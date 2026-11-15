import { z } from 'zod';
import { MAIL_MCP_SERVER_NAME } from '../../prompts/mail-tools';
import { eventSignal, type CliEventMapper, type CliSignal } from '../cli-signal';

const TOOL_PREFIX = `mcp__${MAIL_MCP_SERVER_NAME}__`;

const StreamDeltaSchema = z.object({
  type: z.literal('stream_event'),
  event: z.object({
    type: z.literal('content_block_delta'),
    delta: z.object({ type: z.literal('text_delta'), text: z.string() }),
  }),
});

const ContentBlockSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('text'), text: z.string() }),
  z.object({ type: z.literal('tool_use'), name: z.string().min(1) }),
]);

const AssistantSchema = z.object({
  type: z.literal('assistant'),
  message: z.object({ content: z.array(z.unknown()) }),
});

const ResultSchema = z.object({
  type: z.literal('result'),
  subtype: z.string(),
  is_error: z.boolean().optional(),
  result: z.string().optional(),
  errors: z.array(z.string()).optional(),
});

export class ClaudeStreamMapper implements CliEventMapper {
  private streamedCurrentMessage = false;

  map(line: unknown): readonly CliSignal[] {
    const delta = StreamDeltaSchema.safeParse(line);
    if (delta.success) {
      this.streamedCurrentMessage = true;
      return [eventSignal({ type: 'delta', text: delta.data.event.delta.text })];
    }
    const assistant = AssistantSchema.safeParse(line);
    if (assistant.success) {
      return this.mapAssistant(assistant.data.message.content);
    }
    const result = ResultSchema.safeParse(line);
    if (result.success) {
      return [mapResult(result.data)];
    }
    return [];
  }

  private mapAssistant(content: readonly unknown[]): CliSignal[] {
    const streamed = this.streamedCurrentMessage;
    this.streamedCurrentMessage = false;
    const signals: CliSignal[] = [];
    for (const raw of content) {
      const block = ContentBlockSchema.safeParse(raw);
      if (!block.success) {
        continue;
      }
      if (block.data.type === 'tool_use') {
        signals.push(eventSignal({ type: 'toolCall', name: toolName(block.data.name) }));
        continue;
      }
      if (!streamed && block.data.text.length > 0) {
        signals.push(eventSignal({ type: 'delta', text: block.data.text }));
      }
    }
    return signals;
  }
}

function mapResult(result: z.infer<typeof ResultSchema>): CliSignal {
  if (result.subtype === 'success' && result.is_error !== true) {
    return { type: 'final', text: result.result ?? '' };
  }
  const message = result.result ?? result.errors?.join('\n') ?? result.subtype;
  return { type: 'error', message: message.length > 0 ? message : result.subtype };
}

function toolName(name: string): string {
  return name.startsWith(TOOL_PREFIX) ? name.slice(TOOL_PREFIX.length) : name;
}
