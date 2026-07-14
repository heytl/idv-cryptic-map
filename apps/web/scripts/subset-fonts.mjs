// ==========================================================================
// 字体子集化：TTF 源 → 仅含站内实际用字的 woff2（自托管，替代 Google Fonts CDN）
//
// 用法：node scripts/subset-fonts.mjs <TTF源目录>
//   源目录须包含 Cinzel.ttf / MaShanZheng.ttf / NotoSerifSC.ttf
//   （下载地址见 docs/REFACTOR.md，均来自 github.com/google/fonts，OFL 协议）
//
// 何时需要重跑：站内文案或地图名新增了此前未用过的字符
// （src/data/fonts-coverage.test.ts 会在字符缺失时报错提醒）
// ==========================================================================
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import subsetFont from 'subset-font';

const webRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const srcDir = process.argv[2];
if (!srcDir) {
  console.error('用法: node scripts/subset-fonts.mjs <TTF源目录>');
  process.exit(1);
}

// ---- 收集站内实际使用的字符集 ----
function collectText(dir, exts, acc) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'assets' || entry.name === 'node_modules') continue;
      collectText(p, exts, acc);
    } else if (exts.some((e) => entry.name.endsWith(e))) {
      acc.push(readFileSync(p, 'utf8'));
    }
  }
}

const sources = [readFileSync(join(webRoot, 'index.html'), 'utf8')];
collectText(join(webRoot, 'src'), ['.vue', '.ts', '.json', '.css'], sources);

// ASCII 可打印区 + 全角标点等常用符号兜底，避免细碎缺字
let ascii = '';
for (let c = 0x20; c <= 0x7e; c++) ascii += String.fromCharCode(c);
const extras = '，。、；：？！“”‘’（）《》【】—…·×°⇅▲●';

const charset = new Set((sources.join('') + ascii + extras).replace(/\s/g, ''));
const text = [...charset].sort().join('');
console.log(`字符集共 ${charset.size} 个字符`);

// ---- 逐字体子集化输出 woff2（保留变量字重轴）----
const fonts = [
  { src: 'Cinzel.ttf', out: 'Cinzel-subset.woff2' },
  { src: 'MaShanZheng.ttf', out: 'MaShanZheng-subset.woff2' },
  { src: 'NotoSerifSC.ttf', out: 'NotoSerifSC-subset.woff2' },
];

const outDir = join(webRoot, 'src/assets/fonts');
for (const f of fonts) {
  const buf = readFileSync(resolve(srcDir, f.src));
  const woff2 = await subsetFont(buf, text, { targetFormat: 'woff2' });
  writeFileSync(join(outDir, f.out), woff2);
  console.log(`${f.out}: ${(buf.length / 1024).toFixed(0)}KB → ${(woff2.length / 1024).toFixed(1)}KB`);
}

// 子集字符表随产物记录，供覆盖测试校验
writeFileSync(join(outDir, 'subset-chars.txt'), text);
console.log('done');
