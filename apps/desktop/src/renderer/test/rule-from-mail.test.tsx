// @vitest-environment jsdom
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MessageSchema } from '@relay/shared';
import { demoIds } from '../src/data/demo/seed/ids';
import type { MailClient } from '../src/data/MailClient';
import { setUi } from '../src/state/ui-store';
import { demoClient, gate, openThreadBySubject, press, settle } from './features-support';
import { seededClient } from './support/contact-pane';
import { click, popover, stored } from './support/automations';
import { present } from './support/present';
import { renderApp, resetStores } from './support/render-app';

const TITLE = 'Nové pravidlo z mailu';
const NEWSLETTER = 'Je to newsletter Frontend týždenník';
const APPLY = 'Použiť aj na existujúce maily v doručenej pošte';

const rowBySubject = (subject: string): HTMLElement =>
  present(
    within(screen.getByRole('listbox', { name: 'Konverzácie' }))
      .getAllByRole('option')
      .find((row) => row.textContent.includes(subject)),
  );

const fromContextMenu = async (subject: string): Promise<HTMLElement> => {
  await screen.findByRole('listbox', { name: 'Konverzácie' });
  act(() => {
    fireEvent.contextMenu(rowBySubject(subject), { clientX: 120, clientY: 200 });
  });
  click(
    within(screen.getByRole('menu')).getByRole('menuitem', { name: 'Vytvoriť pravidlo z mailu…' }),
  );
  return screen.findByRole('dialog', { name: TITLE });
};

const showFor = async (key: string): Promise<HTMLElement> => {
  act(() => {
    setUi({ overlay: { kind: 'ruleFromMail', threadId: demoIds.thread(key) } });
  });
  const dialog = await screen.findByRole('dialog', { name: TITLE });
  await within(dialog).findByRole('group', { name: 'Akcie pravidla' });
  return dialog;
};

const forThread = async (client: MailClient, key: string): Promise<HTMLElement> => {
  renderApp({ demo: () => client });
  await screen.findByRole('listbox', { name: 'Konverzácie' });
  return showFor(key);
};

const checked = (dialog: HTMLElement, name: string): boolean =>
  within(dialog).getByRole<HTMLInputElement>('checkbox', { name }).checked;

const pressed = (dialog: HTMLElement, name: string): string | null =>
  within(dialog).getByRole('button', { name }).getAttribute('aria-pressed');

const summary = (dialog: HTMLElement): string =>
  within(dialog).getByRole('status', { name: 'Zhrnutie pravidla' }).textContent;

const previewText = async (dialog: HTMLElement): Promise<string> => {
  await waitFor(
    () => {
      const region = within(dialog).getByRole('region', { name: 'Náhľad pravidla' });
      expect(region.getAttribute('aria-busy')).toBe('false');
      expect(region.textContent).toContain('by to zachytilo');
    },
    { timeout: 2000 },
  );
  return (
    within(dialog).getByRole('region', { name: 'Náhľad pravidla' }).querySelector('.au-prev-h')
      ?.textContent ?? ''
  );
};

describe('Vytvoriť pravidlo z mailu', () => {
  beforeEach(() => {
    resetStores();
  });
  afterEach(() => {
    resetStores();
  });

  it('opens from the row context menu with options from the latest received mail', async () => {
    renderApp();
    const dialog = await fromContextMenu('Obed v piatok?');
    await within(dialog).findByRole('group', { name: 'Akcie pravidla' });

    expect(
      within(within(dialog).getByRole('group', { name: 'Podľa čoho rozpoznať maily' }))
        .getAllByRole('checkbox')
        .map((box) => box.getAttribute('aria-label')),
    ).toEqual([
      'Od tomas.balaz@firma.sk',
      'Z domény firma.sk',
      'Predmet obsahuje „Obed v piatok?“',
    ]);
    expect(checked(dialog, 'Od tomas.balaz@firma.sk')).toBe(true);
    expect(checked(dialog, 'Z domény firma.sk')).toBe(false);
    expect(summary(dialog)).toBe('Vyber aspoň jednu podmienku a jednu akciu.');
    expect(within(dialog).getByRole('button', { name: 'Vytvoriť' })).toHaveProperty(
      'disabled',
      true,
    );
  });

  it('offers the command in the palette for the open thread', async () => {
    renderApp();
    await openThreadBySubject('Obed v piatok?');
    act(() => {
      fireEvent.keyDown(document.body, { key: 'k', ctrlKey: true });
    });
    const palette = await screen.findByRole('dialog', { name: 'Príkazy' });
    act(() => {
      fireEvent.change(within(palette).getByRole('textbox', { name: 'Hľadať príkaz' }), {
        target: { value: 'pravidlo z mailu' },
      });
    });
    click(within(palette).getByRole('button', { name: /Vytvoriť pravidlo z mailu/ }));

    const dialog = await screen.findByRole('dialog', { name: TITLE });
    expect(
      await within(dialog).findByRole('checkbox', { name: 'Od tomas.balaz@firma.sk' }),
    ).toBeDefined();
  });

  it('defaults a newsletter to the newsletter option with clean up actions', async () => {
    const dialog = await forThread(demoClient(), 'o-newsletter');

    expect(checked(dialog, NEWSLETTER)).toBe(true);
    expect(checked(dialog, 'Od redakcia@frontend-tyzdennik.sk')).toBe(false);
    expect(pressed(dialog, 'Označiť ako prečítané')).toBe('true');
    expect(pressed(dialog, 'Archivovať')).toBe('true');
    expect(pressed(dialog, 'Pripnúť')).toBe('false');
    expect(summary(dialog)).toContain(
      'z newslettra a od redakcia@frontend-tyzdennik.sk, označí ho ako prečítaný a archivuje ho.',
    );
    expect(await previewText(dialog)).toBe('1 mail za 30 dní by to zachytilo');
    click(within(dialog).getByRole('button', { name: 'Zobraziť' }));
    expect(
      within(within(dialog).getByRole('list', { name: 'Ukážka zachytených mailov' })).getAllByRole(
        'listitem',
      )[0]?.textContent,
    ).toContain('Frontend týždenník');
  });

  it('changes the summary and the preview count when options change', async () => {
    const dialog = await forThread(demoClient(), 'c-lunch');
    click(within(dialog).getByRole('button', { name: 'Pripnúť' }));
    const sender = await previewText(dialog);

    click(within(dialog).getByRole('checkbox', { name: 'Od tomas.balaz@firma.sk' }));
    click(within(dialog).getByRole('checkbox', { name: 'Z domény firma.sk' }));
    await settle(500);
    const domain = await previewText(dialog);

    expect(summary(dialog)).toContain('Keď príde mail do účtu');
    expect(summary(dialog)).toContain('z domény firma.sk, pripne ho.');
    expect(domain).not.toBe(sender);

    click(within(dialog).getByRole('checkbox', { name: 'Predmet obsahuje „Obed v piatok?“' }));
    await settle(500);
    expect(summary(dialog)).toContain('z domény firma.sk a so slovom „Obed v piatok?“ v predmete');
    expect(await previewText(dialog)).toBe('1 mail za 30 dní by to zachytilo');
  });

  it('creates the rule on the mail account and shows it in the automations', async () => {
    const client = demoClient();
    const dialog = await forThread(client, 'o-newsletter');
    click(within(dialog).getByRole('button', { name: 'Vytvoriť' }));

    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: TITLE })).toBeNull();
    });
    expect(await stored(client, 'Newsletter Frontend týždenník')).toMatchObject({
      accountId: demoIds.account('efa'),
      enabled: true,
      match: 'all',
      conditions: [
        { type: 'header', name: 'List-Unsubscribe', pattern: '.+' },
        { type: 'fromAddress', address: 'redakcia@frontend-tyzdennik.sk' },
      ],
      exceptions: [],
      actions: [{ type: 'markRead' }, { type: 'archive' }],
    });
    expect(screen.getByRole('status').textContent).toContain(
      'Pravidlo Newsletter Frontend týždenník je vytvorené',
    );
    expect((await client.getThread(demoIds.thread('o-newsletter'))).thread.state).toBe('inbox');

    act(() => {
      setUi({ overlay: { kind: 'settings', section: 'automations', adding: false } });
    });
    const sheet = screen.getByRole('dialog', { name: 'Nastavenia' });
    expect(
      await within(sheet).findByRole('listitem', {
        name: 'Pravidlo Newsletter Frontend týždenník',
      }),
    ).toBeDefined();
  });

  it('applies the new rule to existing mail when chosen', async () => {
    const client = demoClient();
    const dialog = await forThread(client, 'o-newsletter');
    click(within(dialog).getByRole('checkbox', { name: APPLY }));
    click(within(dialog).getByRole('button', { name: 'Vytvoriť' }));

    await waitFor(() => {
      expect(screen.getByRole('status').textContent).toContain(
        'Pravidlo sa použilo na 1 konverzáciu',
      );
    });
    expect((await client.getThread(demoIds.thread('o-newsletter'))).thread.state).toBe('done');
  });

  it('adds a label action through the label picker', async () => {
    const client = demoClient();
    const dialog = await forThread(client, 'c-lunch');
    click(within(dialog).getByRole('button', { name: 'Pridať štítok' }));
    const picker = popover('Pridať štítok');
    const group = await within(picker).findByRole('group', { name: 'Pridať štítok' });
    const first = within(group).getAllByRole('button')[0];
    const name = present(first).textContent.trim();
    click(present(first));

    expect(pressed(dialog, `Štítok ${name}`)).toBe('true');
    expect(within(dialog).queryByRole('checkbox', { name: APPLY })).not.toBeNull();
    click(within(dialog).getByRole('button', { name: 'Vytvoriť' }));
    await waitFor(async () => {
      expect((await stored(client, 'Tomáš Baláž'))?.actions.map((action) => action.type)).toEqual([
        'addLabel',
      ]);
    });
  });

  it('opens the full editor with the unsaved draft and saves it there', async () => {
    const client = demoClient();
    const dialog = await forThread(client, 'c-lunch');
    click(within(dialog).getByRole('button', { name: 'Notifikácia' }));
    click(within(dialog).getByRole('button', { name: 'Upraviť podrobne' }));

    const sheet = screen.getByRole('dialog', { name: 'Nastavenia' });
    const rule = within(sheet).getByRole('region', { name: 'Pravidlo Tomáš Baláž' });
    expect(within(rule).getByText('Neuložené')).toBeDefined();
    expect(within(rule).getByRole('region', { name: 'Zhrnutie pravidla' }).textContent).toContain(
      'od tomas.balaz@firma.sk, pošle notifikáciu.',
    );
    expect(await stored(client, 'Tomáš Baláž')).toBeUndefined();

    click(within(rule).getByRole('button', { name: 'Uložiť pravidlo' }));
    await waitFor(async () => {
      expect(await stored(client, 'Tomáš Baláž')).toMatchObject({
        accountId: demoIds.account('efa'),
        conditions: [{ type: 'fromAddress', address: 'tomas.balaz@firma.sk' }],
        actions: [{ type: 'notify' }],
      });
    });
  });

  it('does not treat a personal reply after a newsletter as a newsletter', async () => {
    const { state, client } = seededClient();
    const record = present(state.threads.get(demoIds.thread('o-newsletter')));
    const newsletterMail = present(record.messages.at(-1));
    record.messages = [
      ...record.messages,
      MessageSchema.parse({
        ...newsletterMail,
        id: 'o-newsletter-reply',
        from: { name: 'Tomáš Baláž', email: 'tomas.balaz@firma.sk' },
        subject: `Re: ${newsletterMail.subject}`,
        date: new Date(Date.parse(newsletterMail.date) + 60_000).toISOString(),
      }),
    ];
    const dialog = await forThread(client, 'o-newsletter');

    expect(within(dialog).queryByRole('checkbox', { name: NEWSLETTER })).toBeNull();
    expect(checked(dialog, 'Od tomas.balaz@firma.sk')).toBe(true);
    expect(pressed(dialog, 'Archivovať')).toBe('false');
    expect(pressed(dialog, 'Označiť ako prečítané')).toBe('false');
  });

  it('saves once and leaves a newer dialog open when a slow save finishes', async () => {
    const base = demoClient();
    const held = gate();
    let saves = 0;
    const client: MailClient = {
      ...base,
      replaceAutomations: async (automations) => {
        saves += 1;
        await held.wait();
        return base.replaceAutomations(automations);
      },
    };
    const first = await forThread(client, 'o-newsletter');
    const create = within(first).getByRole('button', { name: 'Vytvoriť' });
    click(create);
    click(create);
    press('Escape');
    expect(screen.queryByRole('dialog', { name: TITLE })).toBeNull();

    const second = await showFor('c-lunch');
    held.open();
    await waitFor(async () => {
      expect(await stored(client, 'Newsletter Frontend týždenník')).toBeDefined();
    });
    await settle();

    expect(saves).toBe(1);
    expect(screen.getByRole('dialog', { name: TITLE })).toBe(second);
    expect(within(second).getByRole('checkbox', { name: 'Od tomas.balaz@firma.sk' })).toBeDefined();
  });
});
