import { afterEach, expect, it, vi } from "vitest";
import { createPreviewIdle } from "./preview-idle";
afterEach(() => vi.useRealTimers());

it("waits for a loaded, visible page and a quiet interval after the gesture ends", async () => {
  vi.useFakeTimers();
  const idle = createPreviewIdle(); const work = vi.fn();
  const pending = idle.wait().then(work);
  await vi.advanceTimersByTimeAsync(1000);
  expect(work).not.toHaveBeenCalled();
  idle.setReady(true);
  await vi.advanceTimersByTimeAsync(500);
  idle.setInteracting(true);
  await vi.advanceTimersByTimeAsync(1000);
  expect(work).not.toHaveBeenCalled();
  idle.setInteracting(false);
  await vi.advanceTimersByTimeAsync(599);
  expect(work).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(1); await pending;
  expect(work).toHaveBeenCalledTimes(1);
  // Subsequent stages can proceed without paying another quiet interval.
  const next = idle.wait().then(work);
  await vi.advanceTimersByTimeAsync(0); await next;
  expect(work).toHaveBeenCalledTimes(2);
});

it("pauses in the background, restarts the interval for button activity, and releases on disposal", async () => {
  vi.useFakeTimers();
  const idle = createPreviewIdle(); const work = vi.fn();
  idle.setReady(true);
  const pending = idle.wait().then(work);
  idle.setForeground(false);
  await vi.advanceTimersByTimeAsync(2000);
  expect(work).not.toHaveBeenCalled();
  idle.setForeground(true);
  await vi.advanceTimersByTimeAsync(400);
  idle.activity();
  await vi.advanceTimersByTimeAsync(599);
  expect(work).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(1); await pending;
  idle.setInteracting(true);
  const stopped = idle.wait().then(work);
  idle.dispose(); await stopped;
  expect(work).toHaveBeenCalledTimes(2);
  expect(vi.getTimerCount()).toBe(0);
});
