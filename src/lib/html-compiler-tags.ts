import { HTMLCompiler, type TagDef } from './html-compiler.ts';
import type { Part } from './parts.ts';

const validateAllowedKeys = (hint: string, attrs: Record<string, any>, ...allowed: string[]) => {
  for (const key in attrs) {
    if (!allowed.includes(key)) {
      throw new Error(`${hint}: has unexpected attr: ${key}`);
    }
  }
};

export class HTMLCompilerTags extends HTMLCompiler {
  innerMapper(inner: string): Part | Part[] | void {
    // no special inner tags
  }

  partForTag(tag: TagDef): Part | Part[] | void {
    if (!tag.name.startsWith('hc:')) {
      return;
    }

    const validate = validateAllowedKeys.bind(null, tag.name, tag.attrs);

    switch (tag.name) {
      case 'hc:loop': {
        if (!tag.selfClosing && tag.isClose) {
          validate();
          return { mode: 'logic-close' };
        }
        validate('i', 'v');

        const inner = tag.attrs['i'];
        if (typeof inner !== 'string') {
          throw new Error(`hc:for needs i=... was=${inner}`);
        }

        let varName = tag.attrs['v'];
        if (typeof varName !== 'string') {
          varName = '_';
        }

        return { mode: 'logic-loop', inner, use: varName };
      }

      case 'hc:empty': {
        if (!tag.selfClosing && tag.isClose) {
          validate();
          return { mode: 'logic-close' };
        }
        validate('i');

        const inner = tag.attrs['i'];
        if (typeof inner !== 'string') {
          throw new Error(`hc:empty needs i=... was=${inner}`);
        }

        return { mode: 'logic-empty-loop', inner };
      }

      case 'hc:else': {
        if (!tag.selfClosing) {
          // TODO: could this look like something else? immediately follow closing `hc:if`?
          throw new Error(`hc:else must be self-closing`);
        }

        validate();
        return { mode: 'logic-else' };
      }

      case 'hc:if': {
        if (!tag.selfClosing && tag.isClose) {
          validate();
          return { mode: 'logic-close' };
        }
        validate('i');

        let inner = tag.attrs['i'];
        if (typeof inner !== 'string') {
          throw new Error(`hc:if needs i=... was=${JSON.stringify(tag.attrs)}`);
        }

        let invert = false;
        if (inner.startsWith('!')) {
          invert = true;
          inner = inner.substring(1);
        }

        return { mode: 'logic-conditional', inner, invert };
      }
    }

    throw new Error(`unsupported ${tag.name}`);
  }
}
