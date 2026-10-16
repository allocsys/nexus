import { Router } from './web/router.js';
import { DbService } from './services/db.js';
import { HTML_TEMPLATES } from './web/templates.js';
import { runProxyPoolHealthCheck } from './services/proxy-pool.js';

export default {
  async fetch(request, env, ctx) {
    // TEMP CRASH CAPTURE — fetch() previously had no top-level try/catch, so
    // any uncaught synchronous/async throw anywhere in the routing chain
    // propagated straight to the runtime as a bare error 1101 with nothing
    // in wrangler tail (especially if it happened before the first
    // console.log, or during a tail reconnect gap). This wraps the entire
    // handler so the real exception — message, stack, and which URL
    // triggered it — always gets logged before we return a response.
    // Safe to leave on long-term; remove the console.error verbosity once
    // the current crash is identified if it's too noisy.
    try {
      const url = new URL(request.url);

      // WebSocket proxy path — skip ensureSchema entirely.
      // handleVLESS never reads the schema; putting DB migrations on the hot
      // proxy path was the primary cause of "Worker hung" errors and added
      // unnecessary latency before the WebSocket handshake was accepted.
      if (Router.isWebSocketUpgrade(request) && url.pathname === '/') {
        return await Router.handleWebSocket(request, env, ctx);
      }

      // All non-proxy routes need the schema to be up-to-date.
      await DbService.ensureSchema(env.DB);

      // Routes for subscription / feed endpoints
      if (Router.isSubscriptionPath(url.pathname)) {
        return await Router.handleSubscription(url, env, request);
      }

      // Routes for web service APIs
      if (url.pathname.startsWith('/api/') || url.pathname === '/locations') {
        return await Router.handleApi(request, url, env, ctx);
      }

      // Load the admin panel shell
      if (url.pathname === '/panel') {
        return await Router.handlePanel(request, env);
      }

      // Show a fake Nginx page for all other unmatched paths
      return new Response(HTML_TEMPLATES.nginx, {
        headers: { "Content-Type": "text/html; charset=utf-8" }
      });
    } catch (e) {
      console.error(`[fetch-crash] ${request.method} ${request.url} :: ${e && e.stack ? e.stack : e}`);
      return new Response('Internal error: ' + (e && e.message ? e.message : String(e)), { status: 500 });
    }
  },

  // ==========================================================
  // 3b. Scheduled cron handler (HEALTH CHECKER)
  // ==========================================================
  async scheduled(event, env, ctx) {
    ctx.waitUntil(runProxyPoolHealthCheck(env));
  }
};
