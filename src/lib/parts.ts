export type Part =
  | {
      mode: 'html' | 'comment';
      render: string;
    }
  | {
      mode: 'attr';
      parts: string[]; // always odd: e.g., string,part,string,part,string
    }
  | {
      mode: 'attr-render';
      attr: string;
      render: string;
    }
  | {
      mode: 'attr-boolean';
      attr: string;
      render: string;
    }
  | {
      mode: 'logic-conditional';
      render: string;
      invert: boolean;
    }
  | {
      mode: 'logic-loop';
      render: string;
      use: string;
    }
  | {
      mode: 'logic-else';
    }
  | {
      mode: 'logic-close';
    };

export type PartArray = (string | Part)[];

const partRe = /{{(.*?)}}/g;

/**
 * Split a string containing "parts" into an odd number of strings. For example:
 *
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
    partRe.lastIndex = index;
    const part = partRe.exec(raw);
    if (!part) {
      out.push(raw.substring(index));
      return out;
    }

    out.push(raw.substring(index, part.index));
    out.push(part[1].trim());
    index = part.index + part[0].length;
  }
}

export function splitForParts(raw: string, mode: 'text' | 'comment'): PartArray {
  const out: PartArray = [];
  let index = 0;

  for (;;) {
    partRe.lastIndex = index;
    const part = partRe.exec(raw);
    if (!part) {
      if (index !== raw.length) {
        out.push(raw.substring(index));
      }
      return out;
    }

    if (part.index !== index) {
      out.push(raw.substring(index, part.index));
    }
    index = part.index + part[0].length;

    const render = part[1].trim();

    // TODO: if render starts with custom code...

    if (/[0-9a-zA-Z_]/.test(render[0])) {
      // this is "{{stuff}}" with relatively boring contents
      const actualMode = mode === 'text' ? 'html' : mode;
      out.push({ mode: actualMode, render });
      continue;
    }

    switch (render[0]) {
      case '~': {
        let v;
        let invert = false;
        if (render[1] === '!') {
          v = render.substring(2);
          invert = true;
        } else {
          v = render.substring(1);
        }

        out.push({ mode: 'logic-conditional', invert, render: v.trim() });
        continue;
      }

      case '>': {
        const [check, use] = render.substring(1).trim().split(/\s+/);
        out.push({ mode: 'logic-loop', render: check, use: use || '_' });
        continue;
      }

      case '|':
        out.push({ mode: 'logic-else' });
        continue;

      case '<':
        out.push({ mode: 'logic-close' });
        continue;

      default:
        throw new Error(`unknown code: ${render}`);
    }
  }
}

/**
 * Find all string-only parts and coalesce them into single strings. Ignores/leaves control parts
 * alone.
 *
 * Useful for a parser which might aggressively generate lots of strings.
 */
export function coalesceParts(parts: PartArray): PartArray {
  const out: PartArray = [];
  let strings: string[] = [];
  const emit = () => {
    const p = strings.join('');
    if (p) {
      out.push(p);
    }
    strings = [];
  };

  for (const p of parts) {
    if (typeof p === 'string') {
      strings.push(p);
    } else {
      emit();
      out.push(p);
    }
  }

  emit();
  return out;
}
