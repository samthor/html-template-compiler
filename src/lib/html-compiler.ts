import { consumeBraceValue } from './brace.ts';
import {
  coalesceParts,
  oddSplitForParts,
  splitForParts,
  type Part,
  type PartArray,
} from './parts.ts';

const interestingRe = /\<[\/\w!]/g; // not sticky, goes over content
const tagNameRe = /([^\s>]*)/gy;
const attrRe = /\s*([^\s/>=]*)(=|)/gy;
const tagSuffixRe = /\s*\/?>/gy;

export type TagDef = {
  name: string;
  attrs: Record<string, string | true>;
  isClose: boolean;
  selfClosing: boolean;
};

export class HTMLCompiler {
  private index: number = 0;
  private output: PartArray = [];

  constructor(public src: string) {}

  allParts(): PartArray {
    return coalesceParts(this.output);
  }

  /**
   * Consumes a top-level item: text, a comment (including doctype), a tag.
   */
  consumeTopLevel(): 'tag' | 'comment' | 'text' | '' {
    if (this.index === this.src.length) {
      return ''; // done
    }

    interestingRe.lastIndex = this.index;
    const next = interestingRe.exec(this.src);

    // there's nothing more interesting: consume text until the dend
    if (!next) {
      this.createText(this.src.substring(this.index, this.src.length));
      this.index = this.src.length;
      return 'text';
    }

    // the next index is >= here, consume text until then
    if (next.index > this.index) {
      this.createText(this.src.substring(this.index, next.index));
      this.index = next.index;
      return 'text';
    }

    // is this a comment or a tag?
    const s = next[0];
    if (s[1] === '!') {
      // consume comment
      this.mustConsumeComment();
      return 'comment';
    }

    // consume tag
    this.mustConsumeTag();
    return 'tag';
  }

  /**
   * Consume a tag at this location. Traverses all attributes.
   */
  private mustConsumeTag() {
    if (this.src[this.index] !== '<') {
      throw new Error(`can't consume tag, bad pos`);
    }

    const isClose = this.src[this.index + 1] === '/';
    this.index += isClose ? 2 : 1; // step over start

    tagNameRe.lastIndex = this.index;
    const tagName = tagNameRe.exec(this.src)![0];
    if (tagName.endsWith('/') && this.src[this.index + tagName.length] === '>') {
      // bail early, "<tag/>"
      const name = tagName.substring(0, tagName.length - 1);
      this.createTag({ name, attrs: {}, isClose, selfClosing: true });
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
    this.createTag({ name: tagName, attrs, isClose, selfClosing });
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

  /**
   * Consume content that appears after an attribute "=".
   */
  private eatAttributeValue(): string {
    let re: RegExp;
    const start = this.src[this.index];

    if (start === '{' && this.src[this.index + 1] === '{') {
      // this allows `foo={{bar}}` _without_ quotes
      const b = this.consumeBraceValue();
      this.index = b.end;
      return `{{${b.inner}}}`; // we're just sanitizing this
    } else if (start === '"') {
      // match everything within quotes (non-aggressively)
      // TODO: this will barf on `foo="{{bar + "zing"}}"`
      re = /\"(.*?)\"]*/gy;
    } else {
      // match `whatever=zing` which is wrong but we'll later emit in quotes
      re = /([^\s/>]*)/gy;
    }
    re.lastIndex = this.index;
    const out = re.exec(this.src);
    if (!out) {
      return '';
    }

    const v = out?.[1] ?? '';
    this.index += out[0].length;
    return v;
  }

  /**
   * Map unknown "inner" brace-bounded parts.
   */
  innerMapper(inner: string): Part | Part[] | void {
    switch (inner[0]) {
      case '~': {
        let v;
        let invert = false;
        if (inner[1] === '!') {
          v = inner.substring(2);
          invert = true;
        } else {
          v = inner.substring(1);
        }

        return { mode: 'logic-conditional', invert, inner: v.trim() };
      }

      case '>': {
        const [check, use] = inner.substring(1).trim().split(/\s+/);
        return { mode: 'logic-loop', inner: check, use: use || '_' };
      }

      case '|':
        return { mode: 'logic-else' };

      case '<':
        return { mode: 'logic-close' };
    }
  }

  private createComment(s: string) {
    this.output.push(...splitForParts(s, 'comment', this.innerMapper));
  }

  private createText(s: string) {
    this.output.push(...splitForParts(s, 'html', this.innerMapper));
  }

  /**
   * Returns a custom part for this tag. Intended for overrides.
   */
  partForTag(tag: TagDef): Part | Part[] | void {}

  private createTag(tag: TagDef) {
    // console.info('TAG:', {
    //   tagName,
    //   attrs: arg.attrs,
    //   isClose: arg.isClose,
    //   selfClosing: arg.selfClosing,
    // });

    // TODO: look for special tags (e.g., "hc:if", "hc:for" ...)

    const p = this.partForTag(tag);
    if (p) {
      this.output.push(...[p].flat());
      return;
    }

    // rebuild output
    this.output.push({ mode: 'raw', raw: `<${tag.isClose ? '/' : ''}${tag.name}` });

    for (const key in tag.attrs) {
      const out = this.internalRenderKeyValue(key, tag.attrs[key]);
      if (out.length) {
        this.output.push({ mode: 'raw', raw: ' ' }, ...out);
      }
    }

    this.output.push({ mode: 'raw', raw: tag.selfClosing ? ' />' : '>' });
  }

  /**
   * Consumes a braced value at the given cursor.
   */
  private consumeBraceValue() {
    return consumeBraceValue(this.src, this.index);
  }

  internalRenderKeyValue(key: string, value: string | true): PartArray {
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
      return [{ mode: 'raw', raw: key }];
    }

    const s = oddSplitForParts(value);
    if (!(s.length % 2)) {
      throw new Error(`internal: must be odd split: ${s}`);
    }
    if (s.length === 1) {
      // no renderable parts
      return [{ mode: 'raw', raw: `${key}="${s[0]}"` }];
    }
    if (s.length === 3 && !s[0] && !s[2]) {
      // special maybe-renderable
      return [{ mode: 'attr-render', attr: key, inner: s[1] }];
    }

    // we MUST have parts now
    return [
      { mode: 'raw', raw: `${key}=` },
      { mode: 'attr', parts: s },
    ];
  }
}
