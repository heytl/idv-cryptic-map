import { afterEach, describe, expect, it, vi } from "vitest";
import { returnToHandbookPage } from "./handbook-navigation";

afterEach(() => vi.unstubAllGlobals());
function setup(routes: string[]) {
  const navigation = { navigateBack: vi.fn(), redirectTo: vi.fn() };
  vi.stubGlobal("uni", navigation);
  vi.stubGlobal("getCurrentPages", () => routes.map(route => ({ route })));
  return navigation;
}
describe("handbook return navigation", () => {
  it("returns to the existing catalog without losing its state", () => {
    const navigation = setup(["pages/maps/index", "pages/about/index", "pages/changelog/index"]);
    returnToHandbookPage("maps");
    expect(navigation.navigateBack).toHaveBeenCalledWith(expect.objectContaining({ delta: 2 }));
    expect(navigation.redirectTo).not.toHaveBeenCalled();
  });
  it("returns from the archive to the existing about page", () => {
    const navigation = setup(["pages/maps/index", "pages/about/index", "pages/changelog/index"]);
    returnToHandbookPage("about");
    expect(navigation.navigateBack).toHaveBeenCalledWith(expect.objectContaining({ delta: 1 }));
  });
  it("opens the about page when the archive was entered directly", () => {
    const navigation = setup(["pages/changelog/index"]);
    returnToHandbookPage("about");
    expect(navigation.redirectTo).toHaveBeenCalledWith({ url: "/pages/about/index" });
    expect(navigation.navigateBack).not.toHaveBeenCalled();
  });
  it("falls back to the requested page if native back navigation fails", () => {
    const navigation = setup(["pages/maps/index", "pages/about/index"]);
    returnToHandbookPage("maps");
    navigation.navigateBack.mock.calls[0]![0].fail();
    expect(navigation.redirectTo).toHaveBeenCalledWith({ url: "/pages/maps/index" });
  });
});
