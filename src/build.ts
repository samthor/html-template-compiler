import { coalesceParts, HTMLCompiler } from './lib/html-compiler.ts';

/**
 * Builds a template literal from the passed HTML source. May throw if the source is invalid.
 *
 * Uses the `unsafeName` key to check if passed values are safe to be included unescaped inside
 * HTML.
 */
export function buildTemplate(raw: string) {
  const c = new HTMLCompiler(raw);

  for (;;) {
    const more = c.consumeTopLevel();
    if (!more) {
      break;
    }
  }

  const propsRequired = new Set<string>();
  const propsOptional = new Set<string>();

  const recordProp = (name: string, required?: boolean) => {
    const [left] = name.split('.');
    if (left.startsWith('_')) {
      // ignore
    } else if (required) {
      propsRequired.add(left);
    } else {
      propsOptional.add(left);
    }
  };

  c.output = coalesceParts(c.output);

  const inner = c.output
    .map((part) => {
      if (typeof part === 'string') {
        return part.replaceAll('`', '\\`');
      }

      const c = (name: string) => {
        if (!/[0-9a-zA-Z_]/.test(name[0])) {
          throw new Error(`invalid context name: ${name}`);
        }

        if (name.startsWith('_')) {
          return name;
        }

        recordProp(name);
        const parts = name.split('.');
        return `(context as any)` + parts.map((part) => `[${JSON.stringify(part)}]`).join('?.');
      };

      switch (part.mode) {
        case 'comment':
          return `\${ifDefined(${c(part.render)})}`;

        case 'html':
          return `\${renderBody(${c(part.render)})}`;

        case 'attr-boolean':
          return `\${${c(part.render)} ? ' ${part.attr}' : ''}`;

        case 'attr':
          return (
            '"' +
            part.parts
              .map((subpart, index) => {
                if (!(index % 2)) {
                  return subpart;
                }
                recordProp(subpart, true); // extra because we MUST be required
                return `\${ifDefined(${c(subpart)})}`;
              })
              .join('') +
            '"'
          );

        case 'attr-render':
          return `\${ifDefined(${c(part.render)}, (v) => \` ${part.attr}="\${v}"\`)}`;

        case 'logic-conditional': {
          const invert = part.invert ? '!' : '';
          return `\${ifCheck(${invert}${c(part.render)}, () => \``;
        }

        case 'logic-loop':
          return `\${loop(${c(part.render)}, (_${part.use}) => \``;

        case 'logic-else':
          return `\`, () => \``;

        case 'logic-close':
          return '`)}';

        default:
          part satisfies never;
      }
    })
    .join('');

  const stringProps = (i: Iterable<string>) => {
    return [...i].map((s) => JSON.stringify(s)).join(' | ');
  };
  const typeParts: string[] = [];

  // make props required if optional
  for (const required of propsRequired) {
    propsOptional.delete(required);
  }

  if (propsRequired.size) {
    typeParts.push(`Record<${stringProps(propsRequired)}, unknown>`);
  }
  if (propsOptional.size) {
    typeParts.push(`Partial<Record<${stringProps(propsOptional)}, unknown>>`);
  }
  if (!typeParts.length) {
    typeParts.push(`Record<never, never>`);
  }
  const typeString = typeParts.join(' & ');

  return { template: '`' + inner + '`', typeString };
}
