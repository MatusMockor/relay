import { SplitIdSchema } from '@relay/shared';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { HttpApi } from '../src/data/remote/HttpApi';
import { RendererTokenSession } from '../src/data/remote/RendererTokenSession';
import { createRemoteMailClient } from '../src/data/remote/RemoteMailClient';
import { MemoryTokenStore } from '../src/data/remote/TokenStore';
import type { MailClient } from '../src/data/MailClient';
import { type ContractServer, startContractServer } from './support/contract-server';
import { tokens } from './support/fixtures';

describe('RemoteMailClient splits', () => {
  let server: ContractServer;
  let store: MemoryTokenStore;
  let client: MailClient | null = null;

  beforeEach(async () => {
    server = await startContractServer();
    store = new MemoryTokenStore();
    await store.save(tokens('access-1'));
  });

  afterEach(async () => {
    client?.dispose();
    client = null;
    await server.close();
  });

  const connect = () => {
    client = createRemoteMailClient({
      http: new HttpApi({
        baseUrl: server.url,
        session: new RendererTokenSession({ baseUrl: server.url, tokens: store }),
      }),
      reconnectDelayMs: 20,
    });
    return client;
  };

  const split = {
    id: SplitIdSchema.parse('split-1'),
    accountId: null,
    name: 'Klienti',
    order: 0,
    match: 'all' as const,
    rules: [{ type: 'fromDomain' as const, domain: 'klient.sk' }],
    exceptions: [{ type: 'hasAttachment' as const }],
    exclusive: true,
    hideTasks: false,
  };
  const legacy = {
    id: 'split-1',
    userId: 'user-1',
    accountId: null,
    name: 'Klienti',
    order: 0,
    rules: [{ type: 'fromDomain', domain: 'klient.sk' }],
    exclusive: true,
    hideTasks: false,
  };

  it('restores the previous splits when the server dropped the match mode and exceptions', async () => {
    const previous = [{ ...legacy, rules: [{ type: 'fromDomain', domain: 'stary.sk' }] }];
    server.handle('splits.list', () => ({ body: previous }));
    server.handle('splits.replace', () => ({ body: [legacy] }));

    await expect(connect().replaceSplits([split])).rejects.toMatchObject({
      code: 'not_implemented',
      message:
        'Server je starší a nepodporuje režim podmienok ani výnimky v splitoch. Aktualizuj server.',
    });

    const replaces = server.requests.filter((item) => item.key === 'splits.replace');
    expect(replaces).toHaveLength(2);
    expect(replaces[1]?.body).toMatchObject({
      splits: [{ id: 'split-1', rules: [{ type: 'fromDomain', domain: 'stary.sk' }] }],
    });
  });

  it('reads an older server response with the defaults', async () => {
    server.handle('splits.list', () => ({ body: [legacy] }));

    expect(await connect().listSplits()).toEqual([{ ...legacy, match: 'any', exceptions: [] }]);
  });

  it('keeps a split with newer conditions as unsupported instead of failing', async () => {
    server.handle('splits.list', () => ({
      body: [legacy, { ...legacy, id: 'split-2', order: 1, rules: [{ type: 'future' }] }],
    }));

    const splits = await connect().listSplits();

    expect(splits[1]).toEqual({
      kind: 'unsupported',
      id: 'split-2',
      accountId: null,
      name: 'Klienti',
      order: 1,
      exclusive: true,
      hideTasks: false,
    });
  });

  it('asks for a server update when the split preview endpoint is missing', async () => {
    server.handle('splits.preview', () => ({
      status: 404,
      body: { error: { code: 'not_found', message: 'Cannot POST /splits/preview' } },
    }));

    await expect(
      connect().previewSplit({
        splitId: null,
        accountId: null,
        match: 'any',
        rules: split.rules,
        exceptions: [],
      }),
    ).rejects.toMatchObject({
      code: 'not_implemented',
      message: 'Server je starší a nepodporuje náhľad splitu. Aktualizuj server.',
    });
  });
});
