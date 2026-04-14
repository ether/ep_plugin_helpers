'use strict';

const assert = require('assert');
const {hideCSS, removeElement} = require('../hide-elements');

describe('hideCSS', () => {
  it('generates style tag that hides selector', () => {
    const hook = hideCSS('#chatbox');
    const args = {content: ''};
    hook('test', args, () => {});
    assert.strictEqual(args.content, '<style>#chatbox { display: none !important; }</style>');
  });

  it('appends extra CSS when provided', () => {
    const hook = hideCSS('#chatbox', {extra: '#users{height:100%}'});
    const args = {content: ''};
    hook('test', args, () => {});
    assert.ok(args.content.includes('#chatbox { display: none !important; }'));
    assert.ok(args.content.includes('#users{height:100%}'));
  });

  it('appends to existing content', () => {
    const hook = hideCSS('#foo');
    const args = {content: '<link rel="stylesheet">'};
    hook('test', args, () => {});
    assert.ok(args.content.startsWith('<link rel="stylesheet">'));
    assert.ok(args.content.includes('#foo'));
  });

  it('calls callback', () => {
    const hook = hideCSS('#foo');
    let called = false;
    hook('test', {content: ''}, () => { called = true; });
    assert.strictEqual(called, true);
  });
});

describe('removeElement', () => {
  it('returns a function', () => {
    const hook = removeElement('#foo');
    assert.strictEqual(typeof hook, 'function');
  });
});
