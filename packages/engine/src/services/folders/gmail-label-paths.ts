import type { Label } from '@relay/shared/domain';
import { acceptedLabelName } from '../labels/label-name-policy';

export const assertGmailLabelPaths = (paths: readonly string[], others: readonly Label[]): void => {
  paths.forEach((name) => {
    acceptedLabelName({ name, kind: 'gmail', others, newIdentity: true });
  });
};
