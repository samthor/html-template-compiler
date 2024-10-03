import { consumeBraceValue } from './brace.ts';
import { isVar } from './escape.ts';

export type Part =
  | {
      /**
       * Raw, unmediated output.
       */
      mode: 'raw';
      raw: string;
    }
  | {
      /**
       * Renders some inner value within HTML or a comment.
       */
      mode: 'html' | 'comment';
      inner: string;
    }
  | {
      mode: 'attr';
      parts: string[]; // always odd: e.g., string,part,string,part,string
    }
  | {
      /**
       * Renders an attribute and its value presuming it is not `null` or `undefined`.
       */
      mode: 'attr-render';
      attr: string;
      inner: string;
    }
  | {
      /**
       * Renders a boolean attribute if the inner value is truthy.
       */
      mode: 'attr-boolean';
      attr: string;
      inner: string;
    }
  | {
      /**
       * If conditional. Checks inner is truthy, with optional inversion.
       */
      mode: 'logic-conditional';
      invert: boolean;
      inner: string;
      check?: 'iter'; // if iter, checks if the iterable has any content
    }
  | {
      /**
       * Loop over ther inner value, creating a variable defined in "use".
       */
      mode: 'logic-loop';
      use: string;
      inner: string;
    }
  | {
      /**
       * Else for a conditional or loop (runs if no values rendered).
       */
      mode: 'logic-else';
    }
  | {
      /**
       * Closes a conditional or loop, or its respective else branch.
       */
      mode: 'logic-close';
    };

const startPartRe = /\{\{/g;

/**
 * Split a string containing "parts" into an odd number of strings. For example:
 *
 * - "" => [""]
 * - "Nothing" => ["Nothing"]
 * - "{{foo}}" => ["", "foo", ""]
 * - "Hello {{attr}}" => ["Hello ", "attr", ""]
 * - "What {{is}} up {{name}}" => ["What ", "is", " up ", "name", ""]
 *
 * The caller can be responsible for dropping blank strings parts.
 */
export function oddSplitForParts(raw: string): string[] {
  const out: string[] = [];
  let index = 0;

  for (;;) {
    startPartRe.lastIndex = index;
    const startPart = startPartRe.exec(raw);
    if (!startPart) {
      out.push(raw.substring(index));
      return out;
    }

    const b = consumeBraceValue(raw, startPart.index);
    out.push(raw.substring(index, b.start));
    out.push(b.inner);
    index = b.end;
  }
}

export function splitForParts(
  raw: string,
  mode: 'html' | 'comment',
  mapper: (inner: string) => Part | Part[] | void,
): Part[] {
  const out: Part[] = [];
  let index = 0;

  for (;;) {
    startPartRe.lastIndex = index;
    const startPart = startPartRe.exec(raw);
    if (!startPart) {
      if (index !== raw.length) {
        out.push({ mode: 'raw', raw: raw.substring(index) });
      }
      return out;
    }

    if (startPart.index !== index) {
      out.push({ mode: 'raw', raw: raw.substring(index, startPart.index) });
    }

    const b = consumeBraceValue(raw, startPart.index);
    const inner = b.inner;
    index = b.end;

    // this is "{{stuff}}" with relatively boring contents
    if (isVar(inner)) {
      out.push({ mode, inner: inner });
      continue;
    }

    const p = mapper(inner);
    if (!p) {
      throw new Error(`couldn't map: ${JSON.stringify(inner)}`);
    }
    out.push(...[p].flat());
  }
}

/**
 * Find all string-only parts and coalesce them into single strings. Ignores/leaves control parts
 * alone.
 *
 * Useful for a parser which might aggressively generate lots of strings.
 */
export function coalesceParts(parts: Part[]): Part[] {
  const out: Part[] = [];
  let strings: string[] = [];
  const emit = () => {
    const p = strings.join('');
    if (p) {
      out.push({ mode: 'raw', raw: p });
    }
    strings = [];
  };

  for (const p of parts) {
    if (p.mode === 'raw') {
      strings.push(p.raw);
    } else {
      emit();
      out.push(p);
    }
  }

  emit();
  return out;
}

/**
 * Render a key/value pair that appears inside a tag. This must return leading whitespace if raw.
 */
export function renderAttrKeyValue(key: string, value: string | true): Part[] {
  // optional prop shorthand
  if (key.startsWith('?')) {
    key = key.substring(1);

    if (value === true || !value) {
      return []; // passed `?foo` without value? - never true
    }

    const s = oddSplitForParts(value);
    if (s.length !== 3 || s[0] || s[2]) {
      // if we're not `?foo="{{bar}}"` literally then this is always true!
      return [{ mode: 'raw', raw: key }];
    }
    return [{ mode: 'attr-boolean', attr: key, inner: s[1] }];
  }

  // ":content" shorthand
  if (key.startsWith(':')) {
    key = key.substring(1);
    if (!key) {
      throw new Error(`must bind :-value`);
    }
    return [{ mode: 'attr-render', attr: key, inner: key }];
  }

  // just `<bar foo />`
  if (value === true) {
    return [{ mode: 'raw', raw: ` ${key}` }];
  }

  const s = oddSplitForParts(value);
  if (!(s.length % 2)) {
    throw new Error(`internal: must be odd split: ${s}`);
  }
  if (s.length === 1) {
    // no renderable parts
    return [{ mode: 'raw', raw: ` ${key}="${s[0]}"` }];
  }
  if (s.length === 3 && !s[0] && !s[2]) {
    // special maybe-renderable
    return [{ mode: 'attr-render', attr: key, inner: s[1] }];
  }

  // we MUST have parts now
  return [
    { mode: 'raw', raw: ` ${key}=` },
    { mode: 'attr', parts: s },
  ];
}
