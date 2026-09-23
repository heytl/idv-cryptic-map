import { createHash } from "node:crypto";
import { mkdir, readFile, realpath, writeFile } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { spawn } from "node:child_process";

const [sourceArg, outputArg] = process.argv.slice(2);
if (!sourceArg || !outputArg) {
  throw new Error("用法: node scripts/prepare-v2-content-for-v3.mjs <正式 maps-v2.json URL> <新建的迁移包目录>");
}
const sourceUrl = new URL(sourceArg);
if (sourceUrl.protocol !== "https:" || sourceUrl.pathname !== "/maps-v2.json") {
  throw new Error("来源必须是 HTTPS /maps-v2.json 公开接口");
}
const root = resolve(import.meta.dirname, "..");
const sourceBase = sourceUrl.origin;
const outputDir = resolve(outputArg);
const workPrefix = join(dirname(outputDir), basename(outputDir));
const internalV2Path = `${workPrefix}-internal-v2.json`;
const convertedPath = `${workPrefix}-converted-v3.json`;

async function fetchOk(url) {
  const response = await fetch(url, { headers: { "Cache-Control": "no-cache" } });
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
  return response;
}

function assetKey(raw) {
  const url = new URL(raw, sourceBase);
  if (url.origin !== sourceBase) throw new Error(`非来源站点媒体地址：${url.origin}`);
  const match = url.pathname.match(/^\/r2\/(maps\/(?:entrance|entrance-thumb|entry|entry-thumb|full|floor1|floor2|layout\/(?:full|basement|floor1|floor2))\/[^/]+\.webp)$/);
  if (!match || match[1].includes("..")) throw new Error(`图片路径不合法：${url.pathname}`);
  return match[1];
}

function convertPublicV2(source) {
  if (source.schemaVersion !== 2 || !Array.isArray(source.maps) || !Number.isInteger(source.dataVersion)) {
    throw new Error("来源不是预期的 V2 公开地图配置");
  }
  const maps = source.maps.map((item) => ({
    id: item.id,
    mode: item.mode,
    name: item.name,
    displayName: item.displayName,
    remarks: item.remarks,
    sort: item.sort,
    published: true,
    legacyNames: item.legacyNames ?? [],
    layout: Object.fromEntries(Object.entries(item.layout).map(([floor, asset]) => [floor, { key: assetKey(asset.url) }])),
    entrances: item.entrances.map((entry) => ({
      id: entry.id,
      type: entry.type,
      direction: entry.direction,
      ...(entry.passage ? { passage: entry.passage } : {}),
      image: { key: assetKey(entry.imageUrl) },
      thumb: { key: assetKey(entry.thumbUrl) },
    })),
  }));
  return { schemaVersion: 2, version: source.dataVersion, updatedAt: source.updatedAt, maps };
}

function runMigration() {
  return new Promise((resolveRun, rejectRun) => {
    const child = spawn(process.execPath, ["scripts/migrate-v2-to-v3.mts", internalV2Path, convertedPath], {
      cwd: root,
      stdio: "inherit",
    });
    child.on("error", rejectRun);
    child.on("close", (code) => code === 0 ? resolveRun() : rejectRun(new Error(`V2→V3 转换失败（exit ${code}）`)));
  });
}

await mkdir(dirname(outputDir), { recursive: true });
const source = await (await fetchOk(sourceUrl)).json();
const internalV2 = convertPublicV2(source);
await writeFile(internalV2Path, JSON.stringify(internalV2, null, 2) + "\n", { flag: "wx" });
await runMigration();
const config = JSON.parse(await readFile(convertedPath, "utf8"));
const assetKeys = new Set();
for (const item of config.layouts) {
  for (const value of Object.values(item.floorImages)) if (value?.key) assetKeys.add(value.key);
  for (const entrance of item.entrances) {
    if (entrance.image?.key) assetKeys.add(entrance.image.key);
    if (entrance.thumb?.key) assetKeys.add(entrance.thumb.key);
  }
}
const keys = [...assetKeys].sort();
const nightmare = config.layouts.filter((item) => item.mode === "nightmare").length;
console.log(`公开版本 ${source.dataVersion}：${config.layouts.length} 张地图（困难 ${config.layouts.length - nightmare}，噩梦 ${nightmare}），${keys.length} 个图片资源。`);

await mkdir(outputDir, { recursive: false });
const realOutput = await realpath(outputDir);
const records = new Array(keys.length);
let next = 0;
await Promise.all(Array.from({ length: 8 }, async () => {
  while (true) {
    const index = next++;
    if (index >= keys.length) return;
    const key = keys[index];
    const response = await fetchOk(`${sourceBase}/r2/${key.split("/").map(encodeURIComponent).join("/")}`);
    const bytes = Buffer.from(await response.arrayBuffer());
    if (!bytes.length) throw new Error(`来源图片为空：${key}`);
    const path = resolve(realOutput, "assets", key);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, bytes, { flag: "wx" });
    records[index] = { key, sha256: createHash("sha256").update(bytes).digest("hex"), size: bytes.length };
    if ((index + 1) % 25 === 0 || index + 1 === keys.length) console.log(`已下载来源图片 ${index + 1}/${keys.length}`);
  }
}));
await writeFile(join(realOutput, "manifest.json"), JSON.stringify({
  format: "idv-content",
  formatVersion: 1,
  config,
  assets: records,
}, null, 2) + "\n", { flag: "wx" });
console.log(`迁移包已生成：${realOutput}`);
