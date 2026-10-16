import { TLS_PORTS } from '../config/constants.js';
import { _te } from '../lib/encoding.js';

const WEATHER_CACHE = new Map();
const WEATHER_CACHE_TTL = 180 * 60 * 1000; // 3 hours — weather doesn't change fast enough to justify per-request lookups
const WEATHER_CACHE_FAIL_TTL = 15 * 60 * 1000; // shorter TTL for failed lookups so transient errors recover sooner

const WEATHER_CACHE_MAX = 500; // max entries before a prune sweep evicts expired keys

// Shared helpers used by both generateJson and generateText.
// Returns the list of IPs to generate configs for, falling back to [host].
function parseUserIps(user, host) {
  if (user.ips) {
    const parsed = user.ips.split('\n').map(ip => ip.trim()).filter(ip => ip.length > 0);
    if (parsed.length > 0) return parsed;
  }
  return [host];
}

// Returns the list of ports to generate configs for, falling back to ['443'].
function parseUserPorts(user) {
  return (user.port_text || String(user.port || '443'))
    .split(',').map(p => p.trim()).filter(p => p.length > 0);
}

const SubscriptionService = {
  async generateJson(user, host, env, request) {
    const ips = parseUserIps(user, host);
    const portList = parseUserPorts(user);
    const fp = user.fingerprint || 'chrome';

    let fragLen = "20-30";
    let fragInt = "1-2";
    try {
      const { results: fragRows } = await env.DB.prepare(
        "SELECT key, value FROM settings WHERE key IN ('frag_len', 'frag_int')"
      ).all();
      const fragMap = Object.fromEntries((fragRows || []).map(r => [r.key, r.value]));
      if (fragMap['frag_len']) fragLen = fragMap['frag_len'];
      if (fragMap['frag_int']) fragInt = fragMap['frag_int'];
    } catch(e) {}

    const configArray = [];
    ips.forEach((ip) => {
      portList.forEach((port) => {
        const tlsVal = TLS_PORTS.includes(port) ? 'tls' : 'none';
        const remark = user.username;

        const configObj = {
          remarks: remark,
          version: { min: "25.10.15" },
          log: { loglevel: "none" },
          dns: {
            servers: [
              { address: "https://8.8.8.8/dns-query", tag: "remote-dns" },
              { address: "8.8.8.8", domains: ["full:" + host], skipFallback: true }
            ],
            queryStrategy: "UseIP",
            tag: "dns"
          },
          inbounds: [
            {
              listen: "127.0.0.1", port: 10808, protocol: "socks",
              settings: { auth: "noauth", udp: true },
              sniffing: { destOverride: ["http", "tls"], enabled: true, routeOnly: true },
              tag: "mixed-in"
            },
            {
              listen: "127.0.0.1", port: 10853, protocol: "dokodemo-door",
              settings: { address: "1.1.1.1", network: "tcp,udp", port: 53 },
              tag: "dns-in"
            }
          ],
          outbounds: [
            {
              protocol: "vle" + "ss",
              settings: {
                ["vne" + "xt"]: [{
                  address: ip,
                  port: parseInt(port),
                  users: [{ id: user.uuid, encryption: "none" }]
                }]
              },
              ["stream" + "Settings"]: {
                network: "ws",
                ["ws" + "Settings"]: { host: host, path: "/" },
                security: tlsVal,
                sockopt: { ["dialer" + "Proxy"]: "fragment" }
              },
              tag: "proxy"
            },
            {
              protocol: "freedom",
              settings: {
                fragment: { packets: "tlshello", length: fragLen, interval: fragInt }
              },
              ["stream" + "Settings"]: {
                sockopt: {
                  domainStrategy: "UseIP",
                  happyEyeballs: { tryDelayMs: 250, prioritizeIPv6: false, interleave: 2, maxConcurrentTry: 4 }
                }
              },
              tag: "fragment"
            },
            { protocol: "dns", settings: { nonIPQuery: "reject" }, tag: "dns-out" },
            { protocol: "freedom", settings: { domainStrategy: "UseIP" }, tag: "direct" },
            { protocol: "blackhole", settings: { response: { type: "http" } }, tag: "block" }
          ],
          routing: {
            domainStrategy: "IPIfNonMatch",
            rules: [
              { inboundTag: ["mixed-in"], port: 53, outboundTag: "dns-out", type: "field" },
              { inboundTag: ["dns-in"], outboundTag: "dns-out", type: "field" },
              { inboundTag: ["remote-dns"], outboundTag: "proxy", type: "field" },
              { inboundTag: ["dns"], outboundTag: "direct", type: "field" },
              { domain: ["geosite:private"], outboundTag: "direct", type: "field" },
              { ip: ["geoip:private"], outboundTag: "direct", type: "field" },
              { network: "udp", outboundTag: "block", type: "field" },
              { network: "tcp", outboundTag: "proxy", type: "field" }
            ]
          }
        };

        if (tlsVal === 'tls') {
          configObj.outbounds[0]["stream" + "Settings"]["tls" + "Settings"] = {
            serverName: host,
            fingerprint: fp,
            alpn: ["http/1.1"],
            allowInsecure: false
          };
        }
        configArray.push(configObj);
      }); // end portList.forEach
    }); // end ips.forEach

    return new Response(JSON.stringify(configArray, null, 2), {
      headers: { 
        "Content-Type": "text/plain; charset=utf-8",
        "Access-Control-Allow-Origin": "*",
        "Cache-Control": "no-store"
      }
    });
  },

  async generateText(user, host, request) {
    const ips = parseUserIps(user, host);
    const portList = parseUserPorts(user);

    const fp = user.fingerprint || 'chrome';

    // Fetch weather — manual city overrides IP-based geolocation.
    // Cached by city name (manual) or client IP (auto) so repeated subscription
    // refreshes don't re-hit the geocoding/weather/ip-api endpoints every time.
    let weatherStr = '';
    if (user.show_weather) {
      const hasManualCity = !!(user.weather_city && user.weather_city.trim());
      const cacheKey = hasManualCity
        ? 'city:' + user.weather_city.trim().toLocaleLowerCase('en')
        : 'ip:' + (request.headers.get('CF-Connecting-IP') || 'unknown');

      const cached = WEATHER_CACHE.get(cacheKey);
      if (cached && Date.now() < cached.expires) {
        weatherStr = cached.value;
      } else {
        try {
          let lat, lon, city;

          if (hasManualCity) {
            // Manual city: use Open-Meteo geocoding API to get coords
            const cityName = user.weather_city.trim();
            const geoRes = await fetch(
              `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(cityName)}&count=1&language=en&format=json`,
              { cf: { cacheTtl: 86400, cacheEverything: true } }
            );
            if (geoRes.ok) {
              const geoData = await geoRes.json();
              const result = geoData.results && geoData.results[0];
              if (result) {
                lat = result.latitude;
                lon = result.longitude;
                city = result.name;
              }
            }
          } else {
            // Auto: geolocate by client IP using ipinfo.io (HTTPS, no key needed for basic fields)
            const clientIP = request.headers.get('CF-Connecting-IP');
            if (clientIP) {
              const geoRes = await fetch(`https://ipinfo.io/${clientIP}/json`,
                { cf: { cacheTtl: 3600, cacheEverything: true } });
              if (geoRes.ok) {
                const geo = await geoRes.json();
                // ipinfo returns "loc": "lat,lon" and "city"
                if (geo.loc && typeof geo.loc === 'string') {
                  const parts = geo.loc.split(',');
                  if (parts.length === 2) {
                    lat = parseFloat(parts[0]);
                    lon = parseFloat(parts[1]);
                    city = geo.city || '';
                  }
                }
              }
            }
          }

          if (lat != null && lon != null) {
            const weatherRes = await fetch(
              `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&daily=temperature_2m_min,temperature_2m_max,weathercode&timezone=auto&forecast_days=1`,
              { cf: { cacheTtl: 3600, cacheEverything: true } }
            );
            if (weatherRes.ok) {
              const weatherData = await weatherRes.json();
              const d = weatherData.daily;
              if (d && d.weathercode && d.weathercode[0] != null) {
                const code = d.weathercode[0];
                const tMin = Math.round(d.temperature_2m_min[0]);
                const tMax = Math.round(d.temperature_2m_max[0]);
                let icon = '🌡️';
                if (code === 0) icon = '☀️';
                else if (code <= 2) icon = '🌤️';
                else if (code === 3) icon = '☁️';
                else if (code <= 49) icon = '🌫️';
                else if (code <= 59) icon = '🌦️';
                else if (code <= 69) icon = '🌧️';
                else if (code <= 79) icon = '❄️';
                else if (code <= 84) icon = '🌨️';
                else if (code <= 99) icon = '⛈️';
                weatherStr = icon + ' ' + tMin + '↓' + tMax + '↑';
              }
            }
          }
        } catch (e) {}

        // Cache the result — successes get the full TTL, failures (empty string)
        // get a shorter TTL so transient lookup errors recover sooner without
        // hammering the upstream APIs on every refresh.
        const ttl = weatherStr ? WEATHER_CACHE_TTL : WEATHER_CACHE_FAIL_TTL;
        WEATHER_CACHE.set(cacheKey, { value: weatherStr, expires: Date.now() + ttl });
        // Prune expired entries when the map grows too large (many unique users/cities).
        if (WEATHER_CACHE.size > WEATHER_CACHE_MAX) {
          const _now = Date.now();
          for (const [k, v] of WEATHER_CACHE.entries()) {
            if (_now >= v.expires) WEATHER_CACHE.delete(k);
          }
        }
      }
    }
    // Build usage/expiry info for the info config remark
    const usedGb = user.used_gb || 0;
    const usedStr = usedGb < 1 ? (usedGb * 1024).toFixed(0) + 'MB' : usedGb.toFixed(2) + 'GB';
    let infoRemark = (user.tag && user.tag.trim() ? user.tag.trim() : 'ⁿᵉˣᵘˢ') + ' • ' + user.username;
    if (weatherStr) infoRemark += ' • ' + weatherStr;
    if (user.limit_gb) {
      const limitStr = user.limit_gb < 1 ? (user.limit_gb * 1024).toFixed(0) + 'MB' : user.limit_gb + 'GB';
      infoRemark += ' • ' + usedStr + '/' + limitStr;
    } else {
      infoRemark += ' • ' + usedStr + '/∞';
    }
    if (user.expiry_days && user.created_at) {
      const created = new Date(user.created_at);
      const expiryDate = new Date(created.getTime() + user.expiry_days * 24 * 60 * 60 * 1000);
      const daysLeft = Math.ceil((expiryDate - Date.now()) / (1000 * 60 * 60 * 24));
      if (daysLeft > 0) {
        infoRemark += ' • ' + daysLeft + 'd';
      } else {
        infoRemark += ' • Expired';
      }
    } else if (!user.expiry_days) {
      infoRemark += ' • ∞';
    }

    const links = [];
    ips.forEach((ip) => {
      portList.forEach((port) => {
        const tlsVal = TLS_PORTS.includes(port) ? 'tls' : 'none';
        const remark = infoRemark;
        links.push(atob('dmxlc3M6Ly8=') + user.uuid + '@' + ip + ':' + port + '?path=%2F&security=' + tlsVal + '&encryption=none&insecure=0&host=' + host + '&fp=' + fp + '&type=ws&allowInsecure=0&sni=' + host + '#' + encodeURIComponent(remark));
      });
    });

    const noise = [
      "# System Update Feed: OK",
      "# Sync Code: " + Math.random().toString(36).slice(2, 10),
      "# Version: 2.10.1",
      "# Description: Secure Node Configurations",
      ""
    ].join('\n');

    const plainContent = noise + links.join('\n');
    // UTF-8-safe base64: encode to bytes first, then convert byte-by-byte to avoid
    // btoa's RangeError on multi-byte characters (e.g. non-ASCII usernames/remarks).
    const plainBytes = _te.encode(plainContent);
    let binaryStr = '';
    const CHUNK = 8192;
    for (let i = 0; i < plainBytes.length; i += CHUNK) {
      binaryStr += String.fromCharCode(...plainBytes.subarray(i, i + CHUNK));
    }
    const subContent = btoa(binaryStr);

    // Build Subscription-Userinfo header for clients like v2rayNG
    // upload is always 0 (traffic is tracked as total, not split by direction)
    const uploadBytes = 0;
    const downloadBytes = Math.round((user.used_gb || 0) * 1024 * 1024 * 1024);
    const totalBytes = user.limit_gb ? Math.round(user.limit_gb * 1024 * 1024 * 1024) : 0;
    let expireTimestamp = 0;
    if (user.expiry_days && user.created_at) {
      const created = new Date(user.created_at);
      expireTimestamp = Math.floor((created.getTime() + user.expiry_days * 24 * 60 * 60 * 1000) / 1000);
    }

    const userInfoParts = [
      'upload=' + uploadBytes,
      'download=' + downloadBytes,
    ];
    if (totalBytes > 0) userInfoParts.push('total=' + totalBytes);
    if (expireTimestamp > 0) userInfoParts.push('expire=' + expireTimestamp);

    return new Response(subContent, {
      headers: { 
        "Content-Type": "text/plain; charset=utf-8",
        "Access-Control-Allow-Origin": "*",
        "Cache-Control": "no-store",
        "Subscription-Userinfo": userInfoParts.join('; '),
        "Content-Disposition": 'attachment; filename="' + (user.username || 'sub') + '"',
      }
    });
  }
};
export { SubscriptionService };
