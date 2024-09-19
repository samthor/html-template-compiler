import { templatePage } from './test.ts';

console.info(
  templatePage({
    disabled: false,
    content: ['Hello <there>', '...2'],
    emoji: 'butt',
    loopable: '',
  }).toString(),
);
