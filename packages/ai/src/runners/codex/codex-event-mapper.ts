import { z } from 'zod';
import { eventSignal, type CliEventMapper, type CliSignal } from '../cli-signal';

const ItemEventSchema = z.object({
  type: z.enum(['item.started', 'item.completed']),
  item: z.object({
    type: z.string(),
    text: z.string().optional(),
    tool: z.string().optional(),
  }),
});

const TurnCompletedSchema = z.object({ type: z.literal('turn.completed') });
const TurnFailedSchema = z.object({
  type: z.literal('turn.failed'),
  error: z.object({ message: z.string() }),
});
const ErrorSchema = z.object({ type: z.literal('error'), message: z.string() });

export class CodexEventMapper implements CliEventMapper {
  private lastMessage: string | null = null;

  map(line: unknown): readonly CliSignal[] {
    const item = ItemEventSchema.safeParse(line);
    if (item.success) {
      return this.mapItem(item.data);
    }
    if (TurnCompletedSchema.safeParse(line).success) {
      return [this.completeTurn()];
    }
    const failed = TurnFailedSchema.safeParse(line);
    if (failed.success) {
      return [{ type: 'error', message: failed.data.error.message }];
    }
    const error = ErrorSchema.safeParse(line);
    if (error.success) {
      return [{ type: 'error', message: error.data.message }];
    }
    return [];
  }

  private mapItem(event: z.infer<typeof ItemEventSchema>): CliSignal[] {
    if (event.type === 'item.started' && event.item.type === 'mcp_tool_call') {
      return [eventSignal({ type: 'toolCall', name: event.item.tool ?? 'mcp' })];
    }
    if (event.type === 'item.started' && event.item.type === 'command_execution') {
      return [eventSignal({ type: 'toolCall', name: 'command' })];
    }
    if (event.type !== 'item.completed' || event.item.type !== 'agent_message') {
      return [];
    }
    const text = event.item.text ?? '';
    this.lastMessage = text;
    return text.length === 0 ? [] : [eventSignal({ type: 'delta', text })];
  }

  private completeTurn(): CliSignal {
    if (this.lastMessage === null) {
      return { type: 'error', message: 'Codex finished the turn without an agent message' };
    }
    return { type: 'final', text: this.lastMessage };
  }
}
