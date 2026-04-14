'use strict';

module.exports = {
  plugins: [
    'n',
  ],
  extends: [
    './index.js',
    'plugin:n/recommended',
  ],
  parserOptions: {
    // Set to at least 2020 to enable support for dynamic import(). This only affects how the code
    // is parsed -- it does not affect what features rules will allow.
    ecmaVersion: 2020,
  },
  env: {
    node: true,
  },
  ignorePatterns: [
    'node_modules/',
  ],
  overrides: [
    {
      files: ['.eslintrc.*'],
      rules: {
        'n/no-unpublished-require': 'off',
      },
    },
    {
      files: ['*.ts', '*.tsx', '*.cts', '*.mts'].map((p) => [p, `.${p}`]).flat(),
      settings: {
        n: {
          tryExtensions: ['.js', '.cjs', '.mjs', '.ts', '.cts', '.mts', '.json', '.node'],
        },
      },
    },
  ],
};
