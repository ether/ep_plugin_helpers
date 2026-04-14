'use strict';

const eejs = require('ep_etherpad-lite/node/eejs/');

const eejsBlock = (templatePath, opts = {}) => (hookName, args, cb) => {
  if (opts.skip && opts.skip(args)) return cb();
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
