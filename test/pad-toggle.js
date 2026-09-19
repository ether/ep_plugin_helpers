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
      // Etherpad >= 3.0.0). loadSettings without the flag set must leave
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

    it('clientVars exposes patchPresent + runtimeEnabled so the client can name the cause', async () => {
      // PR shifts the client-side degradation warning from a generic
      // "patch missing" line to a specific cause. Locking in that the
      // server publishes the two flags. In this test env the patched
      // core is not installed, so patchPresent is false; runtimeEnabled
      // reflects the loadSettings call below.
      const t = padToggle(baseConfig());
      await t.loadSettings('h', {settings: {enablePluginPadOptions: true}});
      const cv = await t.clientVars('h', {pad: null});
      const block = cv.ep_plugin_helpers.padToggle.ep_test;
      assert.strictEqual(block.patchPresent, false,
          'patchPresent must reflect PluginCapabilities, not be conflated with the runtime flag');
      assert.strictEqual(block.runtimeEnabled, true,
          'runtimeEnabled must reflect settings.enablePluginPadOptions exactly');
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

    it('reports padWidePanelEnabled=false when settings.enablePadWideSettings is off', async () => {
      // With the Pad Wide Settings panel disabled, core never calls
      // eejsBlock_padSettings, so pad-wide really is unavailable and the
      // client warning must be able to say so instead of blaming the
      // passthrough patch.
      const t = padToggle(baseConfig());
      await t.loadSettings('h', {settings: {
        enablePluginPadOptions: true, enablePadWideSettings: false,
      }});
      const cv = await t.clientVars('h', {pad: null});
      const block = cv.ep_plugin_helpers.padToggle.ep_test;
      assert.strictEqual(block.padWidePanelEnabled, false);
      assert.strictEqual(block.padWideSupported, false);
    });

    it('treats a missing enablePadWideSettings key as enabled', async () => {
      // Cores that predate the flag always render the panel.
      const t = padToggle(baseConfig());
      await t.loadSettings('h', {settings: {enablePluginPadOptions: true}});
      const cv = await t.clientVars('h', {pad: null});
      assert.strictEqual(
          cv.ep_plugin_helpers.padToggle.ep_test.padWidePanelEnabled, true);
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

  describe('client degradation warning', () => {
    const {padToggle: clientFactory} = require('../pad-toggle');

    // The client needs a window with a jQuery-ish $ and clientVars. Nothing
    // is rendered here: zero-length selections force init() down the
    // "pad-wide checkbox missing" branch, which is where the warning lives.
    const withWindow = (block, fn) => {
      const savedWindow = global.window;
      const savedWarn = console.warn;
      const warnings = [];
      global.window = {
        $: () => ({length: 0}),
        clientVars: block
          ? {ep_plugin_helpers: {padToggle: {ep_test: block}}}
          : {},
      };
      console.warn = (msg) => warnings.push(String(msg));
      try {
        fn();
      } finally {
        console.warn = savedWarn;
        if (savedWindow === undefined) delete global.window;
        else global.window = savedWindow;
      }
      return warnings;
    };

    it('blames enablePadWideSettings when the pad-wide panel is disabled', () => {
      const warnings = withWindow({
        padWideSupported: false,
        patchPresent: true,
        runtimeEnabled: true,
        padWidePanelEnabled: false,
      }, () => clientFactory(baseConfig()).init());
      assert.strictEqual(warnings.length, 1);
      assert.match(warnings[0], /settings\.enablePadWideSettings is false/);
    });

    it('still blames the runtime flag when that is the actual cause', () => {
      const warnings = withWindow({
        padWideSupported: false,
        patchPresent: true,
        runtimeEnabled: false,
        padWidePanelEnabled: true,
      }, () => clientFactory(baseConfig()).init());
      assert.strictEqual(warnings.length, 1);
      assert.match(warnings[0], /settings\.enablePluginPadOptions is false/);
    });

    it('stays silent when pad-wide support is available', () => {
      const warnings = withWindow({
        padWideSupported: true,
        patchPresent: true,
        runtimeEnabled: true,
        padWidePanelEnabled: true,
      }, () => clientFactory(baseConfig()).init());
      assert.deepStrictEqual(warnings, []);
    });
  });

  describe('backwards-compat alias', () => {
    it('createPadToggle resolves on both sub-paths', () => {
      assert.strictEqual(typeof require('../pad-toggle-server').createPadToggle, 'function');
      assert.strictEqual(typeof require('../pad-toggle').createPadToggle, 'function');
    });
  });
});
