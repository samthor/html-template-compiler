/**
 * Emits TS code that renders all templates in the given folder (or current dir).
 */

import { buildTemplate } from './build.ts';
import * as fs from 'node:fs';
import * as path from 'node:path';

const templatePath = process.argv[2] ?? '.';

console.info(`// Generated on ${new Date()}

const unsafe = Symbol.for('html-template-compiler:unsafe');`);

const seenNames = new Set<string>();

const contents = fs.readdirSync(templatePath);
for (const c of contents) {
  if (!c.endsWith('.html')) {
    continue;
  }

  const raw = fs.readFileSync(path.join(templatePath, c), 'utf-8');
  const { template, typeString } = buildTemplate(raw, 'unsafe');

  const { name } = path.parse(c);
  const cc = toCamelCase(name);
  if (seenNames.has(cc)) {
    throw new Error(`duplicate name: ${name} => ${cc}`);
  }
  seenNames.add(cc);

  console.info(
    `\nexport const template${cc} = (context: ${typeString}): { toString(): string } => {
  const out = ${template};
  return {
    toString() { return out; },
    // @ts-ignore
    [unsafe]: true,
  };
};`,
  );
}

if (seenNames.size === 0) {
  throw new Error(`found no templates?`);
}

function toCamelCase(raw: string) {
  const parts = raw.split(/\W+/).filter((x) => x);
  if (!parts.length) {
    throw new Error(`can't camel-case from: ${raw}`);
  }

  return parts.map((p) => p[0].toUpperCase() + p.substring(1)).join('');
}
