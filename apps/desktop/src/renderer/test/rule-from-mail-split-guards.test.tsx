// @vitest-environment jsdom
import { type SplitReplaceItem, supportedSplits } from '@relay/shared';
import { within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MailClientError } from '../src/data/errors';
import type { MailClient } from '../src/data/MailClient';
import { demoClient, settle } from './features-support';
import { click } from './support/automations';
import { resetStores } from './support/render-app';
import { closed, openLunch, pick, SENDER, splitNamed } from './support/rule-from-mail-split';

const recording = (client: MailClient, listSplits: MailClient['listSplits']) => {
  const replaces: SplitReplaceItem[][] = [];
  return {
    replaces,
    client: {
      ...client,
      listSplits,
      replaceSplits: (items: SplitReplaceItem[]) => {
        replaces.push(items);
        return client.replaceSplits(items);
      },
    },
  };
};

const submit = (panel: HTMLElement) =>
  within(panel).getByRole<HTMLButtonElement>('button', { name: 'Zaradiť' });

describe('Zaradiť do splitu z mailu bez načítaných splitov', () => {
  beforeEach(() => {
    resetStores();
  });
  afterEach(() => {
    resetStores();
  });

  it('waits for the split list before it can file the mail', async () => {
    const server = recording(demoClient(), () => new Promise(() => undefined));
    const panel = await openLunch(server.client);

    expect(within(panel).getByRole('status').textContent).toBe('Načítavam splity…');
    expect(submit(panel).disabled).toBe(true);
    expect(within(panel).queryByRole('combobox', { name: 'Split' })).toBeNull();
    expect(server.replaces).toEqual([]);
  });

  it('refuses to file the mail when the split list failed to load', async () => {
    const server = recording(demoClient(), () =>
      Promise.reject(new MailClientError({ code: 'internal', message: 'Server je nedostupný' })),
    );
    const panel = await openLunch(server.client);
    await settle();

    expect(within(panel).getByRole('status').textContent).toContain('Splity sa nepodarilo načítať');
    expect(submit(panel).disabled).toBe(true);
    expect(server.replaces).toEqual([]);
  });

  it('files against the current split list, not the one loaded with the dialog', async () => {
    const demo = demoClient();
    const panel = await openLunch(demo);
    const current = supportedSplits(await demo.listSplits());
    await demo.replaceSplits([
      ...current,
      {
        accountId: null,
        name: 'Z iného zariadenia',
        order: current.length,
        rules: [{ type: 'subjectContains', value: 'faktúra' }],
        exclusive: true,
        hideTasks: false,
      },
    ]);

    pick(panel, 'Jira');
    click(submit(panel));
    await closed();

    expect((await splitNamed(demo, 'Jira')).rules).toContainEqual(SENDER);
    expect(await splitNamed(demo, 'Z iného zariadenia')).toBeDefined();
  });
});
