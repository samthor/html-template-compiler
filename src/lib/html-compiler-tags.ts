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
        validate('iter', 'v');

        const inner = tag.attrs['iter'];
        if (typeof inner !== 'string') {
          throw new Error(`hc:for needs iter=... was=${inner}`);
        }

        let varName = tag.attrs['v'];
        if (typeof varName !== 'string') {
          varName = '_';
        }

        return { mode: 'logic-loop', inner, use: varName };
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
        const out: Part = { mode: 'logic-conditional', inner: '', invert: false };

        let inner: string | boolean;
        if ('iter' in tag.attrs) {
          validate('iter');
          inner = tag.attrs['iter'];
          out.check = 'iter';
        } else {
          validate('i');
          inner = tag.attrs['i'];
        }

        if (typeof inner !== 'string') {
          throw new Error(`hc:if needs string`);
        }

        if (inner.startsWith('!')) {
          out.invert = true;
          inner = inner.substring(1);
        }
        out.inner = inner;

        return out;
      }
    }

    throw new Error(`unsupported ${tag.name}`);
  }
}
