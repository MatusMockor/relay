import type { AccountId, Label, LabelId, LabelKind } from '@relay/shared';
import { MailClientError } from '../errors';

const invalid = (message: string) => new MailClientError({ code: 'validation_failed', message });

const sameName = (left: string, right: string): boolean =>
  left.toLocaleLowerCase('sk') === right.toLocaleLowerCase('sk');

export const labelNotFound = () =>
  new MailClientError({ code: 'not_found', message: 'Štítok neexistuje' });

export const assertLabelName = (
  labels: readonly Label[],
  accountId: AccountId,
  kind: LabelKind,
  name: string,
  except?: LabelId,
): void => {
  if (kind === 'gmail' && (name.toLowerCase().startsWith('[gmail]') || name.includes('\\'))) {
    throw invalid('Názov Gmail štítka nesmie začínať „[Gmail]“ ani obsahovať „\\“.');
  }
  const taken = labels.some(
    (label) => label.accountId === accountId && label.id !== except && sameName(label.name, name),
  );
  if (taken) {
    throw new MailClientError({ code: 'conflict', message: 'Štítok s týmto názvom už existuje.' });
  }
};

export const invalidLabel = () => invalid('Názov štítka musí mať 1 až 100 znakov.');
