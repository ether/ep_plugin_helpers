'use strict';

const eejs = require('ep_etherpad-lite/node/eejs/');
const {createLogger} = require('./logger');

const logger = createLogger('ep_plugin_helpers');

// A throw inside opts.skip() propagates through the synchronous template
// render pipeline and crashes the entire pad page. That is never what a skip
// predicate is meant to do — it only decides whether this block adds its
// content. Treat any throw as "don't skip" (render the template) and log a
// warning so the offending plugin can be found.
//
// This also defends against the ESM/CJS interop regression in Etherpad core
// (see https://github.com/ether/etherpad/issues/7543): before the #7421 core
// fix ships in a tagged release, plugins that read `settings.toolbar` from a
// CJS `require('ep_etherpad-lite/node/utils/Settings')` see `undefined`, and
// `JSON.stringify(undefined).indexOf(...)` inside a skip() predicate throws.
// Swallowing the throw here lets pads keep loading until core is upgraded.
const safeSkip = (templatePath, skipFn, args) => {
  try {
    return skipFn(args);
  } catch (err) {
    logger.warn(
        `skip() predicate for ${templatePath} threw; rendering anyway: ` +
        `${err && err.stack || err}`);
    return false;
  }
};

const eejsBlock = (templatePath, opts = {}) => (hookName, args, cb) => {
  if (opts.skip && safeSkip(templatePath, opts.skip, args)) return cb();
  const vars = opts.vars ? opts.vars() : {};
  args.content += eejs.require(templatePath, vars, module);
  return cb();
};

eejsBlock.raw = (htmlString) => (hookName, args, cb) => {
  args.content += htmlString;
  return cb();
};

const template = eejsBlock;
const rawHTML = eejsBlock.raw;

module.exports = {template, rawHTML, eejsBlock};
