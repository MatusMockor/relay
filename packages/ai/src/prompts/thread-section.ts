import type { ThreadId } from '@relay/shared/domain';
import { COMMON_TEXTS } from './common-texts';
import type { PromptContext } from './prompt-spec';
import { renderThread } from './thread-renderer';
import { wrapUntrusted } from './untrusted-content';

export function threadSection(threadId: ThreadId, context: PromptContext): string {
  const texts = COMMON_TEXTS[context.language];
  if (context.thread === null || context.thread.thread.id !== threadId) {
    return texts.fetchThread(threadId);
  }
  return `${texts.threadIntro}\n${wrapUntrusted(renderThread(context.thread), context.nonce)}`;
}
