import { Injectable } from '@nestjs/common';
import type { AiMailToolsEndpoint } from '@relay/engine';
import type { AiJob } from '@relay/shared/domain';
import { LocalServerUrl } from './local-server-url';
import { MAIL_MCP_PATH } from './mail-mcp-path';
import { MailToolsTokenService } from './mail-tools-token.service';

@Injectable()
export class ServerMailToolsResolver {
  constructor(
    private readonly urls: LocalServerUrl,
    private readonly tokens: MailToolsTokenService,
  ) {}

  async resolve(job: AiJob, owner: string): Promise<AiMailToolsEndpoint | null> {
    const url = this.urls.resolve(MAIL_MCP_PATH);
    if (url === null) {
      return null;
    }
    const { token } = await this.tokens.issue({
      userId: job.userId,
      jobId: job.id,
      holder: { kind: 'run', owner },
    });
    return {
      transport: 'http',
      command: null,
      args: [],
      url,
      headers: { Authorization: `Bearer ${token}` },
    };
  }
}
