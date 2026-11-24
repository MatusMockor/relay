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

  const olderServer = (initial: readonly (typeof legacy)[]) => {
    let stored = [...initial];
    server.handle('splits.list', () => ({ body: stored }));
    server.handle('splits.replace', (request) => {
      const body = request.body as { splits: { id?: string; name: string; order: number }[] };
      if (
        body.splits.some((item) => item.id !== undefined && !stored.some((s) => s.id === item.id))
      ) {
        return {
          status: 400,
          body: { error: { code: 'validation_failed', message: 'Unknown split id' } },
        };
      }
      stored = body.splits.map((item, index) => ({
        ...legacy,
        name: item.name,
        order: item.order,
        id: item.id ?? `split-new-${String(index)}`,
      }));
      return { body: stored };
    });
    return { current: () => stored };
  };

  it('refuses to write to an older server that already holds splits', async () => {
    const previous = [
      { ...legacy, id: 'split-old', rules: [{ type: 'fromDomain', domain: 'stary.sk' }] },
    ];
    const older = olderServer(previous);

    await expect(connect().replaceSplits([{ ...split, id: undefined }])).rejects.toMatchObject({
      code: 'not_implemented',
      message:
        'Server je starší a nepodporuje režim podmienok ani výnimky v splitoch. Aktualizuj server.',
    });

    expect(server.requests.filter((item) => item.key === 'splits.replace')).toEqual([]);
    expect(older.current()).toEqual(previous);
  });

  it('removes a split an empty older server stored without its match mode', async () => {
    const older = olderServer([]);

    await expect(connect().replaceSplits([{ ...split, id: undefined }])).rejects.toMatchObject({
      code: 'not_implemented',
    });

    expect(older.current()).toEqual([]);
  });

  it('writes directly when the server already knows the match mode', async () => {
    server.handle('splits.list', () => ({ body: [{ ...legacy, match: 'any', exceptions: [] }] }));
    server.handle('splits.replace', () => ({ body: [{ ...split, userId: 'user-1' }] }));

    await expect(connect().replaceSplits([split])).resolves.toEqual([
      { ...split, userId: 'user-1' },
    ]);
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
