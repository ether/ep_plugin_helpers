'use strict';

// Lazy-load all modules so that etherpad-lite dependencies are only resolved
// when the factories are actually called (within the Etherpad runtime).

module.exports = {
  // Attributes — generate hooks for formatting attributes
  get lineAttribute() { return require('./attributes').lineAttribute; },
  get inlineAttribute() { return require('./attributes').inlineAttribute; },
  get tagAttribute() { return require('./attributes').tagAttribute; },

  // Templates — inject HTML into page sections
  get template() { return require('./eejs-blocks').template; },
  get rawHTML() { return require('./eejs-blocks').rawHTML; },

  // Settings — load plugin config and send to client
  get settings() { return require('./settings').settings; },

  // Toggle — checkbox in settings panel with cookie persistence
  get toggle() { return require('./settings-toggle').toggle; },

  // Messages — intercept and relay real-time messages
  get messageRelay() { return require('./message-relay').messageRelay; },

  // Hide — hide or remove UI elements
  get hideCSS() { return require('./hide-elements').hideCSS; },
  get removeElement() { return require('./hide-elements').removeElement; },

  // Logger
  get logger() { return require('./logger').logger; },
};
