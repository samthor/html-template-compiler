// src/lib.ts
var unsafeSymbol = Symbol.for("html-template-compiler:unsafe");
var escapeMap = {
  "<": "&lt;",
  ">": "&gt;",
  "&": "&amp;",
  '"': "&quot;",
  "'": "&#39;"
};
var unsafe = (raw) => {
  return {
    toString() {
      return String(raw);
    },
    // @ts-ignore
    [unsafeSymbol]: true
  };
};
var escape = (raw) => raw.replaceAll(/[<>&"']/g, (x) => escapeMap[x]);
var ifDefined = (raw, render) => {
  if (raw == null) {
    return "";
  }
  const out = escape(String(raw));
  return render === void 0 ? out : render(out);
};
var renderBody = (raw) => {
  if (raw == null) {
    return "";
  }
  if (raw[unsafeSymbol]) {
    return String(raw);
  }
  if (typeof raw !== "string" && raw[Symbol.iterator]) {
    const out = [];
    for (const each of raw) {
      out.push(renderBody(each));
    }
    return out.join("");
  }
  return escape(String(raw));
};
export {
  escape,
  ifDefined,
  renderBody,
  unsafe
};
