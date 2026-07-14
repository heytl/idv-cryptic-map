import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import rawData from './maps.json';

// 字体是子集化的：maps.json 出现的字符必须都在子集字符表里，
// 否则新增地图后线上会缺字回退到系统字体（需重跑 scripts/subset-fonts.mjs）
describe('字体子集覆盖', () => {
  const subsetChars = new Set(
    readFileSync(fileURLToPath(new URL('../assets/fonts/subset-chars.txt', import.meta.url)), 'utf8'),
  );

  it('maps.json 中出现的全部字符均在字体子集内', () => {
    const text = JSON.stringify(rawData).replace(/\s/g, '');
    const missing = [...new Set(text)].filter((ch) => !subsetChars.has(ch));
    expect(missing, `缺字: ${missing.join('')}（请重跑 scripts/subset-fonts.mjs）`).toEqual([]);
  });
});
