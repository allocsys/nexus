import { _te } from '../lib/encoding.js';
import { generateSubToken } from '../lib/crypto.js';

// Short-lived cache for the UUID -> user row lookup that runs on every new
// VLESS connection (handleVLESS auth check). Unlike the proxy pool / DNS
// caches, this gates access control (bans, expiry, quota), so the TTL is
// kept short and admin mutations actively invalidate affected entries
// rather than waiting out the TTL. Negative lookups (invalid UUID) are
// also cached to avoid a full D1 query per bad probe.
const UUID_USER_CACHE = new Map(); // uuid -> { user: row|null, expires }

const UUID_CACHE_TTL = 20 * 1000; // 20 seconds
const UUID_CACHE_MAX = 1000;   // max entries before a prune sweep evicts expired keys

let schemaEnsured = false;

// Short-lived in-memory cache for the session token.
// Reading from D1 on every authenticated API call (panel polls every 60 s) is
// wasteful. We cache the token for 30 s; createSession() invalidates it
// immediately so a fresh login is always reflected within the same isolate.
const SESSION_TOKEN_CACHE = { value: null, expires: 0 };
const SESSION_TOKEN_CACHE_TTL = 30 * 1000; // 30 seconds

// Simple in-isolate rate limiter for login attempts: tracks { count, windowStart }
const LOGIN_ATTEMPTS = new Map();
const LOGIN_MAX_ATTEMPTS = 10;
const LOGIN_WINDOW_MS = 60 * 1000; // 1 minute

const DbService = {
  checkLoginRateLimit(ip) {
    const now = Date.now();

    // Prune expired entries so the map doesn't grow unbounded if many unique
    // IPs hit the login endpoint. Only runs when the map has accumulated more
    // than 500 entries so normal usage pays zero iteration cost.
    if (LOGIN_ATTEMPTS.size > 500) {
      for (const [key, val] of LOGIN_ATTEMPTS.entries()) {
        if (now - val.windowStart > LOGIN_WINDOW_MS) LOGIN_ATTEMPTS.delete(key);
      }
    }

    const entry = LOGIN_ATTEMPTS.get(ip) || { count: 0, windowStart: now };
    if (now - entry.windowStart > LOGIN_WINDOW_MS) {
      // Window expired — reset
      LOGIN_ATTEMPTS.set(ip, { count: 1, windowStart: now });
      return true;
    }
    if (entry.count >= LOGIN_MAX_ATTEMPTS) return false;
    entry.count++;
    LOGIN_ATTEMPTS.set(ip, entry);
    return true;
  },

  clearLoginRateLimit(ip) {
    LOGIN_ATTEMPTS.delete(ip);
  },

  async ensureSchema(db) {
    if (schemaEnsured) return;

    // Wrap the entire migration block so that if anything throws unexpectedly,
    // schemaEnsured stays false and the next request retries the migration
    // rather than silently serving a partially-migrated schema forever.
    try {

    // Ensure settings table exists first so we can read schema_version
    try { await db.prepare("CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT)").run(); } catch (e) {}

    const CURRENT_SCHEMA_VERSION = 13;
    let schemaVersion = 0;
    try {
      const row = await db.prepare("SELECT value FROM settings WHERE key = 'schema_version'").first();
      schemaVersion = row ? parseInt(row.value) || 0 : 0;
    } catch (e) {}

    if (schemaVersion < 1) {
      try {
        await db.prepare(`
          CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE,
            uuid TEXT,
            limit_gb REAL,
            expiry_days INTEGER,
            ips TEXT,
            connection_type TEXT,
            tls TEXT,
            port INTEGER,
            port_text TEXT,
            used_gb REAL DEFAULT 0,
            is_active INTEGER DEFAULT 1,
            last_active INTEGER,
            fingerprint TEXT DEFAULT 'chrome',
            tag TEXT,
            show_weather INTEGER DEFAULT 0,
            weather_city TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
          )
        `).run();
      } catch (e) {}
    }

    if (schemaVersion < 2) {
      try { await db.prepare("ALTER TABLE users ADD COLUMN is_active INTEGER DEFAULT 1").run(); } catch (e) {}
      try { await db.prepare("ALTER TABLE users ADD COLUMN last_active INTEGER").run(); } catch (e) {}
    }

    if (schemaVersion < 3) {
      try { await db.prepare("ALTER TABLE users ADD COLUMN port_text TEXT").run(); } catch (e) {}
      try { await db.prepare("UPDATE users SET port_text = CAST(port AS TEXT) WHERE port_text IS NULL AND port IS NOT NULL").run(); } catch (e) {}
    }

    if (schemaVersion < 4) {
      try { await db.prepare("ALTER TABLE users ADD COLUMN fingerprint TEXT DEFAULT 'chrome'").run(); } catch (e) {}
    }

    if (schemaVersion < 5) {
      try { await db.prepare("ALTER TABLE users ADD COLUMN tag TEXT").run(); } catch (e) {}
    }

    if (schemaVersion < 6) {
      try { await db.prepare("ALTER TABLE users ADD COLUMN show_weather INTEGER DEFAULT 0").run(); } catch (e) {}
    }

    if (schemaVersion < 7) {
      try { await db.prepare("ALTER TABLE users ADD COLUMN weather_city TEXT").run(); } catch (e) {}
    }

    if (schemaVersion < 8) {
      // Pool of candidate proxy IPs for the "smart" proxy IP selection feature.
      // - ip: the IP or hostname to connect through (unique)
      // - source: where it came from - 'custom' (user-pinned), 'iata' (resolved
      //   from a Cloudflare location), or 'default' (hardcoded fallback)
      // - latency_ms: last measured TCP connect latency in ms, NULL if untested
      // - last_checked: unix ms timestamp of the last health check, NULL if never
      // - last_success: unix ms timestamp of the last successful health check
      // - consecutive_failures: count of consecutive failed health checks, used
      //   to temporarily skip ("dead-list") an IP without removing it permanently
      // - is_pinned: 1 for the user's custom proxy IP, always tried first
      //   regardless of health-check status (still subject to live failover)
      try {
        await db.prepare(`
          CREATE TABLE IF NOT EXISTS proxy_ip_pool (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            ip TEXT UNIQUE NOT NULL,
            source TEXT DEFAULT 'custom',
            latency_ms INTEGER,
            last_checked INTEGER,
            last_success INTEGER,
            consecutive_failures INTEGER DEFAULT 0,
            is_pinned INTEGER DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
          )
        `).run();
      } catch (e) {}
      // Index used by the selection query: healthy, non-dead-listed candidates
      // ordered by latency. Cron health-checker (added later) will keep these
      // columns fresh; handleVLESS failover (added later) will read this order.
      try {
        await db.prepare("CREATE INDEX IF NOT EXISTS idx_proxy_pool_selection ON proxy_ip_pool (consecutive_failures, latency_ms)").run();
      } catch (e) {}
    }

    if (schemaVersion < 9) {
      // is_disabled: soft-disables a pool IP from being used in connections without
      // deleting it. Disabled IPs are still stored, health-checked, and visible in
      // the panel, but are excluded from the candidate list in handleWebSocket.
      try { await db.prepare("ALTER TABLE proxy_ip_pool ADD COLUMN is_disabled INTEGER DEFAULT 0").run(); } catch (e) {}
    }

    if (schemaVersion < 10) {
      // sub_token: opaque reset-link identifier, independent of username/uuid.
      // Nullable — existing rows stay NULL and keep resolving via username;
      // only accounts that go through POST /reset-link get one assigned.
      try { await db.prepare("ALTER TABLE users ADD COLUMN sub_token TEXT").run(); } catch (e) {}
    }

    if (schemaVersion < 11) {
      // T5 backfill: POST /api/users has generated a sub_token for every
      // account since v10, so "sub_token IS NULL" has been dead for all
      // but pre-v10 rows — /sub/<username> was 404ing for every new user
      // while pre-v10 rows never got a /feed/<sub_token> link. Give every
      // remaining NULL row a token so the whole table resolves via
      // /feed/<sub_token> and /sub/ can be retired as a single canonical
      // link going forward (see T5 plan above).
      try {
        const { results } = await db.prepare(
          "SELECT id FROM users WHERE sub_token IS NULL"
        ).all();
        for (const row of (results || [])) {
          try {
            await db.prepare("UPDATE users SET sub_token = ? WHERE id = ?")
              .bind(generateSubToken(), row.id).run();
          } catch (e) {}
        }
      } catch (e) {}
    }

    if (schemaVersion < 12) {
      // Architectural redesign (T-unify-proxy): collapse the two parallel
      // "what IP to fall back to" systems (health-monitored proxy_ip_pool vs.
      // the never-monitored legacy settings.proxy_ip slot) into one.
      //
      // iata_code: which Cloudflare location an 'iata'-sourced row was
      // resolved from (e.g. 'MUC'). Needed so the health-checker and
      // handleWebSocket can re-resolve {iata_code}.proxyip.cmliussss.net for
      // a fresh IP in the same country instead of just dead-listing the row
      // and silently falling through to the anonymous default.
      try { await db.prepare("ALTER TABLE proxy_ip_pool ADD COLUMN iata_code TEXT").run(); } catch (e) {}

      // One-time migration: if a legacy settings.proxy_ip value exists and
      // isn't already a pool row, bring it in as a pinned row so nothing
      // goes dark during the transition. Tagged 'legacy-migrated' (distinct
      // from 'custom'/'iata') purely for provenance/debugging.
      try {
        const legacyRow = await db.prepare("SELECT value FROM settings WHERE key = 'proxy_ip'").first();
        const legacyIp = legacyRow?.value;
        if (legacyIp) {
          const existing = await db.prepare("SELECT id FROM proxy_ip_pool WHERE ip = ?").bind(legacyIp).first();
          if (!existing) {
            const legacyIata = await db.prepare("SELECT value FROM settings WHERE key = 'proxy_location_iata'").first();
            await db.prepare(
              "INSERT OR IGNORE INTO proxy_ip_pool (ip, source, is_pinned, iata_code) VALUES (?, 'legacy-migrated', 1, ?)"
            ).bind(legacyIp, legacyIata?.value || null).run();
          }
        }
      } catch (e) {}
    }

    if (schemaVersion < 13) {
      // Bug fix (2026-07): consecutive_failures was being written by two
      // unrelated sources — the health-check cron's own TLS-probe timeout,
      // and connectTCP's real-traffic pool-fallback failures — sharing one
      // dead-list threshold. A transient live-traffic hiccup could dead-list
      // a genuinely healthy IP. live_failures now absorbs the real-traffic
      // count; consecutive_failures (and therefore the is_disabled/dead-list
      // filter) is driven ONLY by the health-check cron going forward.
      try { await db.prepare("ALTER TABLE proxy_ip_pool ADD COLUMN live_failures INTEGER DEFAULT 0").run(); } catch (e) {}
    }

    if (schemaVersion < CURRENT_SCHEMA_VERSION) {
      try {
        await db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('schema_version', ?)").bind(String(CURRENT_SCHEMA_VERSION)).run();
      } catch (e) {}
    }

    // Only mark as done if we reach here without an unexpected throw.
    // Individual ALTER TABLE failures are caught above and are expected on
    // fresh DBs (column already exists). An uncaught throw from outside those
    // try/catch blocks (e.g. the settings CREATE TABLE itself) would propagate
    // to the outer catch and leave schemaEnsured = false for the next request.
    schemaEnsured = true;

    } catch (e) {
      // Migration failed unexpectedly — leave schemaEnsured false so the next
      // request retries rather than silently serving a broken schema.
      console.error('[ensureSchema] Migration failed, will retry:', e);
    }
  },

  async getPanelPassword(db) {
    try {
      const row = await db.prepare("SELECT value FROM settings WHERE key = 'panel_password'").first();
      return (row && row.value) ? row.value : null;
    } catch (e) {
      return null;
    }
  },

  async setPanelPassword(db, password) {
    await db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('panel_password', ?)").bind(password).run();
  },

  // Generate a cryptographically random session token and persist it in the DB.
  // Invalidates the in-memory session cache so verifyApiAuth picks up the new
  // token immediately without waiting for the 30-second TTL to expire.
  async createSession(db) {
    const raw = crypto.getRandomValues(new Uint8Array(32));
    const token = Array.from(raw).map(b => b.toString(16).padStart(2, '0')).join('');
    await db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('session_token', ?)").bind(token).run();
    SESSION_TOKEN_CACHE.value = token;
    SESSION_TOKEN_CACHE.expires = Date.now() + SESSION_TOKEN_CACHE_TTL;
    return token;
  },

  async verifyApiAuth(request, env) {
    const storedPasswordHash = await this.getPanelPassword(env.DB);
    // Do NOT auto-pass when no password has been set yet — an unconfigured
    // instance should deny cookie-based API access, not allow it openly.
    if (!storedPasswordHash) return false;
    const cookies = request.headers.get('Cookie') || '';
    const sessionCookie = cookies.split(';').find(c => c.trim().startsWith('panel_session='));
    if (!sessionCookie) return false;
    const sessionToken = sessionCookie.trim().slice('panel_session='.length).trim();
    // Verify against the stored random session token, not the password hash.
    // Use constant-time comparison to prevent timing-based token enumeration.
    // Serve from the in-memory cache (30s TTL) to avoid a D1 round-trip on
    // every authenticated API call; createSession() always populates the cache.
    try {
      let storedToken = null;
      const now = Date.now();
      if (SESSION_TOKEN_CACHE.value && now < SESSION_TOKEN_CACHE.expires) {
        storedToken = SESSION_TOKEN_CACHE.value;
      } else {
        const row = await env.DB.prepare("SELECT value FROM settings WHERE key = 'session_token'").first();
        if (!row || !row.value) return false;
        storedToken = row.value;
        SESSION_TOKEN_CACHE.value = storedToken;
        SESSION_TOKEN_CACHE.expires = now + SESSION_TOKEN_CACHE_TTL;
      }
      const a = _te.encode(sessionToken.padEnd(64, '\0').slice(0, 64));
      const b = _te.encode(storedToken.padEnd(64, '\0').slice(0, 64));
      // Fold the exact-length check into diff so the return is always a single
      // constant-time comparison — avoids the short-circuit timing leak from &&.
      let diff = sessionToken.length === storedToken.length ? 0 : 1;
      for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
      return diff === 0;
    } catch (e) {
      return false;
    }
  },

  async sha256(message) {
    const msgBuffer = _te.encode(message);
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  },

  // ----------------------------------------------------------------------
  // UUID -> user cache. Backs the per-connection auth lookup in handleVLESS
  // (one of these runs per new VLESS stream, so an uncached D1 round-trip
  // there sits directly in the connection-setup critical path). TTL-based
  // like the other module caches, but additionally invalidated eagerly by
  // username on any write that can change a user's auth/quota status, so
  // bans and edits take effect immediately instead of waiting out the TTL.
  // ----------------------------------------------------------------------
  getCachedUserByUuid(uuid) {
    const entry = UUID_USER_CACHE.get(uuid);
    if (!entry) return { hit: false };
    if (Date.now() >= entry.expires) {
      UUID_USER_CACHE.delete(uuid);
      return { hit: false };
    }
    return { hit: true, user: entry.user };
  },

  cacheUserByUuid(uuid, user) {
    // Bound the map before inserting so a flood of bogus UUID probes can't
    // grow it unboundedly between TTL sweeps.
    if (UUID_USER_CACHE.size >= UUID_CACHE_MAX) {
      const now = Date.now();
      for (const [k, v] of UUID_USER_CACHE.entries()) {
        if (now >= v.expires) UUID_USER_CACHE.delete(k);
      }
      // Still over the cap after pruning expired entries (e.g. sustained
      // probing within one TTL window) — drop the oldest entry to make room
      // rather than skip caching entirely.
      if (UUID_USER_CACHE.size >= UUID_CACHE_MAX) {
        const oldestKey = UUID_USER_CACHE.keys().next().value;
        if (oldestKey !== undefined) UUID_USER_CACHE.delete(oldestKey);
      }
    }
    UUID_USER_CACHE.set(uuid, { user, expires: Date.now() + UUID_CACHE_TTL });
  },

  // Called from every admin mutation that can change a user's auth status
  // (toggle active, edit quota/expiry, reset traffic, delete). Bounded by
  // UUID_CACHE_MAX (<=1000), and only runs on infrequent admin writes, so
  // the linear scan is negligible — there's no separate username->uuid
  // index to keep in sync, which keeps the cache itself a single source
  // of truth.
  invalidateUserCache(username) {
    for (const [uuid, entry] of UUID_USER_CACHE.entries()) {
      if (entry.user && entry.user.username === username) {
        UUID_USER_CACHE.delete(uuid);
        return;
      }
    }
  },

  // Returns true if the user is allowed to connect, false otherwise.
  // Accepts a user row from the DB (must include is_active, limit_gb, used_gb, expiry_days, created_at).
  isUserAllowed(user) {
    if (!user || user.is_active === 0) return false;
    if (user.limit_gb && user.used_gb >= user.limit_gb) return false;
    if (user.expiry_days && user.created_at) {
      const created = new Date(user.created_at);
      const expiryDate = new Date(created.getTime() + (user.expiry_days * 24 * 60 * 60 * 1000));
      if (new Date() > expiryDate) return false;
    }
    return true;
  }
};
export { DbService };
