import { templateIndex } from './test.ts';

console.info(templateIndex({ foo: 'zing', required: 123 }).toString());
