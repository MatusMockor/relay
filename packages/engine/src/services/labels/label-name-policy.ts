import { LABEL_DISPLAY_NAME_MAX_LENGTH } from '@relay/shared/api';
import type { Label, LabelKind } from '@relay/shared/domain';
import { ConflictError, ValidationError } from '../../errors';

export interface LabelNameCandidate {
  readonly name: string;
  readonly kind: LabelKind;
  readonly others: readonly Label[];
  readonly becomesRemoteName: boolean;
}

const GMAIL_RESERVED_PREFIX = '[gmail]';

const folded = (value: string): string => value.toLocaleLowerCase('sk');

const isReservedGmailName = (name: string): boolean =>
  folded(name).startsWith(GMAIL_RESERVED_PREFIX) || name.includes('\\');

const clashes = (candidate: LabelNameCandidate, name: string): boolean =>
  candidate.others.some(
    (label) =>
      folded(label.name) === folded(name) ||
      (candidate.becomesRemoteName && label.kind === candidate.kind && label.remoteName === name),
  );

export const acceptedLabelName = (candidate: LabelNameCandidate): string => {
  const name = candidate.name.trim();
  if (name.length === 0 || name.length > LABEL_DISPLAY_NAME_MAX_LENGTH) {
    throw new ValidationError(
      `Názov štítka musí mať 1 až ${String(LABEL_DISPLAY_NAME_MAX_LENGTH)} znakov.`,
    );
  }
  if (candidate.kind === 'gmail' && isReservedGmailName(name)) {
    throw new ValidationError('Názov Gmail štítka nesmie začínať „[Gmail]“ ani obsahovať „\\“.');
  }
  if (clashes(candidate, name)) {
    throw new ConflictError('Štítok s týmto názvom už existuje.');
  }
  return name;
};
