'use strict';

// Shared clientVars merge helper (server side).
//
// Etherpad merges every plugin's clientVars hook return value into the
// outgoing clientVars object with a shallow `Object.assign` (see
// PadMessageHandler). Each padToggle / padSelect instance publishes its
// capability block under the same top-level `ep_plugin_helpers` key, so when
// two or more helper-based plugins are installed the shallow assign makes the
// last hook to run win and every other plugin's block disappears from
// clientVars. The client then finds no capability block, treats pad-wide
// support as unavailable and logs the generic "pad-wide settings unavailable"
// warning even on a fully patched, fully enabled core.
//
// Merging into the live `ctx.clientVars` object keeps every plugin's block.
// The merged branch is still returned so the subsequent `Object.assign`
// re-assigns the very same object reference (a no-op), and so older cores
// that do not expose `ctx.clientVars` keep the previous behaviour.

const isObject = (v) => !!v && typeof v === 'object' && !Array.isArray(v);

const hasOwn = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key);

// Path segments come from plugin config (padSelect accepts any non-empty
// string as a settingId), so plain `node[key] = value` would let a settingId
// of `__proto__` retarget the object's prototype instead of creating an own
// property — the value would then vanish when core serializes clientVars.
// defineProperty always creates an own, enumerable, JSON-visible property.
const setOwn = (obj, key, value) => {
  Object.defineProperty(obj, key, {
    value, enumerable: true, configurable: true, writable: true,
  });
  return value;
};

/**
 * Merge a capability block into clientVars under
 * `ep_plugin_helpers.<path[0]>.<path[1]>...` without clobbering blocks
 * published by other plugins.
 *
 * @param {object} ctx the clientVars hook context (may be null/undefined)
 * @param {string[]} path key path below `ep_plugin_helpers`, e.g.
 *     ['padToggle', 'ep_foo']
 * @param {*} value the block to store at that path
 * @return {object} the value to return from the clientVars hook
 */
const mergeClientVars = (ctx, path, value) => {
  const live = isObject(ctx) && isObject(ctx.clientVars) ? ctx.clientVars : null;
  let root = live && hasOwn(live, 'ep_plugin_helpers') ? live.ep_plugin_helpers : null;
  if (!isObject(root)) {
    root = {};
    if (live) setOwn(live, 'ep_plugin_helpers', root);
  }
  let node = root;
  for (let i = 0; i < path.length - 1; i++) {
    const key = path[i];
    const next = hasOwn(node, key) ? node[key] : null;
    node = isObject(next) ? next : setOwn(node, key, {});
  }
  setOwn(node, path[path.length - 1], value);
  return {ep_plugin_helpers: root};
};

module.exports = {mergeClientVars};
