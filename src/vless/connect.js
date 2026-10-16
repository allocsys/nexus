import { connect } from 'cloudflare:sockets';
import { dohQuery } from '../services/dns.js';
import { createDownstreamSender, waitForBackpressure } from './downstream-sender.js';
import { convertToUint8Array } from '../lib/bytes.js';
import { closeSocketQuietly } from '../lib/socket.js';
import { isIPv4, isIPHostname } from '../lib/net.js';
import { CPU_PROFILE, DOWNSTREAM_DIAG } from '../config/flags.js';
import {
  PRELOAD_RACE_DIAL, TCP_CONCURRENCY, TCP_INITIAL_WRITE_TIMEOUT_MS, DOWNSTREAM_READ_TIMEOUT_MS,
  UDP_DNS_HANDSHAKE_TIMEOUT_MS, UDP_DNS_WRITE_TIMEOUT_MS, DOWNSTREAM_GRAIN_BYTES,
} from '../config/constants.js';

async function connectStreams(remoteSocket, webSocket, headerData, retryFunc, onBytes, cpuStats = null, dsStats = null) {
  let header = headerData, hasData = false, reader, useBYOB = false;
  const BYOB_LIMIT = 64 * 1024;
  const downstreamSender = createDownstreamSender(webSocket, header, cpuStats);
  header = null;
  if (DOWNSTREAM_DIAG && dsStats) dsStats.startedAtMs = performance.now();

  try { 
    reader = remoteSocket.readable.getReader({ mode: 'byob' }); 
    useBYOB = true; 
  } catch (e) { 
    reader = remoteSocket.readable.getReader(); 
  }

  // Races a single reader.read() call against DOWNSTREAM_READ_TIMEOUT_MS,
  // mirroring writeInitialData()'s Promise.race pattern. On timeout this
  // rejects (rather than hanging indefinitely), which the outer try/catch
  // below turns into a normal closeSocketQuietly()+retryFunc() failure path.
  const readWithTimeout = (view) => {
    return Promise.race([
      view ? reader.read(view) : reader.read(),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('downstream read timeout')), DOWNSTREAM_READ_TIMEOUT_MS)
      )
    ]);
  };

  try {
    if (!useBYOB) {
      while (true) {
        await waitForBackpressure(webSocket, dsStats);
        const _t0 = (CPU_PROFILE || DOWNSTREAM_DIAG) ? performance.now() : 0;
        const { done, value } = await readWithTimeout();
        const _dt = (CPU_PROFILE || DOWNSTREAM_DIAG) ? performance.now() - _t0 : 0;
        if (CPU_PROFILE && cpuStats) { cpuStats.byobReadMs += _dt; cpuStats.byobReadN++; }
        if (DOWNSTREAM_DIAG && dsStats) {
          dsStats.readCount++;
          if (_dt > dsStats.maxSingleReadMs) dsStats.maxSingleReadMs = _dt;
        }
        if (done) break;
        if (!value || value.byteLength === 0) continue;
        hasData = true;
        if (typeof onBytes === 'function') onBytes(value.byteLength);
        await downstreamSender.send(value);
      }
    } else {
      let readBuffer = new ArrayBuffer(BYOB_LIMIT);
      while (true) {
        await waitForBackpressure(webSocket, dsStats);
        const _t0 = (CPU_PROFILE || DOWNSTREAM_DIAG) ? performance.now() : 0;
        const { done, value } = await readWithTimeout(new Uint8Array(readBuffer, 0, BYOB_LIMIT));
        const _dt = (CPU_PROFILE || DOWNSTREAM_DIAG) ? performance.now() - _t0 : 0;
        if (CPU_PROFILE && cpuStats) { cpuStats.byobReadMs += _dt; cpuStats.byobReadN++; }
        if (DOWNSTREAM_DIAG && dsStats) {
          dsStats.readCount++;
          if (_dt > dsStats.maxSingleReadMs) dsStats.maxSingleReadMs = _dt;
        }
        if (done) break;
        if (!value || value.byteLength === 0) continue;
        hasData = true;
        if (typeof onBytes === 'function') onBytes(value.byteLength);
        if (value.byteLength >= DOWNSTREAM_GRAIN_BYTES) {
          await downstreamSender.flush();
          await downstreamSender.sendDirect(value);
          readBuffer = new ArrayBuffer(BYOB_LIMIT);
        } else {
          await downstreamSender.send(value);
          readBuffer = value.buffer.byteLength >= BYOB_LIMIT ? value.buffer : new ArrayBuffer(BYOB_LIMIT);
        }
      }
    }
    await downstreamSender.flush();
  } catch (err) { 
    closeSocketQuietly(webSocket);
  } finally { 
    try { reader.cancel(); } catch (e) {} 
    try { reader.releaseLock(); } catch (e) {} 
    // Previously only the reader was released here; the underlying remote
    // TCP socket itself was never explicitly closed on this path. Per
    // workerd#2060/#2366, close() still can't guarantee fast teardown of an
    // already-stuck socket at the runtime level, but it's the correct
    // application-level cleanup call and lets the pool-health system treat
    // this as a normal closed connection rather than a leaked one.
    try { remoteSocket.close(); } catch (e) {}
  }
  if (!hasData && retryFunc) await retryFunc();
}

async function buildRaceCandidates(address, port) {
  if (!PRELOAD_RACE_DIAL || isIPHostname(address)) return null;
  // Only query A records — proxy IPs are IPv4-only and the AAAA lookup was
  // burning an extra DoH round-trip per connection for zero benefit.
  const aRecords = await dohQuery(address, 'A');
  const ipv4List = [...new Set(aRecords.flatMap(r => {
    return r.type === 1 && typeof r.data === 'string' && isIPv4(r.data) ? [r.data] : [];
  }))];
  const limit = Math.max(1, TCP_CONCURRENCY | 0);
  const ipList = ipv4List.slice(0, limit);
  if (ipList.length === 0) return null;
  return ipList.map((hostname, attempt) => ({ hostname, port, attempt, resolvedFrom: address }));
}

async function connectDirect(address, port, initialData = null) {
  const raceCandidates = await buildRaceCandidates(address, port);
  // buildRaceCandidates() returns null for a raw IP address (nothing to race —
  // there's no DNS diversity to exploit). The old fallback here dialed the
  // SAME IP TCP_CONCURRENCY times in parallel, which gives no redundancy
  // benefit (a hung/blackholed IP hangs on both duplicate dials together) and
  // doubles exposure to the workerd close()-doesn't-abort-connect() limitation
  // (cloudflare/workerd #2060, #5432) per dial — confirmed as the source of
  // the 2026-07-05 loadShed traces where the proxy_ip fallback (an
  // IATA-resolved raw IP) was duplicate-dialed. Open exactly 1 socket for a
  // raw IP; only duplicate-dial when we actually have a hostname to race.
  const fallbackCount = isIPHostname(address) ? 1 : TCP_CONCURRENCY;
  const candidates = raceCandidates || Array.from({ length: fallbackCount }, () => ({ hostname: address, port }));

  const openConnection = async (host, prt) => {
    const socket = connect({ hostname: host, port: prt });
    try {
      await Promise.race([
        socket.opened,
        new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 1000))
      ]);
      return socket;
    } catch (err) {
      // The 1s handshake race lost — without this, the raw socket created
      // above is never closed and stays open (billing wall-clock) for the
      // rest of the request's life. Confirmed in production logs: near-zero
      // cpu_time_ms but wall_time_ms stretching for minutes, tracked by
      // unclosed `connect` spans (span-not-ended) nested under the request —
      // this was the actual cause behind both the "Worker exceeded CPU time
      // limit" crashes and a chunk of the loadShed aborts under real traffic.
      // Close it here so a slow/dead candidate fails fast instead of leaking.
      try { socket.close(); } catch (_) {}
      throw err;
    }
  };

  // Guards the writable.write() the same way openConnection() guards
  // socket.opened above. A handshake completing is no guarantee the
  // destination will ever drain a write — without this timeout that await
  // has no upper bound and the whole request hangs until the Workers runtime
  // force-kills it, instead of failing in a way the caller's proxy-pool
  // fallback (in connectTCP) can catch and act on.
  const writeInitialData = async (socket, data) => {
    const w = socket.writable.getWriter();
    try {
      await Promise.race([
        w.write(convertToUint8Array(data)),
        new Promise((_, reject) => setTimeout(() => reject(new Error('write timeout')), TCP_INITIAL_WRITE_TIMEOUT_MS))
      ]);
    } catch (err) {
      try { socket.close(); } catch (_) {}
      throw err;
    } finally {
      try { w.releaseLock(); } catch (_) {}
    }
  };

  if (candidates.length === 1) {
    const s = await openConnection(candidates[0].hostname, candidates[0].port);
    if (initialData && initialData.byteLength > 0) {
      await writeInitialData(s, initialData);
    }
    return s;
  }

  const attempts = candidates.map(c => openConnection(c.hostname, c.port).then(socket => ({ socket, candidate: c })));
  let winner = null;
  try {
    winner = await Promise.any(attempts);
    if (initialData && initialData.byteLength > 0) {
      await writeInitialData(winner.socket, initialData);
    }
    return winner.socket;
  } finally {
    if (winner) {
      for (const attempt of attempts) {
        attempt.then(({ socket }) => {
          if (socket !== winner.socket) {
            try { socket.close(); } catch (e) {}
          }
        }).catch(() => {});
      }
    }
  }
}

async function forwardVlessUDP(udpChunk, webSocket, respHeader) {
  const requestData = convertToUint8Array(udpChunk);
  const tcpSocket = connect({ hostname: '8.8.4.4', port: 53 });
  try {
    // Guard the handshake the same way openConnection() guards socket.opened
    // in connectDirect(). Without this, a stalled/blackholed route to
    // 8.8.4.4:53 leaves this await pending forever — the whole request then
    // hangs until the Workers runtime force-kills it as "hung code" (outcome:
    // exception) instead of failing in a way this function's own catch below
    // can handle. On timeout, close the socket before rethrowing so it
    // doesn't linger open for the rest of the request's life the way Bug 4's
    // leaked TCP candidates did in connectDirect().
    try {
      await Promise.race([
        tcpSocket.opened,
        new Promise((_, reject) => setTimeout(() => reject(new Error('dns handshake timeout')), UDP_DNS_HANDSHAKE_TIMEOUT_MS))
      ]);
    } catch (err) {
      try { tcpSocket.close(); } catch (_) {}
      throw err;
    }

    let vlessHeader = respHeader;
    const writer = tcpSocket.writable.getWriter();
    // Guard the initial write the same way writeInitialData() guards it in
    // connectDirect() — this is Bug 2's exact failure shape (unbounded write
    // await), previously fixed there but never ported to this function.
    try {
      await Promise.race([
        writer.write(requestData),
        new Promise((_, reject) => setTimeout(() => reject(new Error('dns write timeout')), UDP_DNS_WRITE_TIMEOUT_MS))
      ]);
    } catch (err) {
      try { tcpSocket.close(); } catch (_) {}
      throw err;
    } finally {
      try { writer.releaseLock(); } catch (_) {}
    }

    await tcpSocket.readable.pipeTo(new WritableStream({
      async write(chunk) {
        const response = convertToUint8Array(chunk);
        if (webSocket.readyState !== WebSocket.OPEN) return;
        if (vlessHeader) {
          const merged = new Uint8Array(vlessHeader.length + response.byteLength);
          merged.set(vlessHeader, 0);
          merged.set(response, vlessHeader.length);
          webSocket.send(merged.buffer);
          vlessHeader = null;
        } else {
          webSocket.send(response);
        }
      }
    }));
  } catch (e) {
  } finally {
    // Always close the DNS socket — pipeTo consuming the stream to completion
    // does not automatically close the underlying CF socket, so without this
    // the connection to 8.8.4.4:53 lingers until the Worker isolate is reaped.
    try { tcpSocket.close(); } catch (_) {}
  }
}

function extractUUIDFromVless(data) {
  if (data.byteLength < 17) return null;
  const hex = [...data.slice(1, 17)].map(b => b.toString(16).padStart(2, '0')).join('');
  return `${hex.substring(0, 8)}-${hex.substring(8, 12)}-${hex.substring(12, 16)}-${hex.substring(16, 20)}-${hex.substring(20)}`;
}
export { connectStreams, buildRaceCandidates, connectDirect, forwardVlessUDP, extractUUIDFromVless };
