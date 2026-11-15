const THREAD = '0199a8e3-6f7d-7b52-9b1a-4f0c2d1e5a77';

export function codexToolThenAnswer(answer: string): unknown[] {
  return [
    { type: 'thread.started', thread_id: THREAD },
    { type: 'turn.started' },
    {
      type: 'item.started',
      item: {
        id: 'item_0',
        type: 'mcp_tool_call',
        server: 'mail',
        tool: 'search_threads',
        arguments: { query: 'faktúra' },
        status: 'in_progress',
      },
    },
    {
      type: 'item.completed',
      item: {
        id: 'item_0',
        type: 'mcp_tool_call',
        server: 'mail',
        tool: 'search_threads',
        status: 'completed',
      },
    },
    {
      type: 'item.completed',
      item: { id: 'item_1', type: 'reasoning', text: '**Hľadám faktúry**' },
    },
    { type: 'item.completed', item: { id: 'item_2', type: 'agent_message', text: answer } },
    {
      type: 'turn.completed',
      usage: { input_tokens: 1200, cached_input_tokens: 0, output_tokens: 80 },
    },
  ];
}

export function codexUnauthorized(): unknown[] {
  return [
    { type: 'thread.started', thread_id: THREAD },
    { type: 'turn.started' },
    {
      type: 'error',
      message:
        'unexpected status 401 Unauthorized: Missing bearer or basic authentication in header',
    },
    { type: 'turn.failed', error: { message: 'unexpected status 401 Unauthorized' } },
  ];
}

export function codexTransientErrorThenAnswer(answer: string): unknown[] {
  return [
    { type: 'thread.started', thread_id: THREAD },
    { type: 'turn.started' },
    { type: 'error', message: 'Reconnecting... 1/5' },
    { type: 'item.completed', item: { id: 'item_0', type: 'agent_message', text: answer } },
    {
      type: 'turn.completed',
      usage: { input_tokens: 10, cached_input_tokens: 0, output_tokens: 5 },
    },
  ];
}
