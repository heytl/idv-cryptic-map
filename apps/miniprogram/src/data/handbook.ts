import markdown from "../../../../docs/CHANGELOG.md?raw";
import { parseChangelog } from "@idv-map/shared";

export { projectInfo } from "@idv-map/shared";
export const changelog = parseChangelog(markdown);
export const latestUpdate = changelog[0];
