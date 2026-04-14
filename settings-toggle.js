'use strict';

const eejs = require('ep_etherpad-lite/node/eejs/');
const settings = require('ep_etherpad-lite/node/utils/Settings');

const createSettingsToggle = (config) => {
  const {
    pluginName,
    settingId,
    templatePath,
    defaultEnabled = true,
    disabledByDefaultKey = 'disabledByDefault',
  } = config;

  const template = templatePath || `${pluginName}/templates/settings.ejs`;

  // Server-side: inject checkbox into settings panel
  const eejsBlock_mySettings = (hookName, args, cb) => {
    let checkedState = defaultEnabled ? 'checked' : '';
    const pluginSettings = settings[pluginName];
    if (pluginSettings && pluginSettings[disabledByDefaultKey] === true) {
      checkedState = '';
    } else if (pluginSettings && pluginSettings[disabledByDefaultKey] === false) {
      checkedState = 'checked';
    }
    args.content += eejs.require(template, {checked: checkedState});
    return cb();
  };

  // Client-side: initialize checkbox from cookie and bind change handler
  // Returns {enabled} for the plugin to use
  const init = (checkboxId) => {
    const id = checkboxId || `options-${settingId}`;
    const padcookie = require('ep_etherpad-lite/static/js/pad_cookie').padcookie;
    const $checkbox = $(`#${id}`);

    // Restore from cookie
    const pref = padcookie.getPref(settingId);
    if (pref === false) {
      $checkbox.prop('checked', false);
    } else if (pref === true) {
      $checkbox.prop('checked', true);
    }

    const state = {enabled: $checkbox.is(':checked')};

    $checkbox.on('click', () => {
      state.enabled = $checkbox.is(':checked');
      padcookie.setPref(settingId, state.enabled);
    });

    return state;
  };

  return {eejsBlock_mySettings, init};
};

module.exports = {toggle: createSettingsToggle, createSettingsToggle};
