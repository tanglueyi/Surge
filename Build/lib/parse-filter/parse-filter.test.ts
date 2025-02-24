import { describe, it } from 'mocha';

import { parse } from './filters';
import type { ParseType } from './filters';

describe('parse', () => {
  const MUTABLE_PARSE_LINE_RESULT: [string, ParseType] = ['', 1000];

  it('||top.mail.ru^$badfilter', () => {
    console.log(parse('||top.mail.ru^$badfilter', MUTABLE_PARSE_LINE_RESULT, false));
  });
});
