import { HTML_TEMPLATES } from './templates.js';
import { handleVLESS } from '../vless/engine.js';
import { DbService } from '../services/db.js';
import { SubscriptionService } from '../services/subscription.js';
import {
  GLOBAL_TRAFFIC_CACHE, ACTIVE_CONNECTIONS_COUNT, GLOBAL_LAST_ACTIVE_WRITE, flushExpiredTraffic,
} from '../services/traffic.js';
import { dohQuery } from '../services/dns.js';
import { probeProxyIp, runProxyPoolHealthCheck, PROXY_POOL_CACHE, invalidateProxyPoolCache } from '../services/proxy-pool.js';
import { generateSubToken } from '../lib/crypto.js';
import { _te } from '../lib/encoding.js';
import { jsonResponse, deriveTls } from './http.js';
import { AE_DATASET, AE_EVENT_CLOSE, AE_VALID_TYPES } from '../config/flags.js';
import {
  VALID_FINGERPRINTS, DEFAULT_CONNECT_MODE, PROXY_POOL_CACHE_TTL,
  PROXY_POOL_MAX_FAILURES, PROXY_POOL_SELECT_SQL, DEFAULT_PROXY_IP,
} from '../config/constants.js';

const PROXY_IP_CACHE = { value: null, expires: 0 };

const LOCATIONS_CACHE = { data: null, expires: 0 };
const LOCATIONS_CACHE_TTL = 10 * 60 * 1000; // 10 minutes — Cloudflare PoP list rarely changes

// ==========================================================
// SUB-TOKEN / RESET-LINK SYSTEM
// Lets a user get a fresh subscription link (new uuid + new opaque
// sub_token) without breaking anyone still on the old username-based
// link. manager3.js calls the reset-link route at handleChangeLinkExecute.
//
// T1 - schema: users.sub_token TEXT, nullable (see ensureSchema, v10).
//      New users get one generated at creation (see POST /api/users).
// T2 - handleSubscription: /sub/<username|uuid> resolves only while
//      sub_token is still NULL (never reset); /feed/<sub_token> resolves
//      solely on sub_token. This is what actually revokes a leaked old
//      link once reset-link has been used. The admin GET /api/users/:username
//      route is separate (authenticated panel lookup) and still resolves on
//      username OR sub_token, since that isn't a public revocation surface.
// T3 - POST /api/users/:username/reset-link (see handleUsers) issues a
//      fresh sub_token + uuid; old uuid keeps working until the 20s
//      UUID_USER_CACHE TTL expires — no forced disconnect.
// T4 - panel's getSubLink() prefers sub_token, falls back to username
//      for accounts that haven't been reset yet.
//
// T5 (RESOLVED) — /sub was dead-on-arrival for every account; retired.
//   Root cause: POST /api/users (below) calls generateSubToken() and
//   writes it at creation time, not just on reset-link. That means
//   sub_token is never NULL for any account created after v10, so the
//   "AND sub_token IS NULL" branch in handleSubscription (T2) can never
//   match for them — /sub/<username> 404s immediately for every new
//   user, and buildSubLink()/getSubLink() (manager side, T4) never even
//   emits a /sub link for them since a token always exists. Only rows
//   from before the v10 migration (genuinely NULL sub_token) still
//   resolved via /sub. Net effect: /sub and /feed were not actually two
//   supported tiers — /sub was unreachable dead code for ~all traffic.
//   Fix shipped (single canonical link going forward):
//     1. DONE — ensureSchema v11 backfills sub_token for every row still
//        NULL (pre-v10 accounts), so every row now has a token.
//     2. DONE — handleSubscription drops the isSubPath branch, resolves
//        solely on sub_token via /feed/<sub_token>.
//     3. DONE — isSubscriptionPath no longer matches '/sub/'; the /sub
//        prefix handling in handleSubscription is gone.
//     4. OUT OF SCOPE HERE — manager5.js (not part of this file):
//        buildSubLink()/resolveSubscriptionLink() should drop the /sub
//        fallback and regex branch; claim_link_prompt / claim_error_bad_format
//        (en + fa) should reference /feed/ instead of /sub/. The in-file
//        panel helper getSubLink() (search "function getSubLink") already
//        only ever builds /feed/ links, so no change was needed there.
//     5. No change needed — POST /api/users already generates subToken
//        at creation; that's fine now that nothing depends on sub_token
//        being NULL anymore.
// ==========================================================

const Router = {
  isWebSocketUpgrade(request) {
    const upgradeHeader = (request.headers.get('Upgrade') || '').toLowerCase();
    return upgradeHeader === 'websocket';
  },

  isSubscriptionPath(pathname) {
    return pathname.startsWith('/feed/');
  },

  async handleWebSocket(request, env, ctx) {
    try {
      // Build an ordered candidate list from the pool (cached 30s to avoid D1 on every upgrade).
      // Order: pinned first, then by consecutive_failures ASC, then latency ASC.
      // Falls to a live same-country re-roll if a location is picked, then the
      // hardcoded default. The legacy settings.proxy_ip slot no longer plays
      // any part here — see T-unify-proxy migration (schema v12).
      let proxyPool = [];
      let poolPaused = false;
      let connectMode = DEFAULT_CONNECT_MODE;
      const now = Date.now();
      if (PROXY_POOL_CACHE.rows && now < PROXY_POOL_CACHE.expires) {
        proxyPool = PROXY_POOL_CACHE.rows;
        poolPaused = PROXY_POOL_CACHE.paused;
        connectMode = PROXY_POOL_CACHE.connectMode || DEFAULT_CONNECT_MODE;
      } else {
        // Both reads fire in parallel on a cache miss — one D1 round-trip, not two.
        try {
          const [poolRes, pausedRow, modeRow] = await Promise.all([
            env.DB.prepare(
              "SELECT ip, is_pinned, is_disabled, consecutive_failures, latency_ms FROM proxy_ip_pool ORDER BY is_pinned DESC, consecutive_failures ASC, COALESCE(latency_ms, 999999) ASC"
            ).all(),
            env.DB.prepare("SELECT value FROM settings WHERE key = 'pool_paused'").first(),
            env.DB.prepare("SELECT value FROM settings WHERE key = 'connect_mode'").first()
          ]);
          proxyPool = poolRes.results || [];
          poolPaused = pausedRow?.value === '1';
          connectMode = modeRow?.value || DEFAULT_CONNECT_MODE;
          PROXY_POOL_CACHE.rows = proxyPool;
          PROXY_POOL_CACHE.paused = poolPaused;
          PROXY_POOL_CACHE.connectMode = connectMode;
          PROXY_POOL_CACHE.expires = now + PROXY_POOL_CACHE_TTL;
        } catch (e) { proxyPool = []; poolPaused = false; connectMode = DEFAULT_CONNECT_MODE; }
      }

      // Build the candidate list: healthy pool entries first, then a live
      // same-country re-roll (if a location is picked), then the hardcoded
      // default. Disabled IPs (is_disabled = 1) are excluded regardless of
      // health status. If the pool is globally paused, treat it as empty so
      // every connection falls straight through to the re-roll / default.
      const candidates = poolPaused
        ? []
        : proxyPool
            .filter(r => !r.is_disabled && r.consecutive_failures < PROXY_POOL_MAX_FAILURES)
            .map(r => r.ip);

      // Same-country re-roll (reactive, part 6a): the pool is empty or every
      // candidate is currently dead-listed. Rather than silently degrading a
      // user who picked a specific country to an anonymous default, check
      // whether a location is set and, if so, re-resolve that location's
      // hostname live for a fresh IP before giving up on it. {iata}.proxyip.
      // cmliussss.net is DNS-load-balanced across multiple IPs per location,
      // so a fresh resolution often hands back a different, working IP.
      if (candidates.length === 0) {
        try {
          const iataRow = await env.DB.prepare(
            "SELECT value FROM settings WHERE key = 'proxy_location_iata'"
          ).first();
          const iata = iataRow?.value;
          if (iata) {
            const domain = iata.toLowerCase() + '.proxyip.cmliussss.net';
            const dnsAnswers = await dohQuery(domain, 'A');
            const ips = (dnsAnswers || []).filter(a => a.type === 1).map(a => a.data);
            if (ips.length > 0) candidates.push(ips[Math.floor(Math.random() * ips.length)]);
          }
        } catch (e) {}
      }

      if (candidates.length === 0) candidates.push(DEFAULT_PROXY_IP);

      return handleVLESS(env, { proxyPool: candidates, connectMode }, ctx);
    } catch (e) {
      console.error('[handleWebSocket] Unexpected error:', e);
      return new Response("Internal Server Error", { status: 500 });
    }
  },

  async handleSubscription(url, env, request) {
    let subUser;
    try {
      subUser = decodeURIComponent(url.pathname.slice('/feed/'.length));
    } catch (e) {
      // Malformed percent-encoding (e.g. a lone "%") — treat as Not Found
      // rather than letting the URIError surface as an unhandled exception.
      return new Response("Not Found", { status: 404 });
    }
    const host = url.hostname;

    const isJson = subUser.startsWith('json/');
    if (isJson) {
      subUser = subUser.slice(5);
    }

    try {
      // T5: /sub/<username|uuid> has been retired — every row has a
      // sub_token (backfilled in ensureSchema v11), so /feed/<sub_token>
      // is now the single canonical link for all accounts.
      const user = await env.DB.prepare(
        "SELECT * FROM users WHERE sub_token = ?"
      ).bind(subUser).first();
      if (!user || user.connection_type !== atob('dmxlc3M=')) {
        return new Response("Not Found", { status: 404 });
      }

      if (isJson) {
        return await SubscriptionService.generateJson(user, host, env, request);
      } else {
        return await SubscriptionService.generateText(user, host, request);
      }
    } catch (err) {
      return new Response("Error building config: " + err.message, { status: 500 });
    }
  },

  async handlePanel(request, env) {
    const hasPassword = await DbService.getPanelPassword(env.DB);
    if (!hasPassword) {
      return new Response(HTML_TEMPLATES.setup, {
        headers: { "Content-Type": "text/html; charset=utf-8" }
      });
    }

    const authorized = await DbService.verifyApiAuth(request, env);
    if (!authorized) {
      return new Response(HTML_TEMPLATES.login, {
        headers: { "Content-Type": "text/html; charset=utf-8" }
      });
    }

    return new Response(HTML_TEMPLATES.panel, {
      headers: { "Content-Type": "text/html; charset=utf-8" }
    });
  },

  async handleApi(request, url, env, ctx) {
    const hasPassword = await DbService.getPanelPassword(env.DB);

    if (url.pathname === '/api/setup-password' && request.method === 'POST') {
      return Router.handleSetupPassword(request, env, hasPassword);
    }

    if (url.pathname === '/api/login' && request.method === 'POST') {
      return Router.handleLogin(request, env);
    }

    // General authentication check for remaining API routes.
    // Accept either a valid browser session cookie OR a matching X-Admin-Secret
    // header (used by Worker A / Telegram Shop Bot for server-to-server calls).
    // Guard: if ADMIN_SECRET is unset/empty, the header path is a no-op — never
    // compare against an empty string and auto-pass.
    let authorized = false;
    const adminSecret = env.ADMIN_SECRET;
    if (adminSecret) {
      const headerSecret = request.headers.get('X-Admin-Secret') || '';
      // Constant-time comparison — same diff-fold pattern used in verifyApiAuth.
      const a = _te.encode(headerSecret.padEnd(64, '\0').slice(0, 64));
      const b = _te.encode(adminSecret.padEnd(64, '\0').slice(0, 64));
      let diff = headerSecret.length === adminSecret.length ? 0 : 1;
      for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
      if (diff === 0) authorized = true;
    }
    if (!authorized) {
      authorized = await DbService.verifyApiAuth(request, env);
    }
    if (!authorized) {
      return jsonResponse({ error: "Unauthorized" }, 401);
    }

    if (url.pathname === '/locations') {
      return Router.handleLocations();
    }

    if (url.pathname === '/api/proxy-ip') {
      return Router.handleProxyIp(request, env);
    }

    if (url.pathname === '/api/proxy-ip-pool') {
      return Router.handleProxyIpPool(request, env);
    }

    if (url.pathname === '/api/logs') {
      return Router.handleLogs(request, url, env);
    }

    if (url.pathname.startsWith('/api/users')) {
      // NOTE [Feature 1 - Pause/Resume]:   PATCH /api/users/:username (no action) = toggle is_active. Already implemented.
      // NOTE [Feature 2 - Reset Traffic]:   PATCH /api/users/:username?action=reset-traffic. Already implemented.
      // NOTE [Feature 3 - Live Stats]:      GET   /api/users returns used_gb, last_active, is_online, is_active. Already implemented.
      // NOTE [Feature 5 - Modify User]:     PUT   /api/users/:username does a full-replace update. Already implemented.
      //   Manager's handleOrderModify must GET the user first, merge overrides, then call PUT.
      return Router.handleUsers(request, url, env, ctx);
    }

    return jsonResponse({ error: "Not Found" }, 404);
  },

  // Queries Analytics Engine via the Cloudflare REST SQL API. The runtime
  // binding (env.ANALYTICS) can only write data points — reading them back
  // requires an API token, since Analytics Engine has no read binding.
  //
  // Requires two secrets (wrangler secret put ...):
  //   CF_ACCOUNT_ID  — your Cloudflare account ID
  //   CF_API_TOKEN   — a token scoped to Account.Account Analytics: Read only
  //
  // GET /api/logs                        -> last 1h, all event types, 100 rows
  // GET /api/logs?type=close&hours=6      -> filter by event type / window
  // GET /api/logs?username=alice          -> filter by user
  // GET /api/logs?agg=1&hours=24          -> per-address throughput/reliability summary
  // GET /api/logs?agg=1&min_duration_ms=60000&min_bytes=1&order=duration
  //                                        -> abnormal/slow addresses only: real payload
  //                                           (avg_bytes > min_bytes) AND long-lived
  //                                           (avg_duration_ms > min_duration_ms), sorted slowest-first
  async handleLogs(request, url, env) {
    if (!env.CF_ACCOUNT_ID || !env.CF_API_TOKEN) {
      return jsonResponse({
        error: "Analytics not configured — set CF_ACCOUNT_ID and CF_API_TOKEN secrets (token needs Account Analytics: Read)."
      }, 500);
    }

    const params = url.searchParams;
    const VALID_TYPES = AE_VALID_TYPES;
    const type = params.get('type');
    if (type && !VALID_TYPES.has(type)) {
      return jsonResponse({ error: "Invalid type. Must be one of: open, close, pool-failure" }, 400);
    }
    const addr = params.get('addr');

    let hours = parseInt(params.get('hours') || '1', 10);
    if (!Number.isFinite(hours) || hours <= 0) hours = 1;
    hours = Math.min(hours, 168); // cap at 7 days — Analytics Engine default retention

    let limit = parseInt(params.get('limit') || '100', 10);
    if (!Number.isFinite(limit) || limit <= 0) limit = 100;
    limit = Math.min(limit, 1000);

    const agg = params.get('agg') === '1';

    // Optional post-aggregation filter, only meaningful with agg=1 — lets
    // callers ask for "abnormal/slow" addresses: real payload (avg bytes
    // above a floor) combined with a long average duration, which flags
    // slow proxy hops rather than expected zero-byte keepalive channels.
    let minDurationMs = parseFloat(params.get('min_duration_ms') || '');
    if (!Number.isFinite(minDurationMs) || minDurationMs < 0) minDurationMs = null;
    let minBytes = parseFloat(params.get('min_bytes') || '');
    if (!Number.isFinite(minBytes) || minBytes < 0) minBytes = null;
    const orderByDuration = params.get('order') === 'duration';

    // The SQL API takes a raw query string, not parameterized bindings —
    // this quote-escaping is the only injection guard available. type is
    // already whitelist-checked above; addr goes through esc() too.
    const esc = (s) => String(s).replace(/'/g, "''");

    // Dataset name and event-type strings now live in the constants block
    // near the top of the file (AE_DATASET / AE_EVENT_*), alongside the
    // other diag flags — flip/rename there, not here.
    const DATASET = AE_DATASET;

    // NOTE: double-field meaning is positional and differs by event type
    // (blob1) — 'close' rows populate all 18 double fields (connection perf
    // stats, see setOffline's writeDataPoint); 'open' only populates double1
    // (connect latency); 'pool-failure' only populates double1 (failure
    // count). Always filter by type when reading doubles to avoid mixing
    // schemas in one result set.
    let sql;
    if (agg) {
      // Per-remote-address throughput/reliability summary, close events only —
      // answers "which proxy IPs/destinations are actually fast/slow under
      // real load," which is the whole point of dropping the username column:
      // this is now purely about connection/destination performance.
      const having = [];
      if (minDurationMs !== null) having.push(`AVG(double3) > ${minDurationMs}`);
      if (minBytes !== null) having.push(`AVG(double2) > ${minBytes}`);
      const orderBy = orderByDuration ? 'avg_duration_ms DESC' : 'conns DESC';
      sql = `SELECT blob3 AS addr, blob4 AS mode, COUNT() AS conns,
                    AVG(double1) AS avg_bytes_up, AVG(double2) AS avg_bytes_down, AVG(double3) AS avg_duration_ms,
                    AVG(double4) AS avg_byob_read_ms, AVG(double5) AS avg_writer_write_ms,
                    AVG(double13) AS avg_ws_backpressure_wait_ms, AVG(double14) AS avg_max_single_read_ms,
                    AVG(double16) AS avg_msg_gap_ms
             FROM ${DATASET}
             WHERE timestamp > NOW() - INTERVAL '${hours}' HOUR AND blob1 = '${AE_EVENT_CLOSE}'
             ${addr ? `AND blob3 = '${esc(addr)}'` : ''}
             GROUP BY addr, mode
             ${having.length ? `HAVING ${having.join(' AND ')}` : ''}
             ORDER BY ${orderBy}
             LIMIT ${limit}`;
    } else {
      sql = `SELECT timestamp, blob1 AS type, blob2 AS conn_id, blob3 AS addr, blob4 AS mode, blob5 AS port,
                    double1 AS bytes_up, double2 AS bytes_down, double3 AS duration_ms,
                    double4 AS byob_read_ms, double5 AS writer_write_ms, double6 AS send_ms, double7 AS msg_handle_ms,
                    double8 AS bundle_copy_ms, double9 AS flush_copy_ms,
                    double10 AS high_water_bytes, double11 AS waits_blocked, double12 AS waits_timed_out,
                    double13 AS ws_backpressure_wait_ms, double14 AS max_single_read_ms, double15 AS read_count,
                    double16 AS msg_gap_sum_ms, double17 AS msg_gap_max_ms, double18 AS msg_gap_count
             FROM ${DATASET}
             WHERE timestamp > NOW() - INTERVAL '${hours}' HOUR
             ${type ? `AND blob1 = '${esc(type)}'` : ''}
             ${addr ? `AND blob3 = '${esc(addr)}'` : ''}
             ORDER BY timestamp DESC
             LIMIT ${limit}`;
    }

    try {
      const res = await fetch(
        `https://api.cloudflare.com/client/v4/accounts/${env.CF_ACCOUNT_ID}/analytics_engine/sql`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${env.CF_API_TOKEN}`,
            'Content-Type': 'text/plain'
          },
          body: sql
        }
      );
      if (!res.ok) {
        const errText = await res.text().catch(() => '');
        return jsonResponse({ error: "Analytics query failed", detail: errText.slice(0, 500) }, 502);
      }
      const data = await res.json();
      return jsonResponse({ success: true, rows: data.data || [], meta: data.meta || null });
    } catch (e) {
      return jsonResponse({ error: "Analytics query error" }, 502);
    }
  },

  async handleSetupPassword(request, env, hasPassword) {
    if (hasPassword) {
      return jsonResponse({ error: "Password has already been set" }, 400);
    }
    let body;
    try { body = await request.json(); } catch (_) { body = {}; }
    const { password } = body;
    if (!password || password.length < 4) {
      return jsonResponse({ error: "Password must be at least 4 characters" }, 400);
    }
    const hashed = await DbService.sha256(password);
    await DbService.setPanelPassword(env.DB, hashed);
    const sessionToken = await DbService.createSession(env.DB);
    return jsonResponse({ success: true }, 200, {
      "Set-Cookie": "panel_session=" + sessionToken + "; Path=/; HttpOnly; Secure; SameSite=Lax"
    });
  },

  async handleLogin(request, env) {
    const clientIP = request.headers.get('CF-Connecting-IP') || 'unknown';
    if (!DbService.checkLoginRateLimit(clientIP)) {
      return jsonResponse({ error: "Too many login attempts. Please wait a minute." }, 429);
    }
    let loginBody;
    try { loginBody = await request.json(); } catch (_) { loginBody = {}; }
    const { password } = loginBody;
    const hashedInput = await DbService.sha256(password || '');
    const storedHash = await DbService.getPanelPassword(env.DB);
    if (storedHash === hashedInput) {
      DbService.clearLoginRateLimit(clientIP);
      const sessionToken = await DbService.createSession(env.DB);
      return jsonResponse({ success: true }, 200, {
        "Set-Cookie": "panel_session=" + sessionToken + "; Path=/; HttpOnly; Secure; SameSite=Lax"
      });
    }
    return jsonResponse({ error: "Incorrect password" }, 401);
  },

  async handleLocations() {
    const CORS = { "Access-Control-Allow-Origin": "*" };
    const now = Date.now();
    if (LOCATIONS_CACHE.data && now < LOCATIONS_CACHE.expires) {
      return jsonResponse(LOCATIONS_CACHE.data, 200, CORS);
    }
    try {
      const response = await fetch('https://speed.cloudflare.com/locations', {
        headers: { 'Referer': 'https://speed.cloudflare.com/' }
      });
      const data = await response.json();
      LOCATIONS_CACHE.data = data;
      LOCATIONS_CACHE.expires = now + LOCATIONS_CACHE_TTL;
      return jsonResponse(data, 200, CORS);
    } catch (e) {
      // Serve stale cache on error rather than failing, if available
      if (LOCATIONS_CACHE.data) {
        return jsonResponse(LOCATIONS_CACHE.data, 200, CORS);
      }
      return jsonResponse({ error: e.message }, 500);
    }
  },

  async handleProxyIp(request, env) {
    if (request.method === 'POST') {
      let body;
      try { body = await request.json(); } catch (_) { body = {}; }
      const { iata, frag_len, frag_int } = body;
      let { proxy_ip } = body;

      // Resolve IATA domain to an IP server-side so the client's real IP is never
      // exposed to the DNS resolver and the lookup works in restrictive networks.
      if (iata && !proxy_ip) {
        // Bug fix: only re-resolve/reroll when the location actually changed.
        // This used to re-resolve on EVERY save (even just changing frag
        // settings) since the frontend always sends the currently-selected
        // iata — silently discarding whatever IP was already pinged/verified
        // for the same location.
        let currentIata = null;
        try {
          const iataRow = await env.DB.prepare("SELECT value FROM settings WHERE key = 'proxy_location_iata'").first();
          currentIata = iataRow?.value || null;
        } catch (e) {}
        let existingIataIp = null;
        try {
          const poolRow = await env.DB.prepare("SELECT ip FROM proxy_ip_pool WHERE source = 'iata'").first();
          existingIataIp = poolRow?.ip || null;
        } catch (e) {}

        if (currentIata === iata && existingIataIp) {
          // Unchanged location with a live pool row already in place — no-op,
          // just report the existing IP back so the panel doesn't go blank.
          proxy_ip = existingIataIp;
        } else {
          const domain = iata.toLowerCase() + '.proxyip.cmliussss.net';
          try {
            const dnsAnswers = await dohQuery(domain, 'A');
            const ips = dnsAnswers.filter(a => a.type === 1).map(a => a.data);
            proxy_ip = ips.length > 0
              ? ips[Math.floor(Math.random() * ips.length)]
              : domain;
          } catch (e) {
            proxy_ip = domain;
          }

          // Bug fix: seed a real latency_ms at insert time via a live probe
          // instead of leaving it NULL. The selection query orders by
          // COALESCE(latency_ms, 999999), so a fresh pick used to sort
          // dead-last until the next cron cycle happened to probe it —
          // meaning it sat unused for up to several minutes after Save.
          const probe = await probeProxyIp(proxy_ip);
          const probedNow = Date.now();

          // Location pick: land the resolved IP in the health-monitored pool
          // (source='iata') instead of the old unmonitored settings.proxy_ip
          // slot. Any previous iata-sourced row is replaced so only one
          // "picked location" candidate exists in the pool at a time.
          try {
            await env.DB.prepare("DELETE FROM proxy_ip_pool WHERE source = 'iata'").run();
            await env.DB.prepare(
              "INSERT OR REPLACE INTO proxy_ip_pool (ip, source, is_pinned, iata_code, latency_ms, last_checked, last_success, consecutive_failures) VALUES (?, 'iata', 0, ?, ?, ?, ?, 0)"
            ).bind(proxy_ip, iata, probe.success ? probe.latencyMs : null, probedNow, probe.success ? probedNow : null).run();
          } catch (e) {}
        }
      } else if (iata === '') {
        // "Automatic" selected: clearing the location shouldn't just blank
        // the label while an untracked IP lingers forever (the old one-way-
        // ratchet bug) — also drop any iata-sourced pool row so ranking
        // correctly falls back to whatever's actually healthy.
        try { await env.DB.prepare("DELETE FROM proxy_ip_pool WHERE source = 'iata'").run(); } catch (e) {}
      } else if (proxy_ip) {
        // Manual/direct IP entry (no iata involved): still lands in the pool
        // so it gets health-checked like everything else, tagged 'custom'.
        // Bug fix: same latency-seeding as the iata path above, so a manually
        // added IP is immediately ranked correctly instead of sorting last
        // until the next cron cycle.
        const probe = await probeProxyIp(proxy_ip);
        const probedNow = Date.now();
        try {
          await env.DB.prepare(
            "INSERT OR REPLACE INTO proxy_ip_pool (ip, source, is_pinned, latency_ms, last_checked, last_success, consecutive_failures) VALUES (?, 'custom', 1, ?, ?, ?, 0)"
          ).bind(proxy_ip, probe.success ? probe.latencyMs : null, probedNow, probe.success ? probedNow : null).run();
        } catch (e) {}
      }

      if (iata !== undefined) await env.DB.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('proxy_location_iata', ?)").bind(iata).run();
      if (frag_len !== undefined) await env.DB.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('frag_len', ?)").bind(frag_len).run();
      if (frag_int !== undefined) await env.DB.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('frag_int', ?)").bind(frag_int).run();

      // Invalidate the in-memory caches so the next connection picks up the new values immediately.
      PROXY_IP_CACHE.value = null;
      PROXY_IP_CACHE.expires = 0;
      invalidateProxyPoolCache();

      return jsonResponse({ success: true, proxy_ip: proxy_ip || null });
    }

    if (request.method === 'GET') {
      const { results } = await env.DB.prepare(
        "SELECT key, value FROM settings WHERE key IN ('proxy_location_iata', 'frag_len', 'frag_int')"
      ).all();
      const map = Object.fromEntries((results || []).map(r => [r.key, r.value]));

      // Unified model (post-redesign): the legacy settings.proxy_ip slot no
      // longer exists as a separate concept, so there's no 'fallback' source
      // anymore — only 'pool' (a real, monitored row) or 'default' (the
      // hardcoded hostname, used only when the pool is empty/paused/dead).
      // This is read-only (no cache mutation) since it's just for display in
      // the admin panel.
      let activeIp = DEFAULT_PROXY_IP;
      let activeSource = 'default';
      let connectMode = DEFAULT_CONNECT_MODE;
      try {
        const [poolRow, pausedRow, modeRow] = await Promise.all([
          env.DB.prepare(
            "SELECT ip FROM proxy_ip_pool WHERE is_disabled = 0 AND consecutive_failures < ? ORDER BY is_pinned DESC, consecutive_failures ASC, COALESCE(latency_ms, 999999) ASC LIMIT 1"
          ).bind(PROXY_POOL_MAX_FAILURES).first(),
          env.DB.prepare("SELECT value FROM settings WHERE key = 'pool_paused'").first(),
          env.DB.prepare("SELECT value FROM settings WHERE key = 'connect_mode'").first()
        ]);
        const poolPaused = pausedRow?.value === '1';
        if (!poolPaused && poolRow?.ip) {
          activeIp = poolRow.ip;
          activeSource = 'pool';
        }
        connectMode = modeRow?.value || DEFAULT_CONNECT_MODE;
      } catch (e) {}

      return jsonResponse({
        proxy_ip:        activeIp,
        iata:            map['proxy_location_iata'] || "",
        frag_len:        map['frag_len']            || "20-30",
        frag_int:        map['frag_int']             || "1-2",
        active_ip:       activeIp,
        active_source:   activeSource,
        connect_mode:    connectMode,
      });
    }

    return jsonResponse({ error: "Method Not Allowed" }, 405);
  },

  // CRUD handler for the proxy IP pool (multi-IP, health-checked).
  // GET  /api/proxy-ip-pool        → list all rows
  // POST /api/proxy-ip-pool        → add one or more IPs (body: { ips: string[] })
  // DELETE /api/proxy-ip-pool      → remove one or more IPs (body: { ip: string } or { ips: string[] })
  // PATCH /api/proxy-ip-pool       → per-IP: { ip, action: 'pin'|'unpin'|'toggle-disabled'|'reset-failures' }
  //                                   bulk:   { ips: string[], action: 'bulk-pin'|'bulk-unpin'|'bulk-disable'|'bulk-enable' }
  //                                   global: { action: 'check-all'|'clear-dead'|'pause-all'|'resume-all' }
  async handleProxyIpPool(request, env) {
    if (request.method === 'GET') {
      try {
        const { results } = await env.DB.prepare(PROXY_POOL_SELECT_SQL).all();
        let poolPaused = false;
        try {
          const row = await env.DB.prepare("SELECT value FROM settings WHERE key = 'pool_paused'").first();
          poolPaused = row?.value === '1';
        } catch (e) {}
        return jsonResponse({ pool: results || [], pool_paused: poolPaused });
      } catch (e) {
        return jsonResponse({ error: e.message }, 500);
      }
    }

    if (request.method === 'POST') {
      let body;
      try { body = await request.json(); } catch (_) { body = {}; }
      const rawIps = Array.isArray(body.ips) ? body.ips : [];
      const source = body.source || 'custom';
      const isPinned = body.is_pinned ? 1 : 0;
      const added = [];
      const errors = [];

      for (const rawIp of rawIps) {
        const ip = String(rawIp).trim();
        if (!ip) continue;
        try {
          await env.DB.prepare(
            "INSERT OR IGNORE INTO proxy_ip_pool (ip, source, is_pinned) VALUES (?, ?, ?)"
          ).bind(ip, source, isPinned).run();
          added.push(ip);
        } catch (e) {
          errors.push({ ip, error: e.message });
        }
      }

      invalidateProxyPoolCache();
      return jsonResponse({ success: true, added, errors });
    }

    if (request.method === 'DELETE') {
      let body;
      try { body = await request.json(); } catch (_) { body = {}; }
      const rawIps = Array.isArray(body.ips) ? body.ips : (body.ip ? [body.ip] : []);
      const ips = [...new Set(rawIps.map(v => String(v).trim()).filter(Boolean))];
      if (ips.length === 0) return jsonResponse({ error: "ip or ips required" }, 400);
      try {
        const placeholders = ips.map(() => '?').join(',');
        await env.DB.prepare(`DELETE FROM proxy_ip_pool WHERE ip IN (${placeholders})`).bind(...ips).run();
        invalidateProxyPoolCache();
        return jsonResponse({ success: true, affected: ips.length });
      } catch (e) {
        return jsonResponse({ error: e.message }, 500);
      }
    }

    if (request.method === 'PATCH') {
      let body;
      try { body = await request.json(); } catch (_) { body = {}; }
      const action = body.action || '';
      const ip = String(body.ip || '').trim();

      // --- Global actions (no ip needed) ---

      // Trigger an immediate health check across all pool IPs then return fresh rows.
      // Same logic as the cron job but invoked on-demand so the panel doesn't have
      // to wait for the next scheduled run to see updated latencies.
      if (action === 'check-all') {
        await runProxyPoolHealthCheck(env);
        try {
          const { results } = await env.DB.prepare(PROXY_POOL_SELECT_SQL).all();
          return jsonResponse({ success: true, pool: results || [] });
        } catch (e) {
          return jsonResponse({ success: true, pool: [] });
        }
      }

      // Remove all dead-listed IPs (consecutive_failures >= 3) in one shot.
      if (action === 'clear-dead') {
        try {
          await env.DB.prepare(`DELETE FROM proxy_ip_pool WHERE consecutive_failures >= ${PROXY_POOL_MAX_FAILURES}`).run();
          invalidateProxyPoolCache();
          const { results } = await env.DB.prepare(PROXY_POOL_SELECT_SQL).all();
          return jsonResponse({ success: true, pool: results || [] });
        } catch (e) {
          return jsonResponse({ error: e.message }, 500);
        }
      }

      // Pause/resume the entire pool at once — every IP is treated as unavailable
      // while paused, regardless of its individual is_disabled/health state.
      // This does NOT touch is_disabled on individual rows, so resuming restores
      // exactly the per-IP state that was in effect before pausing.
      if (action === 'pause-all' || action === 'resume-all') {
        const paused = action === 'pause-all' ? '1' : '0';
        try {
          await env.DB.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('pool_paused', ?)").bind(paused).run();
          invalidateProxyPoolCache();
          return jsonResponse({ success: true, pool_paused: paused === '1' });
        } catch (e) {
          return jsonResponse({ error: e.message }, 500);
        }
      }

      // Switch the connection order live, no redeploy needed. 'direct-first'
      // is the original behavior (try real destination, pool as fallback);
      // 'pool-first' inverts it (try pool candidates, direct destination as
      // last resort) — meant for temporarily testing pool-first routing,
      // then flipping back to 'direct-first'.
      if (action === 'set-connect-mode') {
        const mode = body.mode === 'pool-first' ? 'pool-first' : 'direct-first';
        try {
          await env.DB.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('connect_mode', ?)").bind(mode).run();
          invalidateProxyPoolCache();
          PROXY_POOL_CACHE.connectMode = undefined;
          return jsonResponse({ success: true, connect_mode: mode });
        } catch (e) {
          return jsonResponse({ error: e.message }, 500);
        }
      }

      // --- Bulk actions (ips: string[] required) ---
      // Each operates on a caller-supplied list of IPs in one batched D1 call
      // via a parameterized IN (...) clause, rather than N individual UPDATEs.
      if (action === 'bulk-disable' || action === 'bulk-enable' || action === 'bulk-pin' || action === 'bulk-unpin') {
        const rawIps = Array.isArray(body.ips) ? body.ips : [];
        const ips = [...new Set(rawIps.map(v => String(v).trim()).filter(Boolean))];
        if (ips.length === 0) return jsonResponse({ error: "ips required" }, 400);

        const placeholders = ips.map(() => '?').join(',');
        let column, value;
        if (action === 'bulk-disable') { column = 'is_disabled'; value = 1; }
        else if (action === 'bulk-enable') { column = 'is_disabled'; value = 0; }
        else if (action === 'bulk-pin') { column = 'is_pinned'; value = 1; }
        else { column = 'is_pinned'; value = 0; }

        try {
          await env.DB.prepare(
            `UPDATE proxy_ip_pool SET ${column} = ? WHERE ip IN (${placeholders})`
          ).bind(value, ...ips).run();
          invalidateProxyPoolCache();
          return jsonResponse({ success: true, affected: ips.length });
        } catch (e) {
          return jsonResponse({ error: e.message }, 500);
        }
      }

      // --- Per-IP actions (ip required) ---

      if (!ip) return jsonResponse({ error: "ip required" }, 400);

      if (action === 'pin' || action === 'unpin') {
        const isPinned = action === 'pin' ? 1 : 0;
        try {
          await env.DB.prepare("UPDATE proxy_ip_pool SET is_pinned = ? WHERE ip = ?").bind(isPinned, ip).run();
          invalidateProxyPoolCache();
          return jsonResponse({ success: true });
        } catch (e) {
          return jsonResponse({ error: e.message }, 500);
        }
      }

      if (action === 'toggle-disabled') {
        try {
          await env.DB.prepare("UPDATE proxy_ip_pool SET is_disabled = CASE WHEN is_disabled = 1 THEN 0 ELSE 1 END WHERE ip = ?").bind(ip).run();
          invalidateProxyPoolCache();
          return jsonResponse({ success: true });
        } catch (e) {
          return jsonResponse({ error: e.message }, 500);
        }
      }

      if (action === 'reset-failures') {
        try {
          await env.DB.prepare("UPDATE proxy_ip_pool SET consecutive_failures = 0 WHERE ip = ?").bind(ip).run();
          invalidateProxyPoolCache();
          return jsonResponse({ success: true });
        } catch (e) {
          return jsonResponse({ error: e.message }, 500);
        }
      }

      return jsonResponse({ error: "Unknown action" }, 400);
    }

    return jsonResponse({ error: "Method Not Allowed" }, 405);
  },

  async handleUsers(request, url, env, ctx) {
    const pathParts = url.pathname.split('/');
    const isUserAction = pathParts.length > 3; // /api/users/username

    if (isUserAction) {
      const username = decodeURIComponent(pathParts[3]);
      const subAction = pathParts[4];

      if (subAction === 'reset-link' && request.method === 'POST') {
        // Issues a fresh subscription link without breaking the old one for
        // anyone still on the username-based link. The old uuid keeps
        // authenticating existing WebSocket connections until the 20s
        // UUID_USER_CACHE TTL naturally expires — no forced disconnect.
        const existing = await env.DB.prepare("SELECT id FROM users WHERE username = ?").bind(username).first();
        if (!existing) return jsonResponse({ error: "User not found" }, 404);
        const subToken = generateSubToken();
        const uuid = crypto.randomUUID();
        await env.DB.prepare("UPDATE users SET sub_token = ?, uuid = ? WHERE username = ?")
          .bind(subToken, uuid, username).run();
        DbService.invalidateUserCache(username);
        return jsonResponse({ success: true, sub_token: subToken, uuid });
      }

      if (request.method === 'GET') {
        try {
          await flushExpiredTraffic(env, ctx);
        } catch (e) {}
        const user = await env.DB.prepare(
          "SELECT id, username, uuid, sub_token, limit_gb, expiry_days, ips, tls, port, port_text, used_gb, is_active, last_active, fingerprint, tag, show_weather, weather_city, created_at FROM users WHERE username = ? OR sub_token = ?"
        ).bind(username, username).first();
        if (!user) return jsonResponse({ error: "User not found" }, 404);
        const cachedBytes = GLOBAL_TRAFFIC_CACHE.get(user.username) || 0;
        const cachedGb    = cachedBytes / (1024 * 1024 * 1024);
        const now         = Date.now();
        return jsonResponse({
          ...user,
          used_gb:   (user.used_gb || 0) + cachedGb,
          is_online: (user.last_active && (now - user.last_active) < 65000) ? 1 : 0,
          serverTime: now,
        }, 200, { "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0" });
      }

      if (request.method === 'PUT') {
        const { limit_gb, expiry_days, ips, port, fingerprint, tag, show_weather, weather_city } = await request.json();
        const portText = Array.isArray(port) ? port.join(',') : String(port || '443');
        const tlsDerived = deriveTls(portText);
        await env.DB.prepare(
          "UPDATE users SET limit_gb = ?, expiry_days = ?, ips = ?, tls = ?, port = ?, port_text = ?, fingerprint = ?, tag = ?, show_weather = ?, weather_city = ? WHERE username = ?"
        ).bind(
          limit_gb ? parseFloat(limit_gb) : null,
          expiry_days ? parseInt(expiry_days) : null,
          ips || null,
          tlsDerived,
          parseInt(portText.split(',')[0]) || 443,
          portText,
          VALID_FINGERPRINTS.has(fingerprint) ? fingerprint : 'chrome',
          tag ? tag.trim() : null,
          show_weather ? 1 : 0,
          weather_city ? weather_city.trim() : null,
          username
        ).run();
        DbService.invalidateUserCache(username);
        return jsonResponse({ success: true });
      }

      if (request.method === 'DELETE') {
        await env.DB.prepare("DELETE FROM users WHERE username = ?").bind(username).run();
        GLOBAL_TRAFFIC_CACHE.delete(username);
        ACTIVE_CONNECTIONS_COUNT.delete(username);
        GLOBAL_LAST_ACTIVE_WRITE.delete(username);
        DbService.invalidateUserCache(username);
        return jsonResponse({ success: true });
      }

      if (request.method === 'PATCH') {
        // Distinguish sub-actions via ?action= query param
        const action = url.searchParams.get('action') || 'toggle';

        if (action === 'reset-traffic') {
          // Reset used_gb to 0 and clear in-memory cache
          GLOBAL_TRAFFIC_CACHE.set(username, 0);
          await env.DB.prepare("UPDATE users SET used_gb = 0 WHERE username = ?").bind(username).run();
          DbService.invalidateUserCache(username);
          return jsonResponse({ success: true });
        }

        if (action === 'extend') {
          let body2;
          try { body2 = await request.json(); } catch (_) { body2 = {}; }
          const rawDays = parseInt(body2.days);
          if (isNaN(rawDays) || rawDays <= 0) {
            return jsonResponse({ error: "days must be a positive integer" }, 400);
          }
          const days = Math.min(rawDays, 3650); // cap at 10 years
          // If user has no expiry set, start from today
          const user2 = await env.DB.prepare("SELECT expiry_days, created_at FROM users WHERE username = ?").bind(username).first();
          if (!user2) return jsonResponse({ error: "User not found" }, 404);
          const newExpiry = (user2.expiry_days || 0) + days;
          await env.DB.prepare("UPDATE users SET expiry_days = ? WHERE username = ?").bind(newExpiry, username).run();
          DbService.invalidateUserCache(username);
          return jsonResponse({ success: true, expiry_days: newExpiry });
        }

        // Default: Toggle is_active: 1 → 0 (paused) or 0 → 1 (resumed)
        const user = await env.DB.prepare("SELECT is_active FROM users WHERE username = ?").bind(username).first();
        if (!user) {
          return jsonResponse({ error: "User not found" }, 404);
        }
        const newActive = user.is_active === 0 ? 1 : 0;
        await env.DB.prepare("UPDATE users SET is_active = ? WHERE username = ?").bind(newActive, username).run();
        DbService.invalidateUserCache(username);
        return jsonResponse({ success: true, is_active: newActive });
      }
    } else {
      if (request.method === 'GET') {
        try {
          await flushExpiredTraffic(env, ctx);
        } catch (e) {}
        const { results } = await env.DB.prepare(
          "SELECT id, username, uuid, sub_token, limit_gb, expiry_days, ips, tls, port, port_text, used_gb, is_active, last_active, fingerprint, tag, show_weather, weather_city, created_at FROM users ORDER BY id DESC"
        ).all();
        const now = Date.now();
        const enrichedUsers = (results || []).map(user => {
          const cachedBytes = GLOBAL_TRAFFIC_CACHE.get(user.username) || 0;
          const cachedGb = cachedBytes / (1024 * 1024 * 1024);
          return {
            ...user,
            used_gb: (user.used_gb || 0) + cachedGb,
            is_online: (user.last_active && (now - user.last_active) < 65000) ? 1 : 0
          };
        });
        return jsonResponse({ users: enrichedUsers, serverTime: now }, 200, {
          "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0"
        });
      }

      if (request.method === 'POST') {
        const { username, limit_gb, expiry_days, ips, port, fingerprint, tag, show_weather, weather_city } = await request.json();
        if (!username) {
          return jsonResponse({ error: "Username is required" }, 400);
        }
        if (typeof username !== 'string' || username.length > 64) {
          return jsonResponse({ error: "Username must be 64 characters or fewer" }, 400);
        }
        if (!/^[a-zA-Z0-9_\-\.]+$/.test(username)) {
          return jsonResponse({ error: "Username may only contain letters, numbers, underscores, hyphens, and dots" }, 400);
        }
        const uuid = crypto.randomUUID();
        const subToken = generateSubToken();
        const portText = Array.isArray(port) ? port.join(',') : String(port || '443');
        // Derive tls from whether any selected port is a known TLS port
        const tlsDerived = deriveTls(portText);
        try {
          await env.DB.prepare(
            "INSERT INTO users (username, uuid, sub_token, limit_gb, expiry_days, ips, connection_type, tls, port, port_text, fingerprint, tag, show_weather, weather_city) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
          ).bind(
            username,
            uuid,
            subToken,
            limit_gb ? parseFloat(limit_gb) : null,
            expiry_days ? parseInt(expiry_days) : null,
            ips || null,
            atob('dmxlc3M='),
            tlsDerived,
            parseInt(portText.split(',')[0]) || 443,
            portText,
            VALID_FINGERPRINTS.has(fingerprint) ? fingerprint : 'chrome',
            tag ? tag.trim() : null,
            show_weather ? 1 : 0,
            weather_city ? weather_city.trim() : null
          ).run();
          // Return the generated UUID so callers (e.g. manager) can store it
          // without needing a second GET /api/users/<username> round-trip.
          return jsonResponse({ success: true, uuid, sub_token: subToken, username });
        } catch (err) {
          let errorMsg = err.message;
          if (errorMsg.includes("UNIQUE constraint failed")) {
            errorMsg = "This username already exists.";
          }
          return jsonResponse({ error: errorMsg }, 409);
        }
      }
    }

    return jsonResponse({ error: "Not Found" }, 404);
  }
};
export { Router };
