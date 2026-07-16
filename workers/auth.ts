// Cloudflare Access JWT 校验（双保险的第二道：即使流量绕过 Access 边缘拦截，
// Worker 内也验签 Cf-Access-Jwt-Assertion）。无第三方依赖，WebCrypto 实现 RS256。
import { type Env, jsonError } from './types';

interface Jwk {
  kid: string;
  kty: string;
  n: string;
  e: string;
  alg?: string;
}

// JWKS 进程内缓存（Worker 实例存活期内有效，1 小时过期重取）
let jwksCache: { keys: Jwk[]; fetchedAt: number } | null = null;
const JWKS_TTL_MS = 60 * 60 * 1000;

function b64urlToBytes(s: string): Uint8Array {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(s.length / 4) * 4, '=');
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

function decodeJson<T>(b64url: string): T {
  return JSON.parse(new TextDecoder().decode(b64urlToBytes(b64url))) as T;
}

async function getJwks(teamDomain: string): Promise<Jwk[]> {
  if (jwksCache && Date.now() - jwksCache.fetchedAt < JWKS_TTL_MS) return jwksCache.keys;
  const res = await fetch(`${teamDomain}/cdn-cgi/access/certs`);
  if (!res.ok) throw new Error(`JWKS 拉取失败: ${res.status}`);
  const { keys } = (await res.json()) as { keys: Jwk[] };
  jwksCache = { keys, fetchedAt: Date.now() };
  return keys;
}

/**
 * 通过返回 null；未通过返回 401/503 Response。
 * - env.dev 设 DEV_DISABLE_AUTH=1 跳过（仅本地）
 * - 生产未配置 ACCESS_* 时 fail closed：拒绝所有 /api 请求，避免裸奔
 */
export async function requireAuth(request: Request, env: Env): Promise<Response | null> {
  if (env.DEV_DISABLE_AUTH === '1') return null;
  if (!env.ACCESS_TEAM_DOMAIN || !env.ACCESS_AUD) {
    return jsonError(503, 'access_not_configured', '请先完成 Phase 2.0：配置 ACCESS_TEAM_DOMAIN 与 ACCESS_AUD');
  }

  const token =
    request.headers.get('Cf-Access-Jwt-Assertion') ??
    request.headers.get('Cookie')?.match(/CF_Authorization=([^;]+)/)?.[1];
  if (!token) return jsonError(401, 'unauthorized', '缺少 Access 凭证');

  try {
    const [h, p, sig] = token.split('.');
    if (!h || !p || !sig) throw new Error('JWT 格式错误');
    const header = decodeJson<{ kid: string; alg: string }>(h);
    if (header.alg !== 'RS256') throw new Error('非预期的签名算法');

    const jwk = (await getJwks(env.ACCESS_TEAM_DOMAIN)).find((k) => k.kid === header.kid);
    if (!jwk) throw new Error('kid 无匹配公钥');

    const key = await crypto.subtle.importKey(
      'jwk',
      { kty: jwk.kty, n: jwk.n, e: jwk.e },
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
      false,
      ['verify'],
    );
    const valid = await crypto.subtle.verify(
      'RSASSA-PKCS1-v1_5',
      key,
      b64urlToBytes(sig) as unknown as ArrayBuffer,
      new TextEncoder().encode(`${h}.${p}`),
    );
    if (!valid) throw new Error('签名校验失败');

    const payload = decodeJson<{ aud: string | string[]; exp: number; nbf?: number; iss: string }>(p);
    const now = Math.floor(Date.now() / 1000);
    const auds = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
    if (!auds.includes(env.ACCESS_AUD)) throw new Error('aud 不匹配');
    if (payload.exp < now || (payload.nbf && payload.nbf > now)) throw new Error('token 已过期');
    if (payload.iss !== env.ACCESS_TEAM_DOMAIN) throw new Error('iss 不匹配');
    return null;
  } catch (e) {
    return jsonError(401, 'unauthorized', e instanceof Error ? e.message : '凭证校验失败');
  }
}
