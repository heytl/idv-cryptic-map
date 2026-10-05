import { describe, expect, it } from "vitest";
import { changelog, latestUpdate, projectInfo } from "./handbook";
import { changelog as webChangelog } from "../../../web/src/data/changelog";
import { projectInfo as webProjectInfo } from "../../../web/src/data/project-info";

describe("shared Web / WeChat handbook", () => {
  it("ships every Web update and the same latest record", () => {
    expect(changelog.length).toBeGreaterThan(0);
    expect(changelog).toEqual(webChangelog);
    expect(latestUpdate).toBe(changelog[0]);
  });
  it("shares project metadata, release status and QR configuration", () => {
    expect(projectInfo).toBe(webProjectInfo);
    expect(projectInfo.website).toMatch(/^https:\/\//);
  });
});
