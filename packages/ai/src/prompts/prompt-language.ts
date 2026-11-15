import { z } from 'zod';

export const PromptLanguageSchema = z.enum(['sk', 'en']);
export type PromptLanguage = z.infer<typeof PromptLanguageSchema>;

export const DEFAULT_PROMPT_LANGUAGE: PromptLanguage = 'sk';

export type Localized<T> = Readonly<Record<PromptLanguage, T>>;
