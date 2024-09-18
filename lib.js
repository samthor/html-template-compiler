// src/lib.ts
var unsafe = Symbol.for("html-template-compiler:unsafe");
var ifDefined = (raw, render) => {
  if (raw == null) {
    return "";
  }
  if (render === void 0) {
    return encodeURI(String(raw));
  }
  return render(encodeURI(String(raw)));
};
var ifDefinedMaybeSafe = (raw) => {
  if (raw == null) {
    return "";
  }
  if (raw[unsafe]) {
    return String(raw);
  }
  return encodeURI(String(raw));
};
export {
  ifDefined,
  ifDefinedMaybeSafe,
  unsafe
};
