import { describe, it, expect, vi } from "vitest";
import { createVisitTracker } from "./telemetry";
describe("layout visit semantics", () => {
  const a = { gameMapId: "one", layoutId: 1, entranceId: "1-side" };
  it("counts entry, re-entry and new layouts, not floor/entrance changes", () => {
    const send = vi.fn();
    const t = createVisitTracker(send, () => "uuid");
    t.navigate(a, true, true);
    t.navigate(a, true, true);
    t.navigate({ ...a, entranceId: "1-front" }, true, true);
    expect(send).toHaveBeenCalledTimes(1);
    t.navigate(null, true, true);
    t.navigate(a, true, true);
    t.navigate({ ...a, layoutId: 2 }, true, true);
    expect(send).toHaveBeenCalledTimes(3);
    const refresh = createVisitTracker(send, () => "new");
    refresh.navigate(a, true, true);
    expect(send).toHaveBeenCalledTimes(4);
  });
  it("waits for visibility and does not replay offline visits", () => {
    const send = vi.fn();
    const t = createVisitTracker(send, () => "uuid");
    t.navigate(a, false, true);
    expect(send).not.toHaveBeenCalled();
    t.navigate(a, true, false);
    t.navigate(a, true, true);
    expect(send).not.toHaveBeenCalled();
    t.navigate({ ...a, layoutId: 2 }, false, true);
    t.navigate({ ...a, layoutId: 2 }, true, true);
    expect(send).toHaveBeenCalledTimes(1);
  });
});
