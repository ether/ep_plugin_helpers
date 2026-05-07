'use strict';

const assert = require('assert');
const {padToggle} = require('../pad-toggle-server');

const baseConfig = () => ({
  pluginName: 'ep_test',
  settingId: 'thing',
  l10nId: 'ep_test.thing',
  defaultLabel: 'Show Thing',
});

describe('padToggle', () => {
  describe('config validation', () => {
    it('throws when pluginName fails the ep_<lowercase> namespace check', () => {
      assert.throws(() => padToggle({...baseConfig(), pluginName: 'EP_SHOUTY'}),
          /pluginName must match/);
      assert.throws(() => padToggle({...baseConfig(), pluginName: 'ep-dashy'}),
          /pluginName must match/);
      assert.throws(() => padToggle({...baseConfig(), pluginName: 'no-prefix'}),
          /pluginName must match/);
    });

    it('throws when settingId, l10nId, or defaultLabel is missing', () => {
      assert.throws(() => padToggle({...baseConfig(), settingId: ''}),
          /settingId/);
      assert.throws(() => padToggle({...baseConfig(), l10nId: ''}),
          /l10nId/);
      assert.throws(() => padToggle({...baseConfig(), defaultLabel: ''}),
          /defaultLabel/);
      assert.throws(() => padToggle({...baseConfig(), defaultLabel: undefined}),
          /defaultLabel/);
    });

    it('returns the full server hook surface for valid config', () => {
      const t = padToggle(baseConfig());
      for (const k of [
        'loadSettings', 'clientVars',
        'eejsBlock_mySettings', 'eejsBlock_padSettings',
      ]) {
        assert.strictEqual(typeof t[k], 'function', `missing hook: ${k}`);
      }
    });

    it('client sub-path exposes init + handleClientMessage_CLIENT_MESSAGE', () => {
      const {padToggle: clientFactory} = require('../pad-toggle');
      const t = clientFactory(baseConfig());
      assert.strictEqual(typeof t.init, 'function');
      assert.strictEqual(typeof t.handleClientMessage_CLIENT_MESSAGE, 'function');
    });
  });

  describe('eejsBlock_mySettings', () => {
    it('emits a checkbox with namespaced id, data-l10n-id, and label fallback', (done) => {
      const t = padToggle(baseConfig());
      const args = {content: ''};
      t.eejsBlock_mySettings('hook', args, () => {
        assert.match(args.content, /id="options-thing"/);
        assert.match(args.content, /data-l10n-id="ep_test\.thing"/);
        // a11y fallback: <label> must contain the default text so screen
        // readers announce something even if html10n hasn't loaded yet.
        assert.match(args.content, /data-l10n-id="ep_test\.thing">Show Thing<\/label>/);
        done();
      });
    });

    it('HTML-escapes the defaultLabel and l10nId to prevent injection', (done) => {
      const t = padToggle({
        ...baseConfig(),
        defaultLabel: 'A & B <script>',
        l10nId: 'ep_test.thing"onerror',
      });
      const args = {content: ''};
      t.eejsBlock_mySettings('hook', args, () => {
        assert.ok(!args.content.includes('<script>'),
            'raw <script> must not survive into rendered HTML');
        assert.match(args.content, /A &amp; B &lt;script&gt;/);
        assert.match(args.content, /data-l10n-id="ep_test\.thing&quot;onerror"/);
        done();
      });
    });
  });

  describe('eejsBlock_padSettings', () => {
    it('is a no-op when the core lacks the passthrough patch', (done) => {
      // Module-level capability detection ran at require time. In this test
      // env the patched core is not installed, so it stays false — exactly
      // the unsupported-server scenario the helper is meant to handle.
      const t = padToggle(baseConfig());
      const args = {content: ''};
      t.eejsBlock_padSettings('hook', args, () => {
        assert.strictEqual(args.content, '',
            'pad-wide block must not render without core support');
        done();
      });
    });

    it('is a no-op when settings.enablePluginPadOptions is missing/false', async () => {
      // Even on a patched core, the runtime flag is opt-in (default false in
      // Etherpad >= 2.7.4). loadSettings without the flag set must leave
      // pad-wide rendering off.
      const t = padToggle(baseConfig());
      await t.loadSettings('h', {settings: {}}); // no enablePluginPadOptions
      const args = {content: ''};
      await new Promise((res) => t.eejsBlock_padSettings('h', args, res));
      assert.strictEqual(args.content, '');
    });

    it('clientVars reports padWideSupported=false when the runtime flag is off', async () => {
      const t = padToggle(baseConfig());
      await t.loadSettings('h', {settings: {enablePluginPadOptions: false}});
      const cv = await t.clientVars('h', {pad: null});
      assert.strictEqual(
          cv.ep_plugin_helpers.padToggle.ep_test.padWideSupported, false,
          'capability flag in clientVars must reflect both core patch AND runtime flag');
    });
  });

  describe('loadSettings', () => {
    it('honors instance default from settings.json[pluginName].defaultEnabled', async () => {
      const t = padToggle({...baseConfig(), defaultEnabled: false});
      await t.loadSettings('h', {settings: {ep_test: {defaultEnabled: true}}});
      // Verify by reading clientVars seeded value.
      const cv = await t.clientVars('h', {pad: null});
      assert.strictEqual(
          cv.ep_plugin_helpers.padToggle.ep_test.defaultEnabled, true);
    });

    it('falls back to the constructor default when settings.json is silent', async () => {
      const t = padToggle({...baseConfig(), defaultEnabled: false});
      await t.loadSettings('h', {settings: {}});
      const cv = await t.clientVars('h', {pad: null});
      assert.strictEqual(
          cv.ep_plugin_helpers.padToggle.ep_test.defaultEnabled, false);
    });
  });

  describe('clientVars', () => {
    it('namespaces under ep_plugin_helpers.padToggle.<pluginName>', async () => {
      const t = padToggle(baseConfig());
      const cv = await t.clientVars('h', {pad: null});
      assert.ok(cv.ep_plugin_helpers);
      assert.ok(cv.ep_plugin_helpers.padToggle);
      assert.ok(cv.ep_plugin_helpers.padToggle.ep_test);
    });

    it('reports padWideSupported=false in this test env (no patched core)', async () => {
      const t = padToggle(baseConfig());
      const cv = await t.clientVars('h', {pad: null});
      assert.strictEqual(
          cv.ep_plugin_helpers.padToggle.ep_test.padWideSupported, false);
    });

    it('reads stored pad-wide value from pad.getPadSettings()[pluginName]', async () => {
      const t = padToggle({...baseConfig(), defaultEnabled: false});
      const fakePad = {
        getPadSettings: () => ({ep_test: {enabled: true}}),
      };
      const cv = await t.clientVars('h', {pad: fakePad});
      assert.strictEqual(
          cv.ep_plugin_helpers.padToggle.ep_test.initialPadEnabled, true);
    });

    it('falls back to instance default when pad has no stored value', async () => {
      const t = padToggle({...baseConfig(), defaultEnabled: true});
      const fakePad = {getPadSettings: () => ({})};
      const cv = await t.clientVars('h', {pad: fakePad});
      assert.strictEqual(
          cv.ep_plugin_helpers.padToggle.ep_test.initialPadEnabled, true);
    });
  });

  describe('backwards-compat alias', () => {
    it('createPadToggle resolves on both sub-paths', () => {
      assert.strictEqual(typeof require('../pad-toggle-server').createPadToggle, 'function');
      assert.strictEqual(typeof require('../pad-toggle').createPadToggle, 'function');
    });
  });
});
