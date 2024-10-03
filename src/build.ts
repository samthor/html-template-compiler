import { escapeKey, validateVar } from './lib/escape.ts';
import { HTMLCompilerTags } from './lib/html-compiler-tags.ts';
import type { Part } from './lib/parts.ts';
import { TypeScope } from './lib/scope.ts';

/**
 * Builds a template literal from the passed HTML source. May throw if the source is invalid.
 *
 * Uses the `unsafeName` key to check if passed values are safe to be included unescaped inside
 * HTML.
 */
export function buildTemplate(raw: string) {
  const compiler = new HTMLCompilerTags(raw);
  while (compiler.consumeTopLevel()) {
    // keep going
  }

  const ts = new TypeScope();
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

  const renderPart = (part: Part): string => {
    switch (part.mode) {
      case 'raw':
        return part.raw;

      case 'comment':
        return `\${ifDefined(${c(part.inner)})}`;

      case 'html':
        return `\${renderBody(${c(part.inner)})}`;

      case 'attr-boolean':
        return `\${${c(part.inner)} ? ' ${part.attr}' : ''}`;

      case 'attr':
        return (
          '"' +
          part.parts
            .map((subpart, index) => {
              if (!(index % 2)) {
                return subpart;
              }
              ts.record(subpart, true);
              return `\${ifDefined(${c(subpart)})}`;
            })
            .join('') +
          '"'
        );

      case 'attr-render':
        return `\${ifDefined(${c(part.inner)}, (v) => \` ${part.attr}="\${v}"\`)}`;

      case 'logic-conditional': {
        const invert = part.invert ? '!' : '';

        let content = c(part.inner);
        if (part.check === 'iter') {
          // see if iterable exists and is non-empty
          content = `iterAsBoolean(${content})`;
          ts.nestIterable(part.inner, '');
        } else {
          ts.nestEmpty();
        }

        return `\${ifCheck(${invert}${content}, () => \``;
      }

      case 'logic-loop':
        if (part.use === 'context') {
          throw new Error(`cannot nest value "context", used internally`);
        }
        validateVar(part.use);
        ts.nestIterable(part.inner, part.use);
        return `\${loop(${c(part.inner)}, (${part.use}) => \``;

      case 'logic-else':
        ts.pop();
        ts.nestEmpty();
        return `\`, () => \``;

      case 'logic-close':
        ts.pop();
        return '`)}';

      default:
        part satisfies never;
        throw 'Should never happen';
    }
  };

  const inner = compiler
    .allParts()
    .map((part) => renderPart(part))
    .join('');
  const typeString = ts.generateType();
  return { template: '`' + inner + '`', typeString, anyRequired: ts.anyRequired() };
}
