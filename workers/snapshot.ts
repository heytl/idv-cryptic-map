// Cron：每日把 KV 配置快照回写 git（docs/ADMIN-BACKEND.md §8.2）
// 作用：Vercel 备用镜像与前端内嵌兜底数据滞后 ≤1 天；git 里留审计记录。
// 未配置 GITHUB_TOKEN/GITHUB_REPO 时静默跳过，随时可安全部署。
import { CONFIG_KEY, type Env, type StoredConfig } from './types';

const SNAPSHOT_PATH = 'apps/web/src/data/maps.snapshot.json';

export async function runSnapshot(env: Env): Promise<void> {
  if (!env.GITHUB_TOKEN || !env.GITHUB_REPO || !env.CONFIG) return;

  const config = await env.CONFIG.get<StoredConfig>(CONFIG_KEY, 'json');
  if (!config) return;

  // 与 GET /maps.json 相同的公开视图，直接可作前端兜底数据
  const snapshot = {
    version: config.version,
    updatedAt: config.updatedAt,
    maps: config.maps
      .filter((m) => m.published !== false && !m.deletedAt)
      .sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0))
      .map(({ sort: _s, published: _p, deletedAt: _d, sourceKey: _k, ...pub }) => pub),
  };
  const content = JSON.stringify(snapshot, null, 2) + '\n';

  const branch = env.GITHUB_BRANCH ?? 'main';
  const apiBase = `https://api.github.com/repos/${env.GITHUB_REPO}/contents/${SNAPSHOT_PATH}`;
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
    const existingText = atob(existing.content.replace(/\n/g, ''));
    if (existingText === content) return;
  }

  const putRes = await fetch(apiBase, {
    method: 'PUT',
    headers,
    body: JSON.stringify({
      message: `chore(snapshot): 地图配置每日快照 v${config.version}`,
      content: btoa(unescape(encodeURIComponent(content))), // UTF-8 → base64
      branch,
      ...(sha ? { sha } : {}),
    }),
  });
  if (!putRes.ok) throw new Error(`快照提交失败: ${putRes.status} ${await putRes.text()}`);
}
