const DEFAULT_CHUNK_SIZE = 500;

export const chunked = <Item>(items: readonly Item[], size = DEFAULT_CHUNK_SIZE): Item[][] => {
  const chunks: Item[][] = [];
  for (let start = 0; start < items.length; start += size) {
    chunks.push(items.slice(start, start + size));
  }
  return chunks;
};
