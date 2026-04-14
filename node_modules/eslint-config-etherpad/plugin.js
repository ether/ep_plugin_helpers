'use strict';

const commonNodeOverrides = {
  rules: {
    'n/no-missing-require': ['error', {
      allowModules: [
        // Disable the node/no-missing-require rule for `require('ep_etherpad-lite/foo')`. It would
        // be nice to warn plugin devs that their plugin is requiring a core Etherpad module that
        // doesn't actually exist, but there is a significant cost to enabling this rule for
        // ep_etherpad-lite: ep_etherpad-lite is a peer dependency for plugins, so a simple `npm i`
        // in the plugin's clone will not install it. Instead, the developer working on the plugin
        // ep_example has to do one of these two things:
        //
        //   * Manually clone the etherpad-lite repo, then clone the ep_example repo to
        //     `/path/to/etherpad-lite/node_modules/ep_example`. Creating a symlink there that
        //     points to the clone's actual location will not work because npm (or maybe Node.js
        //     itself?) will resolve the symlink to its physical path before Node.js walks the
        //     parent directories in search of ep_etherpad-lite.
        //
        //     The biggest flaw with this option: npm loves to quietly nuke anything in
        //     `node_modules` that isn't a dependency. There's no easy way to prevent npm from
        //     nuking the plugin's clone. "Installing" the plugin via
        //         npm install ep_example@file:/path/to/ep_example
        //     does not help because installation via `file:` works by creating a symlink in
        //     `node_modules`. (Another annoyance: The dev would have to remember to not commit the
        //     changes npm makes to `package.json` and `package-lock.json`.)
        //
        //   * Manually clone the etherpad-lite repo, then create an `ep_etherpad-lite` symlink
        //     inside the plugin's `node_modules` directory that points to
        //     `/path/to/etherpad-lite/src`. This is a hack: It assumes Node.js searches the
        //     plugin's own `node_modules` directory even though ep_etherpad-lite is a peer
        //     dependency. Unfortunately, npm will quietly delete the `ep_etherpad-lite` symlink
        //     whenever it runs. To prevent npm from deleting the symlink, ep_etherpad-lite could be
        //     "installed" as a dev dependency via:
        //         npm install --save-dev ep_etherpad-lite@file:/path/to/etherpad-lite/src
        //     The dev would have to remember to not commit the changes npm makes to `package.json`
        //     and `package-lock.json`.
        //
        // This exemption is made here in this `plugin.js` file and not in `node.js` because
        // Etherpad code in `etherpad-lite/bin` and `etherpad-lite/tests` already has
        // ep_etherpad-lite available as a dependency (there is no developer burden there).
        //
        // This exemption does not affect node/no-extraneous-require, so a plugin is still required
        // to add `ep_etherpad-lite` to its `peerDependencies` if it requires ep_etherpad-lite.
        //
        // All peer dependencies are similarly troublesome; this is not just an ep_etherpad-lite
        // problem. They should all be listed here to avoid hassle. Unfortunately, this
        // `allowModules` option does not take regular expressions, otherwise we could simply permit
        // `ep_.*`. (Modules beginning with `ep_` are almost certainly going to be peer
        // dependencies.)
        'ep_etherpad-lite',
      ],
    }],
  },
};

module.exports = {
  overrides: [
    {
      files: ['**/.eslintrc.js'],
      extends: './node.js',
    },
    {
      files: ['**/*'],
      excludedFiles: ['**/.eslintrc.js', 'static/js/**/*', 'static/tests/frontend/**/*'],
      extends: './node.js',
      ...commonNodeOverrides,
    },
    {
      files: ['static/js/**/*'],
      excludedFiles: ['**/.eslintrc.js'],
      extends: './browser.js',
    },
    {
      files: ['static/tests/**/*'],
      excludedFiles: ['**/.eslintrc.js'],
      extends: './tests.js',
    },
    {
      files: ['static/tests/backend/**/*'],
      excludedFiles: ['**/.eslintrc.js'],
      extends: './tests/backend.js',
      ...commonNodeOverrides,
      overrides: [
        {
          files: [
            'static/tests/backend/**/*',
          ],
          excludedFiles: [
            'static/tests/backend/specs/**/*',
          ],
          rules: {
            'mocha/no-exports': 'off',
            'mocha/no-top-level-hooks': 'off',
          },
        },
      ],
    },
    {
      files: ['static/tests/frontend/**/*'],
      excludedFiles: ['**/.eslintrc.js'],
      extends: './tests/frontend.js',
    },
  ],
};
