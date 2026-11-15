export const chunk = <Item>(items: readonly Item[], size: number): Item[][] => {
  const batches: Item[][] = [];
  for (let index = 0; index < items.length; index += size) {
    batches.push(items.slice(index, index + size));
  }
  return batches;
};

export const sortedUids = (uids: readonly number[] | false, minUid = 1): number[] => {
  if (uids === false) {
    return [];
  }
  return [...new Set(uids)].filter((uid) => uid >= minUid).sort((left, right) => left - right);
};
