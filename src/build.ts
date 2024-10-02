import { escapeKey, validateVar } from './lib/escape.ts';
import { HTMLCompiler } from './lib/html-compiler.ts';
import { TypeScope } from './lib/scope.ts';

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

  const ts = new TypeScope();

  const parts = c.allParts();
  const inner = parts
    .map((part) => {
      if (typeof part === 'string') {
        return part.replaceAll('`', '\\`');
      }

      const c = (name: string) => {
        ts.record(name);
        const parts = name.split('.');

        if (!ts.isLocal(parts[0])) {
          parts.unshift('context');
        }

        return parts
          .map((part, index) => {
            if (index === 0) {
              return part;
            }
            return escapeKey(part, true);
          })
          .join('?.');
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
                ts.record(subpart); // TODO: maybe "required"?
                return `\${ifDefined(${c(subpart)})}`;
              })
              .join('') +
            '"'
          );

        case 'attr-render':
          return `\${ifDefined(${c(part.render)}, (v) => \` ${part.attr}="\${v}"\`)}`;

        case 'logic-conditional': {
          const invert = part.invert ? '!' : '';
          ts.nestEmpty();
          return `\${ifCheck(${invert}${c(part.render)}, () => \``;
        }

        case 'logic-loop':
          if (part.use === 'context') {
            throw new Error(`cannot nest value "context", used internally`);
          }
          validateVar(part.use);
          ts.nestIterable(part.render, part.use);
          return `\${loop(${c(part.render)}, (${part.use}) => \``;

        case 'logic-else':
          ts.pop();
          ts.nestEmpty();
          return `\`, () => \``;

        case 'logic-close':
          ts.pop();
          return '`)}';

        default:
          part satisfies never;
      }
    })
    .join('');

  const typeString = ts.generateType();
  return { template: '`' + inner + '`', typeString };
}
