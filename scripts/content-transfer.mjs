import { mkdir, readFile, writeFile, realpath, lstat } from "node:fs/promises";
import { resolve, dirname, relative, sep } from "node:path";
import { createHash } from "node:crypto";

// Access credentials stay in environment variables, never command arguments or exports.
const [action, baseArg, folderArg] = process.argv.slice(2);
if (!["export", "import"].includes(action) || !baseArg || !folderArg)
  throw new Error(
    "用法: node scripts/content-transfer.mjs export|import <站点 URL> <备份目录>",
  );
const base = new URL(baseArg);
if (
  base.protocol !== "https:" &&
  !["localhost", "127.0.0.1"].includes(base.hostname)
)
  throw new Error("远端迁移必须使用 HTTPS");
const headers = {};
if (process.env.CF_ACCESS_CLIENT_ID)
  headers["CF-Access-Client-Id"] = process.env.CF_ACCESS_CLIENT_ID;
if (process.env.CF_ACCESS_CLIENT_SECRET)
  headers["CF-Access-Client-Secret"] = process.env.CF_ACCESS_CLIENT_SECRET;
if (process.env.CF_ACCESS_JWT)
  headers.Cookie = `CF_Authorization=${process.env.CF_ACCESS_JWT}`;
async function api(path, options = {}) {
  const r = await fetch(new URL(path, base), {
    ...options,
    redirect: "error",
    headers: { ...headers, ...options.headers },
  });
  if (!r.ok)
    throw new Error(
      `${path.split("?")[0]}: HTTP ${r.status} ${await r.text()}`,
    );
  return r;
}
const digest = (b) => createHash("sha256").update(b).digest("hex");
const root = resolve(folderArg);
if (action === "export") await mkdir(root, { recursive: false });
const realRoot = await realpath(root);
async function assetPath(key, create = false) {
  if (
    typeof key !== "string" ||
    !/^maps\/(?:entry|entry-thumb|full|floor1|floor2|entrance|entrance-thumb|layout\/(?:full|basement|floor1|floor2))\/[^/\\]+\.webp$/.test(
      key,
    ) ||
    key.includes("..")
  )
    throw new Error("非法资源路径");
  const path = resolve(realRoot, "assets", key);
  const rel = relative(realRoot, path);
  if (rel.startsWith(".." + sep) || rel === "..")
    throw new Error("资源路径越界");
  // Reject symlink traversal, including an existing parent directory.
  let cursor = realRoot;
  for (const part of relative(realRoot, dirname(path)).split(sep)) {
    cursor = resolve(cursor, part);
    try {
      if ((await lstat(cursor)).isSymbolicLink())
        throw new Error("备份目录不允许符号链接");
    } catch (e) {
      if (e.code !== "ENOENT") throw e;
      if (create) await mkdir(cursor);
      else throw e;
    }
  }
  try {
    if ((await lstat(path)).isSymbolicLink())
      throw new Error("资源不允许符号链接");
  } catch (e) {
    if (e.code !== "ENOENT") throw e;
  }
  return path;
}
if (action === "export") {
  const manifest = await (await api("/api/admin/v3/export")).json();
  for (const asset of manifest.assets) {
    const bytes = Buffer.from(
      await (
        await api(`/api/admin/v3/assets?key=${encodeURIComponent(asset.key)}`)
      ).arrayBuffer(),
    );
    asset.sha256 = digest(bytes);
    asset.size = bytes.length;
    delete asset.url;
    await writeFile(await assetPath(asset.key, true), bytes, { flag: "wx" });
  }
  await writeFile(
    resolve(realRoot, "manifest.json"),
    JSON.stringify(manifest, null, 2) + "\n",
    { flag: "wx" },
  );
  console.log(`完整备份：${manifest.assets.length} 个资源。`);
} else {
  const manifest = JSON.parse(
    await readFile(resolve(realRoot, "manifest.json"), "utf8"),
  );
  if (
    manifest.format !== "idv-content" ||
    manifest.formatVersion !== 1 ||
    !Array.isArray(manifest.assets)
  )
    throw new Error("备份格式不合法");
  // Validate every local file before any remote mutation.
  for (const asset of manifest.assets) {
    const b = await readFile(await assetPath(asset.key));
    if (digest(b) !== asset.sha256 || b.length !== asset.size)
      throw new Error(`资源校验失败：${asset.key}`);
  }
  const current = await (await api("/api/admin/v3/maps")).json();
  for (const asset of manifest.assets) {
    const b = await readFile(await assetPath(asset.key));
    await api(`/api/admin/v3/assets?key=${encodeURIComponent(asset.key)}`, {
      method: "PUT",
      headers: {
        "Content-Type": "image/webp",
        "X-Content-SHA256": asset.sha256,
      },
      body: b,
    });
  }
  const r = await api("/api/admin/v3/import", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ baseVersion: current.version, manifest }),
  });
  console.log(`已恢复内容版本 ${(await r.json()).version}；统计未更改。`);
}
