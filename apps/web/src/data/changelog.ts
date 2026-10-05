import markdown from "../../../../docs/CHANGELOG.md?raw";
import { parseChangelog } from "./parse-changelog";

export const changelog = parseChangelog(markdown);
export const latestUpdate = changelog[0];
