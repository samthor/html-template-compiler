A simple HTML template compiler that generates compiled templates which are environment-agnostic.
(The compiler itself runs in Node.)

## Usage

```bash
$ npx html-template-compiler templates/
```

This emits TypeScript code to stdout that can be called to render templates.

## Syntax

This supports simple rendering of passed properties:

```html
<div id="{{idName}}" ?disabled="{{foo}}">{{content}}</div>
{{object.property.hello}}
```

You can also do conditionals (with `~`):

```html
{{~foo}}
<div class="foo-is-truthy">{{foo}}</div>
{{|}}
<div class="else">Or else?</div>
{{<}}
```

Or loops:

```html
{{>foo}}
<div class="each-foo-in-underscore">{{_}}</div>
{{|}}
<div class="empty">No items available</div>
{{<}}
```
