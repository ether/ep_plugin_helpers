'use strict';

// padToggle (server side) — emits parallel checkboxes in the User Settings
// (mySettings) and Pad Wide Settings (padSettings) panels, mirroring native
// Etherpad behavior. Pad-wide values ride the existing padoptions COLLABROOM
// rail (stored at pad.padOptions[pluginName] = {enabled: bool}) when the core
// has the ep_* passthrough patch (Etherpad >= 2.7.4); on older cores the
// pad-wide block silently no-ops and the user-side cookie toggle alone still
// works.
//
// This module is intended for server-side import only. The companion
// `pad-toggle.js` provides the client-side init/handleClientMessage hooks.
// They share the same config; plugin authors should use identical
// `pluginName`, `settingId`, `l10nId`, and `defaultEnabled` on both sides so
// the checkbox ids and clientVars block line up.

const PLUGIN_NAME_RE = /^ep_[a-z0-9_]+$/;

let padOptionsPluginPassthrough = false;
try {
  // The require lands on a leaf module on patched cores (Etherpad >= 2.7.4)
  // and throws on older cores. Server-only: this file is never bundled for
  // the browser, so esbuild's static analysis does not run here.
  // eslint-disable-next-line global-require
  const caps = require('ep_etherpad-lite/node/utils/PluginCapabilities');
  padOptionsPluginPassthrough = caps && caps.padOptionsPluginPassthrough === true;
} catch (_e) { /* older core — leave as false */ }

const HTML_ESCAPE_RE = /[&<>"']/g;
const HTML_ESCAPES = {'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'};
const escapeHtml = (s) => String(s).replace(HTML_ESCAPE_RE, (c) => HTML_ESCAPES[c]);

const validateConfig = (config) => {
  if (!config || typeof config !== 'object') {
    throw new Error('padToggle requires a config object');
  }
  const {pluginName, settingId, l10nId, defaultLabel, defaultEnabled = true} = config;
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
  if (!defaultLabel || typeof defaultLabel !== 'string') {
    throw new Error(
        'padToggle requires defaultLabel (string) — accessibility fallback ' +
        'rendered inside <label> so screen readers announce something before ' +
        'html10n loads. html10n overwrites it at runtime via data-l10n-id.');
  }
  return {pluginName, settingId, l10nId, defaultLabel, defaultEnabled: !!defaultEnabled};
};

const renderCheckbox = (settingId, l10nId, defaultLabel, idPrefix) =>
  `<p>` +
    `<input type="checkbox" id="${idPrefix}options-${settingId}">` +
    `<label for="${idPrefix}options-${settingId}" ` +
        `data-l10n-id="${escapeHtml(l10nId)}">${escapeHtml(defaultLabel)}</label>` +
  `</p>`;

const padToggleServer = (rawConfig) => {
  const {pluginName, settingId, l10nId, defaultLabel, defaultEnabled} = validateConfig(rawConfig);
  let cachedDefaultEnabled = defaultEnabled;
  // Etherpad >= 2.7.4 introduced settings.enablePluginPadOptions as a runtime
  // gate on the ep_* passthrough (default false per AGENTS.MD §52). We grab
  // it from loadSettings so eejsBlock_padSettings + clientVars correctly
  // no-op when an admin hasn't opted in, even though PluginCapabilities
  // reports the patch is present in the core.
  let runtimeFlagEnabled = false;

  const isPadWideActive = () => padOptionsPluginPassthrough && runtimeFlagEnabled;

  const loadSettings = async (hookName, args) => {
    const root = (args && args.settings) || {};
    const ps = root[pluginName] || {};
    if (typeof ps.defaultEnabled === 'boolean') cachedDefaultEnabled = ps.defaultEnabled;
    runtimeFlagEnabled = root.enablePluginPadOptions === true;
  };

  const clientVars = async (hookName, ctx) => {
    let initialPadEnabled = cachedDefaultEnabled;
    try {
      const padSettings = ctx && ctx.pad && typeof ctx.pad.getPadSettings === 'function'
        ? ctx.pad.getPadSettings() : null;
      const stored = padSettings && padSettings[pluginName];
      if (stored && typeof stored.enabled === 'boolean') initialPadEnabled = stored.enabled;
    } catch (_e) { /* leave initialPadEnabled at instance default */ }

    return {
      ep_plugin_helpers: {
        padToggle: {
          [pluginName]: {
            // True iff the running core has the patch AND the admin has
            // opted in via settings.enablePluginPadOptions. Client-side
            // init() reads this to decide whether to wire the pad-wide
            // checkbox, log the degradation warning, etc.
            padWideSupported: isPadWideActive(),
            settingId,
            l10nId,
            defaultEnabled: cachedDefaultEnabled,
            initialPadEnabled,
          },
        },
      },
    };
  };

  const eejsBlock_mySettings = (hookName, args, cb) => {
    args.content += renderCheckbox(settingId, l10nId, defaultLabel, '');
    return cb();
  };

  const eejsBlock_padSettings = (hookName, args, cb) => {
    if (!isPadWideActive()) return cb();
    args.content += renderCheckbox(settingId, l10nId, defaultLabel, 'padsettings-');
    return cb();
  };

  return {loadSettings, clientVars, eejsBlock_mySettings, eejsBlock_padSettings};
};

module.exports = {padToggle: padToggleServer, createPadToggle: padToggleServer};
