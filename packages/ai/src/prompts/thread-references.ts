import { ThreadIdSchema, type ThreadId } from '@relay/shared/domain';

const MARKER = /\[thread:([A-Za-z0-9_-]{1,128})\]/g;
const MAX_REFERENCES = 20;

export const threadMarkersIn = (text: string): ThreadId[] =>
  [...text.matchAll(MARKER)].flatMap((match) => {
    const parsed = ThreadIdSchema.safeParse(match[1]);
    return parsed.success ? [parsed.data] : [];
  });

export const mergeReferences = (declared: readonly ThreadId[], text: string): ThreadId[] =>
  [...new Set([...declared, ...threadMarkersIn(text)])].slice(0, MAX_REFERENCES);
