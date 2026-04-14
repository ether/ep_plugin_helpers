'use strict';

module.exports = {
  extends: [
    './index.js',
  ],
  env: {
    browser: true,
    jquery: true,
  },
  globals: {
    clientVars: 'readonly',
    exports: 'readonly',
    html10n: 'readonly',
    io: 'readonly',
    module: 'readonly',
    pad: 'readonly',
    require: 'readonly',
  },
  rules: {
    'comma-dangle': ['error', {
      arrays: 'always-multiline',
      objects: 'always-multiline',
      imports: 'always-multiline',
      exports: 'always-multiline',
      // Trailing commas for function declarations and function calls is only supported in
      // ECMAScript 2017 and newer.
      functions: 'never',
    }],
  },
};
