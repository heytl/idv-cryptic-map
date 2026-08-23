import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { spawn } from 'node:child_process';

type AssetRef = { key?: unknown };

const args = new Map<string, string>();
for (let index = 2; index < process.argv.length; index += 2) {
  const name = process.argv[index];
  const value = process.argv[index + 1];
  if (!name?.startsWith('--') || !value) throw new Error(`参数格式错误：${name ?? ''}`);
  args.set(name.slice(2), value);
}

const configPath = required('config');
const sourceBase = required('source-base').replace(/\/$/, '');
const targetBase = required('target-base').replace(/\/$/, '');
const targetBucket = required('target-bucket');
const apply = args.get('apply') === 'true';
const concurrency = Number(args.get('concurrency') ?? '8');

if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 16) {
  throw new Error('concurrency 必须是 1–16 的整数');
}

function required(name: string): string {
  const value = args.get(name);
  if (!value) throw new Error(`缺少 --${name}`);
  return value;
}

function collectAssetKeys(value: unknown, keys = new Set<string>()): Set<string> {
  if (Array.isArray(value)) {
    for (const item of value) collectAssetKeys(item, keys);
    return keys;
  }
  if (!value || typeof value !== 'object') return keys;
  const object = value as AssetRef & Record<string, unknown>;
  if (typeof object.key === 'string' && object.key.startsWith('maps/') && object.key.endsWith('.webp')) {
    keys.add(object.key);
  }
  for (const child of Object.values(object)) collectAssetKeys(child, keys);
  return keys;
}

function assetUrl(base: string, key: string): string {
  return `${base}/${key.split('/').map(encodeURIComponent).join('/')}`;
}

function digest(data: Uint8Array): string {
  return createHash('sha256').update(data).digest('hex');
}

async function fetchAsset(base: string, key: string, requiredAsset: boolean): Promise<Uint8Array | null> {
  const response = await fetch(assetUrl(base, key), { headers: { 'Cache-Control': 'no-cache' } });
  if (response.status === 404 && !requiredAsset) return null;
  if (!response.ok) throw new Error(`${requiredAsset ? '源' : '目标'}图片读取失败 ${response.status}：${key}`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.length === 0) throw new Error(`图片为空：${key}`);
  return bytes;
}

async function runPool<T>(items: T[], task: (item: T, index: number) => Promise<void>): Promise<void> {
  let cursor = 0;
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      await task(items[index]!, index);
    }
  });
  await Promise.all(workers);
}

async function uploadAsset(key: string, file: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(
      'pnpm',
      [
        'exec',
        'wrangler',
        'r2',
        'object',
        'put',
        `${targetBucket}/${key}`,
        '--file',
        file,
        '--content-type',
        'image/webp',
        '--cache-control',
        'public, max-age=31536000, immutable',
        '--remote',
      ],
      { stdio: ['ignore', 'pipe', 'pipe'] },
    );
    let errorOutput = '';
    child.stderr.on('data', (chunk) => (errorOutput += chunk.toString()));
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`上传失败 ${key}（exit ${code}）\n${errorOutput}`));
    });
  });
}

const config = JSON.parse(await readFile(configPath, 'utf8')) as unknown;
const keys = [...collectAssetKeys(config)].sort();
if (keys.length === 0) throw new Error('配置中没有找到任何 maps/*.webp 图片引用');

const workDir = await mkdtemp(join(tmpdir(), 'idv-v2-assets-'));
const sourceHashes = new Map<string, string>();
const missing: string[] = [];

try {
  console.log(`检查 ${keys.length} 个 V2 图片引用（并发 ${concurrency}）…`);
  await runPool(keys, async (key, index) => {
    const source = await fetchAsset(sourceBase, key, true);
    const target = await fetchAsset(targetBase, key, false);
    const sourceHash = digest(source!);
    sourceHashes.set(key, sourceHash);
    if (target) {
      const targetHash = digest(target);
      if (targetHash !== sourceHash) {
        throw new Error(`同名图片内容冲突，已停止迁移：${key}\n源 ${sourceHash}\n目标 ${targetHash}`);
      }
    } else {
      const file = join(workDir, key);
      await mkdir(dirname(file), { recursive: true });
      await writeFile(file, source!);
      missing.push(key);
    }
    if ((index + 1) % 25 === 0 || index === keys.length - 1) {
      console.log(`已核对 ${index + 1}/${keys.length}`);
    }
  });

  console.log(`目标已存在且一致：${keys.length - missing.length}；待复制：${missing.length}`);
  if (!apply) {
    console.log('当前为只读检查；传入 --apply true 才会上传缺失图片。');
    process.exitCode = missing.length === 0 ? 0 : 2;
  } else {
    await runPool(missing, async (key, index) => {
      await uploadAsset(key, join(workDir, key));
      if ((index + 1) % 10 === 0 || index === missing.length - 1) {
        console.log(`已复制 ${index + 1}/${missing.length}`);
      }
    });

    console.log('重新读取正式 R2，进行逐文件 SHA-256 校验…');
    await runPool(keys, async (key, index) => {
      const target = await fetchAsset(targetBase, key, true);
      const expected = sourceHashes.get(key);
      const actual = digest(target!);
      if (actual !== expected) throw new Error(`迁移后校验失败：${key}`);
      if ((index + 1) % 25 === 0 || index === keys.length - 1) {
        console.log(`已验证 ${index + 1}/${keys.length}`);
      }
    });
    console.log(`V2 图片迁移完成：${keys.length} 个引用全部一致，新复制 ${missing.length} 个。`);
  }
} finally {
  await rm(workDir, { recursive: true, force: true });
}
