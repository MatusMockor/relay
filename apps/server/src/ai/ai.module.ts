import { Module } from '@nestjs/common';
import { AiJobDispatcher } from './ai-job-dispatcher';
import { AiJobsController } from './ai-jobs.controller';
import { AiRunnersController } from './ai-runners.controller';
import { AiWorkerController } from './ai-worker.controller';
import { MailMcpController } from './mcp/mail-mcp.controller';
import { MailToolsGrantAuthorizer } from './mcp/mail-tools-grant-authorizer';

@Module({
  controllers: [AiRunnersController, AiJobsController, AiWorkerController, MailMcpController],
  providers: [AiJobDispatcher, MailToolsGrantAuthorizer],
})
export class AiModule {}
