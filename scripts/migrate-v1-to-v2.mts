#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  migrateLegacyConfigToV2,
  validateMapConfigV2,
  type AssetRef,
  type LegacyConfig,
} from '../packages/shared/src/map-v2.ts';

const args = process.argv.slice(2);
const option = (name: string): string | undefined =>
  args.find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3);

const inputArg = option('input');
const inputUrl = option('input-url');
const outputArg = option('output');
const apiUrl = option('api-url');
const imageApiUrl = option('image-api-url');
const dryRun = args.includes('--dry-run');
const copySideToAllEntrances = args.includes('--copy-side-to-all');
const publish = args.includes('--publish');
const replaceExisting = args.includes('--replace-existing');

if ((!inputArg && !inputUrl) || (inputArg && inputUrl)) {
  console.error('用法: pnpm migrate:v2 -- (--input=<v1.json> | --input-url=<url>) [--output=<v2.json>] [--api-url=<maps-api>] [--image-api-url=<images-api>] [--copy-side-to-all] [--publish] [--replace-existing] [--dry-run]');
  process.exit(2);
}
if (!dryRun && !outputArg && !apiUrl) {
  console.error('非 dry-run 必须提供 --output 或 --api-url。');
  process.exit(2);
}

const inputPath = inputArg ? resolve(inputArg) : undefined;
let legacy: LegacyConfig;
if (inputPath) {
  legacy = JSON.parse(readFileSync(inputPath, 'utf8')) as LegacyConfig;
} else {
  const response = await fetch(inputUrl!, { headers: { Accept: 'application/json' } });
  if (!response.ok) throw new Error(`读取 V1 配置失败：HTTP ${response.status}`);
  legacy = await response.json() as LegacyConfig;
}

const result = migrateLegacyConfigToV2(legacy, { copySideToAllEntrances, publish });

function absoluteAssetUrl(value: string): string {
  if (/^https?:\/\//.test(value)) return value;
  if (!inputUrl) throw new Error(`本地输入包含相对图片地址 ${value}，请改用绝对地址或 --input-url`);
  return new URL(value, inputUrl).toString();
}

async function copyImage(kind: string, sourceUrl: string): Promise<AssetRef> {
  const sourceResponse = await fetch(absoluteAssetUrl(sourceUrl));
  if (!sourceResponse.ok) throw new Error(`下载图片失败：HTTP ${sourceResponse.status} ${sourceUrl}`);
  const form = new FormData();
  form.append('kind', kind);
  form.append('file', await sourceResponse.blob(), `${kind}.webp`);
  const uploadResponse = await fetch(imageApiUrl!, { method: 'POST', body: form });
  if (!uploadResponse.ok) throw new Error(`上传 V2 图片失败：HTTP ${uploadResponse.status} ${await uploadResponse.text()}`);
  const uploaded = await uploadResponse.json() as { asset?: AssetRef };
  if (!uploaded.asset?.key) throw new Error(`上传 V2 图片返回不完整：${kind}`);
  return uploaded.asset;
}

if (!dryRun && imageApiUrl) {
  let cursor = 0;
  const workers = Array.from({ length: Math.min(4, legacy.maps.length) }, async () => {
    while (cursor < legacy.maps.length) {
      const index = cursor++;
      const source = legacy.maps[index]!;
      const target = result.config.maps[index]!;
      const images = source.images;
      if (!images?.full || !images.floor1 || !images.floor2 || !images.entry || !images.entryThumb) {
        throw new Error(`${source.name} 图片不完整，停止同步`);
      }
      const [full, floor1, floor2, entrance, entranceThumb] = await Promise.all([
        copyImage('full', images.full),
        copyImage('floor1', images.floor1),
        copyImage('floor2', images.floor2),
        copyImage('entrance', images.entry),
        copyImage('entranceThumb', images.entryThumb),
      ]);
      target.layout.full = full;
      target.layout.floor1 = floor1;
      target.layout.floor2 = floor2;
      for (const item of target.entrances) {
        item.image = { ...entrance };
        item.thumb = { ...entranceThumb };
      }
      console.log(`图片同步 ${index + 1}/${legacy.maps.length} ${source.displayName}`);
    }
  });
  await Promise.all(workers);
}

const validation = validateMapConfigV2(result.config);

const summary = {
  input: inputPath ?? inputUrl,
  maps: result.config.maps.length,
  publishedMaps: result.config.maps.filter((map) => map.published).length,
  entrances: result.config.maps.reduce((total, map) => total + map.entrances.length, 0),
  warnings: result.warnings.length,
  structurallyValid: validation.valid,
  validationErrors: validation.errors.length,
  copySideToAllEntrances,
  publish,
  copiedImages: !dryRun && !!imageApiUrl,
  dryRun,
};
console.log(JSON.stringify(summary, null, 2));

for (const warning of result.warnings) console.warn(`WARN ${warning}`);
for (const error of validation.errors) console.error(`ERROR ${error}`);

if (!validation.valid) process.exit(1);
if (!dryRun && outputArg) {
  const outputPath = resolve(outputArg);
  writeFileSync(outputPath, `${JSON.stringify(result.config, null, 2)}\n`);
  console.log(`V2 配置已写入 ${outputPath}`);
}

if (!dryRun && apiUrl) {
  const currentResponse = await fetch(apiUrl, { headers: { Accept: 'application/json' } });
  if (!currentResponse.ok) throw new Error(`读取当前 V2 配置失败：HTTP ${currentResponse.status}`);
  const current = await currentResponse.json() as { version?: number; maps?: unknown[] };
  if ((current.maps?.length ?? 0) > 0 && !replaceExisting) {
    throw new Error(`目标 V2 已有 ${current.maps!.length} 张地图；如确认替换，请添加 --replace-existing`);
  }
  const writeResponse = await fetch(apiUrl, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ baseVersion: current.version ?? 0, maps: result.config.maps }),
  });
  if (!writeResponse.ok) throw new Error(`写入 V2 配置失败：HTTP ${writeResponse.status} ${await writeResponse.text()}`);
  console.log(`V2 已同步到 ${apiUrl}：${await writeResponse.text()}`);
}
