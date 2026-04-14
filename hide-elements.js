'use strict';

const hideElements = {
  // Server-side: inject CSS to hide elements via eejsBlock_styles
  css: (selector, opts = {}) => (hookName, args, cb) => {
    let style = `${selector} { display: none !important; }`;
    if (opts.extra) style += `\n${opts.extra}`;
    args.content += `<style>${style}</style>`;
    return cb();
  },

  // Client-side: remove DOM elements via postAceInit
  remove: (selector, opts = {}) => () => {
    const $el = $(selector);
    if (opts.removePrecedingSeparator) {
      if ($el.prev('.separator').length === 1 && $el.next('.separator').length === 1) {
        $el.prev('.separator').remove();
      }
    }
    $el.remove();
  },
};

module.exports = {hideElements};
