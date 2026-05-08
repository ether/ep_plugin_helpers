'use strict';

// padSelect (server side) — emits parallel User Settings + Pad Wide Settings
// <select> dropdowns, mirroring padToggle's pattern but for a value chosen
// from a fixed list (e.g. indent size: 2 / 4, theme: light / dark, etc.).
// Pad-wide values ride the existing padoptions COLLABROOM rail (stored at
// pad.padOptions[pluginName] = {[settingId]: value}) when the core has the
// ep_* passthrough patch (Etherpad >= 2.7.4) AND the admin opted in via
// settings.enablePluginPadOptions. Otherwise the pad-wide block silently
// no-ops and the user-side cookie picker still works.
//
// Server-side only. Companion `pad-select.js` provides the client init().

const PLUGIN_NAME_RE = /^ep_[a-z0-9_]+$/;

let padOptionsPluginPassthrough = false;
try {
  // eslint-disable-next-line global-require
  const caps = require('ep_etherpad-lite/node/utils/PluginCapabilities');
  padOptionsPluginPassthrough = caps && caps.padOptionsPluginPassthrough === true;
} catch (_e) { /* older core — leave as false */ }

const HTML_ESCAPE_RE = /[&<>"']/g;
const HTML_ESCAPES = {'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'};
const escapeHtml = (s) => String(s).replace(HTML_ESCAPE_RE, (c) => HTML_ESCAPES[c]);

const validateConfig = (config) => {
  if (!config || typeof config !== 'object') {
    throw new Error('padSelect requires a config object');
  }
  const {pluginName, settingId, l10nId, defaultLabel, options, defaultValue} = config;
  if (!PLUGIN_NAME_RE.test(pluginName || '')) {
    throw new Error(`padSelect pluginName must match /^ep_[a-z0-9_]+$/, got: ${pluginName}`);
  }
  if (!settingId || typeof settingId !== 'string') {
    throw new Error('padSelect requires settingId (string)');
  }
  if (!l10nId || typeof l10nId !== 'string') {
    throw new Error('padSelect requires l10nId (string) — i18n is mandatory');
  }
  if (!defaultLabel || typeof defaultLabel !== 'string') {
    throw new Error(
        'padSelect requires defaultLabel (string) — a11y fallback rendered ' +
        'inside <label> so screen readers announce something before html10n loads');
  }
  if (!Array.isArray(options) || options.length < 2) {
    throw new Error('padSelect requires options as an array of at least 2 entries');
  }
  for (const opt of options) {
    if (!opt || typeof opt.value === 'undefined' || !opt.label || typeof opt.label !== 'string') {
      throw new Error('padSelect option entries must be {value, label, l10nId?}');
    }
  }
  if (typeof defaultValue === 'undefined' || defaultValue === null) {
    throw new Error('padSelect requires defaultValue (must match one of options[].value)');
  }
  if (!options.some((o) => String(o.value) === String(defaultValue))) {
    throw new Error(`padSelect defaultValue ${defaultValue} not present in options`);
  }
  return {pluginName, settingId, l10nId, defaultLabel, options, defaultValue};
};

const renderSelect = (config, idPrefix) => {
  const {settingId, l10nId, defaultLabel, options, currentValue} = config;
  let html = '<p>';
  html += `<label for="${idPrefix}options-${settingId}" ` +
      `data-l10n-id="${escapeHtml(l10nId)}">${escapeHtml(defaultLabel)}</label> `;
  html += `<select id="${idPrefix}options-${settingId}">`;
  for (const opt of options) {
    const sel = String(opt.value) === String(currentValue) ? ' selected' : '';
    const optL10n = opt.l10nId ? ` data-l10n-id="${escapeHtml(opt.l10nId)}"` : '';
    html += `<option value="${escapeHtml(String(opt.value))}"${sel}${optL10n}>` +
        `${escapeHtml(opt.label)}</option>`;
  }
  html += '</select></p>';
  return html;
};

const padSelectServer = (rawConfig) => {
  const config = validateConfig(rawConfig);
  const {pluginName, settingId, options, defaultValue} = config;
  let cachedDefault = defaultValue;
  let runtimeFlagEnabled = false;

  const isPadWideActive = () => padOptionsPluginPassthrough && runtimeFlagEnabled;

  const loadSettings = async (hookName, args) => {
    const root = (args && args.settings) || {};
    const ps = root[pluginName] || {};
    if (typeof ps[settingId] !== 'undefined') {
      const found = options.find((o) => String(o.value) === String(ps[settingId]));
      if (found) cachedDefault = found.value;
    }
    runtimeFlagEnabled = root.enablePluginPadOptions === true;
  };

  const clientVars = async (hookName, ctx) => {
    let initialPadValue = cachedDefault;
    try {
      const padSettings = ctx && ctx.pad && typeof ctx.pad.getPadSettings === 'function'
        ? ctx.pad.getPadSettings() : null;
      const stored = padSettings && padSettings[pluginName];
      if (stored && typeof stored[settingId] !== 'undefined') {
        const found = options.find((o) => String(o.value) === String(stored[settingId]));
        if (found) initialPadValue = found.value;
      }
    } catch (_e) { /* leave at instance default */ }

    return {
      ep_plugin_helpers: {
        padSelect: {
          [pluginName]: {
            [settingId]: {
              padWideSupported: isPadWideActive(),
              options,
              defaultValue: cachedDefault,
              initialPadValue,
            },
          },
        },
      },
    };
  };

  const eejsBlock_mySettings = (hookName, args, cb) => {
    args.content += renderSelect({...config, currentValue: cachedDefault}, '');
    return cb();
  };

  const eejsBlock_padSettings = (hookName, args, cb) => {
    if (!isPadWideActive()) return cb();
    args.content += renderSelect({...config, currentValue: cachedDefault}, 'padsettings-');
    return cb();
  };

  return {loadSettings, clientVars, eejsBlock_mySettings, eejsBlock_padSettings};
};

module.exports = {padSelect: padSelectServer, createPadSelect: padSelectServer};
