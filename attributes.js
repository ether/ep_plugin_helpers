'use strict';

// This file is safe for both client-side (esbuild bundled) and server-side use.
// It contains NO requires for Node.js or ep_etherpad-lite server modules.
// Server-only export hooks are in attributes-server.js

const createLineAttribute = (config) => {
  const {attr, tags, normalize} = config;

  const aceAttribsToClasses = (hookName, context) => {
    if (context.key === attr) {
      return [`${attr}:${context.value}`];
    }
  };

  const aceDomLineProcessLineAttributes = (hookName, context) => {
    const cls = context.cls;
    const match = new RegExp(`(?:^| )${attr}:([A-Za-z0-9]*)`).exec(cls);
    if (match) {
      let tag = match[1];
      if (normalize) tag = normalize(tag);
      if (tags.indexOf(tag) >= 0) {
        return [{
          preHtml: `<${tag}>`,
          postHtml: `</${tag}>`,
          processedMarker: true,
        }];
      }
    }
    return [];
  };

  const aceRegisterBlockElements = () => tags;

  const collectContentPre = (hookName, context, cb) => {
    const tname = context.tname;
    const lineAttributes = context.state.lineAttributes;
    if (tname === 'div' || tname === 'p') {
      delete lineAttributes[attr];
    }
    if (tags.indexOf(tname) >= 0) {
      lineAttributes[attr] = tname;
    }
    if (cb) return cb();
  };

  const collectContentPost = (hookName, context, cb) => {
    const tname = context.tname;
    const lineAttributes = context.state.lineAttributes;
    if (tags.indexOf(tname) >= 0) {
      delete lineAttributes[attr];
    }
    if (cb) return cb();
  };

  return {
    aceAttribsToClasses,
    aceDomLineProcessLineAttributes,
    aceRegisterBlockElements,
    collectContentPre,
    collectContentPost,
  };
};

const createInlineAttribute = (config) => {
  const {attr, values} = config;
  const attrPattern = new RegExp(`(?:^| )${attr}:([A-Za-z0-9]*)`);

  const aceAttribsToClasses = (hookName, context) => {
    if (context.key.indexOf(`${attr}:`) !== -1) {
      const match = attrPattern.exec(context.key);
      if (match) return [`${attr}:${match[1]}`];
    }
    if (context.key === attr) {
      return [`${attr}:${context.value}`];
    }
  };

  const aceCreateDomLine = (hookName, context) => {
    const cls = context.cls;
    const match = attrPattern.exec(cls);
    if (!match) return [];
    if (values && values.indexOf(match[1]) < 0) return [];
    return [{extraOpenTags: '', extraCloseTags: '', cls}];
  };

  const collectContentPre = (hookName, context) => {
    const match = attrPattern.exec(context.cls);
    if (match && match[1]) {
      context.cc.doAttrib(context.state, `${attr}::${match[1]}`);
    }
  };

  const collectContentPost = () => {};

  return {
    aceAttribsToClasses,
    aceCreateDomLine,
    collectContentPre,
    collectContentPost,
  };
};

const createTagAttribute = (config) => {
  const {tags} = config;

  const aceAttribClasses = (hookName, attr) => {
    for (const tag of tags) {
      attr[tag] = `tag:${tag}`;
    }
    return attr;
  };

  const aceAttribsToClasses = (hookName, context) => {
    if (tags.includes(context.key)) {
      return [context.key];
    }
  };

  const aceRegisterBlockElements = () => tags;

  const collectContentPre = (hookName, context, cb) => {
    const tname = context.tname;
    if (tags.includes(tname)) {
      context.cc.doAttrib(context.state, tname);
    }
    if (cb) return cb();
  };

  const collectContentPost = (hookName, context, cb) => {
    if (cb) return cb();
  };

  return {
    aceAttribClasses,
    aceAttribsToClasses,
    aceRegisterBlockElements,
    collectContentPre,
    collectContentPost,
  };
};

module.exports = {createLineAttribute, createInlineAttribute, createTagAttribute};
