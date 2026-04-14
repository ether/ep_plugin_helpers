'use strict';

module.exports = {
  extends: [
    '../browser.js',
    '../tests.js',
  ],
  globals: {
    _: 'readonly',
    expect: 'readonly',
    helper: 'readonly',
  },
  rules: {
    // Each frontend test spec file is wrapped inside a `describe()`.
    'mocha/max-top-level-suites': 'off',
    // Each frontend test spec file is wrapped inside a `describe()`.
    'mocha/no-global-tests': 'off',
    // Each frontend test spec file is wrapped inside a `describe()`.
    'mocha/no-top-level-hooks': 'off',
  },
};
