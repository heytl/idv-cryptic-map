import { afterEach, describe, expect, it, vi } from 'vitest';
import { createPullRefresh } from './pull-refresh';

afterEach(() => { vi.useRealTimers(); });
describe('map pull refresh', () => {
  it('cancels a short pull without requesting data', () => {
    const request = vi.fn();
    const state = createPullRefresh(request, () => false);
    state.pulling({ detail: { dy: 40 } });
    expect(state.phase.value).toBe('pull');
    state.pulling({ detail: { dy: 110 } });
    expect(state.phase.value).toBe('ready');
    state.pulling({ detail: { dy: 30 } });
    state.reset();
    expect(state.progress.value).toBe(0);
    expect(request).not.toHaveBeenCalled();
  });
  it.each([true, false])('finishes with success=%s, releases the native refresher and permits another refresh', async success => {
    vi.useFakeTimers();
    let finish!: (value: boolean) => void;
    const request = vi.fn(() => new Promise<boolean>(resolve => { finish = resolve; }));
    const state = createPullRefresh(request, () => false);
    const pending = state.refresh();
    expect(state.triggered.value).toBe(true);
    await state.refresh();
    state.reset();
    expect(request).toHaveBeenCalledTimes(1);
    expect(state.phase.value).toBe('loading');
    finish(success);
    await vi.advanceTimersByTimeAsync(900);
    expect(state.phase.value).toBe(success ? 'success' : 'error');
    await vi.runAllTimersAsync();
    await pending;
    expect(state.triggered.value).toBe(false);
    state.reset();
    const second = state.refresh();
    expect(request).toHaveBeenCalledTimes(2);
    finish(true);
    await vi.runAllTimersAsync();
    await second;
    state.dispose();
  });
  it('releases a native refresh attempted during initial loading', async () => {
    const request = vi.fn();
    const state = createPullRefresh(request, () => true);
    const pending = state.refresh();
    expect(state.triggered.value).toBe(true);
    await pending;
    expect(state.triggered.value).toBe(false);
    expect(request).not.toHaveBeenCalled();
  });
  it('recovers from a thrown request and disposes pending animation timers', async () => {
    vi.useFakeTimers();
    const state = createPullRefresh(async () => { throw new Error('offline'); }, () => false);
    const pending = state.refresh();
    await vi.advanceTimersByTimeAsync(900);
    expect(state.phase.value).toBe('error');
    state.dispose();
    await pending;
    expect(vi.getTimerCount()).toBe(0);
  });
});
