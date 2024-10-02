export function consumeBraceValue(src: string, at: number = 0) {
  if (src.substring(at, at + 2) !== '{{') {
    throw new Error(`can't consume brace, bad pos`);
  }

  // lazy, scan for next }} - what if we have several inners?
  const endBraceRe = /(.*?)\}\}/g;
  endBraceRe.lastIndex = at + 2;
  const m = endBraceRe.exec(src);
  if (!m) {
    throw new Error(`can't end brace: ${src.substring(at)}`);
  }

  const inner = m[1];
  const end = at + 2 + m[0].length;

  return { inner, start: at, end: end };
}
