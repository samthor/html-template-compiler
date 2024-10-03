import { consumeBraceValue } from './brace.ts';
import { coalesceParts, renderAttrKeyValue, splitForParts, type Part } from './parts.ts';

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
  private output: Part[] = [];

  constructor(public src: string) {}

  allParts(): readonly Part[] {
    return this.output;
  }

  /**
   * Push new part(s) into the output. Automatically coalesces any raw text as part of the push.
   */
  protected pushParts(parts: Part[] | Part) {
    if (!Array.isArray(parts)) {
      parts = [parts];
    }

    if (parts.at(0)?.mode === 'raw' && this.output.at(-1)?.mode === 'raw') {
      parts.unshift(this.output.pop()!);
    }
    this.output.push(...coalesceParts(parts));
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
   * Map unknown "inner" brace-bounded parts. Intended for overrides.
   */
  innerMapper(inner: string): Part | Part[] | void {}

  private createComment(s: string) {
    this.pushParts(splitForParts(s, 'comment', this.innerMapper.bind(this)));
  }

  private createText(s: string) {
    this.pushParts(splitForParts(s, 'html', this.innerMapper.bind(this)));
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
      this.pushParts(p);
      return;
    }

    // rebuild output
    this.pushParts({ mode: 'raw', raw: `<${tag.isClose ? '/' : ''}${tag.name}` });

    for (const key in tag.attrs) {
      const out = renderAttrKeyValue(key, tag.attrs[key]);
      this.pushParts(out);
    }

    this.pushParts({ mode: 'raw', raw: tag.selfClosing ? ' />' : '>' });
  }

  /**
   * Consumes a braced value at the given cursor.
   */
  private consumeBraceValue() {
    return consumeBraceValue(this.src, this.index);
  }
}
