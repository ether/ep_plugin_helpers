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

Checkbox in the settings panel with cookie persistence.

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
| `messageRelay` | `createMessageRelay` |
| `logger` | `createLogger` |

## License

Apache-2.0
