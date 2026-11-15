import type { ThreadDetail } from '@relay/shared/domain';
import type { z } from 'zod';
import type { MailToolName } from './mail-tools';
import type { PromptLanguage } from './prompt-language';

export interface PromptContext {
  readonly language: PromptLanguage;
  readonly nonce: string;
  readonly thread: ThreadDetail | null;
}

export interface PromptSpec<Input, Response, Output> {
  readonly kind: string;
  readonly responseSchema: z.ZodType<Response>;
  readonly tools: readonly MailToolName[];
  readonly languageRule: 'output' | 'source';
  task(input: Input, context: PromptContext): string;
  content(input: Input, context: PromptContext): readonly string[];
  toOutput(response: Response, input: Input): Output;
}
