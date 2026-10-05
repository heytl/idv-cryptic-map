export type ChangelogBlock =
  | { type: "paragraph" | "heading"; text: string }
  | { type: "list"; items: string[] };

export interface ChangelogEntry {
  id: string;
  date: string;
  version: string;
  status: string;
  title: string;
  blocks: ChangelogBlock[];
}

/** Parse the documented changelog format into text blocks; never render raw HTML. */
export function parseChangelog(markdown: string): ChangelogEntry[] {
  const entries: ChangelogEntry[] = [];
  let current: ChangelogEntry | undefined;
  let separated = true;
  const lines = markdown
    .replace(/\r\n?/g, "\n")
    .replace(/<!--[\s\S]*?-->/g, (comment) => comment.replace(/[^\n]/g, ""))
    .split("\n");
  for (const [index, line] of lines.entries()) {
    const text = line.trim();
    const fail = (reason: string): never => {
      throw new Error(`CHANGELOG.md 第 ${index + 1} 行：${reason}`);
    };
    if (!text) {
      separated = true;
      continue;
    }
    if (/^#\s/.test(text) && !current) continue;
    if (/^##\s/.test(text)) {
      const fields = text
        .slice(3)
        .split("|")
        .map((value) => value.trim());
      const [date, version, status] = fields;
      if (
        fields.length !== 3 ||
        !date ||
        !version ||
        !status ||
        !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
        !Number.isFinite(Date.parse(date)) ||
        new Date(date).toISOString().slice(0, 10) !== date
      ) {
        fail(
          "记录标题应为「## YYYY-MM-DD | 版本号 | 发布状态」，日期必须有效。",
        );
      }
      current = {
        id: `${date}-${version}`,
        date: date!,
        version: version!,
        status: status!,
        title: "",
        blocks: [],
      };
      entries.push(current);
      separated = true;
      continue;
    }
    if (!current) fail("内容需放在一条更新记录中。");
    const entry = current!;
    if (/^###\s/.test(text)) {
      if (entry.title || entry.blocks.length)
        fail("每条记录仅使用一个 ### 更新标题。");
      entry.title = text.slice(4).trim();
      separated = true;
      continue;
    }
    if (!entry.title) fail("请先填写 ### 更新标题。");
    const last = entry.blocks.at(-1);
    if (/^####\s/.test(text)) {
      entry.blocks.push({ type: "heading", text: text.slice(5).trim() });
    } else if (/^[-*]\s/.test(text)) {
      const item = text.slice(2).trim();
      if (last?.type === "list" && !separated) last.items.push(item);
      else entry.blocks.push({ type: "list", items: [item] });
    } else {
      if (/^#/.test(text)) fail("正文小标题使用 ####。");
      if (last?.type === "paragraph" && !separated) last.text += ` ${text}`;
      else entry.blocks.push({ type: "paragraph", text });
    }
    separated = false;
  }
  const ids = new Set<string>();
  for (const entry of entries) {
    if (
      !entry.title ||
      !entry.blocks.some((block) => block.type !== "heading")
    ) {
      throw new Error(`CHANGELOG.md：${entry.id} 缺少更新标题或正文。`);
    }
    if (ids.has(entry.id))
      throw new Error(`CHANGELOG.md：日期与版本重复 ${entry.id}。`);
    ids.add(entry.id);
  }
  return entries.sort((a, b) => b.date.localeCompare(a.date));
}
