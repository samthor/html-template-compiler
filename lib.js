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
var renderBody = (raw) => {
  if (raw == null) {
    return "";
  }
  if (raw[unsafe]) {
    return String(raw);
  }
  if (typeof raw !== "string" && raw[Symbol.iterator]) {
    const out = [];
    for (const each of raw) {
      out.push(renderBody(each));
    }
    return out.join("");
  }
  return encodeURI(String(raw));
};
export {
  ifDefined,
  renderBody,
  unsafe
};
