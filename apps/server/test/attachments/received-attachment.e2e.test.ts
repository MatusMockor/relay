import { randomUUID } from 'node:crypto';
import type { GreenMailUser } from '@relay/config/test-infra';
import { composeMime } from '@relay/mail-core';
import { api, buildUrl } from '@relay/shared/api';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { registerUser } from '../support/auth-flow';
import { createGreenMailUser, deleteGreenMailUser, openImap } from '../support/greenmail';
import { addImapAccount, waitForInbox } from '../support/mail-flow';
import { startTestApp, type TestApp } from '../support/test-app';

const pdf = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37, 0x0a, 0x00, 0xfe]);

describe('GET /attachments/:id/content for received mail', () => {
  let app: TestApp;
  let owner: GreenMailUser;

  beforeAll(async () => {
    app = await startTestApp({ env: { JOBS_ENABLED: 'true' } });
    owner = await createGreenMailUser('att');
    const { raw } = await composeMime({
      from: { name: 'Jana', email: 'jana@klient.sk' },
      to: [{ name: null, email: owner.email }],
      cc: [],
      bcc: [],
      subject: 'Faktúra s prílohou',
      text: 'V prílohe faktúra.',
      html: null,
      inReplyTo: null,
      references: [],
      attachments: [
        { filename: 'faktúra október.pdf', contentType: 'application/pdf', content: pdf },
      ],
    });
    const imap = await openImap(owner);
    await imap.append('INBOX', raw);
    await imap.logout();
  });

  afterAll(async () => {
    await app.close();
    await deleteGreenMailUser(owner);
  });

  it('streams the attachment bytes from IMAP with the stored type and name', async () => {
    const session = await registerUser(app.api, `att-${randomUUID().slice(0, 8)}@relay.test`);
    const token = session.accessToken;
    await addImapAccount(app.api, token, owner);
    const [thread] = await waitForInbox(app.api, token, (threads) => threads.length === 1);
    const detail = await app.api.ok(
      api.threads.get,
      { params: { id: thread?.id ?? 'missing' } },
      token,
    );
    const attachment = detail.messages[0]?.attachments[0];
    expect(attachment).toMatchObject({ filename: 'faktúra október.pdf', size: pdf.byteLength });
    const url = buildUrl(app.baseUrl, api.attachments.content, {
      params: { id: attachment?.id ?? 'missing' },
    });

    const response = await fetch(url, { headers: { authorization: `Bearer ${token}` } });

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('application/pdf');
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
    expect(response.headers.get('content-disposition')).toBe(
      `attachment; filename="fakt_ra okt_ber.pdf"; filename*=UTF-8''${encodeURIComponent('faktúra október.pdf')}`,
    );
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(pdf);

    const stranger = await registerUser(app.api, `att-x-${randomUUID().slice(0, 8)}@relay.test`);
    const foreign = await fetch(url, {
      headers: { authorization: `Bearer ${stranger.accessToken}` },
    });
    expect(foreign.status).toBe(404);
  });

  it('serves uploaded draft attachments through the same endpoint', async () => {
    const session = await registerUser(app.api, `att-up-${randomUUID().slice(0, 8)}@relay.test`);
    const uploaded = await app.api.ok(
      api.attachments.upload,
      {
        body: {
          filename: 'návrh.txt',
          contentType: 'text/plain',
          contentBase64: Buffer.from('koncept').toString('base64'),
        },
      },
      session.accessToken,
    );

    const response = await fetch(
      buildUrl(app.baseUrl, api.attachments.content, { params: { id: uploaded.id } }),
      { headers: { authorization: `Bearer ${session.accessToken}` } },
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('text/plain');
    expect(await response.text()).toBe('koncept');
  });
});
