'use strict';

// socketOrigin (client side) — lets a plugin's own socket.io connection prove
// it was opened by an Etherpad page, the same way core's pad socket does.
//
// Core (Etherpad >= 3.3.21) serves a pad socket token from GET
// /pad-socket-token and accepts it in the handshake `auth` payload. Pair this
// with `guardSocketNamespace()` from `ep_plugin_helpers/socket-origin-server`
// on the server:
//
//   const {padSocketAuth} = require('ep_plugin_helpers/socket-origin');
//   const socket = io(url, {path, auth: padSocketAuth(baseURL)});
//
// socket.io calls the auth function on every (re)connect, so the token always
// matches the current cookies. The token is only fetched from the page's own
// origin, and the endpoint sends no CORS headers, so a page on another origin
// cannot read it. On cores without the endpoint the fetch fails quietly and
// the handshake goes out without a token, exactly as before.
//
// Client-safe: no server modules are required here.

const TIMEOUT_MS = 5000;

// Resolves the Etherpad base URL (the directory that holds /p/, /static/ and
// /socket.io/) to an absolute URL with a trailing slash.
const resolveBase = (baseUrl, loc) => {
  const base = new URL(baseUrl == null || baseUrl === '' ? '/' : String(baseUrl), loc);
  if (!base.pathname.endsWith('/')) base.pathname += '/';
  base.search = '';
  base.hash = '';
  return base;
};

// Resolves to the pad socket token, or null if it cannot be fetched. Never
// rejects: without a token the server falls back to its other checks.
// Mirrors core's src/static/js/socketio.ts.
const fetchPadSocketToken = async (tokenUrl, {
  fetchImpl = typeof fetch === 'function' ? fetch : null,
  origin = typeof window !== 'undefined' && window.location ? window.location.origin : null,
} = {}) => {
  if (typeof fetchImpl !== 'function' || origin == null || tokenUrl.origin !== origin) return null;
  const controller = typeof AbortController === 'function' ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), TIMEOUT_MS) : null;
  try {
    const res = await fetchImpl(tokenUrl.href, {
      credentials: 'same-origin',
      cache: 'no-store',
      signal: controller ? controller.signal : undefined,
    });
    if (!res || !res.ok) return null;
    const body = await res.json();
    return body && typeof body.token === 'string' ? body.token : null;
  } catch {
    return null;
  } finally {
    if (timer) clearTimeout(timer);
  }
};

/**
 * Returns a socket.io `auth` option (a function) that sends core's pad socket
 * token with every handshake.
 *
 * @param {string} [baseUrl] - Etherpad base URL, absolute or relative to the
 *     page (e.g. `pad.baseURL` or `'../'` from /p/<pad>). Defaults to '/'.
 * @param {object} [opts] - for tests: `fetchImpl`, `location`.
 */
const padSocketAuth = (baseUrl, opts = {}) => {
  const loc = opts.location ||
      (typeof window !== 'undefined' && window.location ? window.location.href : undefined);
  return (cb) => {
    let tokenUrl;
    try {
      tokenUrl = new URL('pad-socket-token', resolveBase(baseUrl, loc));
    } catch {
      cb({});
      return;
    }
    const origin = opts.location ? new URL(opts.location).origin : undefined;
    fetchPadSocketToken(tokenUrl, {
      ...(opts.fetchImpl ? {fetchImpl: opts.fetchImpl} : {}),
      ...(origin ? {origin} : {}),
    }).then((token) => cb(token ? {padSocketToken: token} : {}));
  };
};

module.exports = {padSocketAuth, fetchPadSocketToken};
