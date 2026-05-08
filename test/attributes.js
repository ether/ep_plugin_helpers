'use strict';

const assert = require('assert');
const {lineAttribute, inlineAttribute, tagAttribute} = require('../attributes');

describe('lineAttribute', () => {
  const tags = ['h1', 'h2', 'h3', 'h4', 'code'];
  const headings = lineAttribute({
    attr: 'heading',
    tags,
    normalize: (v) => (v === 'h5' || v === 'h6') ? 'h4' : v,
  });

  describe('aceAttribsToClasses', () => {
    it('returns class for matching attribute', () => {
      const result = headings.aceAttribsToClasses('test', {key: 'heading', value: 'h1'});
      assert.deepStrictEqual(result, ['heading:h1']);
    });

    it('returns undefined for non-matching attribute', () => {
      const result = headings.aceAttribsToClasses('test', {key: 'bold', value: 'true'});
      assert.strictEqual(result, undefined);
    });
  });

  describe('aceDomLineProcessLineAttributes', () => {
    it('wraps line in matching tag', () => {
      const result = headings.aceDomLineProcessLineAttributes('test', {cls: 'heading:h2'});
      assert.deepStrictEqual(result, [{preHtml: '<h2>', postHtml: '</h2>', processedMarker: true}]);
    });

    it('normalizes h5 to h4', () => {
      const result = headings.aceDomLineProcessLineAttributes('test', {cls: 'heading:h5'});
      assert.deepStrictEqual(result, [{preHtml: '<h4>', postHtml: '</h4>', processedMarker: true}]);
    });

    it('normalizes h6 to h4', () => {
      const result = headings.aceDomLineProcessLineAttributes('test', {cls: 'heading:h6'});
      assert.deepStrictEqual(result, [{preHtml: '<h4>', postHtml: '</h4>', processedMarker: true}]);
    });

    it('returns empty array for non-matching class', () => {
      const result = headings.aceDomLineProcessLineAttributes('test', {cls: 'bold'});
      assert.deepStrictEqual(result, []);
    });

    it('returns empty array for unknown tag value', () => {
      const result = headings.aceDomLineProcessLineAttributes('test', {cls: 'heading:h9'});
      assert.deepStrictEqual(result, []);
    });
  });

  describe('aceRegisterBlockElements', () => {
    it('returns the tags array', () => {
      assert.deepStrictEqual(headings.aceRegisterBlockElements(), tags);
    });
  });

  describe('ccRegisterBlockElements', () => {
    it('returns the tags array (server-side counterpart)', () => {
      assert.deepStrictEqual(headings.ccRegisterBlockElements(), tags);
    });

    it('is exposed alongside aceRegisterBlockElements', () => {
      assert.strictEqual(typeof headings.ccRegisterBlockElements, 'function');
      assert.strictEqual(typeof headings.aceRegisterBlockElements, 'function');
    });
  });

  describe('collectContentPre', () => {
    it('sets line attribute for matching tag', () => {
      const state = {lineAttributes: {}};
      headings.collectContentPre('test', {tname: 'h1', state}, () => {});
      assert.deepStrictEqual(state.lineAttributes, {heading: 'h1'});
    });

    it('clears attribute on div', () => {
      const state = {lineAttributes: {heading: 'h1'}};
      headings.collectContentPre('test', {tname: 'div', state}, () => {});
      assert.deepStrictEqual(state.lineAttributes, {});
    });

    it('clears attribute on p', () => {
      const state = {lineAttributes: {heading: 'h2'}};
      headings.collectContentPre('test', {tname: 'p', state}, () => {});
      assert.deepStrictEqual(state.lineAttributes, {});
    });

    it('ignores non-matching tags', () => {
      const state = {lineAttributes: {}};
      headings.collectContentPre('test', {tname: 'span', state}, () => {});
      assert.deepStrictEqual(state.lineAttributes, {});
    });

    it('works without callback', () => {
      const state = {lineAttributes: {}};
      headings.collectContentPre('test', {tname: 'h3', state});
      assert.deepStrictEqual(state.lineAttributes, {heading: 'h3'});
    });
  });

  describe('collectContentPost', () => {
    it('clears attribute for matching tag', () => {
      const state = {lineAttributes: {heading: 'h3'}};
      headings.collectContentPost('test', {tname: 'h3', state}, () => {});
      assert.deepStrictEqual(state.lineAttributes, {});
    });

    it('does not clear on non-matching tag', () => {
      const state = {lineAttributes: {heading: 'h1'}};
      headings.collectContentPost('test', {tname: 'span', state}, () => {});
      assert.deepStrictEqual(state.lineAttributes, {heading: 'h1'});
    });
  });
});

describe('inlineAttribute', () => {
  const fontColor = inlineAttribute({
    attr: 'color',
    values: ['black', 'red', 'green', 'blue'],
  });

  describe('aceAttribsToClasses', () => {
    it('handles key=attr, value=color', () => {
      const result = fontColor.aceAttribsToClasses('test', {key: 'color', value: 'red'});
      assert.deepStrictEqual(result, ['color:red']);
    });

    it('handles key=attr:value format', () => {
      const result = fontColor.aceAttribsToClasses('test', {key: 'color:blue', value: ''});
      assert.deepStrictEqual(result, ['color:blue']);
    });

    it('returns undefined for non-matching key', () => {
      const result = fontColor.aceAttribsToClasses('test', {key: 'bold', value: 'true'});
      assert.strictEqual(result, undefined);
    });
  });

  describe('aceCreateDomLine', () => {
    it('returns modifier for valid color', () => {
      const result = fontColor.aceCreateDomLine('test', {cls: 'color:red'});
      assert.strictEqual(result.length, 1);
      assert.strictEqual(result[0].cls, 'color:red');
    });

    it('rejects color not in values list', () => {
      const result = fontColor.aceCreateDomLine('test', {cls: 'color:purple'});
      assert.deepStrictEqual(result, []);
    });

    it('returns empty for non-matching class', () => {
      const result = fontColor.aceCreateDomLine('test', {cls: 'bold'});
      assert.deepStrictEqual(result, []);
    });
  });

  describe('collectContentPre', () => {
    it('calls doAttrib with double-colon format', () => {
      let called = null;
      const cc = {doAttrib: (state, attr) => { called = attr; }};
      fontColor.collectContentPre('test', {cls: 'color:red', state: {}, cc});
      assert.strictEqual(called, 'color::red');
    });

    it('does nothing for non-matching class', () => {
      let called = false;
      const cc = {doAttrib: () => { called = true; }};
      fontColor.collectContentPre('test', {cls: 'bold', state: {}, cc});
      assert.strictEqual(called, false);
    });
  });

  describe('without values list', () => {
    const open = inlineAttribute({attr: 'color'});

    it('accepts any value when no values list', () => {
      const result = open.aceCreateDomLine('test', {cls: 'color:purple'});
      assert.strictEqual(result.length, 1);
    });
  });
});

describe('tagAttribute', () => {
  const subSup = tagAttribute({tags: ['sub', 'sup']});

  describe('aceAttribClasses', () => {
    it('maps tags to tag: prefix', () => {
      const attr = {};
      subSup.aceAttribClasses('test', attr);
      assert.deepStrictEqual(attr, {sub: 'tag:sub', sup: 'tag:sup'});
    });
  });

  describe('aceAttribsToClasses', () => {
    it('returns tag name for matching key', () => {
      assert.deepStrictEqual(subSup.aceAttribsToClasses('test', {key: 'sub'}), ['sub']);
      assert.deepStrictEqual(subSup.aceAttribsToClasses('test', {key: 'sup'}), ['sup']);
    });

    it('returns undefined for non-matching key', () => {
      assert.strictEqual(subSup.aceAttribsToClasses('test', {key: 'bold'}), undefined);
    });
  });

  describe('aceRegisterBlockElements', () => {
    it('returns the tags array', () => {
      assert.deepStrictEqual(subSup.aceRegisterBlockElements(), ['sub', 'sup']);
    });
  });

  describe('ccRegisterBlockElements', () => {
    it('returns the tags array (server-side)', () => {
      assert.deepStrictEqual(subSup.ccRegisterBlockElements(), ['sub', 'sup']);
    });
  });

  describe('collectContentPre', () => {
    it('calls doAttrib for matching tag', () => {
      let called = null;
      const cc = {doAttrib: (state, attr) => { called = attr; }};
      subSup.collectContentPre('test', {tname: 'sub', state: {}, cc});
      assert.strictEqual(called, 'sub');
    });

    it('ignores non-matching tag', () => {
      let called = false;
      const cc = {doAttrib: () => { called = true; }};
      subSup.collectContentPre('test', {tname: 'div', state: {}, cc});
      assert.strictEqual(called, false);
    });
  });
});

describe('backwards compatibility', () => {
  it('old names still work', () => {
    const {createLineAttribute, createInlineAttribute, createTagAttribute} = require('../attributes');
    assert.strictEqual(typeof createLineAttribute, 'function');
    assert.strictEqual(typeof createInlineAttribute, 'function');
    assert.strictEqual(typeof createTagAttribute, 'function');
  });
});
