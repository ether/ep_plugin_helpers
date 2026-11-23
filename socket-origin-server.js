'use strict';

// socketOrigin (server side) — applies Etherpad core's pad socket origin
// check to a plugin's own socket.io namespace.
//
// Core (Etherpad >= 3.3.21) checks that the page which opened a pad socket is
// an Etherpad page before that socket may act on the browser's cookies (the
// author token, the HTTP API group session and the login session). The check
// lives in core's `padOriginMiddleware`, which core only installs on its own
// default namespace. A plugin namespace such as `/comment` gets none of it,
// so this helper installs the very same middleware there. Nothing is
// re-implemented: the rules, the token, and the
// `socketIo.crossOriginPadSockets` / `socketIo.padAllowedOrigins` settings
// are core's, so a plugin namespace behaves exactly like the pad socket:
//
//   * A handshake from an Etherpad page (pad socket token, same-origin Fetch
//     Metadata, no Origin header, or an Origin matching Host /
//     X-Forwarded-Host / publicURL / the allowlists) keeps its cookies.
//     The token does not depend on the Host header, so a reverse proxy that
//     rewrites Host keeps working.
//   * Any other handshake connects without cookies or session (default
//     "anonymous" policy), or is refused ("reject").
//
// The token is the one core issues from GET /pad-socket-token. The client
// side of this helper (`ep_plugin_helpers/socket-origin`) fetches it and
// sends it in the handshake `auth` payload.
//
// On cores that predate the check the helper changes nothing and logs once,
// so a plugin can adopt it without raising its minimum core version.
//
// Server-only: never require this file from client code.

const {logger} = require('./logger');

const log = logger('ep_plugin_helpers');

let coreOverride; // set by tests
let coreCache;

const loadCore = () => {
  if (coreOverride !== undefined) return coreOverride;
  if (coreCache !== undefined) return coreCache;
  coreCache = {originMiddleware: null, sessionMiddleware: null};
  try {
    const m = require('ep_etherpad-lite/node/hooks/express/socketio');
    const fn = (m && m.padOriginMiddleware) || (m && m.default && m.default.padOriginMiddleware);
    if (typeof fn === 'function') coreCache.originMiddleware = fn;
  } catch { /* not running inside Etherpad, or an older core layout */ }
  try {
    const m = require('ep_etherpad-lite/node/hooks/express');
    // Read lazily: core assigns it when its express server is created.
    coreCache.getSessionMiddleware = () => m && m.sessionMiddleware;
  } catch { /* older core layout: tokens are then checked without a session */ }
  return coreCache;
};

const sessionMiddlewareOf = (core) => {
  if (typeof core.sessionMiddleware === 'function') return core.sessionMiddleware;
  if (typeof core.getSessionMiddleware === 'function') {
    const fn = core.getSessionMiddleware();
    if (typeof fn === 'function') return fn;
  }
  return null;
};

// Core only loads the express session on its own namespaces. The pad socket
// token is bound to the logged-in session as well as the cookies, so load the
// session first (same steps as core's socketSessionMiddleware), unless an
// earlier middleware or core's default namespace already did.
const loadSession = (core, socket, next) => {
  const req = socket && socket.request;
  if (!req || req.session != null) return next();
  const sessionMiddleware = sessionMiddlewareOf(core);
  if (!sessionMiddleware) return next();
  if (req.headers && !req.headers.cookie && socket.handshake && socket.handshake.query) {
    // socket.io-client on node.js doesn't support cookies, so it passes them
    // via a query parameter (same fallback core uses).
    req.headers.cookie = socket.handshake.query.cookie;
  }
  try {
    // Never fail the handshake because the session could not be loaded; the
    // origin check below still runs.
    sessionMiddleware(req, {}, () => next());
  } catch {
    next();
  }
};

const warned = new Set();
const warnOnce = (name) => {
  if (warned.has(name)) return;
  warned.add(name);
  log.warn('This Etherpad core does not provide padOriginMiddleware (added in 3.3.21), ' +
      `so socket.io namespace ${name} uses the browser's cookies without checking where the ` +
      'connection comes from. Upgrade Etherpad to get the check.');
};

/**
 * socket.io namespace middleware: loads the express session if needed, then
 * runs core's pad socket origin check. Use it directly with `nsp.use()` or
 * through `guardSocketNamespace()`.
 */
const socketOriginMiddleware = (socket, next) => {
  const core = loadCore();
  if (typeof core.originMiddleware !== 'function') {
    warnOnce((socket && socket.nsp && socket.nsp.name) || 'unknown');
    return next();
  }
  loadSession(core, socket, (err) => {
    if (err) return next(err);
    core.originMiddleware(socket, next);
  });
};

/**
 * Installs `socketOriginMiddleware` on a socket.io namespace and returns the
 * namespace. Call it before any other `use()` or `on('connection')` that
 * reads cookies or the session:
 *
 *   exports.socketio = (hookName, {io}) => {
 *     const nsp = guardSocketNamespace(io.of('/my_plugin'));
 *     nsp.on('connection', (socket) => { ... });
 *   };
 */
const guardSocketNamespace = (nsp) => {
  if (!nsp || typeof nsp.use !== 'function') {
    throw new Error('guardSocketNamespace requires a socket.io namespace');
  }
  nsp.use(socketOriginMiddleware);
  return nsp;
};

/**
 * False when the origin check decided this socket must not act on the
 * browser's cookies. Its Cookie header and session have already been removed
 * by core, so code that reads them sees an anonymous visitor; use this to
 * skip anything else that would treat the socket as the visitor.
 */
const trustsAmbientCredentials = (socket) => {
  const data = socket && socket.data;
  return !(data && data.ambientCredentials === false);
};

/** True when the running core provides the origin check. */
const hasCoreSocketOriginCheck = () => typeof loadCore().originMiddleware === 'function';

module.exports = {
  socketOriginMiddleware,
  guardSocketNamespace,
  trustsAmbientCredentials,
  hasCoreSocketOriginCheck,
  // Tests only: replace core's middlewares ({originMiddleware,
  // sessionMiddleware}); pass undefined to restore.
  _setCoreForTests: (core) => { coreOverride = core; warned.clear(); },
};
