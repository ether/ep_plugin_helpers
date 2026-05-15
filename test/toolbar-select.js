'use strict';

const assert = require('assert');
const {toolbarSelect} = require('../toolbar-select');

// Minimal jQuery-shaped stub. The real plugin runs under Etherpad's bundled
// jQuery; the helper only uses `.on('change', fn)` and `.val(...)`.
const makeFakeSelect = (initialValue = '12') => {
  let value = initialValue;
  let changeHandler = null;
  const $el = {
    on(event, handler) {
      if (event !== 'change') throw new Error(`unexpected event: ${event}`);
      changeHandler = handler;
      return $el;
    },
    val(v) {
      if (v === undefined) return value;
      value = v;
      return $el;
    },
    // Test-only helper: simulate the user picking an option.
    _fire(newValue) {
      value = newValue;
      if (changeHandler) changeHandler.call({_isThis: true, _$: $el});
    },
  };
  return $el;
};

const installJqueryStub = ($el) => {
  // Capture the previous global so multiple tests can swap stubs cleanly.
  const prev = globalThis.window;
  globalThis.window = {
    $: (selectorOrThis) => {
      // window.$(this) inside the change handler returns the element wrapper;
      // window.$(selector) returns the captured $el.
      if (selectorOrThis && selectorOrThis._isThis) return selectorOrThis._$;
      return $el;
    },
  };
  return () => { globalThis.window = prev; };
};

const makeContext = () => {
  const calls = [];
  let focused = 0;
  const aceObj = {
    ace_invoked: (val) => calls.push({type: 'invoked', val}),
  };
  return {
    calls,
    get focusCount() { return focused; },
    ctx: {
      ace: {
        callWithAce(fn, op, fast) { calls.push({type: 'callWithAce', op, fast}); fn(aceObj); },
        focus() { focused++; },
      },
    },
  };
};

describe('toolbarSelect', () => {
  describe('config validation', () => {
    let restore;
    beforeEach(() => { restore = installJqueryStub(makeFakeSelect()); });
    afterEach(() => restore());

    const ok = () => {
      const {ctx} = makeContext();
      return {
        selector: '#x',
        context: ctx,
        invoke: (ace, v) => ace.ace_invoked(v),
      };
    };

    it('throws when config is missing', () => {
      assert.throws(() => toolbarSelect(), /config object/);
      assert.throws(() => toolbarSelect(null), /config object/);
    });

    it('throws when selector is missing or not a string', () => {
      assert.throws(() => toolbarSelect({...ok(), selector: ''}), /selector/);
      assert.throws(() => toolbarSelect({...ok(), selector: 42}), /selector/);
    });

    it('throws when context.ace is absent or missing required methods', () => {
      assert.throws(() => toolbarSelect({...ok(), context: {}}), /context\.ace/);
      assert.throws(
          () => toolbarSelect({...ok(), context: {ace: {callWithAce: () => {}}}}),
          /callWithAce \/ focus/);
      assert.throws(
          () => toolbarSelect({...ok(), context: {ace: {focus: () => {}}}}),
          /callWithAce \/ focus/);
    });

    it('throws when invoke is not a function', () => {
      assert.throws(() => toolbarSelect({...ok(), invoke: undefined}), /invoke/);
      assert.throws(() => toolbarSelect({...ok(), invoke: 'not-a-fn'}), /invoke/);
    });

    it('throws when op is provided but empty', () => {
      assert.throws(() => toolbarSelect({...ok(), op: ''}), /op must be a non-empty string/);
    });

    it('throws when coerce is an unknown token', () => {
      assert.throws(() => toolbarSelect({...ok(), coerce: 'bigint'}),
          /coerce must be a function or one of/);
    });

    it('throws when onAfterChange is provided but not a function', () => {
      assert.throws(() => toolbarSelect({...ok(), onAfterChange: 42}), /onAfterChange/);
    });
  });

  describe('change behaviour', () => {
    it("calls invoke with coerced int, resets select, and focuses editor", () => {
      const $sel = makeFakeSelect('initial');
      const restore = installJqueryStub($sel);
      const {ctx, calls} = makeContext();
      let captured = ctx; // alias for clarity

      toolbarSelect({
        selector: '#font-size',
        context: ctx,
        invoke: (ace, v) => ace.ace_invoked(v),
        op: 'insertsize',
      });

      $sel._fire('24');
      restore();

      assert.deepStrictEqual(calls, [
        {type: 'callWithAce', op: 'insertsize', fast: true},
        {type: 'invoked', val: 24},
      ]);
      assert.strictEqual($sel.val(), 'dummy', 'select should be reset to sentinel');
      assert.strictEqual(captured === ctx, true);
    });

    it('still focuses the editor when the coerced value is unusable', () => {
      const $sel = makeFakeSelect('initial');
      const restore = installJqueryStub($sel);
      const ce = makeContext();

      toolbarSelect({
        selector: '#font-size',
        context: ce.ctx,
        invoke: (ace, v) => ace.ace_invoked(v),
      });

      $sel._fire('not-a-number');
      restore();

      // No edit happened, but focus was restored — the user picked from a
      // toolbar control and we don't want keystrokes to land back on it.
      assert.strictEqual(ce.calls.length, 0);
      assert.strictEqual(ce.focusCount, 1);
      assert.strictEqual($sel.val(), 'not-a-number',
          'unusable picks must not reset the select — the user can see what they picked');
    });

    it('supports a function coercer', () => {
      const $sel = makeFakeSelect();
      const restore = installJqueryStub($sel);
      const ce = makeContext();

      toolbarSelect({
        selector: '#x',
        context: ce.ctx,
        invoke: (ace, v) => ace.ace_invoked(v),
        coerce: (raw) => raw === 'special' ? {marker: true} : null,
      });

      $sel._fire('special');
      restore();

      assert.strictEqual(ce.calls.length, 2);
      assert.deepStrictEqual(ce.calls[1], {type: 'invoked', val: {marker: true}});
    });

    it('honours a custom resetValue', () => {
      const $sel = makeFakeSelect();
      const restore = installJqueryStub($sel);
      const ce = makeContext();

      toolbarSelect({
        selector: '#x',
        context: ce.ctx,
        invoke: (ace, v) => ace.ace_invoked(v),
        resetValue: '__none__',
      });

      $sel._fire('7');
      restore();

      assert.strictEqual($sel.val(), '__none__');
    });

    it('invokes onAfterChange with the coerced value and swallows callback errors', () => {
      const $sel = makeFakeSelect();
      const restore = installJqueryStub($sel);
      const ce = makeContext();
      const seen = [];
      const consoleErr = console.error;
      console.error = () => {}; // silence the expected error log

      try {
        toolbarSelect({
          selector: '#x',
          context: ce.ctx,
          invoke: (ace, v) => ace.ace_invoked(v),
          onAfterChange: (v) => {
            seen.push(v);
            if (v === 99) throw new Error('boom');
          },
        });

        $sel._fire('5');
        $sel._fire('99');
      } finally {
        console.error = consoleErr;
        restore();
      }

      assert.deepStrictEqual(seen, [5, 99]);
      assert.strictEqual(ce.focusCount, 2, 'focus must run for both changes');
    });
  });
});
