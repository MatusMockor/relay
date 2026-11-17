import type { UnsubscribeUrl } from '@relay/shared/domain';

export interface UnsubscribeSender {
  sendOneClick(url: UnsubscribeUrl): Promise<void>;
}
