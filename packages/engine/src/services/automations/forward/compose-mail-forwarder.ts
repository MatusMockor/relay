import { hasMessageBody, type EmailAddress, type Message, type UserId } from '@relay/shared/domain';
import type { Logger } from '../../../ports/logger';
import type { MessageBodyService } from '../../bodies/message-body-service';
import type { ComposeService } from '../../compose/compose-service';
import { errorMessage } from '../../shared/mail-provider-sessions';
import { AUTO_FORWARD_HEADERS } from './auto-forward-guard';
import { forwardDraftOf } from './forward-content';
import type { MailForwarder } from './mail-forwarder';

export class ComposeMailForwarder implements MailForwarder {
  constructor(
    private readonly compose: ComposeService,
    private readonly bodies: MessageBodyService,
    private readonly logger: Logger,
  ) {}

  async forward(userId: UserId, message: Message, to: EmailAddress): Promise<void> {
    const body = await this.bodies.get(userId, message.id);
    const text = hasMessageBody(body) ? body.textBody : null;
    const draft = await this.compose.createDraft(userId, forwardDraftOf(message, to, text));
    try {
      await this.compose.forwardAttachments(userId, draft.id, message.id);
      await this.compose.sendDraftWithHeaders(userId, draft.id, AUTO_FORWARD_HEADERS);
    } catch (error) {
      await this.compose.deleteDraft(userId, draft.id).catch((cleanup: unknown) => {
        this.logger.warn('Removing a failed automation forward draft failed', {
          draftId: draft.id,
          error: errorMessage(cleanup),
        });
      });
      throw error;
    }
  }
}
