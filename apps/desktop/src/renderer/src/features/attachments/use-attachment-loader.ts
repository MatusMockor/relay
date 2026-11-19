import { useClient } from '../../data/hooks/services-context';
import type { BlobLoader } from './use-blob-action';

export const useAttachmentLoader = (): BlobLoader => {
  const client = useClient();
  return (attachment) => client.downloadAttachment(attachment.id).then((file) => file.blob);
};
