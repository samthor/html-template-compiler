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

export const ifCheck = (raw: unknown, truthy: () => string, falsey?: () => string) => {
  try {
    // allows checking for 'empty' templates
    if (raw && typeof raw === 'object' && 'toString' in raw) {
      raw = raw.toString();
    }
  } catch {}

  return (raw ? truthy() : falsey?.()) || '';
};

export const loop = (raw: unknown, cb: (each: unknown) => string, empty?: () => string) => {
  const parts: string[] = [];

  if (raw && (raw as any)[Symbol.iterator]) {
    for (const x of raw as Iterable<any>) {
      parts.push(cb(x));
    }
  }

  if (!parts.length && empty) {
    return empty();
  }
  return parts.join('');
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

    return out.join(''); // no commas here
  }

  return escape(String(raw));
};
