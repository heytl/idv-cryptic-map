// Reuse the Web SVG paths, rasterized for WeChat's local image component.
import { readFile, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const viewport = await readFile(new URL("../../web/src/components/MapViewport.vue", import.meta.url), "utf8");
const density = await readFile(new URL("../../web/src/components/DensitySwitch.vue", import.meta.url), "utf8");
const handbook = await readFile(new URL("../../web/src/components/HandbookIcon.vue", import.meta.url), "utf8");
// Extract the literal path map only; never evaluate component source.
const pathMap = handbook.match(/const paths = \{([\s\S]*?)\n\};/)?.[1];
if (!pathMap) throw new Error("Missing Web handbook icon paths.");
const handbookIcons = Object.fromEntries([...pathMap.matchAll(/(?:"([\w-]+)"|(\w+)):\s*"([^"]+)"/g)].map(([, quoted, bare, path]) => [quoted || bare,
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="${path}"/></svg>`]));
if (Object.keys(handbookIcons).length !== 9) throw new Error("Incomplete Web handbook icon paths.");
function iconInButton(source, selector) {
  const marker = source.indexOf(selector);
  const start = source.lastIndexOf("<svg", marker);
  const button = source.lastIndexOf("<button", marker);
  const svg = source.slice(start > button ? start : marker).match(/<svg\b[\s\S]*?<\/svg>/)?.[0];
  if (marker < 0 || !svg) throw new Error(`Missing Web icon: ${selector}`);
  return svg.replace(/\s(?:v-[\w-]+|:[\w-]+)(?:="[^"]*")?/g, "");
}
const icons = {
  ...handbookIcons,
  comfort: iconInButton(density, 'data-density="comfort"'),
  compact: iconInButton(density, 'data-density="compact"'),
  expand: iconInButton(viewport, 'class="fullscreen-icon-expand"'),
  compress: iconInButton(viewport, 'class="fullscreen-icon-compress"'),
  rotate: iconInButton(viewport, 'class="tool-btn rotate-btn"'),
  reset: iconInButton(viewport, 'class="tool-btn reset-btn"'),
  plus: iconInButton(viewport, 'class="tool-btn zoom-in-btn"'),
  minus: iconInButton(viewport, 'class="tool-btn zoom-out-btn"'),
  close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M6 18L18 6"/></svg>',
};
const output = new URL("../src/static/icons/", import.meta.url);
await mkdir(output, { recursive: true });
let generated = 0;
for (const [name, svg] of Object.entries(icons)) {
  for (const [tone, color] of Object.entries({ brass: "#c3a168", ink: "#0a0b0d", light: "#d1c7b7" })) {
    // Handbook pages only use brass, plus the light archive chevron.
    if (name in handbookIcons && tone !== "brass" && !(name === "chevron" && tone === "light")) continue;
    let source = svg.replace("<svg", '<svg xmlns="http://www.w3.org/2000/svg"').replaceAll("currentColor", color);
    // Density SVGs inherit fill in Web CSS; include it explicitly in image assets.
    if (name === "comfort" || name === "compact") source = source.replace("<svg", `<svg fill="${color}"`);
    await sharp(Buffer.from(source), { density: 288 }).resize(72, 72).png().toFile(fileURLToPath(new URL(`${name}-${tone}.png`, output)));
    generated++;
  }
}
console.log(`Generated ${generated} UI icon assets.`);
