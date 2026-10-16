import { TLS_PORTS } from '../config/constants.js';

// Derive TLS setting from a comma-separated port string.
// Returns 'on' if any port is a known TLS port, 'off' otherwise.
// Single source of truth — used by both POST and PUT user handlers.
function deriveTls(portText) {
  return portText.split(',').map(p => p.trim()).some(p => TLS_PORTS.includes(p)) ? 'on' : 'off';
}

// Convenience wrapper: produces a JSON Response with correct Content-Type and
// an optional status code. Eliminates the repeated header boilerplate throughout
// the router and keeps response construction to a single line at each call-site.
function jsonResponse(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", ...extraHeaders }
  });
}
export { deriveTls, jsonResponse };
