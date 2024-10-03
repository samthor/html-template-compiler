A simple HTML template compiler that generates compiled templates which are environment-agnostic.
(The compiler itself runs in Node.)

## Usage

```bash
$ npx html-template-compiler templates/
```

This emits TypeScript code, for the files "templates/\*.html", to stdout.
(You can use glob-syntax in your shell, too.)
The generated code can be called to render templates, and includes relatively comprehensive types.

By default this imports this package's runtime code to render templates.
You can pass flag `-i` to inline the code instead.
Either way, use a tree-shaking compiler.

The 'rendered' object is something with a `toString()` helper.

```ts
import { renderIndex } from './generated-template.ts';
const out = renderIndex({ prop: 'hello', there: 'jim' });
const s = out.toString();
```

## Syntax

This supports simple rendering of passed properties:

```html
<div id="{{idName}}" ?disabled="{{foo}}">{{content}}</div>
{{object.property.hello}}
```

You can use custom tags to handle conditionals:

```html
<hc:if i="foo">
  <div class="foo-is-truthy">{{foo}}</div>
  <hc-else />
  <div class="else">Or else?</div>
</hc-if>
```

You can pass e.g., `!foo` to invert the conditional.

Or loops:

```html
<hc:loop i="foo" v="eachFoo">
  <div class="each-foo-bar">{{eachFoo.bar}}</div>
</hc:loop>
<hc:empty i="foo">
  <div class="empty">No items available</div>
</hc:empty>
```

You can also use `<hc:else />` within a loop to denote the empty block.

## Unsafe

To include unsafe HTML inside other templates, first mark something as unsafe:

```ts
import { unsafe } from 'html-template-compiler';
const out = renderIndex({ body: unsafe('<div>hello</div>') });
```

The rendered objects generated by the compiled code are already denoted unsafe.

## TODOs

- This does not currently support `Promise` arguments, but it could be modified to do so
- It doesn't care or know anything about events or live DOM: this is purely for backend or static generation
