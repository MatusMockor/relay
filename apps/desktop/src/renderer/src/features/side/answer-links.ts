import { type ThreadId, ThreadIdSchema } from '@relay/shared';

export type AnswerPart =
  | { readonly kind: 'text'; readonly text: string }
  | { readonly kind: 'thread'; readonly threadId: ThreadId };

export interface ParsedAnswer {
  readonly parts: readonly AnswerPart[];
  readonly related: readonly ThreadId[];
}

const MARKER = /\[thread:([^\]\s]+)\]/g;

const textPart = (text: string): AnswerPart[] => (text === '' ? [] : [{ kind: 'text', text }]);

export const parseAnswer = (text: string, references: readonly ThreadId[]): ParsedAnswer => {
  const parts: AnswerPart[] = [];
  const inline = new Set<ThreadId>();
  let cursor = 0;
  for (const match of text.matchAll(MARKER)) {
    const parsed = ThreadIdSchema.safeParse(match[1]);
    if (!parsed.success) {
      continue;
    }
    parts.push(...textPart(text.slice(cursor, match.index)));
    parts.push({ kind: 'thread', threadId: parsed.data });
    inline.add(parsed.data);
    cursor = match.index + match[0].length;
  }
  parts.push(...textPart(text.slice(cursor)));
  return { parts, related: [...new Set(references)].filter((id) => !inline.has(id)) };
};
