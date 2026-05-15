'use strict';

// toolbarSelect (client side) — binds the change handler for a toolbar
// <select> dropdown that triggers an ace edit operation, then restores
// focus to the editor so the user can keep typing without an extra click.
//
// Centralises the three-step boilerplate that ep_font_color, ep_font_size,
// ep_headings2 and similar plugins repeat by hand:
//
//   1. on change → coerce the picked value
//   2. wrap the edit in callWithAce(...) so it joins the undo stack
//   3. reset the <select> to a sentinel value (so picking the same option
//      again still fires `change`) and route focus back to the editor
//
// No top-level requires that touch server-only modules — esbuild bundles
// this into the browser pad bundle, and any node-only path would break
// the client build.

const ALLOWED_COERCE = new Set(['int', 'number', 'string', 'identity']);

const validateConfig = (config) => {
  if (!config || typeof config !== 'object') {
    throw new Error('toolbarSelect requires a config object');
  }
  const {
    selector,
    context,
    invoke,
    op = 'toolbarSelect',
    coerce = 'int',
    resetValue = 'dummy',
    onAfterChange,
  } = config;

  if (!selector || typeof selector !== 'string') {
    throw new Error('toolbarSelect requires selector (jQuery selector string)');
  }
  if (!context || typeof context !== 'object' || !context.ace) {
    throw new Error('toolbarSelect requires the postAceInit `context` (must include context.ace)');
  }
  if (typeof context.ace.callWithAce !== 'function' || typeof context.ace.focus !== 'function') {
    throw new Error('toolbarSelect: context.ace is missing callWithAce / focus — wrong context?');
  }
  if (typeof invoke !== 'function') {
    throw new Error('toolbarSelect requires invoke: (ace, value) => void');
  }
  if (typeof op !== 'string' || !op) {
    throw new Error('toolbarSelect: op must be a non-empty string when provided');
  }
  if (typeof coerce !== 'function' && !ALLOWED_COERCE.has(coerce)) {
    throw new Error(
        `toolbarSelect: coerce must be a function or one of ${[...ALLOWED_COERCE].join(', ')}`);
  }
  if (onAfterChange != null && typeof onAfterChange !== 'function') {
    throw new Error('toolbarSelect: onAfterChange must be a function when provided');
  }

  return {selector, context, invoke, op, coerce, resetValue, onAfterChange};
};

// Resolve a coerce token (or function) into a unary coercer. The coercer
// returns null whenever the value cannot be used — the caller then skips
// the edit but still restores focus.
const resolveCoerce = (coerce) => {
  if (typeof coerce === 'function') return coerce;
  if (coerce === 'int') return (raw) => {
    const n = parseInt(raw, 10);
    return Number.isNaN(n) ? null : n;
  };
  if (coerce === 'number') return (raw) => {
    const n = Number(raw);
    return Number.isNaN(n) ? null : n;
  };
  if (coerce === 'string') return (raw) => (raw == null || raw === '') ? null : String(raw);
  // 'identity'
  return (raw) => (raw == null || raw === '') ? null : raw;
};

const toolbarSelect = (rawConfig) => {
  const cfg = validateConfig(rawConfig);
  const coercer = resolveCoerce(cfg.coerce);

  // window.$ is jQuery as exposed by Etherpad's pad bundle. We don't import
  // jquery directly so the helper works whether the host plugin pulls jQuery
  // from the same npm version or relies on the bundled one.
  const $sel = window.$(cfg.selector);

  $sel.on('change', function onToolbarSelectChange() {
    const $this = window.$(this);
    const raw = $this.val();
    const value = coercer(raw);

    if (value != null) {
      cfg.context.ace.callWithAce((ace) => {
        cfg.invoke(ace, value);
      }, cfg.op, true);
      $this.val(cfg.resetValue);
    }

    // Focus restoration runs unconditionally: even if the coerced value was
    // unusable, the user clicked the select and we don't want to leave focus
    // stuck on a toolbar control where the next keystroke would be lost
    // (or, in some browsers, scroll the select's option list).
    cfg.context.ace.focus();

    if (cfg.onAfterChange) {
      try { cfg.onAfterChange(value); } catch (e) {
        // eslint-disable-next-line no-console
        if (typeof console !== 'undefined') console.error('toolbarSelect onAfterChange threw', e);
      }
    }
  });

  return {$sel};
};

module.exports = {toolbarSelect};
