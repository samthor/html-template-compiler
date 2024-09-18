import { parse } from './src/index.ts';
import * as fs from 'node:fs';
import * as path from 'node:path';

console.info(`// Generated on ${new Date()}

const unsafe = Symbol.for('html-template-compiler:unsafe');`);

const contents = fs.readdirSync('templates');
for (const c of contents) {
  if (!c.endsWith('.html')) {
    continue;
  }

  const raw = fs.readFileSync(path.join('templates', c), 'utf-8');
  const { template, props } = parse(raw);

  const propStr = props.map((prop) => JSON.stringify(prop)).join(' | ');

  const { name } = path.parse(c);
  console.info(
    `\nexport const template${toCamelCase(
      name,
    )} = (context: Record<${propStr}, unknown>): { toString(): string } => {
  const out = ${template};
  return {
    toString() { return out; },
    // @ts-ignore
    [unsafe]: true,
  };
};`,
  );
}

function toCamelCase(raw: string) {
  const parts = raw.split(/\W+/).filter((x) => x);
  if (!parts.length) {
    throw new Error(`can't camel-case from: ${raw}`);
  }

  return parts.map((p) => p[0].toUpperCase() + p.substring(1)).join('');
}
