'use strict';

const assert = require('assert');
const {padToggle} = require('../pad-toggle-server');
const {padSelect} = require('../pad-select-server');

// Reproduces how core fans the clientVars hook out: hooks.aCallAll collects
// every hook's return value, then each one is shallow-merged onto the single
// outgoing clientVars object with Object.assign (see PadMessageHandler).
const runCoreClientVarsMerge = async (hooks) => {
  const clientVars = {};
  const messages = [];
  for (const hook of hooks) {
    messages.push(await hook('clientVars', {clientVars, pad: null}));
  }
  for (const msg of messages) {
    if (msg == null) continue;
    Object.assign(clientVars, msg);
  }
  return clientVars;
};

const toggleFor = (pluginName, settingId) => padToggle({
  pluginName,
  settingId,
  l10nId: `${pluginName}.${settingId}`,
  defaultLabel: settingId,
});

const selectFor = (pluginName, settingId) => padSelect({
  pluginName,
  settingId,
  l10nId: `${pluginName}.${settingId}`,
  defaultLabel: settingId,
  options: [{value: 'a', label: 'A'}, {value: 'b', label: 'B'}],
  defaultValue: 'a',
});

describe('clientVars namespace sharing', () => {
  it('keeps every padToggle block when several plugins publish one', async () => {
    const a = toggleFor('ep_alpha', 'alpha');
    const b = toggleFor('ep_bravo', 'bravo');
    const c = toggleFor('ep_charlie', 'charlie');

    const cv = await runCoreClientVarsMerge([a.clientVars, b.clientVars, c.clientVars]);

    // Before the fix each hook returned a fresh `ep_plugin_helpers` object,
    // so core's shallow Object.assign left only the last plugin's block and
    // every other plugin logged "pad-wide settings unavailable" on a fully
    // patched core.
    assert.ok(cv.ep_plugin_helpers.padToggle.ep_alpha, 'ep_alpha block was clobbered');
    assert.ok(cv.ep_plugin_helpers.padToggle.ep_bravo, 'ep_bravo block was clobbered');
    assert.ok(cv.ep_plugin_helpers.padToggle.ep_charlie, 'ep_charlie block was clobbered');
    assert.strictEqual(cv.ep_plugin_helpers.padToggle.ep_alpha.settingId, 'alpha');
    assert.strictEqual(cv.ep_plugin_helpers.padToggle.ep_bravo.settingId, 'bravo');
  });

  it('lets padToggle and padSelect blocks coexist', async () => {
    const t = toggleFor('ep_alpha', 'alpha');
    const s = selectFor('ep_bravo', 'bravo');

    const cv = await runCoreClientVarsMerge([t.clientVars, s.clientVars]);

    assert.ok(cv.ep_plugin_helpers.padToggle.ep_alpha, 'padToggle block was clobbered');
    assert.ok(cv.ep_plugin_helpers.padSelect.ep_bravo.bravo, 'padSelect block was clobbered');
  });

  it('keeps several padSelect settings of different plugins', async () => {
    const a = selectFor('ep_alpha', 'alpha');
    const b = selectFor('ep_bravo', 'bravo');

    const cv = await runCoreClientVarsMerge([a.clientVars, b.clientVars]);

    assert.ok(cv.ep_plugin_helpers.padSelect.ep_alpha.alpha);
    assert.ok(cv.ep_plugin_helpers.padSelect.ep_bravo.bravo);
  });

  it('does not disturb clientVars keys owned by core or other plugins', async () => {
    const clientVars = {padId: 'p', ep_other_plugin: {keep: true}};
    const t = toggleFor('ep_alpha', 'alpha');
    Object.assign(clientVars, await t.clientVars('clientVars', {clientVars, pad: null}));

    assert.strictEqual(clientVars.padId, 'p');
    assert.deepStrictEqual(clientVars.ep_other_plugin, {keep: true});
    assert.ok(clientVars.ep_plugin_helpers.padToggle.ep_alpha);
  });

  it('stores hostile path segments as own properties, not on the prototype', async () => {
    // padSelect accepts any non-empty string as a settingId, so a settingId
    // of __proto__ must not retarget a prototype — the block would then be
    // dropped when core JSON-serializes clientVars.
    const s = padSelect({
      pluginName: 'ep_alpha',
      settingId: '__proto__',
      l10nId: 'ep_alpha.proto',
      defaultLabel: 'proto',
      options: [{value: 'a', label: 'A'}, {value: 'b', label: 'B'}],
      defaultValue: 'a',
    });
    const cv = await runCoreClientVarsMerge([s.clientVars]);
    const plugin = cv.ep_plugin_helpers.padSelect.ep_alpha;

    assert.ok(Object.prototype.hasOwnProperty.call(plugin, '__proto__'),
        '__proto__ must be an own property, not a prototype swap');
    assert.ok(JSON.parse(JSON.stringify(cv))
        .ep_plugin_helpers.padSelect.ep_alpha.__proto__,
    'the block must survive JSON serialization');
    assert.strictEqual(Object.getPrototypeOf({}), Object.prototype,
        'Object.prototype must not have been polluted');
  });

  it('still returns a self-contained block when ctx has no clientVars', async () => {
    // Backwards compatibility: a core (or a test) that calls the hook without
    // exposing the live clientVars object must keep getting the full block.
    const t = toggleFor('ep_alpha', 'alpha');
    const returned = await t.clientVars('clientVars', {pad: null});
    assert.ok(returned.ep_plugin_helpers.padToggle.ep_alpha);
  });
});
