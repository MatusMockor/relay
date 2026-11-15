import { Global, Module } from '@nestjs/common';
import { PORT_TOKENS } from '@relay/engine';
import { SERVER_CONFIG, type ServerConfig } from '../config/server-config';
import { createServerAiRunnerRegistry } from './ai-runner-registry.factory';
import { LocalServerUrl } from './mcp/local-server-url';
import { MailToolsTokenService } from './mcp/mail-tools-token.service';
import { ServerMailToolsResolver } from './mcp/server-mail-tools-resolver';

@Global()
@Module({
  providers: [
    {
      provide: PORT_TOKENS.AiRunnerRegistry,
      inject: [SERVER_CONFIG],
      useFactory: (config: ServerConfig) => createServerAiRunnerRegistry(config),
    },
    LocalServerUrl,
    MailToolsTokenService,
    ServerMailToolsResolver,
  ],
  exports: [PORT_TOKENS.AiRunnerRegistry, MailToolsTokenService, ServerMailToolsResolver],
})
export class AiRuntimeModule {}
