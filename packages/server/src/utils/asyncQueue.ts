type Pending<T> = {
  resolve: (result: IteratorResult<T>) => void;
  reject: (error: unknown) => void;
};

export type AsyncQueue<T> = {
  push: (value: T) => void;
  close: () => void;
  fail: (error: Error) => void;
  iterator: () => AsyncIterable<T>;
};

export function createAsyncQueue<T>(): AsyncQueue<T> {
  const values: T[] = [];
  const pending: Pending<T>[] = [];
  let done = false;
  let error: Error | null = null;

  const flushNext = () => {
    if (pending.length === 0) {
      return;
    }

    if (error) {
      pending.splice(0).forEach((waiter) => waiter.reject(error));
      return;
    }

    if (values.length > 0) {
      const value = values.shift()!;
      pending.shift()!.resolve({ value, done: false });
      return;
    }

    if (done) {
      pending.splice(0).forEach((waiter) =>
        waiter.resolve({ value: undefined as never, done: true })
      );
    }
  };

  const push = (value: T) => {
    if (done || error) {
      return;
    }

    if (pending.length > 0) {
      pending.shift()!.resolve({ value, done: false });
      return;
    }

    values.push(value);
  };

  const close = () => {
    if (done) return;
    done = true;
    flushNext();
  };

  const fail = (cause: Error) => {
    if (done && error) {
      return;
    }

    error = cause;
    done = true;
    flushNext();
  };

  const iterator = (): AsyncIterable<T> => ({
    [Symbol.asyncIterator]() {
      return {
        next: () => {
          if (values.length > 0) {
            const value = values.shift()!;
            return Promise.resolve({ value, done: false });
          }

          if (error) {
            return Promise.reject(error);
          }

          if (done) {
            return Promise.resolve({
              value: undefined as never,
              done: true
            });
          }

          return new Promise<IteratorResult<T>>((resolve, reject) => {
            pending.push({ resolve, reject });
          });
        },
        return: () => {
          close();
          return Promise.resolve({ value: undefined as never, done: true });
        },
        throw: (err) => {
          fail(err instanceof Error ? err : new Error(String(err)));
          return Promise.reject(err);
        }
      };
    }
  });

  return { push, close, fail, iterator };
}
