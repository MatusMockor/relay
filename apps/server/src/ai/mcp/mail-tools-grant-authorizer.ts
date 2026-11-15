import { Inject, Injectable } from '@nestjs/common';
import { AiService } from '@relay/engine';
import type { AiJob } from '@relay/shared/domain';
import { type DeviceRepository, SERVER_PORT_TOKENS } from '../../core';
import { type MailToolsGrant, MailToolsTokenService } from './mail-tools-token.service';

@Injectable()
export class MailToolsGrantAuthorizer {
  constructor(
    private readonly tokens: MailToolsTokenService,
    private readonly ai: AiService,
    @Inject(SERVER_PORT_TOKENS.DeviceRepository) private readonly devices: DeviceRepository,
  ) {}

  async authorize(token: string): Promise<AiJob | null> {
    const grant = await this.tokens.verify(token);
    if (grant === null) {
      return null;
    }
    const job = await this.ai.getJob(grant.userId, grant.jobId).catch(() => null);
    if (job?.status !== 'running') {
      return null;
    }
    return (await this.holderStillLeases(grant)) ? job : null;
  }

  private async holderStillLeases(grant: MailToolsGrant): Promise<boolean> {
    const { holder } = grant;
    if (holder === null) {
      return true;
    }
    if ((await this.devices.findActive(grant.userId, holder.deviceId)) === null) {
      return false;
    }
    return this.ai
      .heartbeatExternal(grant.userId, grant.jobId, {
        workerId: holder.deviceId,
        leaseId: holder.leaseId,
      })
      .then(
        () => true,
        () => false,
      );
  }
}
