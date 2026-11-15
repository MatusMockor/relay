import { Controller, Req, Res } from '@nestjs/common';
import { ComposeService, InboxQueryService, TaskService, ThreadQueryService } from '@relay/engine';
import {
  bearerToken,
  createMailMcpHttpHandler,
  engineMailToolBackend,
  type MailMcpHttpHandler,
} from '@relay/mcp-mail';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { RawRoute } from '../../http/api-route.decorator';
import { scopeMailToolsToJob } from './job-scoped-mail-tools';
import { MAIL_MCP_PATH } from './mail-mcp-path';
import { MailToolsGrantAuthorizer } from './mail-tools-grant-authorizer';

@Controller()
export class MailMcpController {
  private readonly handler: MailMcpHttpHandler;

  constructor(
    grants: MailToolsGrantAuthorizer,
    inbox: InboxQueryService,
    threads: ThreadQueryService,
    tasks: TaskService,
    compose: ComposeService,
  ) {
    this.handler = createMailMcpHttpHandler(async (request) => {
      const token = bearerToken(request);
      const job = token === null ? null : await grants.authorize(token);
      if (job === null) {
        return null;
      }
      const backend = engineMailToolBackend({ inbox, threads, tasks, compose }, job.userId);
      return scopeMailToolsToJob(backend, job.kind);
    });
  }

  @RawRoute('POST', MAIL_MCP_PATH, 'public')
  post(@Req() request: FastifyRequest, @Res() reply: FastifyReply): Promise<void> {
    return this.handle(request, reply);
  }

  @RawRoute('GET', MAIL_MCP_PATH, 'public')
  get(@Req() request: FastifyRequest, @Res() reply: FastifyReply): Promise<void> {
    return this.handle(request, reply);
  }

  @RawRoute('DELETE', MAIL_MCP_PATH, 'public')
  remove(@Req() request: FastifyRequest, @Res() reply: FastifyReply): Promise<void> {
    return this.handle(request, reply);
  }

  private async handle(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    reply.hijack();
    await this.handler(request.raw, reply.raw, request.body);
  }
}
