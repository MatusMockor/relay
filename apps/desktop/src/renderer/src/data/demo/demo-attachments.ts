import { type Draft, type DraftAttachment, DraftAttachmentSchema } from '@relay/shared';
import { MailClientError } from '../errors';
import type { MailClient } from '../MailClient';
import type { DemoState } from './demo-state';

type DemoAttachmentMethods = Pick<
  MailClient,
  'addDraftAttachment' | 'removeDraftAttachment' | 'forwardAttachments'
>;

let sequence = 0;

const notFound = (what: string) =>
  new MailClientError({ code: 'not_found', message: `${what} neexistuje` });

export const createDemoAttachments = (state: DemoState, now: () => Date): DemoAttachmentMethods => {
  const find = (draftId: string): Draft => {
    const found = state.drafts.find((item) => item.id === draftId);
    if (found === undefined) {
      throw notFound('Koncept');
    }
    return found;
  };
  const replace = (draft: Draft, attachments: readonly DraftAttachment[]): Draft => {
    const next = { ...draft, attachments: [...attachments], updatedAt: now().toISOString() };
    state.drafts = state.drafts.map((item) => (item.id === draft.id ? next : item));
    return next;
  };
  const attachment = (filename: string, contentType: string, size: number): DraftAttachment => {
    sequence += 1;
    return DraftAttachmentSchema.parse({
      id: `att-demo-${String(sequence)}`,
      filename,
      contentType,
      size,
    });
  };
  return {
    addDraftAttachment: async (draftId, file) => {
      const draft = find(draftId);
      const added = attachment(file.filename, file.contentType, file.blob.size);
      return Promise.resolve({
        draft: replace(draft, [...draft.attachments, added]),
        attachment: added,
      });
    },
    removeDraftAttachment: async (draftId, attachmentId) => {
      const draft = find(draftId);
      return Promise.resolve(
        replace(
          draft,
          draft.attachments.filter((item) => item.id !== attachmentId),
        ),
      );
    },
    forwardAttachments: async (draftId, messageId) => {
      const draft = find(draftId);
      const message = [...state.threads.values()]
        .flatMap((record) => record.messages)
        .find((item) => item.id === messageId);
      if (message === undefined) {
        throw notFound('Správa');
      }
      const copies = message.attachments
        .filter((item) => !item.inline)
        .map((item) => attachment(item.filename ?? 'príloha', item.contentType, item.size));
      return Promise.resolve({
        draft: replace(draft, [...draft.attachments, ...copies]),
        attachments: copies,
      });
    },
  };
};
