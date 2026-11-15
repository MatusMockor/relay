const SESSION = 'b1f0c6a2-3c55-4c7e-9a43-0d6c2f1d9e10';

const init = {
  type: 'system',
  subtype: 'init',
  cwd: '/tmp/relay-ai-x',
  session_id: SESSION,
  tools: ['mcp__mail__get_thread', 'mcp__mail__search_threads'],
  mcp_servers: [{ name: 'mail', status: 'connected' }],
  model: 'claude-sonnet-5-5',
  permissionMode: 'dontAsk',
  apiKeySource: 'none',
};

function textDelta(text: string) {
  return {
    type: 'stream_event',
    session_id: SESSION,
    event: { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text } },
  };
}

function result(text: string, isError = false) {
  return {
    type: 'result',
    subtype: 'success',
    is_error: isError,
    duration_ms: 2310,
    num_turns: 2,
    result: text,
    session_id: SESSION,
    total_cost_usd: 0.0123,
  };
}

export function claudeToolThenAnswer(answer: string, splitAt: number): unknown[] {
  return [
    init,
    { type: 'stream_event', session_id: SESSION, event: { type: 'message_start', message: {} } },
    {
      type: 'assistant',
      session_id: SESSION,
      message: {
        id: 'msg_1',
        role: 'assistant',
        content: [
          {
            type: 'tool_use',
            id: 'toolu_1',
            name: 'mcp__mail__get_thread',
            input: { threadId: 'thr_1' },
          },
        ],
      },
    },
    {
      type: 'user',
      session_id: SESSION,
      message: {
        role: 'user',
        content: [{ type: 'tool_result', tool_use_id: 'toolu_1', content: '{}' }],
      },
    },
    textDelta(answer.slice(0, splitAt)),
    textDelta(answer.slice(splitAt)),
    {
      type: 'assistant',
      session_id: SESSION,
      message: { id: 'msg_2', role: 'assistant', content: [{ type: 'text', text: answer }] },
    },
    result(answer),
  ];
}

export function claudePlainAnswer(answer: string): unknown[] {
  return [
    init,
    {
      type: 'assistant',
      session_id: SESSION,
      message: { id: 'msg_1', role: 'assistant', content: [{ type: 'text', text: answer }] },
    },
    result(answer),
  ];
}

export function claudeNotLoggedIn(): unknown[] {
  const message = 'Not logged in · Please run /login';
  return [
    init,
    {
      type: 'assistant',
      session_id: SESSION,
      error: 'authentication_failed',
      message: { id: 'msg_1', role: 'assistant', content: [{ type: 'text', text: message }] },
    },
    result(message, true),
  ];
}

export function claudeInterrupted(): unknown[] {
  return [init, textDelta('{"summary":"Klient'), 'not json at all'];
}

export function claudeStarted(): unknown[] {
  return [init, textDelta('{"text":')];
}
