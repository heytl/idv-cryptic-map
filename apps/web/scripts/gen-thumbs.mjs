// ==========================================================================
// 目录页入口图缩略图生成（构建/开发/测试前置步骤，幂等增量）：
// src/assets/maps/entry/*.webp → src/assets/maps/entry-thumb/*.webp（宽 300px）
// 产物目录已 git 忽略，新增地图无需任何手工操作
// ==========================================================================
import { mkdirSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const webRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const srcDir = join(webRoot, 'src/assets/maps/entry');
const outDir = join(webRoot, 'src/assets/maps/entry-thumb');
mkdirSync(outDir, { recursive: true });

const THUMB_WIDTH = 300;

let generated = 0;
for (const name of readdirSync(srcDir).filter((f) => f.endsWith('.webp'))) {
  const src = join(srcDir, name);
  const out = join(outDir, name);
  try {
    // 源图未变则跳过（mtime 比较），保持构建产物哈希稳定
    if (statSync(out).mtimeMs >= statSync(src).mtimeMs) continue;
  } catch {
    /* 缩略图不存在，生成 */
  }
  await sharp(src).resize({ width: THUMB_WIDTH }).webp({ quality: 80 }).toFile(out);
  generated++;
}
console.log(`entry 缩略图: 新生成 ${generated} 张`);
