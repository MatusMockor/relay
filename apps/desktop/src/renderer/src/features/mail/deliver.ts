import type { DraftContent, DraftId, SendResponse } from '@relay/shared';
import type { MailClient } from '../../data/MailClient';

export const deliver = async (
  client: MailClient,
  content: DraftContent,
  draftId: string | null,
  scheduledAt?: Date,
): Promise<SendResponse> => {
  const at = scheduledAt?.toISOString();
  if (draftId === null) {
    return client.send({ source: 'inline', draft: content, scheduledAt: at });
  }
  const id = draftId as DraftId;
  await client.updateDraft(id, content);
  return client.send({ source: 'draft', draftId: id, scheduledAt: at });
};

export const keepAsDraft = async (
  client: MailClient,
  content: DraftContent,
  draftId: string | null,
): Promise<void> => {
  await (draftId === null
    ? client.createDraft(content)
    : client.updateDraft(draftId as DraftId, content));
};
