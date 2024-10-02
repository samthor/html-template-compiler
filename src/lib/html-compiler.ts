import { coalesceParts, oddSplitForParts, splitForParts, type PartArray } from './parts.ts';

const interestingRe = /\<[\/\w!]/g; // not sticky, goes over content
const tagNameRe = /([^\s>]*)/gy;
const attrRe = /\s*([^\s/>=]*)(=|)/gy;
const tagSuffixRe = /\s*\/?>/gy;

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

  /**
   * Consume content that appears after an attribute "=".
   */
  private eatAttributeValue(): string {
    let re: RegExp;

    const start = this.src[this.index];

    if (start === '{' && this.src[this.index + 1] === '{') {
      // this allows `foo={{bar}}` _without_ quotes
      re = /({{.*?}})/gy;
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

  private createComment(s: string) {
    this.output.push(...splitForParts(s, 'comment'));
  }

  private createText(s: string) {
    this.output.push(...splitForParts(s, 'text'));
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

    // TODO: look for special tags (e.g., "hc:if", "hc:for" ...)

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
