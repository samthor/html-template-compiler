export async function getLibNames() {
  const lib = await import('./lib.ts');
  return Object.keys(lib);
}
