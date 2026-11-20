import type { AttachmentId, AttachmentMeta, Message } from '@relay/shared/domain';
import { describe, expect, it } from 'vitest';
import { deliverMail } from '../support/fixtures';
import { historyDate } from '../support/history';
import { attachmentHeader } from '../support/mail/header-attachment-extractor';
import { setupRemoteBodies, storedByHeader } from '../support/remote-bodies';
import { type TestEngine, USER_ID } from '../support/test-engine';

const meta = (id: string, filename: string, contentType: string): AttachmentMeta => ({
  id: id as AttachmentId,
  filename,
  contentType,
  size: 3,
  contentId: null,
  inline: false,
});

const FILE_HEADERS = {
  'X-Test-Attachment-1': attachmentHeader('zmluva.pdf', 'application/pdf', 'PDF'),
  'X-Test-Attachment-2': attachmentHeader('plan.png', 'image/png', 'PNG'),
};

const withAttachments = (
  engine: TestEngine,
  message: Message,
  attachments: readonly AttachmentMeta[],
): void => {
  engine.db.tables.messages.set(message.id, { ...message, attachments: [...attachments] });
};

const text = async (engine: TestEngine, id: string): Promise<string> => {
  const content = await engine.services.attachments.content(USER_ID, id as AttachmentId);
  return new TextDecoder().decode(content.content);
};

describe('received attachments of remote rows', () => {
  it('uses the index only when name and type match, else the matching attachment', async () => {
    const { engine } = await setupRemoteBodies({}, ({ server }) => {
      deliverMail(server, 'Archive', {
        id: 'files',
        date: historyDate(8, 100),
        headers: FILE_HEADERS,
      });
    });
    const remote = storedByHeader(engine, 'files', 'Archive');
    expect(remote.bodyState).toBe('remote');
    withAttachments(engine, remote, [
      meta('att_png', 'plan.png', 'image/png'),
      meta('att_pdf', 'zmluva.pdf', 'Application/PDF'),
      meta('att_doc', 'chyba.doc', 'application/msword'),
    ]);

    expect(await text(engine, 'att_png')).toBe('PNG');
    expect(await text(engine, 'att_pdf')).toBe('PDF');
    await expect(
      engine.services.attachments.content(USER_ID, 'att_doc' as AttachmentId),
    ).rejects.toMatchObject({ code: 'not_found' });
  });

  it('keeps reading stored rows by index', async () => {
    const { engine } = await setupRemoteBodies({}, ({ server }) => {
      deliverMail(server, 'INBOX', { id: 'local-files', headers: FILE_HEADERS });
    });
    const local = storedByHeader(engine, 'local-files', 'INBOX');
    expect(local.bodyState).toBeUndefined();
    withAttachments(engine, local, [
      meta('att_first', 'plan.png', 'image/png'),
      meta('att_second', 'zmluva.pdf', 'application/pdf'),
    ]);

    expect(await text(engine, 'att_first')).toBe('PDF');
    expect(await text(engine, 'att_second')).toBe('PNG');
  });
});
