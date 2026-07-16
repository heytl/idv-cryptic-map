#!/usr/bin/env node
// ==========================================================================
// Phase 2 数据迁移：现有 28 张图 + maps.json → R2 + KV
//
// 用法（仓库根目录执行）：
//   node scripts/migrate-phase2.mjs                 # 本地模拟（wrangler --local，env dev）
//   node scripts/migrate-phase2.mjs --remote        # 真实环境（Phase 2.0 绑定完成后）
//   node scripts/migrate-phase2.mjs --dry-run       # 只生成 kv-config.json，不执行上传
//
// 做的事：
//   1) 对 entry/entry-thumb/floor1/floor2/full 每张 webp 计算 sha256 前 8 位
//   2) wrangler r2 object put 上传为 maps/<kind>/<hash8>.webp（immutable 头）
//   3) 生成 KV 配置（sort=顺序×10、published=true、images 用 IMG_BASE 前缀 URL）
//   4) wrangler kv key put config:current
// 可重复执行（内容哈希命名天然幂等）。
// ==========================================================================
import { execSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const ASSETS = join(ROOT, 'apps/web/src/assets/maps');
const SRC_JSON = join(ROOT, 'apps/web/src/data/maps.json');

const args = process.argv.slice(2);
const REMOTE = args.includes('--remote');
const DRY = args.includes('--dry-run');
const IMG_BASE = (args.find((a) => a.startsWith('--img-base='))?.split('=')[1] ?? '/r2').replace(/\/$/, '');
const ENV = REMOTE ? '' : ' --env dev';
const MODE = REMOTE ? ' --remote' : ' --local';
// 生产桶名与 wrangler.jsonc 保持一致
const BUCKET = REMOTE ? 'idv-media' : 'idv-media-dev';

const KINDS = [
  ['entry', 'entry'],
  ['entryThumb', 'entry-thumb'],
  ['floor1', 'floor1'],
  ['floor2', 'floor2'],
  ['full', 'full'],
];

function sh(cmd, attempts = 4) {
  for (let i = 1; ; i++) {
    try {
      execSync(cmd, { cwd: ROOT, stdio: ['ignore', 'ignore', 'inherit'] });
      return;
    } catch (e) {
      // 跨境网络抖动是常态，指数退避重试而不是崩掉整个迁移
      if (i >= attempts) throw e;
      console.log(`  ↻ 网络抖动，第 ${i} 次重试 …`);
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 2000 * i);
    }
  }
}

// 缩略图目录可能未生成，先跑一遍生成脚本
if (!DRY) {
  console.log('· 生成入口缩略图 …');
  sh('node apps/web/scripts/gen-thumbs.mjs');
}

const raw = JSON.parse(readFileSync(SRC_JSON, 'utf-8'));
const config = { version: 1, updatedAt: raw.updatedAt, maps: [] };
let uploaded = 0;

for (const [i, m] of raw.maps.entries()) {
  const images = {};
  for (const [kind, dir] of KINDS) {
    const file = join(ASSETS, dir, `${m.name}.webp`);
    if (!existsSync(file)) {
      if (kind === 'entryThumb') continue; // 缩略图缺失可由 entry 回退
      throw new Error(`缺少图片: ${file}`);
    }
    const buf = readFileSync(file);
    const hash = createHash('sha256').update(buf).digest('hex').slice(0, 8);
    const key = `maps/${dir}/${hash}.webp`;
    if (!DRY) {
      sh(
        `npx wrangler r2 object put "${BUCKET}/${key}" --file "${file}" ` +
          `--content-type image/webp --cache-control "public, max-age=31536000, immutable"${MODE}`,
      );
      uploaded++;
    }
    images[kind] = `${IMG_BASE}/${key}`;
  }
  config.maps.push({
    id: m.id,
    sort: (i + 1) * 10,
    direction: m.direction,
    name: m.name,
    displayName: m.displayName,
    remarks: m.remarks,
    published: true,
    images,
  });
  console.log(`· [${i + 1}/${raw.maps.length}] ${m.name} ✓`);
}

const out = join(ROOT, 'kv-config.json');
writeFileSync(out, JSON.stringify(config));
console.log(`· KV 配置已生成: kv-config.json（${config.maps.length} 条）`);

if (!DRY) {
  sh(`npx wrangler kv key put config:current --path kv-config.json --binding CONFIG${ENV}${MODE}`);
  console.log(`· 已写入 KV config:current（上传图片 ${uploaded} 张）`);
  console.log('完成。验证：curl <站点>/maps.json 应返回 version=1 且图片为 ' + IMG_BASE + '/maps/... URL');
}
