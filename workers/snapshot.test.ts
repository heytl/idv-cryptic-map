import { afterEach, describe, expect, it, vi } from 'vitest';
import type { MapConfigV2 } from '../packages/shared/src/map-v2';
import { decodeGitHubUtf8Base64, runSnapshot, serializeSnapshotV2 } from './snapshot';
import type { Env } from './types';

const config: MapConfigV2 = {
  schemaVersion: 2,
  version: 23,
  updatedAt: '2026-08-23',
  maps: [],
};

function utf8Base64(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function mockEnv(existingBackup = false): {
  env: Env;
  r2Put: ReturnType<typeof vi.fn>;
  r2List: ReturnType<typeof vi.fn>;
} {
  const r2Put = vi.fn(async () => undefined);
  const r2List = vi.fn(async () => ({ objects: [], truncated: false, delimitedPrefixes: [] }));
  const env = {
    CONFIG: {
      get: vi.fn(async () => config),
    },
    MEDIA: {
      head: vi.fn(async () => existingBackup ? ({ key: 'backups-v2/snapshot-v23.json' }) : null),
      put: r2Put,
      list: r2List,
      delete: vi.fn(async () => undefined),
    },
    GITHUB_TOKEN: 'token',
    GITHUB_REPO: 'heytl/idv-cryptic-map',
    GITHUB_BRANCH: 'feat/admin-backend',
  } as unknown as Env;
  return { env, r2Put, r2List };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('V2 每日快照', () => {
  it('正确解码包含中文的 GitHub UTF-8 Base64', () => {
    const content = '噩梦模式：地下室、一楼、二楼\n';
    expect(decodeGitHubUtf8Base64(utf8Base64(content))).toBe(content);
  });

  it('Git 内容相同且 R2 已有同版本时不产生任何写入', async () => {
    const { env, r2Put, r2List } = mockEnv(true);
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      sha: 'same-sha',
      content: utf8Base64(serializeSnapshotV2(config)),
    }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await runSnapshot(env);

    expect(r2Put).not.toHaveBeenCalled();
    expect(r2List).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('新版本先写入 backups-v2，再提交带 skip ci 的 V2 Git 快照', async () => {
    const { env, r2Put } = mockEnv(false);
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response('', { status: 404 }))
      .mockResolvedValueOnce(new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await runSnapshot(env);

    expect(r2Put).toHaveBeenCalledWith(
      'backups-v2/snapshot-v23.json',
      JSON.stringify(config),
      expect.objectContaining({ customMetadata: expect.objectContaining({ dataVersion: '23' }) }),
    );
    const githubRequest = fetchMock.mock.calls[1]?.[1] as RequestInit;
    const body = JSON.parse(String(githubRequest.body));
    expect(body.message).toBe('chore(snapshot): V2 地图配置快照 v23 [skip ci]');
    expect(decodeGitHubUtf8Base64(body.content)).toBe(serializeSnapshotV2(config));
  });
});
