'use strict';

const assert = require('assert');
const {JSDOM} = require('jsdom');
const {
  createCssHighlights, buildRange, buildSegments, isSupported,
} = require('../css-highlights');

const makeLine = (innerHTML) => {
  const dom = new JSDOM('<!DOCTYPE html><div id="x"></div>');
  const div = dom.window.document.getElementById('x');
  div.innerHTML = innerHTML;
  return {div, win: dom.window};
};

describe('cssHighlights', () => {
  describe('buildSegments', () => {
    it('flattens nested text nodes into char-offset segments', () => {
      const {div, win} = makeLine('hello <span class="a">world</span>!');
      const segs = buildSegments(div, win);
      assert.strictEqual(segs.length, 3);
      assert.strictEqual(segs.reduce((s, x) => s + x.len, 0), 'hello world!'.length);
      assert.strictEqual(segs[0].node.nodeValue, 'hello ');
      assert.strictEqual(segs[1].node.nodeValue, 'world');
      assert.strictEqual(segs[2].node.nodeValue, '!');
    });
  });

  describe('buildRange', () => {
    it('builds a Range over a single text node', () => {
      const {div, win} = makeLine('while (true) {}');
      const segs = buildSegments(div, win);
      const r = buildRange(div.ownerDocument, segs, 0, 5);
      assert.ok(r);
      assert.strictEqual(r.toString(), 'while');
    });

    it('builds a Range across nested elements', () => {
      const {div, win} = makeLine('<span class="a">while</span> (true) {}');
      const segs = buildSegments(div, win);
      const r = buildRange(div.ownerDocument, segs, 0, 5);
      assert.strictEqual(r.toString(), 'while');
      const r2 = buildRange(div.ownerDocument, segs, 7, 11);
      assert.strictEqual(r2.toString(), 'true');
    });

    it('returns null for out-of-bounds ranges', () => {
      const {div, win} = makeLine('hi');
      const segs = buildSegments(div, win);
      assert.strictEqual(buildRange(div.ownerDocument, segs, 5, 10), null);
    });

    it('handles wide ranges spanning multiple text nodes', () => {
      const {div, win} = makeLine('abc<span class="x">DEF</span>ghi');
      const segs = buildSegments(div, win);
      const r = buildRange(div.ownerDocument, segs, 1, 8);
      assert.strictEqual(r.toString(), 'bcDEFgh');
    });
  });

  describe('isSupported', () => {
    it('returns false when the window lacks CSS.highlights', () => {
      assert.strictEqual(isSupported({}), false);
      assert.strictEqual(isSupported({CSS: {}}), false);
      assert.strictEqual(isSupported({CSS: {highlights: {}}}), false);
      assert.strictEqual(isSupported(null), false);
    });

    it('returns true for a window with a CSS.highlights.set + Highlight', () => {
      const win = {Highlight: class {}, CSS: {highlights: {set: () => {}}}};
      assert.strictEqual(isSupported(win), true);
    });
  });

  describe('createCssHighlights', () => {
    it('exposes setLineRanges / removeLineRanges / clearAll / buildRange / buildSegments', () => {
      const reg = createCssHighlights();
      for (const k of ['setLineRanges', 'removeLineRanges', 'clearAll', 'buildRange', 'buildSegments']) {
        assert.strictEqual(typeof reg[k], 'function', `missing ${k}`);
      }
    });

    it('setLineRanges no-ops when CSS.highlights is unavailable', () => {
      // jsdom's window doesn't ship CSS.highlights — exercising the unsupported
      // branch should not throw.
      const {div} = makeLine('const x = 1;');
      const reg = createCssHighlights();
      assert.doesNotThrow(() => reg.setLineRanges(div, [{start: 0, end: 5, cls: 'kw'}]));
    });

    it('setLineRanges + clearAll exercise the supported branch with a stub Highlight', () => {
      // Build a minimal stub with the shape isSupported checks for, then
      // verify setLineRanges adds Range objects to the right Highlight
      // instance and clearAll empties them.
      const {div, win} = makeLine('const foo');
      const created = new Map();
      const setSpy = [];
      win.Highlight = class {
        constructor() {
          this._items = new Set();
        }
        add(r) { this._items.add(r); }
        delete(r) { this._items.delete(r); }
        clear() { this._items.clear(); }
        get size() { return this._items.size; }
      };
      win.CSS = {
        highlights: {
          get: (k) => created.get(k),
          set: (k, h) => { created.set(k, h); setSpy.push(k); },
        },
      };
      const reg = createCssHighlights();
      reg.setLineRanges(div, [
        {start: 0, end: 5, cls: 'kw'},
        {start: 6, end: 9, cls: 'id'},
      ]);
      assert.deepStrictEqual(setSpy.sort(), ['id', 'kw']);
      assert.strictEqual(created.get('kw').size, 1);
      assert.strictEqual(created.get('id').size, 1);
      reg.clearAll();
      assert.strictEqual(created.get('kw').size, 0);
      assert.strictEqual(created.get('id').size, 0);
    });

    it('removeLineRanges deletes only the named line\'s ranges', () => {
      const {div, win} = makeLine('aaa');
      win.Highlight = class {
        constructor() {
          this._items = new Set();
        }
        add(r) { this._items.add(r); }
        delete(r) { this._items.delete(r); }
        clear() { this._items.clear(); }
        get size() { return this._items.size; }
      };
      const map = new Map();
      win.CSS = {
        highlights: {
          get: (k) => map.get(k),
          set: (k, h) => map.set(k, h),
        },
      };
      const reg = createCssHighlights();
      reg.setLineRanges(div, [{start: 0, end: 3, cls: 'kw'}]);
      assert.strictEqual(map.get('kw').size, 1);
      reg.removeLineRanges(div);
      assert.strictEqual(map.get('kw').size, 0);
    });
  });
});
