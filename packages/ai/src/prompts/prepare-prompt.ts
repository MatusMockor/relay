import { z } from 'zod';
import { parseResponse } from '../output/parse-response';
import type { ParseResult } from '../output/parse-result';
import { COMMON_TEXTS } from './common-texts';
import type { MailToolName } from './mail-tools';
import type { PreparedPrompt } from './prepared-prompt';
import type { PromptContext, PromptSpec } from './prompt-spec';
import { untrustedMarkers, wrapUntrusted } from './untrusted-content';

interface PromptParts<Output> {
  readonly kind: string;
  readonly sections: readonly string[];
  readonly tools: readonly MailToolName[];
  readonly parse: (raw: string) => ParseResult<Output>;
  readonly context: PromptContext;
  readonly jsonSchema: string;
  readonly languageRule: 'output' | 'source';
}

export function preparePrompt<Input, Response, Output>(
  spec: PromptSpec<Input, Response, Output>,
  input: Input,
  context: PromptContext,
): PreparedPrompt<Output> {
  return assemble({
    kind: spec.kind,
    sections: [spec.task(input, context), ...spec.content(input, context)],
    tools: spec.tools,
    parse: (raw) => {
      const parsed = parseResponse(raw, spec.responseSchema);
      if (!parsed.ok) {
        return parsed;
      }
      return { ok: true, value: spec.toOutput(parsed.value, input) };
    },
    context,
    jsonSchema: JSON.stringify(z.toJSONSchema(spec.responseSchema)),
    languageRule: spec.languageRule,
  });
}

function assemble<Output>(parts: PromptParts<Output>): PreparedPrompt<Output> {
  const texts = COMMON_TEXTS[parts.context.language];
  const text = [
    texts.security(untrustedMarkers(parts.context.nonce)),
    ...parts.sections,
    texts.output(parts.jsonSchema),
    parts.languageRule === 'output' ? texts.languageRule : texts.sourceLanguageRule,
  ].join('\n\n');
  return {
    kind: parts.kind,
    system: texts.system,
    text,
    tools: parts.tools,
    parse: parts.parse,
    repair: (raw, error) =>
      assemble({
        ...parts,
        sections: [
          texts.repair,
          wrapUntrusted(error, parts.context.nonce),
          wrapUntrusted(raw, parts.context.nonce),
        ],
        tools: [],
      }),
  };
}
