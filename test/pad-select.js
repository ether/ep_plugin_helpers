'use strict';

const assert = require('assert');
const {padSelect} = require('../pad-select-server');

const baseConfig = () => ({
  pluginName: 'ep_test',
  settingId: 'size',
  l10nId: 'ep_test.size',
  defaultLabel: 'Size',
  options: [
    {value: 2, label: '2'},
    {value: 4, label: '4'},
  ],
  defaultValue: 2,
});

describe('padSelect', () => {
  describe('config validation', () => {
    it('throws when pluginName fails the ep_<lowercase> namespace check', () => {
      assert.throws(() => padSelect({...baseConfig(), pluginName: 'EP_SHOUTY'}),
          /pluginName must match/);
      assert.throws(() => padSelect({...baseConfig(), pluginName: 'ep-dashy'}),
          /pluginName must match/);
      assert.throws(() => padSelect({...baseConfig(), pluginName: 'no-prefix'}),
          /pluginName must match/);
    });

    it('throws when required strings are missing', () => {
      assert.throws(() => padSelect({...baseConfig(), settingId: ''}),
          /settingId/);
      assert.throws(() => padSelect({...baseConfig(), l10nId: ''}),
          /l10nId/);
      assert.throws(() => padSelect({...baseConfig(), defaultLabel: ''}),
          /defaultLabel/);
    });

    it('throws when options is missing or has < 2 entries', () => {
      assert.throws(() => padSelect({...baseConfig(), options: undefined}),
          /options/);
      assert.throws(() => padSelect({...baseConfig(), options: []}),
          /options/);
      assert.throws(() => padSelect({...baseConfig(), options: [{value: 1, label: '1'}]}),
          /options/);
    });

    it('throws when an option entry is malformed', () => {
      assert.throws(() => padSelect({...baseConfig(), options: [{value: 1}, {value: 2, label: '2'}]}),
          /option entries/);
    });

    it('throws when defaultValue is missing or not in options', () => {
      assert.throws(() => padSelect({...baseConfig(), defaultValue: undefined}),
          /defaultValue/);
      assert.throws(() => padSelect({...baseConfig(), defaultValue: 99}),
          /not present in options/);
    });

    it('returns the server hook surface for valid config', () => {
      const s = padSelect(baseConfig());
      for (const k of [
        'loadSettings', 'clientVars',
        'eejsBlock_mySettings', 'eejsBlock_padSettings',
      ]) {
        assert.strictEqual(typeof s[k], 'function', `missing hook: ${k}`);
      }
    });

    it('client sub-path exposes init + handleClientMessage_CLIENT_MESSAGE', () => {
      const {padSelect: clientFactory} = require('../pad-select');
      const c = clientFactory(baseConfig());
      assert.strictEqual(typeof c.init, 'function');
      assert.strictEqual(typeof c.handleClientMessage_CLIENT_MESSAGE, 'function');
    });
  });

  describe('rendering', () => {
    it('eejsBlock_mySettings emits a <select> with one <option> per choice', async () => {
      const s = padSelect(baseConfig());
      await s.loadSettings('loadSettings', {settings: {}});
      let html = '';
      await new Promise((r) => s.eejsBlock_mySettings('eejsBlock_mySettings',
          {content: ''}, () => r()).then ? Promise.resolve() : null);
      // Helper hooks aren't awaitable in our pattern; collect via direct call.
      const args = {content: ''};
      await new Promise((r) => s.eejsBlock_mySettings('eejsBlock_mySettings', args, () => r()));
      html = args.content;
      assert.match(html, /<select id="options-size">/);
      assert.match(html, /<option value="2"[^>]* selected[^>]*>2<\/option>/);
      assert.match(html, /<option value="4"[^>]*>4<\/option>/);
      assert.match(html, /data-l10n-id="ep_test\.size"/);
    });

    it('reflects settings.json defaultValue override', async () => {
      const s = padSelect(baseConfig());
      await s.loadSettings('loadSettings', {settings: {ep_test: {size: 4}}});
      const args = {content: ''};
      await new Promise((r) => s.eejsBlock_mySettings('eejsBlock_mySettings', args, () => r()));
      assert.match(args.content, /<option value="4"[^>]* selected[^>]*>4<\/option>/);
    });
  });

  describe('clientVars', () => {
    it('exposes the helper block keyed by pluginName -> settingId', async () => {
      const s = padSelect(baseConfig());
      await s.loadSettings('loadSettings', {settings: {}});
      const cv = await s.clientVars('clientVars', {pad: null});
      const block = cv.ep_plugin_helpers.padSelect.ep_test.size;
      assert.ok(block);
      assert.strictEqual(block.defaultValue, 2);
      assert.strictEqual(block.padWideSupported, false);
      assert.deepStrictEqual(block.options, [{value: 2, label: '2'}, {value: 4, label: '4'}]);
    });
  });
});
