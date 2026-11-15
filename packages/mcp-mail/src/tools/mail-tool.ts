import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import type { MailToolBackend } from '../backend/mail-tool-backend';

export type MailToolName =
  | 'search_threads'
  | 'list_folder'
  | 'get_thread'
  | 'list_tasks'
  | 'create_task'
  | 'create_draft';

export interface MailToolDefinition<Shape extends z.ZodRawShape> {
  readonly name: MailToolName;
  readonly title: string;
  readonly description: string;
  readonly readOnly: boolean;
  readonly inputShape: Shape;
  execute(args: z.infer<z.ZodObject<Shape>>, backend: MailToolBackend): Promise<unknown>;
}

export interface MailTool {
  readonly name: MailToolName;
  register(server: McpServer, backend: MailToolBackend): void;
}

export class ToolInputError extends Error {}

export function defineMailTool<Shape extends z.ZodRawShape>(
  definition: MailToolDefinition<Shape>,
): MailTool {
  const schema = z.object(definition.inputShape);
  const inputSchema: z.ZodType<Record<string, unknown>> = schema;
  return {
    name: definition.name,
    register: (server, backend) => {
      server.registerTool(
        definition.name,
        {
          title: definition.title,
          description: definition.description,
          inputSchema,
          annotations: {
            readOnlyHint: definition.readOnly,
            destructiveHint: false,
            idempotentHint: definition.readOnly,
            openWorldHint: false,
          },
        },
        (args: unknown) => toolResult(() => definition.execute(schema.parse(args), backend)),
      );
    },
  };
}

async function toolResult(run: () => Promise<unknown>): Promise<CallToolResult> {
  try {
    const payload = await run();
    return { content: [{ type: 'text', text: JSON.stringify(payload) }] };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Mail tool failed';
    return { isError: true, content: [{ type: 'text', text: message }] };
  }
}
