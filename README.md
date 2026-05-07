# Plugin Helpers for Etherpad Authors

Shared factory functions that eliminate boilerplate across Etherpad plugins.

Instead of writing the same 20-line hook function in every plugin, call a one-liner that generates it for you.

## Install

```
pnpm run plugins i ep_plugin_helpers
```

Plugins that use these helpers should add it as a dependency in their `package.json`:

```json
"dependencies": {
  "ep_plugin_helpers": "^0.2.0"
}
```

## API

### Attributes

Generate the full attribute rendering pipeline — from editor display to HTML export — with a single config object.

#### `lineAttribute(config)` — line-level attributes (headings, alignment)

```js
// Client-side (static/js/index.js)
const {lineAttribute} = require('ep_plugin_helpers/attributes');

const headings = lineAttribute({
  attr: 'heading',
  tags: ['h1', 'h2', 'h3', 'h4', 'code'],
  normalize: (value) => (value === 'h5' || value === 'h6') ? 'h4' : value,
});

exports.aceAttribsToClasses = headings.aceAttribsToClasses;
exports.aceDomLineProcessLineAttributes = headings.aceDomLineProcessLineAttributes;
exports.aceRegisterBlockElements = headings.aceRegisterBlockElements;
exports.aceRegisterLineAttributes = headings.aceRegisterLineAttributes;
```

```js
// Shared (static/js/shared.js)
const {lineAttribute} = require('ep_plugin_helpers/attributes');
const headings = lineAttribute({attr: 'heading', tags: ['h1', 'h2', 'h3']});

exports.collectContentPre = headings.collectContentPre;
exports.collectContentPost = headings.collectContentPost;
```

**Config:**
- `attr` — the attribute name (e.g. `'heading'`, `'align'`)
- `tags` — array of valid tag/value names
- `normalize(value)` — optional function to map values (e.g. h5 → h4)

**Returns:** `aceAttribsToClasses`, `aceDomLineProcessLineAttributes`, `aceRegisterBlockElements`, `aceRegisterLineAttributes`, `collectContentPre`, `collectContentPost`

#### `inlineAttribute(config)` — character-range attributes (font color, font size)

```js
const {inlineAttribute} = require('ep_plugin_helpers/attributes');

const fontColor = inlineAttribute({
  attr: 'color',
  values: ['black', 'red', 'green', 'blue'],
});

exports.aceAttribsToClasses = fontColor.aceAttribsToClasses;
exports.aceCreateDomLine = fontColor.aceCreateDomLine;
```

**Config:**
- `attr` — the attribute name (e.g. `'color'`, `'font-size'`)
- `values` — optional array of allowed values (omit to accept any)

**Returns:** `aceAttribsToClasses`, `aceCreateDomLine`, `collectContentPre`, `collectContentPost`

#### `tagAttribute(config)` — tag-based attributes (subscript, superscript, font families)

```js
const {tagAttribute} = require('ep_plugin_helpers/attributes');

const subSup = tagAttribute({tags: ['sub', 'sup']});

exports.aceAttribClasses = subSup.aceAttribClasses;
exports.aceAttribsToClasses = subSup.aceAttribsToClasses;
exports.aceRegisterBlockElements = subSup.aceRegisterBlockElements;
```

**Config:**
- `tags` — array of tag names that map to HTML elements

**Returns:** `aceAttribClasses`, `aceAttribsToClasses`, `aceRegisterBlockElements`, `collectContentPre`, `collectContentPost`

### Server-only Export Hooks

These require `ep_etherpad-lite` modules and must NOT be imported from client-side code.

```js
// Server-side (index.js)
const {lineAttributeExport} = require('ep_plugin_helpers/attributes-server');

const headingsExport = lineAttributeExport({
  attr: 'heading',
  normalize: (v) => (v === 'h5' || v === 'h6') ? 'h4' : v,
  exportStyles: 'h1{font-size:2.5em}\nh2{font-size:1.8em}\n',
});

exports.stylesForExport = headingsExport.stylesForExport;
exports.getLineHTMLForExport = headingsExport.getLineHTMLForExport;
```

Available exports:
- `lineAttributeExport(config)` — returns `stylesForExport`, `getLineHTMLForExport`
- `inlineAttributeExport(config)` — returns `exportHtmlAdditionalTagsWithData`, `stylesForExport`, `getLineHTMLForExport`
- `tagAttributeExport(config)` — returns `exportHtmlAdditionalTags`, `getLineHTMLForExport`

### Templates

Inject HTML templates into page sections with one line.

```js
const {template, rawHTML} = require('ep_plugin_helpers');

// Inject an EJS template
exports.eejsBlock_editbarMenuLeft = template('ep_myplugin/templates/buttons.ejs');

// With template variables
exports.eejsBlock_mySettings = template('ep_myplugin/templates/settings.ejs', {
  vars: () => ({checked: 'checked'}),
});

// Skip when button already in toolbar
exports.eejsBlock_editbarMenuLeft = template('ep_myplugin/templates/buttons.ejs', {
  skip: () => JSON.stringify(settings.toolbar).indexOf('myButton') > -1,
});

// Inject raw HTML string
exports.eejsBlock_styles = rawHTML('<link href="..." rel="stylesheet">');
```

### Settings

Load plugin settings from `settings.json` and relay to the client.

```js
const {settings} = require('ep_plugin_helpers');

const relay = settings('ep_myplugin', {defaultOption: true});

exports.loadSettings = relay.loadSettings;
exports.clientVars = relay.clientVars;

// Access settings anywhere in your plugin:
relay.get()           // full settings object
relay.get('option')   // specific key
```

### Toggle

Checkbox in the User Settings panel with cookie persistence (per-user, per-pad).

```js
const {toggle} = require('ep_plugin_helpers');

const myToggle = toggle({
  pluginName: 'ep_myplugin',
  settingId: 'my-feature',
  defaultEnabled: true,
});

// Server-side
exports.eejsBlock_mySettings = myToggle.eejsBlock_mySettings;

// Client-side (in postAceInit)
const state = myToggle.init(); // reads cookie, binds checkbox
// state.enabled tracks current value
```

### PadToggle

Parallel checkboxes in **both** the User Settings panel and the Pad Wide Settings panel — matching how native settings (sticky chat, line numbers, etc.) work. The pad-wide value rides Etherpad's existing `padoptions` broadcast/persist rail, so changes propagate to every connected client and are remembered across reloads. The pad creator can `enforceSettings` to lock the user-side checkbox for everyone.

Requires Etherpad with the `ep_*` padOptions passthrough patch (>= 2.7.4). On older cores the pad-wide column is hidden automatically and the user-side cookie toggle keeps working — plugins built on this helper run everywhere.

```js
const {padToggle} = require('ep_plugin_helpers');

const t = padToggle({
  pluginName: 'ep_myplugin',          // must match /^ep_[a-z0-9_]+$/
  settingId: 'my-feature',            // → ids: options-my-feature, padsettings-options-my-feature
  l10nId: 'ep_myplugin.myFeature',    // i18n key, html10n overwrites the fallback
  defaultLabel: 'My feature',         // a11y fallback — rendered inside <label> so screen readers
                                      // announce something before html10n loads
  defaultEnabled: false,              // overridable via settings.json[pluginName].defaultEnabled
});

// Server-side hooks
exports.loadSettings           = t.loadSettings;
exports.clientVars             = t.clientVars;
exports.eejsBlock_mySettings   = t.eejsBlock_mySettings;
exports.eejsBlock_padSettings  = t.eejsBlock_padSettings;

// Client-side hooks
exports.postAceInit = (hook, ctx) => {
  const state = t.init({
    onChange: (enabled) => {
      // fires on initial load AND whenever the effective value changes
      enabled ? myFeature.enable() : myFeature.disable();
    },
  });
  // state.getEnabled() returns the current effective value
};
exports.handleClientMessage_CLIENT_MESSAGE = t.handleClientMessage_CLIENT_MESSAGE;
```

The plugin's `ep.json` must list each hook on the right side:

```json
{
  "hooks": {
    "loadSettings": "ep_myplugin",
    "clientVars": "ep_myplugin",
    "eejsBlock_mySettings": "ep_myplugin",
    "eejsBlock_padSettings": "ep_myplugin"
  },
  "client_hooks": {
    "postAceInit": "ep_myplugin/static/js/index",
    "handleClientMessage_CLIENT_MESSAGE": "ep_myplugin/static/js/index"
  }
}
```

**Effective value rules** (returned by `init`'s `onChange` and `getEnabled`):
- `enforceSettings` on → use the pad-wide value
- `enforceSettings` off → use the user cookie value, falling back to pad-wide, falling back to `defaultEnabled`

### Message Relay

Intercept and relay real-time COLLABROOM messages.

```js
const {messageRelay} = require('ep_plugin_helpers');

const relay = messageRelay({
  incomingType: 'cursor',
  action: 'cursorPosition',
  buildPayload: async (message) => ({
    authorId: message.myAuthorId,
    padId: message.padId,
  }),
});

exports.handleMessage = relay.handleMessage;
```

### Hide Elements

Hide or remove UI elements — for `ep_disable_*` style plugins.

```js
const {hideCSS, removeElement} = require('ep_plugin_helpers');

// Server-side: inject CSS to hide
exports.eejsBlock_styles = hideCSS('#chatbox, #chaticon');

// Client-side: remove from DOM
exports.postAceInit = removeElement('li[data-key="clearauthorship"]', {
  removePrecedingSeparator: true,
});
```

### Logger

```js
const {logger} = require('ep_plugin_helpers');

const log = logger('ep_myplugin');
log.info('loaded');
log.warn('something');
```

## Client vs Server imports

Etherpad bundles client-side JS with esbuild. To avoid pulling Node.js modules into the browser bundle:

- **Client-side code** → `require('ep_plugin_helpers/attributes')`
- **Server-side code** → `require('ep_plugin_helpers')` or `require('ep_plugin_helpers/attributes-server')`

## Backwards Compatibility

Old function names still work as aliases:

| New | Old |
|-----|-----|
| `lineAttribute` | `createLineAttribute` |
| `inlineAttribute` | `createInlineAttribute` |
| `tagAttribute` | `createTagAttribute` |
| `template` | `eejsBlock` |
| `rawHTML` | `eejsBlock.raw` |
| `settings` | `createSettingsRelay` |
| `toggle` | `createSettingsToggle` |
| `padToggle` | `createPadToggle` |
| `messageRelay` | `createMessageRelay` |
| `logger` | `createLogger` |

## License

Apache-2.0
