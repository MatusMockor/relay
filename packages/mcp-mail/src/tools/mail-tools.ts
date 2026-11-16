import { createDraftTool } from './create-draft';
import { createTaskTool } from './create-task';
import { getThreadTool } from './get-thread';
import { getThreadEventsTool } from './get-thread-events';
import { listEventsTool } from './list-events';
import { listFolderTool } from './list-folder';
import { listTasksTool } from './list-tasks';
import type { MailTool } from './mail-tool';
import { searchThreadsTool } from './search-threads';

export const MAIL_TOOLS: readonly MailTool[] = [
  searchThreadsTool,
  listFolderTool,
  getThreadTool,
  listTasksTool,
  listEventsTool,
  getThreadEventsTool,
  createTaskTool,
  createDraftTool,
];
