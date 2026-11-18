import type { NotificationRequest } from '@relay/shared';
import { useEffect } from 'react';
import { useClient } from './services-context';

export interface AutomationNotificationSink {
  showNotification(notification: NotificationRequest): void;
}

export const useRemoteAutomationNotifications = (sink: AutomationNotificationSink): void => {
  const client = useClient();
  useEffect(() => {
    if (client.kind !== 'remote') {
      return undefined;
    }
    return client.subscribe((event) => {
      if (event.type !== 'automation.notified') {
        return;
      }
      sink.showNotification({
        title: event.data.title,
        body: event.data.body,
        threadId: event.data.threadId,
      });
    });
  }, [client, sink]);
};
