// Mutates and restores the in-memory local verification fixture only.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

const base = process.env.TEST_URL || "http://127.0.0.1:8787";
if (!["127.0.0.1", "localhost"].includes(new URL(base).hostname)) throw new Error("Use local verification fixtures only");
const admin = () => fetch(`${base}/api/admin/v3/maps`).then(r => r.json());
const original = await admin();
let current = original;
async function save(config, status = 200) {
  const response = await fetch(`${base}/api/admin/v3/maps`, {
    method: "PUT", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ baseVersion: current.version, config }),
  });
  const result = await response.json();
  assert.equal(response.status, status, JSON.stringify(result));
  if (status === 200) current = result;
  return result;
}
const publicConfig = async (version = 5) => {
  const response = await fetch(`${base}/maps-v${version}.json`);
  assert.equal(response.status, 200);
  return response.json();
};
const keys = config => [...new Set(config.layouts.flatMap(l => [
  ...Object.values(l.floorImages).map(a => a.key), ...l.entrances.flatMap(e => [e.image?.key, e.thumb?.key]),
]).filter(Boolean))].sort();
const visit = async (layout, entrance, status) => {
  const response = await fetch(`${base}/telemetry/events`, {
    method: "POST", headers: { "Content-Type": "application/json", Origin: new URL(base).origin },
    body: JSON.stringify({ eventId: randomUUID(), layoutId: layout.id, entranceId: entrance.id }),
  });
  assert.equal(response.status, status, await response.text());
};

try {
  assert.equal(current.entranceRulesVersion, 2);
  let candidate = structuredClone(current);
  const mapId = "lady-of-doom";
  let map = candidate.gameMaps.find(m => m.id === mapId);
  assert(map);
  map.entranceRules.hard.enabled = ["side"];
  const layout = candidate.layouts.find(l => l.gameMapId === mapId && l.mode === "hard" && l.published && !l.deletedAt);
  assert(layout);
  // A published layout can have just the currently visible entrance, while a
  // second entrance is unfinished in the same record.
  layout.entrances = [layout.entrances.find(e => e.type === "side"), { id: `${layout.id}-front`, type: "front", direction: "south" }];
  await save(candidate);
  let published = await publicConfig();
  assert.equal(published.layouts.find(l => l.id === layout.id).entrances.length, 1);
  assert(published.layouts.filter(l => l.mode === "hard" && l.gameMapId === mapId).every(l => l.entrances.every(e => e.type === "side")));

  candidate = structuredClone(current);
  candidate.gameMaps.find(m => m.id === mapId).entranceRules.hard.enabled = ["front", "side", "upstairs"];
  await save(candidate);
  published = await publicConfig();
  assert.deepEqual(published.gameMaps.find(m => m.id === mapId).enabledEntrances.hard, ["front", "side", "upstairs"]);
  assert.deepEqual(published.gameMaps.find(m => m.id === "second").enabledEntrances.hard, ["side"]);
  assert.equal(published.layouts.find(l => l.id === layout.id).entrances.length, 1);
  const fullLayout = current.layouts.find(l => l.gameMapId === mapId && l.mode === "hard" && l.published && l.id !== layout.id && l.entrances.some(e => e.type === "front"));
  const front = fullLayout.entrances.find(e => e.type === "front");
  await visit(fullLayout, front, 204);
  assert((await publicConfig(4)).layouts.filter(l => l.gameMapId === mapId && l.mode === "hard").every(l => l.entrances.every(e => e.type === "side")));

  // Closing side hides the side-only layout without destroying its published
  // record, while other front/upstairs layouts continue to work.
  candidate = structuredClone(current);
  candidate.gameMaps.find(m => m.id === mapId).entranceRules.hard.enabled = ["front", "upstairs"];
  await save(candidate);
  assert(!(await publicConfig()).layouts.some(l => l.id === layout.id));
  assert(current.layouts.find(l => l.id === layout.id).published);

  candidate = structuredClone(current);
  const hardSelection = [...candidate.gameMaps.find(m => m.id === mapId).entranceRules.hard.enabled];
  candidate.gameMaps.find(m => m.id === mapId).modeVisibility.hard = false;
  await save(candidate);
  assert.deepEqual(current.gameMaps.find(m => m.id === mapId).entranceRules.hard.enabled, hardSelection);
  assert(!(await publicConfig()).layouts.some(l => l.gameMapId === mapId && l.mode === "hard"));
  await visit(fullLayout, front, 400);
  candidate = structuredClone(current);
  candidate.gameMaps.find(m => m.id === mapId).modeVisibility.hard = true;
  await save(candidate);
  assert.deepEqual((await publicConfig()).gameMaps.find(m => m.id === mapId).enabledEntrances.hard, hardSelection);
  candidate = structuredClone(current);
  candidate.gameMaps.find(m => m.id === mapId).modeVisibility = { hard: false, nightmare: false };
  await save(candidate);
  assert(!(await publicConfig()).gameMaps.some(m => m.id === mapId));

  const invalid = structuredClone(current);
  invalid.gameMaps.find(m => m.id === mapId).entranceRules.hard.allowed = ["front"];
  assert.equal((await save(invalid, 400)).error, "invalid_config");
  const outdated = structuredClone(current);
  delete outdated.entranceRulesVersion;
  for (const m of outdated.gameMaps) delete m.entranceRules;
  for (const m of outdated.gameMaps) delete m.modeVisibility;
  assert.equal((await save(outdated, 409)).error, "admin_upgrade_required");
  const backups = await (await fetch(`${base}/api/admin/v3/backups`)).json();
  assert(backups.backups.length);
  const exported = await (await fetch(`${base}/api/admin/v3/export`)).json();
  assert.deepEqual(exported.config.gameMaps, current.gameMaps);
  assert(!JSON.stringify(await publicConfig()).includes('"allowed"'));
  console.log("PASS: incremental recording, map isolation, entry ordering, last-entry closure, V4 degradation, statistics, writer guard, backups/export.");
} finally {
  current = await admin();
  await save(original);
  const restored = await admin();
  assert.deepEqual(restored.layouts, original.layouts);
  assert.deepEqual(restored.gameMaps, original.gameMaps);
  assert.deepEqual(keys(restored), keys(original));
  console.log("PASS: local fixture restored without changing IDs, publication flags or media references.");
}
