import {
  MAX_ATTACHMENT_BYTES,
  MAX_DRAFT_ATTACHMENT_COUNT,
  MAX_DRAFT_ATTACHMENTS_BYTES,
  type RejectedFile,
} from '@relay/shared';
import type { AttachmentUploadInput } from '../../../data/MailClient';

export interface Admission {
  readonly accepted: AttachmentUploadInput[];
  readonly problems: string[];
}

export const tooLargeMessage = (filename: string): string => `Súbor ${filename} je väčší ako 25 MB`;

export const overBudgetMessage = (filename: string): string =>
  `Súbor ${filename} sa už nezmestí, prílohy spolu môžu mať najviac 25 MB`;

export const rejectedMessage = (file: RejectedFile): string => {
  if (file.reason === 'too_large') {
    return tooLargeMessage(file.filename);
  }
  if (file.reason === 'total_exceeded') {
    return overBudgetMessage(file.filename);
  }
  return `Súbor ${file.filename} sa nepodarilo načítať`;
};

export const remainingBudget = (usedBytes: number): number =>
  Math.max(0, MAX_DRAFT_ATTACHMENTS_BYTES - usedBytes);

export const admit = (
  inputs: readonly AttachmentUploadInput[],
  used: { readonly bytes: number; readonly count: number },
): Admission =>
  inputs.reduce<Admission & { bytes: number }>(
    (state, input) => {
      const size = input.blob.size;
      if (size > MAX_ATTACHMENT_BYTES) {
        return { ...state, problems: [...state.problems, tooLargeMessage(input.filename)] };
      }
      if (state.bytes + size > MAX_DRAFT_ATTACHMENTS_BYTES) {
        return { ...state, problems: [...state.problems, overBudgetMessage(input.filename)] };
      }
      if (used.count + state.accepted.length >= MAX_DRAFT_ATTACHMENT_COUNT) {
        return {
          ...state,
          problems: [
            ...state.problems,
            `Koncept môže mať najviac ${String(MAX_DRAFT_ATTACHMENT_COUNT)} príloh`,
          ],
        };
      }
      return { ...state, bytes: state.bytes + size, accepted: [...state.accepted, input] };
    },
    { accepted: [], problems: [], bytes: used.bytes },
  );
