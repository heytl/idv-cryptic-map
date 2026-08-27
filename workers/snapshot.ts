// Cron：每日只保护正式 V2。V1 已冻结，历史 KV/R2/快照继续保留但不再写入。
// 1. 按 dataVersion 在 R2 backups-v2/ 留一份完整恢复配置（同版本只写一次）。
// 2. 内容变化时把完整配置回写 git，作为异地审计与恢复副本。
// 未配置 GitHub secrets 时仅跳过 git 回写，R2 留档仍会执行。
import { validateMapConfigV2, type MapConfigV2 } from '../packages/shared/src/map-v2';
import { CONFIG_V2_KEY, ensureVersionBackupV2 } from './api-v2';
import type { Env } from './types';

export const SNAPSHOT_V2_PATH = 'apps/web/src/data/maps-v2.snapshot.json';

export function decodeGitHubUtf8Base64(value: string): string {
  const binary = atob(value.replace(/\s/g, ''));
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function encodeGitHubUtf8Base64(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

export function serializeSnapshotV2(config: MapConfigV2): string {
  return `${JSON.stringify(config, null, 2)}\n`;
}

export async function runSnapshot(env: Env): Promise<void> {
  if (!env.CONFIG || !env.MEDIA) return;

  const config = await env.CONFIG.get<MapConfigV2>(CONFIG_V2_KEY, 'json');
  if (!config) return;
  const validation = validateMapConfigV2(config);
  if (!validation.valid) throw new Error(`V2 快照校验失败: ${validation.errors.join('\n')}`);

  await ensureVersionBackupV2(env, config);
  if (!env.GITHUB_TOKEN || !env.GITHUB_REPO) return;

  const content = serializeSnapshotV2(config);

  const branch = env.GITHUB_BRANCH ?? 'main';
  const apiBase = `https://api.github.com/repos/${env.GITHUB_REPO}/contents/${SNAPSHOT_V2_PATH}`;
  const headers = {
    Authorization: `Bearer ${env.GITHUB_TOKEN}`,
    Accept: 'application/vnd.github+json',
    'User-Agent': 'idv-cryptic-map-snapshot-cron',
  };

  // 取现有文件 sha；内容未变则跳过（不制造空提交）
  let sha: string | undefined;
  const getRes = await fetch(`${apiBase}?ref=${branch}`, { headers });
  if (getRes.ok) {
    const existing = (await getRes.json()) as { sha: string; content: string };
    sha = existing.sha;
    const existingText = decodeGitHubUtf8Base64(existing.content);
    if (existingText === content) return;
  } else if (getRes.status !== 404) {
    throw new Error(`读取 V2 快照失败: ${getRes.status} ${await getRes.text()}`);
  }

  const putRes = await fetch(apiBase, {
    method: 'PUT',
    headers,
    body: JSON.stringify({
      message: `chore(snapshot): V2 地图配置快照 v${config.version} [skip ci]`,
      content: encodeGitHubUtf8Base64(content),
      branch,
      ...(sha ? { sha } : {}),
    }),
  });
  if (!putRes.ok) throw new Error(`快照提交失败: ${putRes.status} ${await putRes.text()}`);
}
