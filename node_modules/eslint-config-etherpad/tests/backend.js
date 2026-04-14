'use strict';

module.exports = {
  extends: [
    '../node.js',
    '../tests.js',
  ],
  rules: {
    'n/no-unpublished-require': 'off', // It's OK for tests to use devDependencies.
  },
};
