import { DbService } from '../services/db.js';
import {
  GLOBAL_TRAFFIC_CACHE, ACTIVE_CONNECTIONS_COUNT, GLOBAL_LAST_ACTIVE_WRITE, commitTrafficBytes,
} from '../services/traffic.js';
import { createUpstreamQueue } from './upstream-queue.js';
import { connectStreams, connectDirect, forwardVlessUDP, extractUUIDFromVless } from './connect.js';
import { concatBytes } from '../lib/bytes.js';
import { closeSocketQuietly } from '../lib/socket.js';
import { _td } from '../lib/encoding.js';
import {
  newCpuStats, logCpuStats, newBackpressureStats, logBackpressureStats,
  newDownstreamStats, logDownstreamStats, newMsgGapStats, logMsgGapStats, logHeartbeat,
} from '../lib/diagnostics.js';
import {
  CPU_PROFILE, BACKPRESSURE_DIAG, DOWNSTREAM_DIAG, MSG_GAP_DIAG, HEARTBEAT_DIAG,
  HEARTBEAT_LOG_EVERY_N_MSGS, ANALYTICS_DIAG, AE_EVENT_OPEN, AE_EVENT_CLOSE, AE_EVENT_POOL_FAILURE,
} from '../config/flags.js';
import {
  UPSTREAM_BACKPRESSURE_BYTES, UPSTREAM_QUEUE_MAX_BYTES, UPSTREAM_QUEUE_MAX_ITEMS,
  DEFAULT_CONNECT_MODE, PROXY_POOL_MAX_FALLBACK, DEFAULT_PROXY_IP,
} from '../config/constants.js';

async function handleVLESS(env, storedData = null, ctx = null) {
  // Timestamp for this WS connection's lifetime — used only for the
  // Analytics Engine close-event duration metric, not on any hot path.
  const connOpenMs = Date.now();
  // Connection-scoped ID (not a user identity) — lets a single AE row (or a
  // console.log diag line, if cross-referencing) be tied back to one
  // specific connection instance, independent of username/addr which can
  // repeat across many connections.
  const connId = crypto.randomUUID().slice(0, 8);
  // Track the resolved remote address/port/mode for this connection, once
  // known, purely for logging (open/close Analytics Engine events). mode
  // ('direct' vs 'fallback') and port are set inside connectTCP's task once
  // the outbound connection attempt resolves.
  let logAddr = null;
  let connMode = null;
  let connPort = null;
  // Prune stale entries from global maps to prevent memory growth in long-lived
  // isolates. Entries older than 5 minutes with no active connections are dead.
  const _now = Date.now();
  for (const [uname, lastActive] of GLOBAL_LAST_ACTIVE_WRITE.entries()) {
    if (!ACTIVE_CONNECTIONS_COUNT.has(uname) && (_now - lastActive) > 5 * 60 * 1000) {
      GLOBAL_LAST_ACTIVE_WRITE.delete(uname);
      GLOBAL_TRAFFIC_CACHE.delete(uname);
    }
  }

  const socketPair = new WebSocketPair();
  const [clientSock, serverSock] = Object.values(socketPair);
  serverSock.accept();
  serverSock.binaryType = 'arraybuffer';

  let username = null;
  let validUUID = null;

  function addBytes(bytes) {
    if (bytes <= 0 || !username) return;
    
    let current = GLOBAL_TRAFFIC_CACHE.get(username) || 0;
    current += bytes;
    
    GLOBAL_LAST_ACTIVE_WRITE.set(username, Date.now());
    
    const threshold = 50 * 1024 * 1024;
    if (current >= threshold) { 
      const chunksOf50MB = Math.floor(current / threshold);
      const bytesToCommit = chunksOf50MB * threshold;
      const leftover = current - bytesToCommit;
      GLOBAL_TRAFFIC_CACHE.set(username, leftover);
      commitTrafficBytes(username, bytesToCommit, env, ctx);
    } else {
      GLOBAL_TRAFFIC_CACHE.set(username, current);
    }
  }

  let isOfflineSet = false;
  const setOffline = () => {
    if (isOfflineSet) return;
    isOfflineSet = true;

    if (CPU_PROFILE) { try { logCpuStats(cpuStats, connId, username, logAddr); } catch (e) {} }
    if (BACKPRESSURE_DIAG) { try { logBackpressureStats(bpStats, connId, username, logAddr); } catch (e) {} }
    if (DOWNSTREAM_DIAG) { try { logDownstreamStats(dsStats, connId, username, logAddr); } catch (e) {} }
    if (MSG_GAP_DIAG) { try { logMsgGapStats(msgGapStats, connId, username, logAddr); } catch (e) {} }

    // Connection-level AE close event. Deliberately NOT gated on `username` —
    // it describes the connection itself (addr/mode/timing/perf), not a user,
    // so it fires even for connections that never got past auth. The billing
    // bookkeeping below (activeCount/closeBytes) is a separate concern and
    // still requires a username.
    if (ANALYTICS_DIAG && env.ANALYTICS) {
      try {
        env.ANALYTICS.writeDataPoint({
          blobs: [AE_EVENT_CLOSE, connId, logAddr || 'unknown', connMode || 'unknown', String(connPort || '')],
          doubles: [
            cpuStats.bytesUp, cpuStats.bytesDown, Date.now() - connOpenMs,
            cpuStats.byobReadMs, cpuStats.writerWriteMs, cpuStats.sendMs, cpuStats.msgHandleMs,
            cpuStats.bundleCopyMs, cpuStats.flushCopyMs,
            bpStats ? bpStats.highWaterBytes : 0,
            bpStats ? bpStats.waitsBlocked : 0,
            bpStats ? bpStats.waitsTimedOut : 0,
            dsStats ? dsStats.wsBackpressureWaitMs : 0,
            dsStats ? dsStats.maxSingleReadMs : 0,
            dsStats ? dsStats.readCount : 0,
            msgGapStats ? msgGapStats.sumMs : 0,
            msgGapStats ? msgGapStats.maxMs : 0,
            msgGapStats ? msgGapStats.count : 0,
          ],
          indexes: [logAddr || 'unknown']
        });
      } catch (e) {}
    }

    const uname = username;
    if (!uname) return;

    let activeCount = ACTIVE_CONNECTIONS_COUNT.get(uname) || 1;
    activeCount = activeCount - 1;
    
    let closeBytes = 0;
    if (activeCount <= 0) {
      ACTIVE_CONNECTIONS_COUNT.delete(uname);
      closeBytes = GLOBAL_TRAFFIC_CACHE.get(uname) || 0;
      if (closeBytes > 0) {
        GLOBAL_TRAFFIC_CACHE.set(uname, 0);
        commitTrafficBytes(uname, closeBytes, env, ctx);
      }
    } else {
      ACTIVE_CONNECTIONS_COUNT.set(uname, activeCount);
    }
  };

  // Heartbeat: keep-alive ping only. DB quota re-checks are removed because
  // each D1 round-trip per active connection was a major memory and CPU cost
  // on the shared stateless isolate. Quota is enforced on connect (first packet)
  // and last_active is written by addBytes/setOffline, which is sufficient.
  // Idle connections that stop sending data will be reaped by setOffline on close.
  const heartbeat = setInterval(() => {
    if (serverSock.readyState === WebSocket.OPEN) {
      try { serverSock.send(new Uint8Array(0)); } catch (e) {}
    } else {
      clearInterval(heartbeat);
    }
  }, 30000);

  let remoteConnWrapper = { socket: null, connectingPromise: null, retryConnect: null, headerSent: false };
  const cpuStats = newCpuStats();
  const bpStats = BACKPRESSURE_DIAG ? newBackpressureStats() : null;
  const dsStats = DOWNSTREAM_DIAG ? newDownstreamStats() : null;
  const msgGapStats = MSG_GAP_DIAG ? newMsgGapStats() : null;
  const connStartMs = HEARTBEAT_DIAG ? performance.now() : null;
  let heartbeatMsgCount = 0;
  let reqUUID = null;
  let isHeaderParsed = false;
  let isDnsQuery = false;
  let chunkBuffer = new Uint8Array(0);
  // custom_proxy_ip is a manually pinned override (set in the admin panel) that
  // takes priority over the IATA-resolved proxy_ip, which in turn falls back to
  // the hardcoded default.
  const proxyPool = Array.isArray(storedData?.proxyPool) ? storedData.proxyPool : [DEFAULT_PROXY_IP];
  // 'direct-first' (default): connectTCP tries the real destination first,
  // proxyPool is only a failure fallback. 'pool-first': connectTCP tries
  // proxyPool candidates first, real destination is only the last resort.
  // Set via the admin panel's "Connection Order" switch (settings.connect_mode),
  // falls back to DEFAULT_CONNECT_MODE if unset.
  const connectMode = storedData?.connectMode || DEFAULT_CONNECT_MODE;

  let wsChain = Promise.resolve();
  let wsStopped = false, wsFailed = false, wsFinished = false;
  let wsQueueBytes = 0, wsQueueItems = 0;
  let currentSocketWriter = null, activeRemoteWriter = null;

  const releaseRemoteWriter = () => {
    if (activeRemoteWriter) {
      try { activeRemoteWriter.releaseLock(); } catch (e) {}
      activeRemoteWriter = null;
    }
    currentSocketWriter = null;
  };

  const getRemoteWriter = () => {
    const s = remoteConnWrapper.socket;
    if (!s) return null;
    if (s !== currentSocketWriter) {
      releaseRemoteWriter();
      currentSocketWriter = s;
      activeRemoteWriter = s.writable.getWriter();
    }
    return activeRemoteWriter;
  };

  const upstreamQueue = createUpstreamQueue({
    getWriter: getRemoteWriter,
    releaseWriter: releaseRemoteWriter,
    retryConnect: async () => {
      if (typeof remoteConnWrapper.retryConnect === 'function') {
        await remoteConnWrapper.retryConnect();
      }
    },
    closeConnection: () => {
      try { remoteConnWrapper.socket?.close(); } catch (e) {}
      closeSocketQuietly(serverSock);
    },
    name: 'VlessWSQueue',
    cpuStats,
    bpStats
  });

  // Previously: `return upstreamQueue.writeAndAwait(chunk, allowRetry);`
  // — that awaited the chunk's actual writer.write() completing on the
  // remote socket before returning, which meant wsChain (strictly serial)
  // couldn't accept the *next* client frame until this one had fully round-
  // tripped to the destination. No pipelining, and the upstream bundler
  // never had more than one chunk to work with.
  //
  // Now: enqueue synchronously (same true/false signal as before — false
  // only means "no writer yet" / "closed", used by the pre-header-parse
  // fallback below) and only await if the backlog has actually built up
  // past UPSTREAM_BACKPRESSURE_BYTES, with a timeout so a stuck drain()
  // degrades instead of hanging. Ordering is unaffected — the queue is
  // still FIFO and drain() still writes chunks in arrival order.
  const writeToRemote = async (chunk, allowRetry = true) => {
    const queued = upstreamQueue.enqueueNoWait(chunk, allowRetry);
    if (queued) {
      await upstreamQueue.awaitBacklogBelow(UPSTREAM_BACKPRESSURE_BYTES);
    }
    return queued;
  };

  const processWsMessage = async (chunk) => {
    const _t0 = CPU_PROFILE ? performance.now() : 0;
    const bytes = chunk.byteLength || 0;

    if (isDnsQuery) {
      await forwardVlessUDP(chunk, serverSock, null);
      if (CPU_PROFILE) { cpuStats.msgHandleMs += performance.now() - _t0; cpuStats.msgHandleN++; }
      return;
    }

    if (await writeToRemote(chunk)) {
      // Only count traffic after the connection is authenticated and routed.
      addBytes(bytes);
      cpuStats.bytesUp += bytes;
      if (CPU_PROFILE) { cpuStats.msgHandleMs += performance.now() - _t0; cpuStats.msgHandleN++; }
      if (HEARTBEAT_DIAG) {
        heartbeatMsgCount++;
        if (heartbeatMsgCount % HEARTBEAT_LOG_EVERY_N_MSGS === 0) {
          try { logHeartbeat(connId, username, logAddr, heartbeatMsgCount, cpuStats.bytesUp, connStartMs); } catch (e) {}
        }
      }
      return;
    }

    if (!isHeaderParsed) {
      // Cap the pre-header buffer to prevent a malicious or stalled client from
      // causing unbounded memory growth and CPU burn via repeated tiny chunks.
      // A VLESS header is at most ~300 bytes; 4 KB is a generous hard ceiling.
      const MAX_HEADER_BYTES = 4 * 1024;
      if (chunkBuffer.byteLength + bytes > MAX_HEADER_BYTES) {
        serverSock.close();
        return;
      }
      chunkBuffer = concatBytes(chunkBuffer, chunk);
      if (chunkBuffer.byteLength < 24) return;

      reqUUID = extractUUIDFromVless(chunkBuffer);
      if (!reqUUID) {
        serverSock.close();
        return;
      }

      // Cache check first — this lookup runs on every new VLESS connection
      // (most clients open a fresh WebSocket per TCP stream), so an
      // uncached D1 query here adds a full round-trip to every connection's
      // setup latency, not just a periodic background cost. TTL is short
      // (UUID_CACHE_TTL) and admin writes invalidate eagerly, so staleness
      // is bounded the same way the existing proxy-pool cache already is.
      let user = null;
      const cached = DbService.getCachedUserByUuid(reqUUID);
      if (cached.hit) {
        user = cached.user;
      } else {
        try {
          user = await env.DB.prepare("SELECT * FROM users WHERE uuid = ?").bind(reqUUID).first() || null;
        } catch (e) { user = null; }
        // Cache both hits and misses (null) — an invalid/bogus UUID being
        // hammered repeatedly shouldn't cost a fresh D1 query every time.
        DbService.cacheUserByUuid(reqUUID, user);
      }

      if (!DbService.isUserAllowed(user)) {
        if (user && user.expiry_days && user.created_at) {
          // Mark expired users as inactive so future connections are rejected immediately
          try {
            await env.DB.prepare("UPDATE users SET is_active = 0, last_active = 0 WHERE uuid = ?").bind(reqUUID).run();
          } catch (e) {}
        }
        serverSock.close();
        return;
      }

      validUUID = reqUUID;
      username = user.username;
      isHeaderParsed = true;
      // Now that we have an authenticated username, charge the bytes for the
      // first chunk (which contained the VLESS header + initial payload).
      addBytes(bytes);

      let activeCount = ACTIVE_CONNECTIONS_COUNT.get(username) || 0;
      ACTIVE_CONNECTIONS_COUNT.set(username, activeCount + 1);
      if (activeCount === 0) {
        const setOnlineTask = async () => {
          try {
            const now = Date.now();
            GLOBAL_LAST_ACTIVE_WRITE.set(username, now);
            await env.DB.prepare("UPDATE users SET last_active = ? WHERE username = ?").bind(now, username).run();
          } catch (e) {}
        };
        if (ctx) ctx.waitUntil(setOnlineTask());
        else setOnlineTask();
      }

      try {
        let offset = 17;
        const optLen = chunkBuffer[offset++];
        offset += optLen;
        const cmd = chunkBuffer[offset++];
        const port = (chunkBuffer[offset++] << 8) | chunkBuffer[offset++];
        const addrType = chunkBuffer[offset++];

        let addr = '';
        if (addrType === 1) {
          addr = `${chunkBuffer[offset++]}.${chunkBuffer[offset++]}.${chunkBuffer[offset++]}.${chunkBuffer[offset++]}`;
        } else if (addrType === 2) {
          const domainLen = chunkBuffer[offset++];
          addr = _td.decode(chunkBuffer.subarray(offset, offset + domainLen));
          offset += domainLen;
        } else if (addrType === 3) {
          // IPv6 is not supported — close cleanly rather than attempting a connection
          // with a bogus address string which would silently fail at the TCP layer.
          console.warn('[VLESS] IPv6 address type received (addrType=3) — not supported, closing connection.');
          serverSock.close();
          return;
        } else {
          // Unrecognized addrType (malformed header) — close immediately rather
          // than falling through with an empty address and relying on a failed
          // connection attempt (and a wasted DoH lookup) to surface the error.
          console.warn(`[VLESS] Unknown addrType (${addrType}) received — closing connection.`);
          closeSocketQuietly(serverSock);
          return;
        }

        const rawData = chunkBuffer.slice(offset);
        const respHeader = new Uint8Array([chunkBuffer[0], 0]);
        logAddr = addr;
        connPort = port;

        if (cmd === 2) {
          if (port === 53) {
            isDnsQuery = true;
            await forwardVlessUDP(rawData, serverSock, respHeader);
          } else {
            serverSock.close();
          }
          return;
        }

        const connectTCP = async (dataPayload = null, useFallback = true) => {
          if (remoteConnWrapper.connectingPromise) {
            await remoteConnWrapper.connectingPromise;
            return;
          }
          const connectStartMs = Date.now();
          const task = (async () => {
            let s = null;
            let usedFallback = false;

            // Shared helper: walk proxyPool candidates in order (up to
            // PROXY_POOL_MAX_FALLBACK), batching failure-increment writes
            // into one D1 call. Returns the connected socket or throws.
            const tryPool = async () => {
              let connected = null;
              const failedIps = [];
              const attempts = proxyPool.slice(0, PROXY_POOL_MAX_FALLBACK);
              for (const candidateIp of attempts) {
                try {
                  connected = await connectDirect(candidateIp, port, dataPayload);
                  break;
                } catch (e2) {
                  failedIps.push(candidateIp);
                }
              }
              if (failedIps.length > 0 && ctx) {
                ctx.waitUntil((async () => {
                  // Bug fix: this used to write consecutive_failures, the same
                  // column the health-check cron uses to decide dead-listing —
                  // meaning a transient live-traffic failure (e.g. the
                  // workerd stuck-socket race) could dead-list a genuinely
                  // healthy IP. live_failures is a separate, purely-diagnostic
                  // counter that does NOT feed the is_disabled/dead-list
                  // filter; only the health-check cron's own probe controls
                  // consecutive_failures now. Also deliberately does not
                  // touch last_checked — that stays solely the health-check
                  // cron's signal for "which IP to probe next".
                  await Promise.all(failedIps.map(ip =>
                    env.DB.prepare(
                      "UPDATE proxy_ip_pool SET live_failures = live_failures + 1 WHERE ip = ?"
                    ).bind(ip).run().catch(() => {})
                  ));
                  if (ANALYTICS_DIAG && env.ANALYTICS) {
                    try {
                      env.ANALYTICS.writeDataPoint({
                        blobs: [AE_EVENT_POOL_FAILURE, connId, addr, failedIps.join(',')],
                        doubles: [failedIps.length],
                        indexes: [addr]
                      });
                    } catch (e) {}
                  }
                })());
              }
              if (!connected) throw new Error('All proxy pool candidates failed');
              return connected;
            };

            if (connectMode === 'pool-first') {
              // Pool-first: try the proxy pool candidates first, real
              // destination is the last resort.
              try {
                s = await tryPool();
                usedFallback = true;
              } catch (err) {
                if (!useFallback) throw err;
                try {
                  s = await connectDirect(addr, port, dataPayload);
                  usedFallback = false;
                } catch (err2) {
                  throw new Error('Direct destination also failed after pool exhausted');
                }
              }
            } else {
              // direct-first (default/original behavior)
              try {
                s = await connectDirect(addr, port, dataPayload);
              } catch (err) {
                if (!useFallback) throw err;
                s = await tryPool();
                usedFallback = true;
              }
            }
            remoteConnWrapper.socket = s; 
            s.closed.catch(() => {}).finally(() => { if (remoteConnWrapper.socket === s) closeSocketQuietly(serverSock); });
            connectStreams(s, serverSock, remoteConnWrapper.headerSent ? null : respHeader, null, (b) => { addBytes(b); }, cpuStats, dsStats);
            remoteConnWrapper.headerSent = true;
            connMode = usedFallback ? 'fallback' : 'direct';

            // Fire-and-forget open event — writeDataPoint queues internally,
            // no await, so this adds ~0ms to connection setup.
            if (ANALYTICS_DIAG && env.ANALYTICS) {
              try {
                env.ANALYTICS.writeDataPoint({
                  blobs: [AE_EVENT_OPEN, connId, addr, connMode, String(port)],
                  doubles: [Date.now() - connectStartMs],
                  indexes: [addr]
                });
              } catch (e) {}
            }
          })();
          remoteConnWrapper.connectingPromise = task;
          try {
            await task;
          } finally {
            if (remoteConnWrapper.connectingPromise === task) {
              remoteConnWrapper.connectingPromise = null;
            }
          }
        };

        remoteConnWrapper.retryConnect = async () => connectTCP(null, false);
        await connectTCP(rawData, true);

      } catch (e) {
        closeSocketQuietly(serverSock);
      }
    }
  };

  const handleWsError = (err) => {
    if (wsFailed) return;
    wsFailed = true;
    wsStopped = true;
    wsQueueBytes = 0;
    wsQueueItems = 0;
    upstreamQueue.clear();
    releaseRemoteWriter();
    closeSocketQuietly(serverSock);
    setOffline();
  };

  const pushToChain = (task) => {
    wsChain = wsChain.then(task).catch(handleWsError);
  };

  // Diagnostic-only: these three raw listeners run synchronously outside both
  // of the file's top-level try/catch wraps ([fetch-crash] and
  // [handleWebSocket] Unexpected error), since the 101 response has already
  // returned by the time they fire. Anything thrown here previously surfaced
  // only as an opaque, redacted "Error: internal error; reference = ..." line
  // in wrangler tail with no stack trace. Wrapping each body in try/catch
  // doesn't change behavior on the happy path — it just logs the real error
  // (with stack) via our own tag before routing it to handleWsError, the same
  // way the WS chain's pushToChain(...).catch(handleWsError) already does for
  // the async side of things.
  const logWsListenerError = (where, e) => {
    try {
      console.error(`[ws-listener-error] ${where} user=${username || '?'} addr=${logAddr || '?'} :: ${e && e.stack ? e.stack : e}`);
    } catch (_) {}
  };

  serverSock.addEventListener('message', (event) => {
    try {
      if (wsStopped || wsFailed) return;
      if (MSG_GAP_DIAG && msgGapStats) {
        const _now = performance.now();
        if (msgGapStats.lastMsgAtMs != null) {
          const gap = _now - msgGapStats.lastMsgAtMs;
          msgGapStats.sumMs += gap;
          if (gap > msgGapStats.maxMs) msgGapStats.maxMs = gap;
          msgGapStats.count++;
        }
        msgGapStats.lastMsgAtMs = _now;
      }
      const size = event.data.byteLength || 0;
      const nextBytes = wsQueueBytes + size;
      const nextItems = wsQueueItems + 1;
      if (nextBytes > UPSTREAM_QUEUE_MAX_BYTES || nextItems > UPSTREAM_QUEUE_MAX_ITEMS) {
        handleWsError(new Error('ws queue overflow'));
        return;
      }
      wsQueueBytes = nextBytes;
      wsQueueItems = nextItems;
      pushToChain(async () => {
        wsQueueBytes = Math.max(0, wsQueueBytes - size);
        wsQueueItems = Math.max(0, wsQueueItems - 1);
        if (wsFailed) return;
        await processWsMessage(event.data);
      });
    } catch (e) {
      logWsListenerError('message', e);
      handleWsError(e instanceof Error ? e : new Error(String(e)));
    }
  });

  serverSock.addEventListener('close', () => {
    try {
      clearInterval(heartbeat);
      closeSocketQuietly(serverSock);
      setOffline();
      if (wsFinished) return;
      wsFinished = true;
      wsStopped = true;
      pushToChain(async () => {
        if (wsFailed) return;
        await upstreamQueue.awaitEmpty();
        releaseRemoteWriter();
      });
    } catch (e) {
      logWsListenerError('close', e);
      handleWsError(e instanceof Error ? e : new Error(String(e)));
    }
  });

  serverSock.addEventListener('error', (err) => {
    try {
      handleWsError(err);
    } catch (e) {
      logWsListenerError('error', e);
    }
  });

  return new Response(null, { status: 101, webSocket: clientSock });
}
export { handleVLESS };
