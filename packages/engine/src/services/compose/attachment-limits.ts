import {
  MAX_ATTACHMENT_BYTES,
  MAX_DRAFT_ATTACHMENT_COUNT,
  MAX_DRAFT_ATTACHMENTS_BYTES,
} from '@relay/shared/domain';
import { ValidationError } from '../../errors';

interface Sized {
  readonly size: number;
}

const totalOf = (items: readonly Sized[]): number =>
  items.reduce((sum, item) => sum + item.size, 0);

export const assertFileSize = (bytes: number): void => {
  if (bytes > MAX_ATTACHMENT_BYTES) {
    throw new ValidationError('Súbor je väčší ako 25 MB');
  }
};

export const assertDraftCapacity = (existing: readonly Sized[], added: readonly Sized[]): void => {
  added.forEach((item) => {
    assertFileSize(item.size);
  });
  if (existing.length + added.length > MAX_DRAFT_ATTACHMENT_COUNT) {
    throw new ValidationError(
      `Koncept môže mať najviac ${String(MAX_DRAFT_ATTACHMENT_COUNT)} príloh`,
    );
  }
  if (totalOf(existing) + totalOf(added) > MAX_DRAFT_ATTACHMENTS_BYTES) {
    throw new ValidationError('Prílohy spolu presahujú 25 MB');
  }
};
