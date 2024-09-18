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

export const ifDefinedMaybeSafe = (raw: unknown) => {
  if (raw == null) {
    return '';
  }
  if ((raw as any)[unsafe]) {
    return String(raw);
  }
  return encodeURI(String(raw));
};
