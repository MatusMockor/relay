import type { NotificationRequest } from '@relay/shared';
import { useEffect } from 'react';
import { sessionKeyOf } from '../../session/session-key';
import { showToast } from '../../state/toast-store';
import { useClient } from './services-context';

export interface AutomationNotificationSink {
  showNotification(notification: NotificationRequest): Promise<void>;
}

export const NOTIFICATION_FAILED_MESSAGE = 'Notifikáciu automatizácie sa nepodarilo zobraziť';

export const useRemoteAutomationNotifications = (sink: AutomationNotificationSink): void => {
  const client = useClient();
  useEffect(() => {
    if (client.kind !== 'remote') {
      return undefined;
    }
    const session = sessionKeyOf(client);
    return client.subscribe((event) => {
      if (event.type !== 'automation.notified') {
        return;
      }
      sink
        .showNotification({
          title: event.data.title,
          body: event.data.body,
          threadId: event.data.threadId,
          session,
        })
        .catch(() => {
          showToast(NOTIFICATION_FAILED_MESSAGE);
        });
    });
  }, [client, sink]);
};
