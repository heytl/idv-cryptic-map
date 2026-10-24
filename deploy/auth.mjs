import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { readFileSync } from 'node:fs';

const hash = value => createHash('sha256').update(value).digest();
const cookieName = 'idv_admin_session';
const lifetime = 8 * 60 * 60 * 1000;
const rememberedLifetime = 30 * 24 * 60 * 60 * 1000;
const windowMs = 15 * 60 * 1000;

export function createAuth(db, key) {
  if (!key || key.length < 32) throw new Error('ADMIN_KEY must contain at least 32 characters');
  const expected = hash(key);
  const keyHash = expected.toString('hex');
  const attempts = new Map();
  const html = readFileSync(new URL('./login.html', import.meta.url), 'utf8');
  db.exec('CREATE TABLE IF NOT EXISTS admin_sessions (token_hash TEXT PRIMARY KEY, expires INTEGER NOT NULL, key_hash TEXT NOT NULL)');
  db.prepare('DELETE FROM admin_sessions WHERE expires<=? OR key_hash<>?').run(Date.now(), keyHash);
  const validKey = value => typeof value === 'string' && value.length <= 1024 && timingSafeEqual(expected, hash(value));
  function session(req) {
    const token = (req.headers.cookie || '').split(';').map(v => v.trim()).find(v => v.startsWith(cookieName + '='))?.slice(cookieName.length + 1);
    if (!token || !/^[\w-]{43}$/.test(token)) return null;
    const tokenHash = hash(token).toString('hex');
    return db.prepare('SELECT token_hash FROM admin_sessions WHERE token_hash=? AND expires>? AND key_hash=?').get(tokenHash, Date.now(), keyHash)?.token_hash;
  }
  const authenticated = req => !!session(req) || validKey(req.headers.authorization?.startsWith('Bearer ') ? req.headers.authorization.slice(7) : null);
  function json(res, status, body, headers = {}) {
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...headers });
    res.end(JSON.stringify(body));
  }
  function cookie(host, token, seconds) {
    // Only local development may use HTTP. Public hosts always require HTTPS.
    const local = /^(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/.test(host);
    return `${cookieName}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${seconds}${local ? '' : '; Secure'}`;
  }
  function loginPage(res, status = 200, error = '', remember = false, headers = {}, head = false) {
    const nonce = randomBytes(18).toString('base64');
    const escaped = error.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
    res.writeHead(status, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Frame-Options': 'DENY', 'Referrer-Policy': 'same-origin', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': `default-src 'none'; script-src 'nonce-${nonce}'; style-src 'unsafe-inline'; connect-src 'self'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'`, ...headers });
    res.end(head ? undefined : html.replaceAll('__NONCE__', nonce).replace('__ERROR__', escaped).replace('__REMEMBER__', remember ? 'checked' : ''));
  }
  async function handle(req, res, url, sameHost) {
    const path = url.pathname;
    if (path === '/admin/login') {
      if (req.method !== 'GET' && req.method !== 'HEAD') { json(res, 405, { error: '请求方式不支持' }); return true; }
      if (session(req)) { res.writeHead(303, { Location: '/admin/', 'Cache-Control': 'no-store' }); res.end(); return true; }
      loginPage(res, 200, '', false, {}, req.method === 'HEAD');
      return true;
    }
    if (!['/auth/login', '/auth/logout', '/auth/session'].includes(path)) return false;
    if (path === '/auth/session') { json(res, session(req) ? 200 : 401, { authenticated: !!session(req) }); return true; }
    if (req.method !== 'POST') { json(res, 405, { error: '请求方式不支持' }); return true; }
    if (!sameHost || req.headers['sec-fetch-site'] === 'cross-site') { json(res, 403, { error: '请在本站页面操作' }); return true; }
    if (path === '/auth/logout') {
      const token = session(req);
      if (token) db.prepare('DELETE FROM admin_sessions WHERE token_hash=?').run(token);
      json(res, 200, { ok: true }, { 'Set-Cookie': cookie(req.headers.host, '', 0) });
      return true;
    }
    const formLogin = req.headers['content-type']?.startsWith('application/x-www-form-urlencoded');
    let remember = false;
    const fail = (status, message, headers = {}) => formLogin ? loginPage(res, status, message, remember, headers) : json(res, status, { error: message }, headers);
    const now = Date.now();
    for (const [ip, bucket] of attempts) if (bucket.until <= now) attempts.delete(ip);
    const ip = req.socket.remoteAddress || 'unknown';
    const bucket = attempts.get(ip) || { count: 0, until: now + windowMs };
    if (bucket.count >= 10) { fail(429, '尝试次数过多，请稍后再试', { 'Retry-After': String(Math.ceil((bucket.until - now) / 1000)) }); return true; }
    bucket.count++; attempts.set(ip, bucket);
    if (!formLogin && !req.headers['content-type']?.startsWith('application/json')) { fail(415, '请求格式不支持'); return true; }
    if (Number(req.headers['content-length']) > 2048) { fail(413, '请求内容过长'); return true; }
    let body = '', value;
    for await (const chunk of req) {
      body += chunk.toString();
      if (Buffer.byteLength(body) > 2048) { fail(413, '请求内容过长'); return true; }
    }
    try { value = formLogin ? Object.fromEntries(new URLSearchParams(body)) : JSON.parse(body); } catch { fail(400, '请求格式错误'); return true; }
    remember = formLogin ? value.remember === 'on' : value?.remember === true;
    if (!validKey(value?.password ?? value?.key)) { fail(401, '密钥不正确，请检查后重试'); return true; }
    attempts.delete(ip);
    db.prepare('DELETE FROM admin_sessions WHERE expires<=?').run(now);
    // Bound stored sessions even when the same key is used by automation.
    db.exec('DELETE FROM admin_sessions WHERE token_hash IN (SELECT token_hash FROM admin_sessions ORDER BY expires DESC LIMIT -1 OFFSET 99)');
    const token = randomBytes(32).toString('base64url');
    const duration = remember ? rememberedLifetime : lifetime;
    db.prepare('INSERT INTO admin_sessions VALUES (?,?,?)').run(hash(token).toString('hex'), now + duration, keyHash);
    const sessionCookie = cookie(req.headers.host, token, duration / 1000);
    if (formLogin) { res.writeHead(303, { Location: '/admin/', 'Cache-Control': 'no-store', 'Set-Cookie': sessionCookie }); res.end(); }
    else json(res, 200, { ok: true }, { 'Set-Cookie': sessionCookie });
    return true;
  }
  return { handle, authenticated };
}
