import { HTMLCompiler, TagDef } from './html-compiler.ts';
import { Part } from './parts.ts';

export class HTMLCompilerTags extends HTMLCompiler {
  innerMapper(inner: string): Part | Part[] | void {
    // no special inner tags
  }

  // TODO: not used yet, not complete

  partForTag(tag: TagDef): Part | Part[] | void {
    switch (tag.name) {
      case 'hc:if': {
        let inner = tag.attrs['i'];
        if (inner !== 'string') {
          throw new Error(`hc:if needs i=...`);
        }

        let invert = false;
        if (inner.startsWith('!')) {
          invert = true;
          inner = inner.substring(1);
        }

        return { mode: 'logic-conditional', inner, invert };
      }

      case 'hc:end': {
        if (Object.keys(tag.attrs)) {
          throw new Error(`hc:end has unexpected attrs`);
        }

        return { mode: 'logic-close' };
      }
    }
  }
}
