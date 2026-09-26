/** Rejects with the error built by `makeError` if `promise` has not settled within `timeoutMs`; the timer is always cleared. `onTimeout` runs only on expiry, `onSettled` runs once on any outcome. */
export function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  makeError: () => Error,
  onTimeout?: () => void,
  onSettled?: () => void
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      onTimeout?.();
      onSettled?.();
      reject(makeError());
    }, timeoutMs);
    Promise.resolve(promise).then(
      (value) => {
        clearTimeout(timer);
        onSettled?.();
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        onSettled?.();
        reject(err);
      }
    );
  });
}
