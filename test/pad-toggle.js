'use strict';

const assert = require('assert');
const {padToggle} = require('../pad-toggle');

const baseConfig = () => ({
  pluginName: 'ep_test',
  settingId: 'thing',
  l10nId: 'ep_test.thing',
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

    it('throws when settingId or l10nId is missing', () => {
      assert.throws(() => padToggle({...baseConfig(), settingId: ''}),
          /settingId/);
      assert.throws(() => padToggle({...baseConfig(), l10nId: ''}),
          /l10nId/);
    });

    it('returns the full hook surface for valid config', () => {
      const t = padToggle(baseConfig());
      for (const k of [
        'loadSettings', 'clientVars',
        'eejsBlock_mySettings', 'eejsBlock_padSettings',
        'init', 'handleClientMessage_CLIENT_MESSAGE',
      ]) {
        assert.strictEqual(typeof t[k], 'function', `missing hook: ${k}`);
      }
    });
  });

  describe('eejsBlock_mySettings', () => {
    it('emits a checkbox with namespaced id and data-l10n-id label', (done) => {
      const t = padToggle(baseConfig());
      const args = {content: ''};
      t.eejsBlock_mySettings('hook', args, () => {
        assert.match(args.content, /id="options-thing"/);
        assert.match(args.content, /data-l10n-id="ep_test\.thing"/);
        // No hardcoded English fallback inside the label tag.
        assert.match(args.content, /data-l10n-id="ep_test\.thing"><\/label>/);
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
    it('createPadToggle still resolves', () => {
      const {createPadToggle} = require('../pad-toggle');
      assert.strictEqual(typeof createPadToggle, 'function');
    });
  });
});
