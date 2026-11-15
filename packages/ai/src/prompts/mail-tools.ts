export const MAIL_MCP_SERVER_NAME = 'mail';

export const MAIL_READ_TOOLS = [
  'search_threads',
  'list_folder',
  'get_thread',
  'list_tasks',
] as const;
export const MAIL_WRITE_TOOLS = ['create_task', 'create_draft'] as const;

export type MailToolName = (typeof MAIL_READ_TOOLS)[number] | (typeof MAIL_WRITE_TOOLS)[number];
