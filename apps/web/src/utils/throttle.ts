/**
 * Throttle utility for GeoNoise
 * Rate-limits function calls with leading edge execution
 */

export type ThrottledFn<T extends (...args: never[]) => void> = ((...args: Parameters<T>) => void) & {
  flush: () => void;
  cancel: () => void;
};

/**
 * Creates a throttled version of a function that only invokes at most once per wait period.
 * Uses leading edge execution (fires immediately on first call) with trailing coalesce.
 */
export function throttle<T extends (...args: never[]) => void>(fn: T, waitMs: number): ThrottledFn<T> {
  let lastCall = 0;
  let timeoutId: number | null = null;
  let pendingArgs: Parameters<T> | null = null;

  const invoke = (args: Parameters<T>) => {
    lastCall = performance.now();
    pendingArgs = null;
    fn(...args);
  };

  // Leading call, then coalesce trailing updates.
  const throttled = ((...args: Parameters<T>) => {
    const now = performance.now();
    const remaining = waitMs - (now - lastCall);
    if (remaining <= 0 || remaining > waitMs) {
      if (timeoutId !== null) {
        window.clearTimeout(timeoutId);
        timeoutId = null;
      }
      invoke(args);
      return;
    }

    pendingArgs = args;
    if (timeoutId === null) {
      timeoutId = window.setTimeout(() => {
        timeoutId = null;
        if (pendingArgs) {
          invoke(pendingArgs);
        }
      }, remaining);
    }
  }) as ThrottledFn<T>;

  throttled.flush = () => {
    if (!pendingArgs) return;
    if (timeoutId !== null) {
      window.clearTimeout(timeoutId);
      timeoutId = null;
    }
    invoke(pendingArgs);
  };

  throttled.cancel = () => {
    if (timeoutId !== null) {
      window.clearTimeout(timeoutId);
      timeoutId = null;
    }
    pendingArgs = null;
  };

  return throttled;
}
