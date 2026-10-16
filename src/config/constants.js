const TLS_PORTS = ['443', '2053', '2083', '2087', '2096', '8443'];
const VALID_FINGERPRINTS = new Set(['chrome','firefox','safari','ios','android','edge','360','qq','random','randomized']);

const DOH_RESOLVER = "https://cloudflare-dns.com/dns-query";
// Was 4KB, then 32KB (see note below on the serialized writeAndAwait() era).
// Bumped again to 128KB: drain() serializes writes one at a time (bundle,
// await writer.write(), repeat — see createUpstreamQueue), so throughput is
// bounded by bundle_size / time-per-write, not by queue capacity. At 32KB
// this measured out to roughly a ~1MB/s upload ceiling regardless of how
// large UPSTREAM_QUEUE_MAX_BYTES was. 128KB keeps a 2x margin under
// UPSTREAM_BACKPRESSURE_BYTES (256KB) — matching the original 8x-below-
// threshold intent isn't preserved exactly, but 2x is still enough that a
// single bundle can't itself cross the backpressure line. If this needs to
// go higher, raise UPSTREAM_BACKPRESSURE_BYTES to keep it above at least
// ~2x the bundle size, and watch Workers Metrics → Errors → Invocation
// Statuses for exceededMemory (1102) — bundleBuffers below pre-allocates
// two buffers at this size per connection, so isolate memory scales with
// (this constant × 2 × concurrent connections on that isolate).
const UPSTREAM_BUNDLE_TARGET_BYTES = 128 * 1024;
// Soft backpressure gate for writeToRemote. Once the upstream queue backlog
// exceeds this, new client chunks start waiting for drain to catch up,
// instead of every chunk waiting for its own full round trip. Deliberately
// well below UPSTREAM_QUEUE_MAX_BYTES so the connection slows down gracefully
// long before the hard overflow kill switch fires.
const UPSTREAM_BACKPRESSURE_BYTES = 256 * 1024;
// Hard cap on how long a single awaitBacklogBelow() wait can block. If
// drain() ever stalls (hung writer.write(), a retryConnect that never
// settles), this prevents the wait — and therefore wsChain, and therefore the
// whole connection's upload side — from hanging forever.
const UPSTREAM_BACKPRESSURE_TIMEOUT_MS = 5000;
const UPSTREAM_QUEUE_MAX_BYTES = 16 * 1024 * 1024;
const UPSTREAM_QUEUE_MAX_ITEMS = 4096;
const DOWNSTREAM_GRAIN_BYTES = 64 * 1024;
const DOWNSTREAM_GRAIN_TAIL_THRESHOLD = 1024;
const DOWNSTREAM_GRAIN_SILENT_MS = 1;
const TCP_CONCURRENCY = 2;
const PRELOAD_RACE_DIAL = true;
// Connection order fallback when no live 'connect_mode' row exists in the
// settings table yet (see the admin-panel toggle wired up below). This is
// only the code-level default — the dashboard switch overrides it live,
// without a redeploy, once a row exists.
// 'direct-first' (original behavior): try the real destination first, only
// fall to the proxy pool candidates on failure.
// 'pool-first': try the proxy pool candidates first, only fall to a direct
// connection to the real destination as the last resort. Useful for
// temporarily testing pool-first routing, then flipping back.
const DEFAULT_CONNECT_MODE = 'direct-first';
// Guards the initial writable.write() in connectDirect() the same way
// socket.opened is already guarded (1000ms). Without this, a destination that
// completes the TCP handshake but then never drains the write leaves the
// await pending forever — no other code path in connectDirect times it out —
// which surfaces as the Workers runtime force-killing the whole request as
// "hung" rather than a catchable error the proxy-pool fallback can react to.
const TCP_INITIAL_WRITE_TIMEOUT_MS = 5000;
// Guards reader.read() in connectStreams' downstream read loop (both plain
// and BYOB modes). Unlike every other blocking socket op in this file
// (socket.opened, writeInitialData, forwardVlessUDP's DNS handshake/write —
// all wrapped in Promise.race+setTimeout), this read loop previously had NO
// timeout guard at all. Per cloudflare/workerd#2366, a stuck TCP read can
// hang permanently with no return value and no thrown error, and #1018
// confirms there's no built-in socket-level read/idle timeout in the
// connect() API. Observed production stuck-read durations were ~30s/~60s/
// ~240s+ before something external (Cloudflare's own loadShed/isolate
// limits) eventually killed the request. 15s bounds the hang at the
// application level instead, so retryFunc/pool-health can react to it as a
// normal failure. See mem0 entity_id bug-4-readside-stuck-sockets for the
// full root-cause writeup.
const DOWNSTREAM_READ_TIMEOUT_MS = 15000;
// Same guard, applied to forwardVlessUDP()'s DNS-over-TCP relay to 8.8.4.4:53.
// That function previously had no timeout at all on either the handshake or
// the initial write — if the destination stalls/blackholes, both the
// connect() and writer.write() calls hang forever with no application-level
// bound, surfacing as a Workers runtime "hung code" cancellation (outcome:
// exception) rather than a catchable error. Mirrors TCP_INITIAL_WRITE_TIMEOUT_MS's
// role in connectDirect(); kept as separate constants since this path talks
// to a single fixed, normally-fast public resolver rather than arbitrary
// user-requested destinations, so a tighter bound is safe here.
const UDP_DNS_HANDSHAKE_TIMEOUT_MS = 1000;
const UDP_DNS_WRITE_TIMEOUT_MS = 3000;

const PROXY_POOL_CACHE_TTL = 30 * 1000; // 30 seconds
const PROXY_POOL_MAX_FAILURES = 3; // dead-list threshold
const PROXY_POOL_MAX_FALLBACK = 3; // max IPs to try per connection
const DEFAULT_PROXY_IP = "proxyip.cmliussss.net";
// Shared SELECT for all full pool reads — single source of truth so column
// additions or ordering changes only need to be made in one place.
const PROXY_POOL_SELECT_SQL = "SELECT id, ip, source, latency_ms, last_checked, last_success, consecutive_failures, live_failures, is_pinned, is_disabled, created_at FROM proxy_ip_pool ORDER BY is_pinned DESC, consecutive_failures ASC, COALESCE(latency_ms, 999999) ASC";
export {
  TLS_PORTS, VALID_FINGERPRINTS, DOH_RESOLVER,
  UPSTREAM_BUNDLE_TARGET_BYTES, UPSTREAM_BACKPRESSURE_BYTES, UPSTREAM_BACKPRESSURE_TIMEOUT_MS,
  UPSTREAM_QUEUE_MAX_BYTES, UPSTREAM_QUEUE_MAX_ITEMS,
  DOWNSTREAM_GRAIN_BYTES, DOWNSTREAM_GRAIN_TAIL_THRESHOLD, DOWNSTREAM_GRAIN_SILENT_MS,
  TCP_CONCURRENCY, PRELOAD_RACE_DIAL, DEFAULT_CONNECT_MODE,
  TCP_INITIAL_WRITE_TIMEOUT_MS, DOWNSTREAM_READ_TIMEOUT_MS,
  UDP_DNS_HANDSHAKE_TIMEOUT_MS, UDP_DNS_WRITE_TIMEOUT_MS,
  PROXY_POOL_CACHE_TTL, PROXY_POOL_MAX_FAILURES, PROXY_POOL_MAX_FALLBACK,
  DEFAULT_PROXY_IP, PROXY_POOL_SELECT_SQL,
};
