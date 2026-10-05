export type HandbookPage = "maps" | "about";

/** Reuse the existing page so returning to the catalog preserves its filters. */
export function returnToHandbookPage(page: HandbookPage) {
  const route = `pages/${page}/index`;
  const pages = getCurrentPages();
  const index = pages.slice(0, -1).map(item => item.route).lastIndexOf(route);
  const open = () => uni.redirectTo({ url: `/${route}` });
  if (index < 0) open();
  else uni.navigateBack({ delta: pages.length - 1 - index, fail: open });
}
