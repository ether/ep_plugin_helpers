'use strict';

const assert = require('assert');
const {settings: settingsRelay} = require('../settings');

describe('settings', () => {
  it('returns loadSettings, clientVars, and get', () => {
    const relay = settingsRelay('ep_test');
    assert.strictEqual(typeof relay.loadSettings, 'function');
    assert.strictEqual(typeof relay.clientVars, 'function');
    assert.strictEqual(typeof relay.get, 'function');
  });

  it('caches plugin settings from loadSettings hook', async () => {
    const relay = settingsRelay('ep_test', {color: 'blue'});
    await relay.loadSettings('test', {settings: {ep_test: {size: 12}}});
    assert.deepStrictEqual(relay.get(), {color: 'blue', size: 12});
  });

  it('uses defaults when plugin settings are missing', async () => {
    const relay = settingsRelay('ep_test', {color: 'blue'});
    await relay.loadSettings('test', {settings: {}});
    assert.deepStrictEqual(relay.get(), {color: 'blue'});
  });

  it('get(key) returns specific value', async () => {
    const relay = settingsRelay('ep_test');
    await relay.loadSettings('test', {settings: {ep_test: {x: 42}}});
    assert.strictEqual(relay.get('x'), 42);
  });

  it('clientVars returns namespaced settings', async () => {
    const relay = settingsRelay('ep_test');
    await relay.loadSettings('test', {settings: {ep_test: {a: 1}}});
    const result = await relay.clientVars();
    assert.deepStrictEqual(result, {ep_test: {a: 1}});
  });

  it('old name createSettingsRelay still works', () => {
    const {createSettingsRelay} = require('../settings');
    assert.strictEqual(typeof createSettingsRelay, 'function');
  });
});
