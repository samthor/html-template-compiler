const unsafeSymbol = Symbol.for('html-template-compiler:unsafe');

const escapeMap: Record<string, string> = {
  '<': '&lt;',
  '>': '&gt;',
  '&': '&amp;',
  '"': '&quot;',
  "'": '&#39;',
};

export const unsafe = (raw: unknown): { toString(): string } => {
  return {
    toString() {
      return String(raw);
    },
    // @ts-ignore
    [unsafeSymbol]: true,
  };
};

export const escape = (raw: string) => raw.replaceAll(/[<>&"']/g, (x) => escapeMap[x]);

export const ifDefined = (raw: unknown, render?: (raw: string) => string) => {
  if (raw == null) {
    return '';
  }
  const out = escape(String(raw));
  return render === undefined ? out : render(out);
};

export const renderBody = (raw: unknown) => {
  if (raw == null) {
    return '';
  }
  if ((raw as any)[unsafeSymbol]) {
    return String(raw);
  }

  if (typeof raw !== 'string' && (raw as any)[Symbol.iterator]) {
    const out: string[] = [];

    for (const each of raw as Iterable<unknown>) {
      out.push(renderBody(each));
    }

    return out.join(''); // no commas hedre
  }

  return escape(String(raw));
};
