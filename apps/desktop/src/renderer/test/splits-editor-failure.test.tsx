// @vitest-environment jsdom
import type { SplitReplaceItem } from '@relay/shared';
import { act, fireEvent, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MailClientError } from '../src/data/errors';
import { demoClient, settle } from './features-support';
import { click } from './support/automations';
import { resetStores } from './support/render-app';
import { openSplit, openSplits, storedSplit } from './support/splits';

const rename = (region: HTMLElement, from: string, to: string) => {
  click(within(region).getByRole('button', { name: `Premenovať split ${from}` }));
  const field = within(region).getByRole('textbox', { name: 'Názov splitu' });
  act(() => {
    fireEvent.change(field, { target: { value: to } });
  });
  act(() => {
    fireEvent.keyDown(field, { key: 'Enter' });
  });
};

describe('Nastavenia > Split Inbox > neuložená zmena', () => {
  beforeEach(() => {
    resetStores();
  });
  afterEach(() => {
    resetStores();
  });

  it('keeps an edit the server refused and saves it on the next try', async () => {
    const demo = demoClient();
    let refuse = true;
    const client = {
      ...demo,
      replaceSplits: (items: SplitReplaceItem[]) =>
        refuse
          ? Promise.reject(
              new MailClientError({ code: 'validation_failed', message: 'Názov je príliš divný.' }),
            )
          : demo.replaceSplits(items),
    };
    const sheet = await openSplits(client);
    rename(openSplit(sheet, 'Jira'), 'Jira', 'Tikety');
    await settle();

    const region = screen.getByRole('region', { name: 'Split Tikety' });
    expect(within(region).getByRole('alert').textContent).toContain('Názov je príliš divný.');
    expect(within(region).getByText('Neuložené')).toBeDefined();
    expect(await storedSplit(client, 'Jira')).toBeDefined();

    refuse = false;
    rename(region, 'Tikety', 'Tikety z Jiry');
    await settle();

    const saved = screen.getByRole('region', { name: 'Split Tikety z Jiry' });
    expect(within(saved).queryByRole('alert')).toBeNull();
    expect(await storedSplit(client, 'Tikety z Jiry')).toBeDefined();
  });
});
