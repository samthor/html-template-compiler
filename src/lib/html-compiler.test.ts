import test from 'node:test';
import * as assert from 'node:assert';
import { HTMLCompiler } from './html-compiler.ts';

test('basic tag', () => {
  const c = new HTMLCompiler('<hello there="{{bob}}">');
  assert.strictEqual(c.consumeTopLevel(), 'tag');

  assert.deepStrictEqual(c.allParts(), [
    {
      mode: 'raw',
      raw: '<hello ',
    },
    {
      mode: 'attr-render',
      attr: 'there',
      inner: 'bob',
    },
    {
      mode: 'raw',
      raw: '>',
    },
  ]);
});

test('complex tag', () => {
  const c = new HTMLCompiler('<hello there="x-{{bob}}">');
  assert.strictEqual(c.consumeTopLevel(), 'tag');

  assert.deepStrictEqual(c.allParts(), [
    {
      mode: 'raw',
      raw: '<hello there=',
    },
    {
      mode: 'attr',
      parts: ['x-', 'bob', ''],
    },
    {
      mode: 'raw',
      raw: '>',
    },
  ]);
});
