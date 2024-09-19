const interestingRe = /\<[\/\w!]/g; // not sticky, goes over content
const tagNameRe = /([^\s>]*)/gy;
const attrRe = /\s*([^\s/>=]*)(=|)/gy;
const tagSuffixRe = /\s*\/?>/gy;

/**
 * Builds a template literal from the passed HTML source. May throw if the source is invalid.
 *
 * Uses the `unsafeName` key to check if passed values are safe to be included unescaped inside
 * HTML.
 */
export function buildTemplate(raw: string) {
  const c = new HTMLCompiler(raw);

  for (;;) {
    const more = c.consumeTopLevel();
    if (!more) {
      break;
    }
  }

  const propsRequired = new Set<string>();
  const propsOptional = new Set<string>();

  const recordProp = (name: string, required?: boolean) => {
    const [left] = name.split('.');
    if (left.startsWith('_')) {
      // ignore
    } else if (required) {
      propsRequired.add(left);
    } else {
      propsOptional.add(left);
    }
  };

  c.output = coalesceParts(c.output);

  const inner = c.output
    .map((part) => {
      if (typeof part === 'string') {
        return part.replaceAll('`', '\\`');
      }

      const c = (name: string) => {
        if (!/[0-9a-zA-Z_]/.test(name[0])) {
          throw new Error(`invalid context name: ${name}`);
        }

        if (name.startsWith('_')) {
          return name;
        }

        recordProp(name);
        const parts = name.split('.');
        return `(context as any)` + parts.map((part) => `[${JSON.stringify(part)}]`).join('?.');
      };

      switch (part.mode) {
        case 'comment':
          return `\${ifDefined(${c(part.render)})}`;

        case 'html':
          return `\${renderBody(${c(part.render)})}`;

        case 'attr-boolean':
          return `\${${c(part.render)} ? ' ${part.attr}' : ''}`;

        case 'attr':
          return (
            '"' +
            part.parts
              .map((subpart, index) => {
                if (!(index % 2)) {
                  return subpart;
                }
                recordProp(subpart, true); // extra because we MUST be required
                return `\${ifDefined(${c(subpart)})}`;
              })
              .join('') +
            '"'
          );

        case 'attr-render':
          return `\${ifDefined(${c(part.render)}, (v) => \` ${part.attr}="\${v}"\`)}`;

        case 'logic-conditional': {
          const invert = part.invert ? '!' : '';
          return `\${ifCheck(${invert}${c(part.render)}, () => \``;
        }

        case 'logic-loop':
          return `\${loop(${c(part.render)}, (_${part.use}) => \``;

        case 'logic-else':
          return `\`, () => \``;

        case 'logic-close':
          return '`)}';

        default:
          part satisfies never;
      }
    })
    .join('');

  const stringProps = (i: Iterable<string>) => {
    return [...i].map((s) => JSON.stringify(s)).join(' | ');
  };
  const typeParts: string[] = [];

  // make props required if optional
  for (const required of propsRequired) {
    propsOptional.delete(required);
  }

  if (propsRequired.size) {
    typeParts.push(`Record<${stringProps(propsRequired)}, unknown>`);
  }
  if (propsOptional.size) {
    typeParts.push(`Partial<Record<${stringProps(propsOptional)}, unknown>>`);
  }
  if (!typeParts.length) {
    typeParts.push(`Record<never, never>`);
  }
  const typeString = typeParts.join(' & ');

  return { template: '`' + inner + '`', typeString };
}

type Part =
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

type PartArray = (string | Part)[];

class HTMLCompiler {
  index: number = 0;
  output: PartArray = [];

  constructor(public src: string) {}

  /**
   * Consumes a doctype, comment, tag.
   */
  consumeTopLevel() {
    interestingRe.lastIndex = this.index;
    const next = interestingRe.exec(this.src);

    if (!next) {
      if (this.index < this.src.length) {
        this.createText(this.src.substring(this.index, this.src.length));
      }
      this.index = this.src.length;
      return false;
    }

    if (next.index > this.index) {
      this.createText(this.src.substring(this.index, next.index));
      this.index = next.index;
    }
    const s = next[0];

    if (s[1] === '!') {
      // comment
      this.mustConsumeComment();
      return true;
    }

    this.mustConsumeTag();
    return true;
  }

  private mustConsumeTag() {
    if (this.src[this.index] !== '<') {
      throw new Error(`can't consume tag, bad pos`);
    }

    const start = this.index; // include "<"
    const isClose = this.src[this.index + 1] === '/';
    if (isClose) {
      this.index += 2;
    } else {
      ++this.index;
    }

    tagNameRe.lastIndex = this.index;
    const tagName = tagNameRe.exec(this.src)![0];
    if (tagName.endsWith('/') && this.src[this.index + tagName.length] === '>') {
      // bail early, "<tag/>"
      this.createTag(tagName.substring(0, tagName.length - 1), { isClose, selfClosing: true });
      this.index += tagName.length + 1;
      return;
    }

    this.index += tagName.length;

    const attrs: Record<string, string | true> = {};

    for (;;) {
      attrRe.lastIndex = this.index;
      const attr = attrRe.exec(this.src);
      if (!attr || !attr[0].length) {
        break;
      }
      this.index += attr[0].length;

      if (!attr[2]) {
        // not equals anything, solo tag
        if (attr[1]) {
          attrs[attr[1]] = true;
        }
        continue;
      }
      if (attr[2] !== '=') {
        throw new Error(`should not get here`);
      }

      // match something after =
      const value = this.eatAttributeValue();
      attrs[attr[1]] = value;
    }

    tagSuffixRe.lastIndex = this.index;
    const suffix = tagSuffixRe.exec(this.src);
    if (!suffix) {
      throw new Error(`bad html, can't match tag suffix`);
    }
    const selfClosing = suffix[0].includes('/');
    this.createTag(tagName, { attrs, isClose, selfClosing });
    this.index += suffix[0].length;
  }

  /**
   * Consume comment at this location.
   */
  private mustConsumeComment() {
    if (this.src[this.index] !== '<' || this.src[this.index + 1] !== '!') {
      throw new Error(`can't consume comment, bad pos`);
    }

    let endIndex = this.src.indexOf('>', this.index);
    if (endIndex === -1) {
      endIndex = this.src.length;
    } else {
      ++endIndex;
    }
    this.createComment(this.src.substring(this.index, endIndex));
    this.index = endIndex;
  }

  private eatAttributeValue(): string {
    let re: RegExp;

    const start = this.src[this.index];

    if (start === '{' && this.src[this.index + 1] === '{') {
      re = /({{.*?}})/gy;
    } else if (start === '"') {
      re = /\"(.*?)\"]*/gy;
    } else {
      re = /([^\s/>]*)/gy;
    }
    re.lastIndex = this.index;
    const out = re.exec(this.src);
    if (!out) {
      throw new Error(`bad attribute`);
    }

    const v = out[1] ?? '';
    this.index += out[0].length;
    return v;
  }

  /**
   * Consume tag at this location.
   */

  private createComment(s: string) {
    this.output.push(...splitTextForParts(s, 'comment'));
  }

  private createText(s: string) {
    this.output.push(...splitTextForParts(s, 'html'));
  }

  private createTag(
    tagName: string,
    arg: { attrs?: Record<string, string | true>; isClose: boolean; selfClosing: boolean },
  ) {
    // console.info('TAG:', {
    //   tagName,
    //   attrs: arg.attrs,
    //   isClose: arg.isClose,
    //   selfClosing: arg.selfClosing,
    // });

    // rebuild output
    this.output.push(`<${arg.isClose ? '/' : ''}${tagName}`);

    if (arg.attrs && Object.keys(arg.attrs).length) {
      for (const [key, value] of Object.entries(arg.attrs)) {
        const out = this.internalRenderKeyValue(key, value);
        this.output.push(...out);
      }
    }

    this.output.push(arg.selfClosing ? ' />' : '>');
  }

  internalRenderKeyValue(key: string, value: string | true): PartArray {
    // optional prop shorthand
    if (key.startsWith('?')) {
      key = key.substring(1);

      if (value === true) {
        return []; // no value for optional attribute?
      }

      const s = oddSplitForParts(value);
      if (s.length !== 3) {
        return [key];
      }
      return [{ mode: 'attr-boolean', attr: key, render: s[1] }];
    }

    // ":content" shorthand
    if (key.startsWith(':')) {
      key = key.substring(1);
      if (!key) {
        throw new Error(`must bind :-value`);
      }
      return [{ mode: 'attr-render', attr: key, render: key }];
    }

    if (value === true) {
      return [' ', key];
    }

    const s = oddSplitForParts(value);
    if (!(s.length % 2)) {
      throw new Error(`internal: must be odd split: ${s}`);
    }
    if (s.length === 1) {
      // no renderable parts
      return [` ${key}="${s[0]}"`];
    }
    if (s.length === 3 && !s[0] && !s[2]) {
      // special maybe-renderable
      return [{ mode: 'attr-render', attr: key, render: s[1] }];
    }

    // we MUST have parts now
    return [` ${key}=`, { mode: 'attr', parts: s }];
  }
}

const partRe = /{{(.*?)}}/g;

function oddSplitForParts(raw: string): string[] {
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

function splitTextForParts(raw: string, mode: 'html' | 'comment'): PartArray {
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
      out.push({ mode, render });
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
        const [check, use = ''] = render.substring(1).trim().split(/\s+/);
        out.push({ mode: 'logic-loop', render: check, use });
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

function coalesceParts(parts: PartArray): PartArray {
  const out: PartArray = [];
  let strings: string[] = [];

  for (const p of parts) {
    if (typeof p === 'string') {
      if (p.length) {
        strings.push(p);
      }
      continue;
    }

    if (strings.length) {
      out.push(strings.join(''));
      strings = [];
    }
    out.push(p);
  }

  if (strings.length) {
    out.push(strings.join(''));
  }
  return out;
}
