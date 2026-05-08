'use strict';

// padSelect (client side) — wires up the parallel User Settings / Pad Wide
// Settings <select> dropdowns that pad-select-server.js renders. Reads the
// helper's clientVars block, persists the per-user choice in padcookie, and
// forwards pad-wide changes through pad.changePadOption() so they ride the
// existing padoptions COLLABROOM broadcast.
//
// No top-level requires that touch server-only modules — esbuild bundles
// this into the browser pad bundle.

const PLUGIN_NAME_RE = /^ep_[a-z0-9_]+$/;

const validateConfig = (config) => {
  if (!config || typeof config !== 'object') {
    throw new Error('padSelect requires a config object');
  }
  const {pluginName, settingId, options, defaultValue} = config;
  if (!PLUGIN_NAME_RE.test(pluginName || '')) {
    throw new Error(`padSelect pluginName must match /^ep_[a-z0-9_]+$/, got: ${pluginName}`);
  }
  if (!settingId || typeof settingId !== 'string') {
    throw new Error('padSelect requires settingId (string)');
  }
  if (!Array.isArray(options) || options.length < 2) {
    throw new Error('padSelect requires options array of at least 2 entries');
  }
  if (typeof defaultValue === 'undefined' || defaultValue === null) {
    throw new Error('padSelect requires defaultValue');
  }
  return {pluginName, settingId, options, defaultValue};
};

const padSelectClient = (rawConfig) => {
  const {pluginName, settingId, options, defaultValue} = validateConfig(rawConfig);
  const userSelectId = `options-${settingId}`;
  const padSelectId = `padsettings-options-${settingId}`;

  let onChangeCallback = () => {};
  let lastEffective = null;

  const getPad = () => {
    if (typeof window === 'undefined') return null;
    try {
      // eslint-disable-next-line global-require
      const m = require('ep_etherpad-lite/static/js/pad');
      if (m && m.pad) return m.pad;
    } catch (_e) { /* fall through */ }
    return window.pad || (window.top && window.top.pad) || null;
  };

  const getCookie = () => {
    try {
      // eslint-disable-next-line global-require
      return require('ep_etherpad-lite/static/js/pad_cookie').padcookie;
    } catch (_e) { return null; }
  };

  const getClientVars = () => {
    if (typeof window === 'undefined') return null;
    return window.clientVars || (window.top && window.top.clientVars) || null;
  };

  const block = () => {
    const cv = getClientVars();
    return cv && cv.ep_plugin_helpers && cv.ep_plugin_helpers.padSelect &&
        cv.ep_plugin_helpers.padSelect[pluginName] &&
        cv.ep_plugin_helpers.padSelect[pluginName][settingId];
  };

  const isSupportedClient = () => !!(block() && block().padWideSupported);

  // Coerce a stored value back to one of the configured option values
  // (cookies serialize numbers as strings). Returns undefined if no match.
  const coerce = (raw) => {
    if (raw == null) return undefined;
    const found = options.find((o) => String(o.value) === String(raw));
    return found ? found.value : undefined;
  };

  const readPadValue = () => {
    const pad = getPad();
    if (!pad || typeof pad.getPadOptions !== 'function') return undefined;
    const opts = pad.getPadOptions();
    const v = opts && opts[pluginName];
    return v ? coerce(v[settingId]) : undefined;
  };

  const readUserValue = () => {
    const cookie = getCookie();
    if (!cookie) return undefined;
    return coerce(cookie.getPref(settingId));
  };

  const isEnforced = () => {
    const pad = getPad();
    return !!(pad && typeof pad.isPadSettingsEnforcedForMe === 'function' &&
        pad.isPadSettingsEnforcedForMe());
  };

  const getEffective = () => {
    if (isEnforced()) {
      const padVal = readPadValue();
      return padVal != null ? padVal : defaultValue;
    }
    const userVal = readUserValue();
    if (userVal != null) return userVal;
    const padVal = readPadValue();
    return padVal != null ? padVal : defaultValue;
  };

  const refreshUI = () => {
    const $u = window.$(`#${userSelectId}`);
    const $p = window.$(`#${padSelectId}`);
    const eff = getEffective();
    const padVal = readPadValue();
    if ($u.length) {
      $u.val(String(eff));
      $u.prop('disabled', isEnforced());
    }
    if ($p.length && padVal != null) {
      $p.val(String(padVal));
    }
    if (eff !== lastEffective) {
      lastEffective = eff;
      try { onChangeCallback(eff); } catch (e) { console.error(e); }
    }
  };

  const init = (opts = {}) => {
    onChangeCallback = typeof opts.onChange === 'function' ? opts.onChange : () => {};
    const pad = getPad();
    const cookie = getCookie();
    const $u = window.$(`#${userSelectId}`);
    const $p = window.$(`#${padSelectId}`);

    if ($u.length) {
      $u.val(String(getEffective()));
      $u.prop('disabled', isEnforced());
      $u.on('change', () => {
        if (isEnforced()) {
          $u.val(String(getEffective()));
          return;
        }
        const v = coerce($u.val());
        if (v == null) return;
        if (cookie) cookie.setPref(settingId, v);
        refreshUI();
      });
    }

    if ($p.length && pad && typeof pad.changePadOption === 'function') {
      const initial = readPadValue();
      if (initial != null) $p.val(String(initial));
      $p.on('change', () => {
        const v = coerce($p.val());
        if (v == null) return;
        pad.changePadOption(pluginName, {[settingId]: v});
        refreshUI();
      });
    } else if (!isSupportedClient()) {
      if (typeof console !== 'undefined' && !init._warned) {
        console.warn(
            `[ep_plugin_helpers.padSelect ${pluginName}] pad-wide settings ` +
            'unavailable — server lacks ep_* passthrough patch (Etherpad < 2.7.4). ' +
            'Per-user cookie picker still works.');
        init._warned = true;
      }
    }

    lastEffective = getEffective();
    try { onChangeCallback(lastEffective); } catch (e) { console.error(e); }

    return {getValue: () => lastEffective, refresh: refreshUI};
  };

  // Plugin re-exports this so the helper sees pad-wide broadcasts and
  // refreshes local state when another user changes the pad-wide value.
  const handleClientMessage_CLIENT_MESSAGE = (hookName, ctx) => {
    if (!ctx || !ctx.payload) return;
    if (ctx.payload.type === 'padoptions') refreshUI();
  };

  return {init, handleClientMessage_CLIENT_MESSAGE};
};

module.exports = {padSelect: padSelectClient, createPadSelect: padSelectClient};
