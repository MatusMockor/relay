import type { RealtimeEvent } from '@relay/shared';
import { describe, expect, it } from 'vitest';
import { createDemoMailClient } from '../src/data/demo/DemoMailClient';
import { demoIds } from '../src/data/demo/seed/ids';

const pause = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('demo labels', () => {
  it('creates Gmail labels with the remote name and renames them remotely too', async () => {
    const client = createDemoMailClient({ aiStepMs: 0 });
    const events: RealtimeEvent[] = [];
    client.subscribe((event) => events.push(event));

    const created = await client.createLabel({
      accountId: demoIds.account('os'),
      name: '  Projekty/Nový ',
    });
    const renamed = await client.updateLabel(created.id, { name: 'Projekty/Starý' });
    await pause();

    expect(created).toMatchObject({ kind: 'gmail', name: 'Projekty/Nový', color: null });
    expect(renamed.remoteName).toBe('Projekty/Starý');
    expect(events.filter((event) => event.type === 'labels.updated')).toHaveLength(2);
  });

  it('keeps the keyword of an IMAP label when renaming it', async () => {
    const client = createDemoMailClient({ aiStepMs: 0 });

    const renamed = await client.updateLabel(demoIds.label('jira'), { name: 'Jira Cloud' });

    expect(renamed).toMatchObject({ kind: 'keyword', name: 'Jira Cloud', remoteName: 'Jira' });
  });

  it('rejects duplicate names ignoring case and reserved Gmail names', async () => {
    const client = createDemoMailClient({ aiStepMs: 0 });

    await expect(
      client.createLabel({ accountId: demoIds.account('efa'), name: 'JIRA' }),
    ).rejects.toThrow('Štítok s týmto názvom už existuje.');
    await expect(
      client.createLabel({ accountId: demoIds.account('os'), name: '[Gmail]/Iné' }),
    ).rejects.toThrow('[Gmail]');
    await expect(
      client.createLabel({ accountId: demoIds.account('fl'), name: 'Jira' }),
    ).resolves.toMatchObject({ kind: 'keyword' });
  });
});
