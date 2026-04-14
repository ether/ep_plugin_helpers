'use strict';

// Lazy-load all modules so that etherpad-lite dependencies are only resolved
// when the factories are actually called (within the Etherpad runtime).

module.exports = {
  get createLogger() { return require('./logger').createLogger; },
  get createSettingsRelay() { return require('./settings').createSettingsRelay; },
  get eejsBlock() { return require('./eejs-blocks').eejsBlock; },
  get createLineAttribute() { return require('./attributes').createLineAttribute; },
  get createInlineAttribute() { return require('./attributes').createInlineAttribute; },
  get createTagAttribute() { return require('./attributes').createTagAttribute; },
  get createSettingsToggle() { return require('./settings-toggle').createSettingsToggle; },
  get createMessageRelay() { return require('./message-relay').createMessageRelay; },
  get hideElements() { return require('./hide-elements').hideElements; },
};
