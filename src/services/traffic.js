const GLOBAL_TRAFFIC_CACHE = new Map();
const ACTIVE_CONNECTIONS_COUNT = new Map();
const GLOBAL_LAST_ACTIVE_WRITE = new Map();

// Tracks the last time flushExpiredTraffic ran a DB write sweep.
// Prevents redundant D1 writes on every 60s panel poll — capped at once per 5 min.
let LAST_FLUSH_TRAFFIC_MS = 0;
const FLUSH_TRAFFIC_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

// Shared helper: write a traffic delta to DB, recovering to the cache on failure.
async function commitTrafficBytes(uname, bytes, env, ctx) {
  const deltaGb = bytes / (1024 * 1024 * 1024);
  const writeTask = async () => {
    try {
      await env.DB.prepare("UPDATE users SET used_gb = used_gb + ? WHERE username = ?").bind(deltaGb, uname).run();
    } catch (e) {
      const recovered = GLOBAL_TRAFFIC_CACHE.get(uname) || 0;
      GLOBAL_TRAFFIC_CACHE.set(uname, recovered + bytes);
    }
  };
  if (ctx) {
    ctx.waitUntil(writeTask());
  } else {
    writeTask();
  }
}
async function flushExpiredTraffic(env, ctx) {
  // Early-exit if there is nothing buffered — avoids the iteration cost on every
  // GET /api/users poll (called every 60 s by the panel).
  if (GLOBAL_TRAFFIC_CACHE.size === 0) return;

  // Rate-gate: only flush to DB at most once every FLUSH_TRAFFIC_INTERVAL_MS.
  // The panel polls every 60 s; without this gate each poll fires one D1 UPDATE
  // per active user. The in-memory cache already holds the live total, so the
  // panel response is still accurate — only the persisted DB value is deferred.
  const now = Date.now();
  if (now - LAST_FLUSH_TRAFFIC_MS < FLUSH_TRAFFIC_INTERVAL_MS) return;
  LAST_FLUSH_TRAFFIC_MS = now;

  const flushTasks = [];
  for (const [uname, cachedBytes] of GLOBAL_TRAFFIC_CACHE.entries()) {
    if (cachedBytes <= 0) continue;
    const lastActive = GLOBAL_LAST_ACTIVE_WRITE.get(uname) || 0;
    const activeCount = ACTIVE_CONNECTIONS_COUNT.get(uname) || 0;
    if (activeCount <= 0 || (now - lastActive > 65000)) {
      GLOBAL_TRAFFIC_CACHE.set(uname, 0);
      // Fix #3: pass ctx so commitTrafficBytes uses waitUntil and bytes are
      // never silently dropped when the Worker exits before the promise settles.
      flushTasks.push(commitTrafficBytes(uname, cachedBytes, env, ctx));
    }
  }
  await Promise.all(flushTasks);
}
export {
  GLOBAL_TRAFFIC_CACHE, ACTIVE_CONNECTIONS_COUNT, GLOBAL_LAST_ACTIVE_WRITE,
  commitTrafficBytes, flushExpiredTraffic,
};
