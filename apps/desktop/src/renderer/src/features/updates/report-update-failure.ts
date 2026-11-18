import { describeError } from '../../data/errors';
import { showToast } from '../../state/toast-store';

export const reportUpdateFailure = (error: unknown): void => {
  showToast(describeError(error));
};
