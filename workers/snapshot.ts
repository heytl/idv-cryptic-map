// Daily V3 backup plus optional Git snapshot. V2 remains an archived migration baseline.
import type { MapConfigV3 } from "../packages/shared/src/index";
import { maintenance } from "../packages/server/src/content";
import { CloudflareContent, D1Statistics } from "./cloudflare";
import type { Env } from "./types";

export const SNAPSHOT_V3_PATH = "apps/web/src/data/maps-v3.snapshot.json";

export function decodeGitHubUtf8Base64(value: string): string {
  const binary = atob(value.replace(/\s/g, ""));
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function encodeGitHubUtf8Base64(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

export function serializeSnapshotV3(config: MapConfigV3): string {
  return `${JSON.stringify(config, null, 2)}\n`;
}

export async function runSnapshot(env: Env): Promise<void> {
  if (!env.CONFIG || !env.MEDIA) return;

  const repo = new CloudflareContent(env);
  await maintenance(repo, env.STATS ? new D1Statistics(env.STATS) : undefined);
  const config = await repo.read();
  if (!env.GITHUB_TOKEN || !env.GITHUB_REPO) return;

  const content = serializeSnapshotV3(config);

  const branch = env.GITHUB_BRANCH ?? "main";
  const apiBase = `https://api.github.com/repos/${env.GITHUB_REPO}/contents/${SNAPSHOT_V3_PATH}`;
  const headers = {
    Authorization: `Bearer ${env.GITHUB_TOKEN}`,
    Accept: "application/vnd.github+json",
    "User-Agent": "idv-cryptic-map-snapshot-cron",
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
    throw new Error(
      `读取 V3 快照失败: ${getRes.status} ${await getRes.text()}`,
    );
  }

  const putRes = await fetch(apiBase, {
    method: "PUT",
    headers,
    body: JSON.stringify({
      message: `chore(snapshot): V3 地图配置快照 v${config.version} [skip ci]`,
      content: encodeGitHubUtf8Base64(content),
      branch,
      ...(sha ? { sha } : {}),
    }),
  });
  if (!putRes.ok)
    throw new Error(`快照提交失败: ${putRes.status} ${await putRes.text()}`);
}
