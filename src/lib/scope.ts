import { escapeKey } from './escape.ts';

const iterableSymbol = Symbol('iterable');
const requiredSymbol = Symbol('required');
const nestSymbol = Symbol('nest');

export class TypeScope {
  private layout: Record<string | symbol, any> = {}; // le sigh
  private stack: (() => void)[] = [];

  isLocal(name: string) {
    return nestSymbol in this.layout[name];
  }

  record(name: string, required?: boolean) {
    const parts = name.split('.');

    let curr = this.layout;
    if (required) {
      // TODO: does this break iterables?
      curr[requiredSymbol] = true;
    }

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

      if (required) {
        curr[requiredSymbol] = true;
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

    if (!as) {
      this.stack.push(() => {});
      return;
    }

    const typeOfIterable = node[iterableSymbol];
    typeOfIterable[nestSymbol] = true;

    const prev = this.layout[as];
    this.layout[as] = typeOfIterable;

    const cleanup = () => {
      if (this.layout[as] !== typeOfIterable) {
        throw new Error(`bad cleanup: unexpected value in ${as} pos`);
      }
      delete typeOfIterable[nestSymbol];

      if (prev) {
        this.layout[as] = prev;
      } else {
        delete this.layout[as];
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
    return this.internalGenerateType(this.layout, '');
  }

  anyRequired() {
    return requiredSymbol in this.layout;
  }

  private internalGenerateType(node: Record<string | symbol, any>, indent: string): string {
    const ni = indent + '  ';
    const keys = Object.keys(node);

    const parts = keys.map((key): string => {
      const int = this.internalGenerateType(node[key], ni);

      let qualifier = '?';
      if (node[key]?.[requiredSymbol]) {
        qualifier = '';
      }

      return `${ni}${escapeKey(key)}${qualifier}: ${int};\n`;
    });

    const iterType = node[iterableSymbol];
    if (iterType) {
      parts.push(
        `${ni}[Symbol.iterator]?(): Iterator<${this.internalGenerateType(iterType, ni)}>;\n`,
      );
    }

    if (!parts.length) {
      return 'unknown';
    }

    return `{\n${parts.join('')}${indent}}`;
  }
}
