import type { AttachmentId } from '@relay/shared/domain';
import { describe, expect, it } from 'vitest';
import { createTestEngine, OTHER_USER_ID, USER_ID } from '../support/test-engine';

describe('AttachmentContentService', () => {
  it('returns uploaded attachment bytes to their owner', async () => {
    const engine = createTestEngine();
    const content = new TextEncoder().encode('obsah');
    const uploaded = await engine.attachments.put(USER_ID, {
      filename: 'poznámka.txt',
      contentType: 'text/plain',
      content,
    });

    await expect(engine.services.attachments.content(USER_ID, uploaded.id)).resolves.toEqual({
      filename: 'poznámka.txt',
      contentType: 'text/plain',
      content,
    });
    await expect(
      engine.services.attachments.content(OTHER_USER_ID, uploaded.id),
    ).rejects.toMatchObject({ code: 'not_found' });
  });

  it('reports unknown attachments as not found without a received-mail reader', async () => {
    const engine = createTestEngine();

    await expect(
      engine.services.attachments.content(USER_ID, 'att_missing' as AttachmentId),
    ).rejects.toMatchObject({ code: 'not_found' });
  });
});
