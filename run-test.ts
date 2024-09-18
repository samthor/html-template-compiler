import { templatePage } from './test.ts';

console.info(templatePage({ content: ['Hello <there>', '...2'] }).toString());
