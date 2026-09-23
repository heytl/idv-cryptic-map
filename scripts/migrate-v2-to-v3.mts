import { readFileSync, writeFileSync } from "node:fs";
import {
  validateMapConfigV2,
  type MapConfigV2,
} from "../packages/shared/src/map-v2.ts";
// Pure file migration: never writes remote storage or changes the original baseline.
const [input, output] = process.argv.slice(2);
if (!input || !output)
  throw new Error("用法: pnpm migrate:v3 <V2 完整配置.json> <V3 输出.json>");
const source = JSON.parse(readFileSync(input, "utf8")) as MapConfigV2;
const result = validateMapConfigV2(source);
if (!result.valid) throw new Error(result.errors.join("\n"));
const config = {
  schemaVersion: 3,
  version: source.version,
  updatedAt: source.updatedAt,
  gameMaps: [
    { id: "lady-of-doom", name: "厄运之女", sort: 10, published: true },
  ],
  layouts: source.maps.map(({ layout, ...rest }) => ({
    ...rest,
    gameMapId: "lady-of-doom",
    floorImages: layout,
  })),
};
writeFileSync(output, JSON.stringify(config, null, 2) + "\n", { flag: "wx" });
console.log(`迁移 ${config.layouts.length} 个布局，保留全部 ID 和资源键。`);
