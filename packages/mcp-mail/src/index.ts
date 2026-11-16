export type {
  CalendarEventsResult,
  CalendarRangeQuery,
  ThreadEventsResult,
} from './backend/calendar-tool-types';
export type { MailToolBackend, NewMailTask } from './backend/mail-tool-backend';
export {
  engineMailToolBackend,
  engineMailTools,
  type MailToolEngineServices,
} from './backend/engine-mail-tools';
export {
  scopeMailTools,
  type MailToolCommands,
  type MailToolQueries,
} from './backend/mail-tool-services';
export {
  MAIL_MCP_TOKEN_ENV,
  runRelayMailMcp,
  type RelayMailMcpRuntime,
} from './cli/run-relay-mail-mcp';
export { UNTRUSTED_NOTICE } from './presenters/views';
export { createMailMcpServer, MAIL_MCP_SERVER_INFO } from './server';
export { MailToolSocketHost, type MailToolSocketHostOptions } from './socket/mail-tool-socket-host';
export { SocketMailToolBackend } from './socket/socket-mail-tool-backend';
export type { MailToolName } from './tools/mail-tool';
export { MAIL_TOOLS } from './tools/mail-tools';
export {
  bearerToken,
  createMailMcpHttpHandler,
  type MailBackendResolver,
  type MailMcpHttpHandler,
} from './transports/http';
export {
  serveMailMcpOverStdio,
  type RunningMailMcpServer,
  type StdioStreams,
} from './transports/stdio';
