'use strict';

// padToggle (client side) — wires up the parallel User Settings / Pad Wide
// Settings checkboxes that pad-toggle-server.js renders. Reads the helper's
// clientVars block (capability flag + initial pad-wide value), persists the
// per-user choice in padcookie, and forwards pad-wide changes through the
// native pad.changePadOption() flow so they ride the existing padoptions
// COLLABROOM broadcast.
//
// This file deliberately has no top-level requires that touch server-only
// modules — esbuild bundles it into the browser pad bundle, and any
// node-only path would break the client build.

const PLUGIN_NAME_RE = /^ep_[a-z0-9_]+$/;

const validateConfig = (config) => {
  if (!config || typeof config !== 'object') {
    throw new Error('padToggle requires a config object');
  }
  const {pluginName, settingId, l10nId, defaultEnabled = true} = config;
  if (!PLUGIN_NAME_RE.test(pluginName || '')) {
    throw new Error(
        `padToggle pluginName must match /^ep_[a-z0-9_]+$/, got: ${pluginName}`);
  }
  if (!settingId || typeof settingId !== 'string') {
    throw new Error('padToggle requires settingId (string)');
  }
  if (!l10nId || typeof l10nId !== 'string') {
    throw new Error('padToggle requires l10nId (string) — i18n is mandatory');
  }
  // Client side does no rendering, but the same validation runs here so an
  // author who forgets defaultLabel on the client gets the same loud error
  // as on the server.
  if (!config.defaultLabel || typeof config.defaultLabel !== 'string') {
    throw new Error('padToggle requires defaultLabel (string) — a11y fallback for screen readers');
  }
  return {pluginName, settingId, l10nId, defaultEnabled: !!defaultEnabled};
};

const padToggleClient = (rawConfig) => {
  const {pluginName, settingId, defaultEnabled} = validateConfig(rawConfig);
  const userCheckboxId = `options-${settingId}`;
  const padCheckboxId = `padsettings-options-${settingId}`;

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

  const isSupportedClient = () => {
    const cv = getClientVars();
    const block = cv && cv.ep_plugin_helpers && cv.ep_plugin_helpers.padToggle &&
        cv.ep_plugin_helpers.padToggle[pluginName];
    return !!(block && block.padWideSupported);
  };

  const readPadValue = () => {
    const pad = getPad();
    if (!pad || typeof pad.getPadOptions !== 'function') return undefined;
    const opts = pad.getPadOptions();
    const v = opts && opts[pluginName];
    return (v && typeof v.enabled === 'boolean') ? v.enabled : undefined;
  };

  const readUserValue = () => {
    const cookie = getCookie();
    if (!cookie) return undefined;
    const pref = cookie.getPref(settingId);
    return (pref === true || pref === false) ? pref : undefined;
  };

  const isEnforced = () => {
    const pad = getPad();
    return !!(pad && typeof pad.isPadSettingsEnforcedForMe === 'function' &&
        pad.isPadSettingsEnforcedForMe());
  };

  const getEffective = () => {
    if (isEnforced()) {
      const padVal = readPadValue();
      return padVal != null ? padVal : defaultEnabled;
    }
    const userVal = readUserValue();
    if (userVal != null) return userVal;
    const padVal = readPadValue();
    return padVal != null ? padVal : defaultEnabled;
  };

  const refreshUI = () => {
    const $u = window.$(`#${userCheckboxId}`);
    const $p = window.$(`#${padCheckboxId}`);
    const eff = getEffective();
    const padVal = readPadValue();
    if ($u.length) {
      $u.prop('checked', eff);
      $u.prop('disabled', isEnforced());
    }
    if ($p.length && padVal != null) {
      $p.prop('checked', padVal);
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
    const $u = window.$(`#${userCheckboxId}`);
    const $p = window.$(`#${padCheckboxId}`);

    if ($u.length) {
      $u.prop('checked', getEffective());
      $u.prop('disabled', isEnforced());
      $u.on('change', () => {
        if (isEnforced()) {
          $u.prop('checked', getEffective());
          return;
        }
        const v = $u.is(':checked');
        if (cookie) cookie.setPref(settingId, v);
        refreshUI();
      });
    }

    if ($p.length && pad && typeof pad.changePadOption === 'function') {
      const initial = readPadValue();
      if (initial != null) $p.prop('checked', initial);
      $p.on('change', () => {
        const v = $p.is(':checked');
        pad.changePadOption(pluginName, {enabled: v});
        refreshUI();
      });
    } else if (!isSupportedClient()) {
      if (typeof console !== 'undefined' && !init._warned) {
        console.warn(
            `[ep_plugin_helpers.padToggle ${pluginName}] pad-wide settings ` +
            'unavailable — server lacks ep_* passthrough patch (Etherpad < 2.7.4). ' +
            'Per-user cookie toggle still works.');
        init._warned = true;
      }
    }

    lastEffective = getEffective();
    try { onChangeCallback(lastEffective); } catch (e) { console.error(e); }

    return {
      getEnabled: () => lastEffective,
      refresh: refreshUI,
    };
  };

  // Plugin re-exports this so the helper sees pad-wide broadcasts and
  // refreshes local state when another user toggles the pad-wide checkbox.
  // Etherpad dispatches handleClientMessage_<type> for every COLLABROOM
  // message; for pad-wide changes the outer type is CLIENT_MESSAGE and the
  // inner payload.type is padoptions.
  const handleClientMessage_CLIENT_MESSAGE = (hookName, ctx) => {
    if (!ctx || !ctx.payload) return;
    if (ctx.payload.type === 'padoptions') refreshUI();
  };

  return {init, handleClientMessage_CLIENT_MESSAGE};
};

module.exports = {padToggle: padToggleClient, createPadToggle: padToggleClient};
