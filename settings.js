'use strict';

const createSettingsRelay = (pluginName, defaults = {}) => {
  let cached = null;

  const loadSettings = async (hookName, {settings}) => {
    const pluginSettings = settings[pluginName] || {};
    cached = {...defaults, ...pluginSettings};
  };

  const clientVars = async () => ({[pluginName]: cached});

  const get = (key) => {
    if (key !== undefined) return cached ? cached[key] : undefined;
    return cached;
  };

  return {loadSettings, clientVars, get};
};

module.exports = {settings: createSettingsRelay, createSettingsRelay};
