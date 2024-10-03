import test from 'node:test';
import * as assert from 'node:assert';
import { buildTemplate } from './build.ts';

test('types', () => {
  const out = buildTemplate(`
<hc:loop iter="subgroups" v="_">
  <hc:loop iter="_.links">
    {{_}}
  </hc:loop>
</hc:loop>
    `);

  assert.strictEqual(
    out.typeString,
    `{
  subgroups?: {
    [Symbol.iterator]?(): Iterator<{
      links?: {
        [Symbol.iterator]?(): Iterator<unknown>;
      };
    }>;
  };
}`,
  );
});
