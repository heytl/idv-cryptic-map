import { readFile, writeFile } from "node:fs/promises";

const databaseId = process.env.V3_PREVIEW_D1_ID;
if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(databaseId || "")) {
  throw new Error("Set the GitHub Actions repository variable V3_PREVIEW_D1_ID to the UUID of the isolated idv-map-stats-preview database.");
}

const path = new URL("../wrangler.jsonc", import.meta.url);
const config = await readFile(path, "utf8");
const environmentStart = config.indexOf('"v2-preview": {');
if (environmentStart < 0) throw new Error("Missing v2-preview Wrangler environment");
const binding = '"database_name": "idv-map-stats-preview", "migrations_dir": "workers/migrations"';
const bindingIndex = config.indexOf(binding, environmentStart);
if (bindingIndex < 0) throw new Error("Missing preview STATS D1 binding");
const updated = config.slice(0, bindingIndex) +
  '"database_name": "idv-map-stats-preview", "database_id": "' + databaseId + '", "migrations_dir": "workers/migrations"' +
  config.slice(bindingIndex + binding.length);
await writeFile(path, updated);
console.log("Configured the isolated v2-preview STATS binding for this CI run.");
