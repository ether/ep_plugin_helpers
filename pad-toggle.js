'use strict';

// padToggle — emit parallel checkboxes in the User Settings (mySettings) and
// Pad Wide Settings (padSettings) panels, mirroring how native settings like
// stickychat / lineNumbers / disablechat work. The pad-wide value rides the
// existing padoptions COLLABROOM rail (the helper's value lives at
// pad.padOptions[pluginName] = {enabled: bool}), so broadcast, persistence,
// creator-only-write, and enforceSettings semantics all come for free —
// provided Etherpad core ships the ep_* passthrough patch (since 2.7.4).
//
// On older cores (no PluginCapabilities module), the pad-wide block is a
// no-op and the user-side cookie toggle still works. Plugins built on this
// helper continue to function everywhere; only the pad-wide column is gone.

const PLUGIN_NAME_RE = /^ep_[a-z0-9_]+$/;

let padOptionsPluginPassthrough = false;
try {
  // Server-only. Wrapped because the Settings module pulls in node deps
  // (fs, path) that don't exist in the esbuild-bundled client. The require
  // also fails on Etherpad versions before the passthrough patch shipped.
  // eslint-disable-next-line global-require
  const caps = require('ep_etherpad-lite/node/utils/PluginCapabilities');
  padOptionsPluginPassthrough = caps && caps.padOptionsPluginPassthrough === true;
} catch (_e) { /* older core or client bundle — leave as false */ }

const padToggle = (config) => {
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
    throw new Error('padToggle requires l10nId (string) — never hardcode a label');
  }

  const userCheckboxId = `options-${settingId}`;
  const padCheckboxId = `padsettings-options-${settingId}`;
  let cachedDefaultEnabled = !!defaultEnabled;

  // ---------- Server hooks ----------

  const loadSettings = async (hookName, args) => {
    const ps = (args && args.settings && args.settings[pluginName]) || {};
    if (typeof ps.defaultEnabled === 'boolean') cachedDefaultEnabled = ps.defaultEnabled;
  };

  const clientVars = async (hookName, ctx) => {
    let initialPadEnabled = cachedDefaultEnabled;
    try {
      const padSettings = ctx && ctx.pad && typeof ctx.pad.getPadSettings === 'function'
        ? ctx.pad.getPadSettings() : null;
      const stored = padSettings && padSettings[pluginName];
      if (stored && typeof stored.enabled === 'boolean') initialPadEnabled = stored.enabled;
    } catch (_e) { /* leave initialPadEnabled at instance default */ }

    const helperBlock = {
      [pluginName]: {
        padWideSupported: padOptionsPluginPassthrough,
        settingId,
        l10nId,
        defaultEnabled: cachedDefaultEnabled,
        initialPadEnabled,
      },
    };
    return {ep_plugin_helpers: {padToggle: helperBlock}};
  };

  const renderCheckbox = (idPrefix) =>
    `<p>` +
      `<input type="checkbox" id="${idPrefix}options-${settingId}">` +
      `<label for="${idPrefix}options-${settingId}" data-l10n-id="${l10nId}"></label>` +
    `</p>`;

  const eejsBlock_mySettings = (hookName, args, cb) => {
    args.content += renderCheckbox('');
    return cb();
  };

  const eejsBlock_padSettings = (hookName, args, cb) => {
    if (!padOptionsPluginPassthrough) return cb();
    args.content += renderCheckbox('padsettings-');
    return cb();
  };

  // ---------- Client-side state (closed over by init/handleClientMessage) ----------

  let onChangeCallback = () => {};
  let lastEffective = null;

  const getPad = () => {
    if (typeof window === 'undefined') return null;
    // Try the AMD pad module first (preferred), then the global.
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
      return padVal != null ? padVal : cachedDefaultEnabled;
    }
    const userVal = readUserValue();
    if (userVal != null) return userVal;
    const padVal = readPadValue();
    return padVal != null ? padVal : cachedDefaultEnabled;
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

    // User-side checkbox: cookie-backed, mirrors the effective value when not
    // enforced. Disabled visually + functionally when the pad creator has
    // turned on enforceSettings.
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

    // Pad-wide checkbox: only present when the rendering hook ran (i.e. the
    // server has the passthrough patch). changePadOption broadcasts and the
    // local applyPadSettings updates pad.padOptions[pluginName] in-place.
    if ($p.length && pad && typeof pad.changePadOption === 'function') {
      const initial = readPadValue();
      if (initial != null) $p.prop('checked', initial);
      $p.on('change', () => {
        const v = $p.is(':checked');
        pad.changePadOption(pluginName, {enabled: v});
        refreshUI();
      });
    } else if (!isSupportedClient()) {
      // Surface the degraded state once per pad load so the operator notices
      // when their core lacks the passthrough patch but plugin authors expect
      // pad-wide behavior.
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

  // Etherpad dispatches handleClientMessage_<type> for every incoming
  // COLLABROOM message. For pad-wide changes, the outer type is
  // CLIENT_MESSAGE and the inner payload.type is padoptions. Plugins
  // re-export this hook so the helper can refresh local state when another
  // user toggles the pad-wide value.
  const handleClientMessage_CLIENT_MESSAGE = (hookName, ctx) => {
    if (!ctx || !ctx.payload) return;
    if (ctx.payload.type === 'padoptions') refreshUI();
  };

  return {
    loadSettings,
    clientVars,
    eejsBlock_mySettings,
    eejsBlock_padSettings,
    init,
    handleClientMessage_CLIENT_MESSAGE,
  };
};

module.exports = {padToggle, createPadToggle: padToggle};
