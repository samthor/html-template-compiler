import { escapeKey } from './escape.ts';

export const iterableSymbol = Symbol('iterable');

export class TypeScope {
  private layout: Record<string | symbol, any> = {}; // le sigh
  private stack: (() => void)[] = [];
  private local: Record<string, number> = {};

  isLocal(name: string) {
    return Boolean(this.local[name]);
  }

  record(name: string) {
    // TODO: look up redirs
    const parts = name.split('.');

    let curr = this.layout;
    for (const p of parts) {
      const prev = curr[p];
      if (prev === undefined) {
        // insert new value
        const next = {};
        curr[p] = next;
        curr = next;
      } else {
        curr = curr[p];
      }
    }

    return curr;
  }

  nestEmpty() {
    this.stack.push(() => {});
  }

  nestIterable(name: string, as: string) {
    if (as.includes('.')) {
      throw new Error(`can't nest dot-property: just for inner fn`);
    }

    const node = this.record(name);
    node[iterableSymbol] ??= {};

    const prev = this.layout[as];

    this.layout[as] = node[iterableSymbol];
    this.local[as] = (this.local[as] || 0) + 1;

    const cleanup = () => {
      if (prev) {
        this.layout[as] = prev;
      } else {
        delete this.layout[as];
      }
      this.local[as]--;
      if (this.local[as] === 0) {
        delete this.local[as];
      }
    };
    this.stack.push(cleanup);
  }

  pop() {
    const top = this.stack.pop();
    if (!top) {
      throw new Error(`bad pop count`);
    }
    top();
  }

  generateType() {
    console.warn(this.layout);

    return this.internalGenerateType(this.layout, '');
  }

  private internalGenerateType(node: Record<string | symbol, any>, indent: string): string {
    const ni = indent + '  ';
    const keys = Object.keys(node);

    const parts = keys.map((key): string => {
      const int = this.internalGenerateType(node[key], ni);
      return `${ni}${escapeKey(key)}?: ${int};\n`;
    });

    const iterType = node[iterableSymbol];
    if (iterType) {
      parts.push(
        `${ni}[Symbol.iterator](): Iterator<${this.internalGenerateType(iterType, ni)}>;\n`,
      );
    }

    if (!parts.length) {
      return 'unknown';
    }

    return `{\n${parts.join('')}${indent}}`;
  }
}
