'use strict';

const plugin = require('eslint-config-etherpad/flat/plugin');

// `eslint-config-etherpad/plugin` assumes the standard Etherpad plugin layout: browser code under
// `static/js/`, Mocha specs under `static/tests/backend/specs/`. This package is a plain library,
// so its client-side helpers live at the repository root and its specs in `test/`. Neither
// location picks up the browser/test globals from the shared config, so they are declared here.
module.exports = [
  ...plugin,
  {
    files: ['test/**/*.js'],
    rules: {
      // The Mocha suite lives in `test/`, which `eslint-plugin-n` does not recognise as a test
      // directory, so it treats `require('jsdom')` as a published file reaching for a
      // devDependency. The specs are never loaded by consumers of this package.
      'n/no-unpublished-require': 'off',
    },
    languageOptions: {
      globals: {
        after: 'readonly',
        afterEach: 'readonly',
        before: 'readonly',
        beforeEach: 'readonly',
        describe: 'readonly',
        it: 'readonly',
      },
    },
  },
  {
    files: [
      'hide-elements.js',
      'pad-select.js',
      'pad-toggle.js',
      'settings-toggle.js',
      'toolbar-select.js',
    ],
    languageOptions: {
      globals: {
        $: 'readonly',
        window: 'readonly',
      },
    },
  },
];
