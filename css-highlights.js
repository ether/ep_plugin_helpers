'use strict';

// cssHighlights — wrapper around the CSS Custom Highlights API for plugins
// that want to paint Range-based decorations *without mutating the editor's
// DOM*. Use cases: syntax highlighting, spell-check squiggles, find-and-
// replace highlights, lint indicators, "search-in-pad" UIs.
//
// Why not splitText / inject <span>: Etherpad's Ace tracks every line's
// internal state (text nodes, attribute spans, _magicdom_dirtiness.knownHTML).
// Mutating the DOM that Ace owns fights its bookkeeping — broken caret on
// active-line typing, broken collab changeset application, stuck stale
// decorations. Range-based highlights register with the browser; the DOM
// itself stays exactly as Ace wrote it.
//
// CSS Custom Highlights ships in Chrome 105+, Safari 17.2+, Firefox 140+.
// On older browsers `setLineRanges` no-ops gracefully — host editor still
// works, just without the decoration paint.
//
// Usage (client-side; this module loads in the browser pad bundle):
//
//   const {createCssHighlights} = require('ep_plugin_helpers/css-highlights');
//   const reg = createCssHighlights();
//
//   // Whenever a line should re-paint:
//   reg.setLineRanges(lineEl, [
//     {start: 0,  end: 5,  cls: 'my-keyword'},
//     {start: 12, end: 18, cls: 'my-string'},
//   ]);
//
//   // CSS:
//   //   ::highlight(my-keyword) { color: #d73a49; }
//   //   ::highlight(my-string)  { color: #032f62; }
//
// On language change / state reset:
//   reg.clearAll();
//
// A line that the host removes from the DOM has its WeakMap entry GC'd
// automatically; no explicit cleanup needed.

const isSupported = (win) => {
  if (!win || !win.Highlight) return false;
  if (!win.CSS || !win.CSS.highlights) return false;
  return typeof win.CSS.highlights.set === 'function';
};

const buildSegments = (lineEl, win) => {
  const doc = lineEl.ownerDocument;
  const walker = doc.createTreeWalker(lineEl, win.NodeFilter.SHOW_TEXT);
  const segs = [];
  let pos = 0;
  let n;
  while ((n = walker.nextNode())) {
    const len = n.nodeValue.length;
    segs.push({node: n, start: pos, len});
    pos += len;
  }
  return segs;
};

// Build a DOM Range covering the [start, end) character offsets within the
// line's flattened text. Returns null if the bounds fall outside the line.
const buildRange = (doc, segs, start, end) => {
  let startNode = null;
  let startOff = 0;
  let endNode = null;
  let endOff = 0;
  for (const seg of segs) {
    const segEnd = seg.start + seg.len;
    if (!startNode && start >= seg.start && start <= segEnd) {
      startNode = seg.node;
      startOff = start - seg.start;
    }
    // We break the moment endNode is set, so by the time we reach this
    // condition again endNode is guaranteed null.
    if (end > seg.start && end <= segEnd) {
      endNode = seg.node;
      endOff = end - seg.start;
      break;
    }
  }
  if (!startNode || !endNode) return null;
  const range = doc.createRange();
  try {
    range.setStart(startNode, startOff);
    range.setEnd(endNode, endOff);
  } catch (_e) {
    return null;
  }
  return range;
};

const createCssHighlights = () => {
  // Per-instance state so plugins don't share Highlight registries.
  const lineRanges = new WeakMap();
  const classHighlights = new Map();

  const getOrCreateHighlight = (win, cls) => {
    let h = classHighlights.get(cls);
    if (h) return h;
    h = new win.Highlight();
    win.CSS.highlights.set(cls, h);
    classHighlights.set(cls, h);
    return h;
  };

  const removeLineRanges = (lineEl) => {
    const map = lineRanges.get(lineEl);
    if (!map) return;
    for (const [cls, arr] of map) {
      const h = classHighlights.get(cls);
      if (!h) continue;
      for (const r of arr) {
        try { h.delete(r); } catch (_e) { /* stale range */ }
      }
    }
    lineRanges.delete(lineEl);
  };

  const setLineRanges = (lineEl, tokenRanges) => {
    if (!lineEl) return;
    const win = lineEl.ownerDocument && lineEl.ownerDocument.defaultView;
    if (!isSupported(win)) {
      removeLineRanges(lineEl);
      return;
    }
    removeLineRanges(lineEl);
    if (!tokenRanges || !tokenRanges.length) return;
    const segs = buildSegments(lineEl, win);
    if (!segs.length) return;
    const newMap = new Map();
    for (const tr of tokenRanges) {
      if (!tr || tr.start >= tr.end || !tr.cls) continue;
      const range = buildRange(lineEl.ownerDocument, segs, tr.start, tr.end);
      if (!range) continue;
      const h = getOrCreateHighlight(win, tr.cls);
      h.add(range);
      let arr = newMap.get(tr.cls);
      if (!arr) {
        arr = [];
        newMap.set(tr.cls, arr);
      }
      arr.push(range);
    }
    if (newMap.size > 0) lineRanges.set(lineEl, newMap);
  };

  const clearAll = () => {
    for (const h of classHighlights.values()) {
      try { h.clear(); } catch (_e) { /* ignore */ }
    }
  };

  return {setLineRanges, removeLineRanges, clearAll, buildRange, buildSegments};
};

module.exports = {
  createCssHighlights,
  cssHighlights: createCssHighlights,
  // Pure helpers exposed for unit testing without a browser window.
  buildRange,
  buildSegments,
  isSupported,
};
