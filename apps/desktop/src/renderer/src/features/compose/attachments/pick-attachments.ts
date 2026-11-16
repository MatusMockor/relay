import type { IpcResult, PickedFiles, RelayBridge } from '@relay/shared';
import { MailClientError } from '../../../data/errors';

const unwrap = async <T>(result: Promise<IpcResult<T>>): Promise<T> => {
  const settled = await result;
  if (!settled.ok) {
    throw new MailClientError(settled.error);
  }
  return settled.data;
};

export const pickNativeAttachments = (
  bridge: RelayBridge | null,
  budgetBytes: number,
): Promise<PickedFiles> | null =>
  bridge === null ? null : unwrap(bridge.invoke('app.pickAttachments', { budgetBytes }));
