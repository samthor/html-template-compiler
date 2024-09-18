export const unsafe = Symbol.for('html-template-compiler:unsafe');

export const ifDefined = (raw: unknown, render?: (raw: string) => string) => {
  if (raw == null) {
    return '';
  }
  if (render === undefined) {
    return encodeURI(String(raw));
  }
  return render(encodeURI(String(raw)));
};

export const renderBody = (raw: unknown) => {
  if (raw == null) {
    return '';
  }
  if ((raw as any)[unsafe]) {
    return String(raw);
  }

  if (typeof raw !== 'string' && (raw as any)[Symbol.iterator]) {
    const out: string[] = [];

    for (const each of raw as Iterable<unknown>) {
      out.push(renderBody(each));
    }

    return out.join(''); // no commas hedre
  }

  return encodeURI(String(raw));
};
