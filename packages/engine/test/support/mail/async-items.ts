export async function* asyncItems<Item>(items: readonly Item[]): AsyncIterable<Item> {
  for (const item of items) {
    yield await Promise.resolve(item);
  }
}

export const failingItems = <Item>(error: Error): AsyncIterable<Item> => ({
  [Symbol.asyncIterator]: () => ({ next: () => Promise.reject(error) }),
});
