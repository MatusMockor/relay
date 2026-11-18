import type { Mailbox } from '@relay/shared/domain';
import { ConflictError, ValidationError } from '../../errors';
import { isReservedName } from './folder-guard';

export interface ListedPath {
  readonly path: string;
  readonly delimiter: string | null;
}

export interface FolderParent {
  readonly path: string;
  readonly delimiter: string | null;
}

const WILDCARDS: readonly string[] = ['*', '%'];

export const accountDelimiter = (mailboxes: readonly ListedPath[]): string | null =>
  mailboxes.find((mailbox) => mailbox.delimiter !== null && mailbox.delimiter !== '')?.delimiter ??
  null;

export const leafName = (mailbox: ListedPath): string => {
  const { path, delimiter } = mailbox;
  if (delimiter === null || delimiter === '') {
    return path;
  }
  return path.slice(path.lastIndexOf(delimiter) + delimiter.length);
};

export const parentOf = (mailbox: ListedPath): FolderParent | null => {
  const { path, delimiter } = mailbox;
  const index = delimiter === null || delimiter === '' ? -1 : path.lastIndexOf(delimiter);
  return index <= 0 ? null : { path: path.slice(0, index), delimiter };
};

export const isInTree = (root: ListedPath, path: string): boolean =>
  path === root.path ||
  (root.delimiter !== null && root.delimiter !== '' && path.startsWith(root.path + root.delimiter));

export const namespacePrefix = (mailboxes: readonly ListedPath[]): string => {
  const delimiter = accountDelimiter(mailboxes);
  if (delimiter === null) {
    return '';
  }
  const prefix = `INBOX${delimiter}`.toUpperCase();
  const others = mailboxes.filter((mailbox) => mailbox.path.toUpperCase() !== 'INBOX');
  const nested = others.every((mailbox) => mailbox.path.toUpperCase().startsWith(prefix));
  return others.length > 0 && nested ? (others[0]?.path.slice(0, prefix.length) ?? '') : '';
};

export const validFolderName = (raw: string, delimiter: string | null): string => {
  const name = raw.trim();
  if (name === '') {
    throw new ValidationError('Názov priečinka nemôže byť prázdny.');
  }
  const forbidden = [...WILDCARDS, ...(delimiter === null ? [] : [delimiter])];
  if (forbidden.some((character) => name.includes(character))) {
    const listed = forbidden.map((character) => `„${character}“`).join(', ');
    throw new ValidationError(`Názov priečinka nemôže obsahovať znaky ${listed}.`);
  }
  if (isReservedName(name)) {
    throw new ValidationError('Tento názov je vyhradený pre systémový priečinok.');
  }
  return name;
};

export const childPath = (
  name: string,
  parent: FolderParent | null,
  mailboxes: readonly ListedPath[],
): string => {
  if (parent === null) {
    return `${namespacePrefix(mailboxes)}${name}`;
  }
  if (parent.delimiter === null || parent.delimiter === '') {
    throw new ValidationError('Do tohto priečinka nie je možné vnoriť ďalší priečinok.');
  }
  return `${parent.path}${parent.delimiter}${name}`;
};

export const assertFreePath = (
  path: string,
  listed: readonly ListedPath[],
  except: Mailbox | null = null,
): void => {
  const wanted = path.toLocaleLowerCase('sk');
  const clash = listed.some(
    (mailbox) => mailbox.path !== except?.path && mailbox.path.toLocaleLowerCase('sk') === wanted,
  );
  if (clash) {
    throw new ConflictError('Priečinok s týmto názvom tu už existuje.');
  }
};
