export const collect = async <Item>(iterable: AsyncIterable<Item>): Promise<Item[]> => {
  const items: Item[] = [];
  for await (const item of iterable) {
    items.push(item);
  }
  return items;
};
