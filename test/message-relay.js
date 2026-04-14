'use strict';

const assert = require('assert');
const {messageRelay} = require('../message-relay');

describe('messageRelay', () => {
  it('returns a handleMessage function', () => {
    const relay = messageRelay({
      incomingType: 'cursor',
      action: 'move',
      buildPayload: async (msg) => ({x: msg.x}),
    });
    assert.strictEqual(typeof relay.handleMessage, 'function');
  });

  it('ignores non-COLLABROOM messages', async () => {
    const relay = messageRelay({
      incomingType: 'cursor',
      buildPayload: async () => ({}),
    });
    const result = await relay.handleMessage('test', {message: {type: 'OTHER', data: {}}});
    assert.strictEqual(result, undefined);
  });

  it('ignores wrong data type', async () => {
    const relay = messageRelay({
      incomingType: 'cursor',
      buildPayload: async () => ({}),
    });
    const result = await relay.handleMessage('test', {
      message: {type: 'COLLABROOM', data: {type: 'chat'}},
    });
    assert.strictEqual(result, undefined);
  });

  it('ignores wrong action when action is specified', async () => {
    const relay = messageRelay({
      incomingType: 'cursor',
      action: 'move',
      buildPayload: async () => ({}),
    });
    const result = await relay.handleMessage('test', {
      message: {type: 'COLLABROOM', data: {type: 'cursor', action: 'click'}},
    });
    assert.strictEqual(result, undefined);
  });

  it('old name createMessageRelay still works', () => {
    const {createMessageRelay} = require('../message-relay');
    assert.strictEqual(typeof createMessageRelay, 'function');
  });
});
