import { resolve } from 'node:path';
import { readdir } from 'node:fs/promises';
import { json, write } from './lib.mjs';
const escape = value => String(value).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);
export async function createVersionDirectory(site) {
  const versions = [];
  for (const entry of await readdir(site, { withFileTypes: true })) {
    if (!entry.isDirectory() || !/^v[1-9]\d*(?:\.\d+){0,2}$/.test(entry.name)) continue;
    if (entry.name === 'v1') {
      const original = await json(resolve(site, 'v1/maps.json'));
      versions.push({ version: 'v1', url: '/v1/', layouts: original.length, description: '最初的静态手册，保留当时的界面与地图。' });
    } else {
      const release = await json(resolve(site, entry.name, 'release.json'));
      versions.push({ version: entry.name, url: `/${entry.name}/`, layouts: release.layouts, capturedAt: release.capturedAt, description: '完整保留发布时的界面、地图配置与图片。' });
    }
  }
  versions.sort((a, b) => b.version.localeCompare(a.version, undefined, { numeric: true }));
  const latest = await json(resolve(site, 'release.json'));
  await write(resolve(site, 'versions/index.json'), JSON.stringify({ latest, versions }, null, 2) + '\n');
  await write(resolve(site, 'versions/index.html'), `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>历史版本 · 加页手记</title><meta name="theme-color" content="#1a1410"><style>
:root{color-scheme:dark}*{box-sizing:border-box}body{margin:0;background:#171719;color:#ded5bd;font-family:"Noto Serif SC","Songti SC",serif;line-height:1.8}main{max-width:860px;margin:0 auto;padding:64px 24px}a{color:#d7b774;text-underline-offset:5px}a:focus-visible{outline:2px solid #d7b774;outline-offset:5px}h1{font-size:clamp(28px,6vw,42px);font-weight:500;margin:24px 0 12px;letter-spacing:3px}p{color:#bcb6a9}.latest{margin:32px 0;padding:20px 0;border-block:1px solid #62543d}.latest a{font-size:20px}ul{padding:0;list-style:none}li{padding:24px 0;border-bottom:1px solid #383737}li a{font-size:24px}li p{margin:8px 0 0}.meta{font-size:14px;color:#aaa18e}.eyebrow{font-size:12px;letter-spacing:3px;color:#b9a274}footer{margin-top:40px;font-size:14px}@media(prefers-reduced-motion:no-preference){html{scroll-behavior:smooth}}
</style></head><body><main><a href="/">← 返回最新手册</a><p class="eyebrow">CRYPTIC HANDBOOK / ARCHIVE</p><h1>历史版本</h1><p>熟悉的界面，留在这里。历史版本保留当时的地图内容，攻略可能已不适用于当前游戏。</p><div class="latest"><a href="/">打开最新发布版 · ${escape(latest.version)}</a><div class="meta">${latest.layouts} 个布局 · 地图更新 ${escape(latest.updatedAt.slice(0, 10))}</div></div><ul>${versions.map(v => `<li><a href="${v.url}">${escape(v.version)} ${v.version === 'v1' ? '· 经典旧版' : '· 历史快照'}</a><p>${escape(v.description)}</p><div class="meta">${v.layouts} 个布局${v.capturedAt ? ` · 保存于 ${new Date(v.capturedAt).toLocaleDateString('zh-CN', { timeZone: 'Asia/Shanghai' })}` : ''}</div></li>`).join('')}</ul><footer>© 2026 OUU · 加页手记解密手册</footer></main></body></html>\n`);
}
