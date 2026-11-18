import type { AccountId, Label, LabelId, Mailbox, MailboxId, MailboxRole } from '@relay/shared';
import { describe, expect, it } from 'vitest';
import {
  labelEntries,
  mailboxEntries,
  syncedFolders,
} from '../src/features/folders/folder-sections';
import { buildFolderTree, type FolderTreeNode } from '../src/features/folders/folder-tree';

const ACCOUNT = 'acc-1' as AccountId;

const mailbox = (
  path: string,
  options: { role?: MailboxRole; delimiter?: string | null; subscribed?: boolean } = {},
): Mailbox => ({
  id: `mbx-${path}` as MailboxId,
  accountId: ACCOUNT,
  name: path,
  path,
  delimiter: options.delimiter === undefined ? '/' : options.delimiter,
  role: options.role ?? 'custom',
  subscribed: options.subscribed ?? true,
  uidValidity: 1,
  unreadCount: 0,
  totalCount: 0,
});

const label = (name: string, kind: Label['kind']): Label => ({
  id: `lbl-${name}` as LabelId,
  accountId: ACCOUNT,
  name,
  color: null,
  kind,
  remoteName: name,
});

interface Shape {
  readonly name: string;
  readonly real: boolean;
  readonly children: readonly Shape[];
}

const shapeOf = <Value,>(nodes: readonly FolderTreeNode<Value>[]): Shape[] =>
  nodes.map((node) => ({
    name: node.name,
    real: node.value !== null,
    children: shapeOf(node.children),
  }));

const leaf = (name: string): Shape => ({ name, real: true, children: [] });

describe('folder tree', () => {
  it('nests folders by delimiter and creates missing parents for unselectable gaps', () => {
    const tree = buildFolderTree(
      mailboxEntries([
        mailbox('Projekty'),
        mailbox('Projekty/Beta'),
        mailbox('Klienti/Zrnko'),
        mailbox('Projekty/Alfa'),
      ]),
    );

    expect(shapeOf(tree)).toEqual([
      { name: 'Klienti', real: false, children: [leaf('Zrnko')] },
      { name: 'Projekty', real: true, children: [leaf('Alfa'), leaf('Beta')] },
    ]);
    expect(tree[0]?.children[0]?.key).toBe('Klienti/Zrnko');
  });

  it('sorts names the Slovak way', () => {
    const tree = buildFolderTree(
      mailboxEntries(
        ['Čajovňa', 'Zákazky', 'Archív 2024', 'Cestovanie', 'Šport'].map((path) => mailbox(path)),
      ),
    );

    expect(tree.map((node) => node.name)).toEqual([
      'Archív 2024',
      'Cestovanie',
      'Čajovňa',
      'Šport',
      'Zákazky',
    ]);
  });

  it('uses the server delimiter and hides the INBOX namespace prefix', () => {
    const tree = buildFolderTree(
      mailboxEntries([
        mailbox('INBOX.Zákazky', { delimiter: '.' }),
        mailbox('INBOX.Zákazky.Brezina', { delimiter: '.' }),
        mailbox('Projekty/Alfa', { delimiter: null }),
      ]),
    );

    expect(shapeOf(tree)).toEqual([
      leaf('Projekty/Alfa'),
      { name: 'Zákazky', real: true, children: [leaf('Brezina')] },
    ]);
  });

  it('keeps only custom subscribed folders unless the server reports no subscriptions', () => {
    const subscribed = [
      mailbox('INBOX', { role: 'inbox' }),
      mailbox('Projekty'),
      mailbox('Staré', { subscribed: false }),
      mailbox('Klienti', { role: 'label' }),
    ];
    const unknown = subscribed.map((item) => ({ ...item, subscribed: false }));

    expect(syncedFolders(subscribed).map((item) => item.path)).toEqual(['Projekty']);
    expect(syncedFolders(unknown).map((item) => item.path)).toEqual(['Projekty', 'Staré']);
  });

  it('splits Gmail labels on a slash and keeps keyword labels flat', () => {
    const tree = buildFolderTree(
      labelEntries([
        label('Klienti/Acme', 'gmail'),
        label('Cestovanie', 'gmail'),
        label('Cestovanie/Taliansko 2026', 'gmail'),
        label('a/b', 'keyword'),
      ]),
    );

    expect(shapeOf(tree)).toEqual([
      leaf('a/b'),
      { name: 'Cestovanie', real: true, children: [leaf('Taliansko 2026')] },
      { name: 'Klienti', real: false, children: [leaf('Acme')] },
    ]);
  });
});
