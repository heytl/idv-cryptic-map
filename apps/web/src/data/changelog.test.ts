import { describe, it, expect } from "vitest";
import { changelog, latestUpdate } from "./changelog";
import { parseChangelog } from "./parse-changelog";

const record = (date: string, version: string, body = "- 一条更新") =>
  `## ${date} | ${version} | 开发预览\n### 更新标题\n${body}`;

describe("document-backed changelog", () => {
  it("validates the actual Markdown source and keeps newest first", () => {
    expect(changelog.length).toBeGreaterThan(0);
    expect(latestUpdate).toBe(changelog[0]);
    expect(changelog.map((entry) => entry.date)).toEqual(
      changelog
        .map((entry) => entry.date)
        .sort()
        .reverse(),
    );
  });

  it("accepts CRLF, ignores maintenance comments and preserves same-day order", () => {
    const md = `# 更新日志\n<!-- ${record("2099-01-01", "隐藏示例")} -->\n${record("2026-08-23", "旧版")}\n${record("2026-10-04", "V3")}\n${record("2026-10-04", "小程序")}`;
    expect(
      parseChangelog(md.replaceAll("\n", "\r\n")).map((entry) => entry.version),
    ).toEqual(["V3", "小程序", "旧版"]);
  });

  it("reads paragraphs, subsections and multiple lists without executing markup", () => {
    const [entry] = parseChangelog(
      record(
        "2026-10-04",
        "V3",
        "说明第一行\n第二行\n\n#### 修复\n- 第一项\n- 第二项\n\n补充说明\n\n* <script>alert(1)</script>",
      ),
    );
    expect(entry!.blocks).toEqual([
      { type: "paragraph", text: "说明第一行 第二行" },
      { type: "heading", text: "修复" },
      { type: "list", items: ["第一项", "第二项"] },
      { type: "paragraph", text: "补充说明" },
      { type: "list", items: ["<script>alert(1)</script>"] },
    ]);
  });

  it.each([
    record("2026-02-30", "V3"),
    "## 2026-10-04 | V3\n### 标题\n- 内容",
    "## 2026-10-04 | V3 | 开发预览\n- 缺少标题",
    "## 2026-10-04 | V3 | 开发预览\n### 缺少正文",
    `${record("2026-10-04", "V3")}\n${record("2026-10-04", "V3")}`,
  ])("rejects malformed records instead of silently losing content", (md) => {
    expect(() => parseChangelog(md)).toThrow(/CHANGELOG\.md/);
  });

  it("supports a growing archive without truncating entries", () => {
    const md = Array.from({ length: 25 }, (_, index) =>
      record("2026-10-04", `版本 ${index}`),
    ).join("\n\n");
    expect(parseChangelog(md)).toHaveLength(25);
  });
});
