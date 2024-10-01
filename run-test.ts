import { buildTemplate } from './src/build.ts';
import * as fs from 'node:fs';
import { getLibNames } from './src/scriptinfo.ts';

const libNames = await getLibNames();
const importStr = `import { ${libNames.join(', ')} } from '../src/lib.ts';`;

const out = buildTemplate(fs.readFileSync('templates/page.html', 'utf-8'));

fs.mkdirSync('tmp', { recursive: true });
fs.writeFileSync(
  'tmp/templates.ts',
  `${importStr}\nexport const fn = (context) => ${out.template};`,
);

const { fn } = await import('./tmp/templates.ts');

console.info(
  fn({
    disabled: false,
    content: ['Hello <there>', '...2'],
    emoji: 'butt',
    loopable: '',
  }).toString(),
);
