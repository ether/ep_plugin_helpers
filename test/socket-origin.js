'use strict';

const assert = require('assert');
const server = require('../socket-origin-server');
const {padSocketAuth, fetchPadSocketToken} = require('../socket-origin');

const fakeSocket = (overrides = {}) => ({
  nsp: {name: '/test'},
  request: {headers: {}},
  handshake: {query: {}, auth: {}},
  data: {},
  ...overrides,
});

const run = (socket) => new Promise((resolve) => {
  server.socketOriginMiddleware(socket, (err) => resolve(err));
});

describe('socketOrigin (server)', () => {
  afterEach(() => server._setCoreForTests(undefined));

  it('runs the session middleware, then core\'s origin middleware', async () => {
    const calls = [];
    server._setCoreForTests({
      sessionMiddleware: (req, res, next) => {
        calls.push('session');
        req.session = {user: {username: 'u'}};
        req.sessionID = 'sid';
        next();
      },
      originMiddleware: (socket, next) => {
        calls.push(`origin:${socket.request.sessionID}`);
        next();
      },
    });
    const err = await run(fakeSocket());
    assert.strictEqual(err, undefined);
    assert.deepStrictEqual(calls, ['session', 'origin:sid']);
  });

  it('does not reload a session an earlier middleware loaded', async () => {
    let sessionCalls = 0;
    server._setCoreForTests({
      sessionMiddleware: (req, res, next) => { sessionCalls++; next(); },
      originMiddleware: (socket, next) => next(),
    });
    await run(fakeSocket({request: {headers: {}, session: {}}}));
    assert.strictEqual(sessionCalls, 0);
  });

  it('copies the query-string cookie for node.js clients before loading the session', async () => {
    let seen;
    server._setCoreForTests({
      sessionMiddleware: (req, res, next) => { seen = req.headers.cookie; next(); },
      originMiddleware: (socket, next) => next(),
    });
    await run(fakeSocket({handshake: {query: {cookie: 'token=t.abc'}, auth: {}}}));
    assert.strictEqual(seen, 'token=t.abc');
  });

  it('still runs the origin check when the session middleware throws', async () => {
    let checked = false;
    server._setCoreForTests({
      sessionMiddleware: () => { throw new Error('db down'); },
      originMiddleware: (socket, next) => { checked = true; next(); },
    });
    const err = await run(fakeSocket());
    assert.strictEqual(err, undefined);
    assert.strictEqual(checked, true);
  });

  it('passes core\'s rejection through to socket.io', async () => {
    const rejection = Object.assign(new Error('origin not allowed'),
        {data: {code: 'origin_not_allowed'}});
    server._setCoreForTests({originMiddleware: (socket, next) => next(rejection)});
    const err = await run(fakeSocket());
    assert.strictEqual(err, rejection);
  });

  it('lets the handshake through unchanged on cores without the check', async () => {
    server._setCoreForTests({originMiddleware: null, sessionMiddleware: null});
    const socket = fakeSocket({request: {headers: {cookie: 'token=t.abc'}}});
    const err = await run(socket);
    assert.strictEqual(err, undefined);
    assert.strictEqual(socket.request.headers.cookie, 'token=t.abc');
    assert.strictEqual(server.hasCoreSocketOriginCheck(), false);
  });

  it('reports the check as available when core provides it', () => {
    server._setCoreForTests({originMiddleware: (s, n) => n()});
    assert.strictEqual(server.hasCoreSocketOriginCheck(), true);
  });

  it('guardSocketNamespace installs the middleware and returns the namespace', () => {
    const used = [];
    const nsp = {use: (fn) => { used.push(fn); return nsp; }};
    assert.strictEqual(server.guardSocketNamespace(nsp), nsp);
    assert.deepStrictEqual(used, [server.socketOriginMiddleware]);
    assert.throws(() => server.guardSocketNamespace(null), /socket.io namespace/);
  });

  it('trustsAmbientCredentials reads the flag core sets', () => {
    assert.strictEqual(server.trustsAmbientCredentials(fakeSocket()), true);
    assert.strictEqual(
        server.trustsAmbientCredentials(fakeSocket({data: {ambientCredentials: true}})), true);
    assert.strictEqual(
        server.trustsAmbientCredentials(fakeSocket({data: {ambientCredentials: false}})), false);
    assert.strictEqual(server.trustsAmbientCredentials(null), true);
  });

  it('is exported from the package index', () => {
    const helpers = require('../index');
    assert.strictEqual(helpers.guardSocketNamespace, server.guardSocketNamespace);
    assert.strictEqual(helpers.socketOriginMiddleware, server.socketOriginMiddleware);
    assert.strictEqual(helpers.trustsAmbientCredentials, server.trustsAmbientCredentials);
  });
});

describe('socketOrigin (client)', () => {
  const okFetch = (calls, token = 'tok123') => async (url, opts) => {
    calls.push({url, opts});
    return {ok: true, json: async () => ({token})};
  };
  const authOf = (fn) => new Promise((resolve) => fn(resolve));

  it('fetches the token from the Etherpad base URL and sends it in auth', async () => {
    const calls = [];
    const auth = await authOf(padSocketAuth('/etherpad/', {
      location: 'https://pad.example.com/etherpad/p/foo',
      fetchImpl: okFetch(calls),
    }));
    assert.deepStrictEqual(auth, {padSocketToken: 'tok123'});
    assert.strictEqual(calls[0].url, 'https://pad.example.com/etherpad/pad-socket-token');
    assert.strictEqual(calls[0].opts.credentials, 'same-origin');
    assert.strictEqual(calls[0].opts.cache, 'no-store');
  });

  it('adds the missing trailing slash and resolves relative base URLs', async () => {
    const calls = [];
    const sub = 'https://pad.example.com/etherpad/p/foo';
    const root = 'https://pad.example.com/p/foo';
    await authOf(padSocketAuth('/etherpad', {location: sub, fetchImpl: okFetch(calls)}));
    await authOf(padSocketAuth('../', {location: sub, fetchImpl: okFetch(calls)}));
    await authOf(padSocketAuth(undefined, {location: root, fetchImpl: okFetch(calls)}));
    assert.deepStrictEqual(calls.map((c) => c.url), [
      'https://pad.example.com/etherpad/pad-socket-token',
      'https://pad.example.com/etherpad/pad-socket-token',
      'https://pad.example.com/pad-socket-token',
    ]);
  });

  it('never fetches the token from another origin', async () => {
    const calls = [];
    const location = 'https://pad.example.com/p/foo';
    const auth = await authOf(
        padSocketAuth('https://other.example.com/', {location, fetchImpl: okFetch(calls)}));
    assert.deepStrictEqual(auth, {});
    assert.strictEqual(calls.length, 0);
  });

  it('sends an empty auth payload when the token is unavailable', async () => {
    const location = 'https://pad.example.com/p/foo';
    const notFound = async () => ({ok: false, json: async () => ({})});
    const throws = async () => { throw new Error('offline'); };
    const badBody = async () => ({ok: true, json: async () => ({token: 42})});
    for (const fetchImpl of [notFound, throws, badBody]) {
      assert.deepStrictEqual(await authOf(padSocketAuth('/', {location, fetchImpl})), {});
    }
  });

  it('fetchPadSocketToken returns null without fetch or a page origin', async () => {
    const url = new URL('https://pad.example.com/pad-socket-token');
    assert.strictEqual(await fetchPadSocketToken(url, {fetchImpl: null, origin: url.origin}), null);
    assert.strictEqual(
        await fetchPadSocketToken(url, {fetchImpl: async () => ({}), origin: null}), null);
  });
});
