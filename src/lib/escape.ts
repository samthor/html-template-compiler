export function escapeKey(s: string, propUse?: boolean) {
  if (/\W/g.test(s)) {
    const j = JSON.stringify(s);
    return propUse ? `[${j}]` : j;
  }
  return s;
}

export function validateVar(name: string) {
  if (!/^[a-zA-Z$_]/g.test(name)) {
    throw new Error(`var starts with invalid character`);
  }

  if (/[^\w\.$_]/g.test(name)) {
    throw new Error(`var has invalid character`);
  }

  return name;
}
