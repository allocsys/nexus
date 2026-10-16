import { connect } from 'cloudflare:sockets';
import { dohQuery } from './dns.js';
import { PROXY_POOL_MAX_FAILURES } from '../config/constants.js';

// Short-lived in-memory cache for the proxy_ip_pool rows.
// Rebuilt at most once every 30 seconds so a busy worker doesn't hammer D1
// on every WebSocket upgrade while still picking up admin changes promptly.
const PROXY_POOL_CACHE = { rows: null, expires: 0, paused: undefined };


// Checks a batch of proxy IPs from the pool, updating their latency and
// failure counts. Runs on a cron schedule (e.g. every 5 minutes).
// Single TLS-handshake probe against one proxy IP. Extracted from the health-
// check cron so it can also be used to seed a real latency_ms at insert time
// (bug fix: new pool rows used to insert with latency_ms=NULL, which
// COALESCE(latency_ms, 999999) sorts dead-last, so a freshly-picked IATA IP
// sat unused until the next cron cycle happened to probe it).
async function probeProxyIp(ip, timeoutMs = 3000) {
  let latencyMs = null;
  let success = false;
  let failReason = null;
  let sock = null;
  try {
    const t0 = Date.now();
    sock = connect({ hostname: ip, port: 443 }, { secureTransport: 'off' });
    // writer.ready resolves synchronously in CF Workers (bogus 0ms).
    // reader.read() hangs forever on proxy servers that don't speak first.
    // Solution: write a minimal TLS ClientHello probe, then wait for the server
    // to respond (it will send a ServerHello or alert). This measures true RTT
    // and confirms the port is actually open and speaking TLS.
    const writer = sock.writable.getWriter();
    const reader = sock.readable.getReader();
    // Minimal TLS 1.0 ClientHello (enough to elicit a ServerHello or alert)
    const clientHello = new Uint8Array([
      0x16, 0x03, 0x01, 0x00, 0x2f, // TLS record: handshake, version 1.0, length 47
      0x01, 0x00, 0x00, 0x2b,        // ClientHello, length 43
      0x03, 0x03,                    // client version: TLS 1.2
      // 32 bytes of random
      0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,
      0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,
      0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,
      0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,
      0x00,                          // session ID length: 0
      0x00, 0x04,                    // cipher suites length: 4
      0xc0, 0x2b, 0xc0, 0x2c,       // TLS_ECDHE_ECDSA_WITH_AES_128_GCM_SHA256 + _256
      0x01, 0x00,                    // compression: none
      0x00, 0x00                     // extensions length: 0
    ]);
    await writer.ready;
    await writer.write(clientHello);
    writer.releaseLock();
    await Promise.race([
      reader.read(),
      new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), timeoutMs))
    ]);
    reader.releaseLock();
    try { sock.close(); } catch (_) {}
    latencyMs = Date.now() - t0;
    success = true;
  } catch (e) {
    failReason = e && e.message ? e.message : String(e);
    // Bug 6 fix: the handshake may have already completed successfully before
    // the read() timeout fires, leaving a genuinely-open socket that would
    // otherwise be silently abandoned instead of closed (every other connect()
    // site in this file closes on its error path; this one didn't).
    if (sock) { try { sock.close(); } catch (_) {} }
  }
  return { success, latencyMs, failReason };
}

async function runProxyPoolHealthCheck(env) {
  let rows;
  try {
    const { results } = await env.DB.prepare(
      "SELECT id, ip, source, iata_code, consecutive_failures FROM proxy_ip_pool ORDER BY COALESCE(last_checked, 0) ASC LIMIT 10"
    ).all();
    rows = results || [];
  } catch (e) { return; }

  const HEALTH_TIMEOUT_MS = 3000;
  const now = Date.now();

  // Run all checks in parallel so N dead IPs don't multiply the timeout
  // (previously sequential: 5 dead IPs × 3 s = 15 s, exceeding Worker limits).
  await Promise.allSettled(rows.map(async (row) => {
    const { success, latencyMs, failReason } = await probeProxyIp(row.ip, HEALTH_TIMEOUT_MS);

    console.log(`[health] ${row.ip} → ${success ? '✅ ' + latencyMs + 'ms' : '❌ FAILED (' + failReason + ')'}`);

    try {
      if (success) {
        await env.DB.prepare(
          "UPDATE proxy_ip_pool SET latency_ms = ?, last_checked = ?, last_success = ?, consecutive_failures = 0, live_failures = 0 WHERE id = ?"
        ).bind(latencyMs, now, now, row.id).run();
      } else {
        const nextFailures = (row.consecutive_failures || 0) + 1;
        // Same-country re-roll (proactive, part 6b): an iata-sourced row is
        // about to cross the dead-list threshold. Rather than let it degrade
        // and force live traffic onto the reactive re-roll (or the anonymous
        // default), re-resolve the same {iata}.proxyip.cmliussss.net hostname
        // now and swap in a fresh IP so a working candidate is ready before
        // any connection needs it.
        let rerolled = false;
        if (row.source === 'iata' && row.iata_code && nextFailures >= PROXY_POOL_MAX_FAILURES) {
          try {
            const domain = row.iata_code.toLowerCase() + '.proxyip.cmliussss.net';
            const dnsAnswers = await dohQuery(domain, 'A');
            const ips = (dnsAnswers || []).filter(a => a.type === 1).map(a => a.data);
            if (ips.length > 0) {
              const freshIp = ips[Math.floor(Math.random() * ips.length)];
              await env.DB.prepare(
                "UPDATE proxy_ip_pool SET ip = ?, last_checked = ?, consecutive_failures = 0, live_failures = 0 WHERE id = ?"
              ).bind(freshIp, now, row.id).run();
              rerolled = true;
            }
          } catch (e) {}
        }
        if (!rerolled) {
          await env.DB.prepare(
            "UPDATE proxy_ip_pool SET last_checked = ?, consecutive_failures = consecutive_failures + 1 WHERE id = ?"
          ).bind(now, row.id).run();
        }
      }
    } catch (_) {}
  }));

  // Invalidate in-memory pool cache so next connection gets fresh ordering.
  invalidateProxyPoolCache();
}
export {
  probeProxyIp, runProxyPoolHealthCheck, PROXY_POOL_CACHE, invalidateProxyPoolCache,
};

// Clears the in-memory pool cache so the next connection rebuilds it from D1.
function invalidateProxyPoolCache() {
  PROXY_POOL_CACHE.rows = null;
  PROXY_POOL_CACHE.expires = 0;
  PROXY_POOL_CACHE.paused = undefined;
}
