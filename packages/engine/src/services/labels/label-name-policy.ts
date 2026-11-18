import { LABEL_DISPLAY_NAME_MAX_LENGTH } from '@relay/shared/api';
import { ConflictError, ValidationError } from '../../errors';
import { type Label, type LabelKind, labelNameKey } from '@relay/shared/domain';
import { isUserKeyword } from '../shared/user-keyword';
import { encodeKeyword, keywordKey } from './keyword-codec';

export interface LabelNameCandidate {
  readonly name: string;
  readonly kind: LabelKind;
  readonly others: readonly Label[];
  readonly newIdentity: boolean;
}

export const KEYWORD_MAX_LENGTH = 50;

export const LABEL_NAME_TAKEN = 'Štítok s týmto názvom už existuje.';

const GMAIL_RESERVED_PREFIX = '[gmail]';

const isReservedGmailName = (name: string): boolean =>
  labelNameKey(name).startsWith(GMAIL_RESERVED_PREFIX) || name.includes('\\');

export const remoteNameOf = (kind: LabelKind, name: string): string =>
  kind === 'keyword' ? encodeKeyword(name) : name;

const clashes = (candidate: LabelNameCandidate, name: string): boolean => {
  const remote = keywordKey(remoteNameOf(candidate.kind, name));
  return candidate.others.some(
    (label) =>
      labelNameKey(label.name) === labelNameKey(name) ||
      (candidate.newIdentity &&
        label.kind === candidate.kind &&
        keywordKey(label.remoteName) === remote),
  );
};

const CONTROL_CHARACTER = /\p{Cc}/u;

const requireAllowed = (candidate: LabelNameCandidate, name: string): void => {
  if (CONTROL_CHARACTER.test(name)) {
    throw new ValidationError('Názov štítka nesmie obsahovať riadiace znaky.');
  }
  if (candidate.kind === 'gmail' && isReservedGmailName(name)) {
    throw new ValidationError('Názov Gmail štítka nesmie začínať „[Gmail]“ ani obsahovať „\\“.');
  }
  if (candidate.kind !== 'keyword' || !candidate.newIdentity) {
    return;
  }
  const keyword = encodeKeyword(name);
  if (!isUserKeyword(keyword)) {
    throw new ValidationError('Tento názov je vyhradený serverom.');
  }
  if (keyword.length > KEYWORD_MAX_LENGTH) {
    throw new ValidationError('Názov štítka je pre server príliš dlhý.');
  }
};

export const acceptedLabelName = (candidate: LabelNameCandidate): string => {
  const name = candidate.name.trim();
  if (name.length === 0 || name.length > LABEL_DISPLAY_NAME_MAX_LENGTH) {
    throw new ValidationError(
      `Názov štítka musí mať 1 až ${String(LABEL_DISPLAY_NAME_MAX_LENGTH)} znakov.`,
    );
  }
  requireAllowed(candidate, name);
  if (clashes(candidate, name)) {
    throw new ConflictError(LABEL_NAME_TAKEN);
  }
  return name;
};

export const asNameConflict = async <Result>(work: Promise<Result>): Promise<Result> => {
  try {
    return await work;
  } catch (error) {
    if (error instanceof ConflictError) {
      throw new ConflictError(LABEL_NAME_TAKEN, { cause: error });
    }
    throw error;
  }
};
