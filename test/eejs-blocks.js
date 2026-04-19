'use strict';

const assert = require('assert');
const Module = require('module');

// Stub out ep_etherpad-lite modules that eejs-blocks.js require()s so we can
// load the helper without a full Etherpad runtime.
const stubs = new Map([
  ['ep_etherpad-lite/node/eejs/', {
    require: (templatePath) => `<!--rendered:${templatePath}-->`,
  }],
  ['ep_etherpad-lite/node_modules/log4js', {
    getLogger: () => {
      const calls = [];
      const logger = {
        warn: (msg) => calls.push(msg),
        _calls: calls,
      };
      return logger;
    },
  }],
]);

const originalResolve = Module._resolveFilename;
const originalLoad = Module._load;

before(() => {
  Module._resolveFilename = function (request, ...rest) {
    if (stubs.has(request)) return request;
    return originalResolve.call(this, request, ...rest);
  };
  Module._load = function (request, ...rest) {
    if (stubs.has(request)) return stubs.get(request);
    return originalLoad.call(this, request, ...rest);
  };
});

after(() => {
  Module._resolveFilename = originalResolve;
  Module._load = originalLoad;
});

describe('eejsBlock skip() safety', () => {
  // Require AFTER stubs are installed.
  let template;
  before(() => {
    // Clear any cached copy from prior test files.
    delete require.cache[require.resolve('../eejs-blocks')];
    ({template} = require('../eejs-blocks'));
  });

  it('renders the template when skip() returns false', (done) => {
    const block = template('some/template.ejs', {skip: () => false});
    const args = {content: ''};
    block('hookName', args, () => {
      assert.strictEqual(args.content, '<!--rendered:some/template.ejs-->');
      done();
    });
  });

  it('skips the template when skip() returns true', (done) => {
    const block = template('some/template.ejs', {skip: () => true});
    const args = {content: 'before'};
    block('hookName', args, () => {
      assert.strictEqual(args.content, 'before');
      done();
    });
  });

  it('renders anyway when skip() throws — never crashes the render', (done) => {
    // Regression for https://github.com/ether/etherpad/issues/7543: if
    // settings.toolbar is undefined (ESM/CJS interop on older core), plugins
    // that do JSON.stringify(settings.toolbar).indexOf(...) inside skip()
    // throw synchronously. The helper must swallow that throw so the pad
    // still loads.
    const block = template('boom.ejs', {
      skip: () => { throw new TypeError("Cannot read properties of undefined (reading 'indexOf')"); },
    });
    const args = {content: ''};
    block('hookName', args, () => {
      assert.strictEqual(args.content, '<!--rendered:boom.ejs-->');
      done();
    });
  });

  it('does not call skip() when no skip option is provided', (done) => {
    const block = template('plain.ejs');
    const args = {content: ''};
    block('hookName', args, () => {
      assert.strictEqual(args.content, '<!--rendered:plain.ejs-->');
      done();
    });
  });
});
