export type Deferred<T> = {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (error: Error) => void;
  settled: () => boolean;
};

export function createDeferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  let isSettled = false;

  const promise = new Promise<T>((res, rej) => {
    resolve = (value: T) => {
      if (isSettled) return;
      isSettled = true;
      res(value);
    };
    reject = (error: Error) => {
      if (isSettled) return;
      isSettled = true;
      rej(error);
    };
  });

  return {
    promise,
    resolve,
    reject,
    settled: () => isSettled
  };
}
