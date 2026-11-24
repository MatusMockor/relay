let draftCount = 0;

export const nextDraftKey = (): string => {
  draftCount += 1;
  return `draft-${String(draftCount)}`;
};
