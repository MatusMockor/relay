import { useEffect } from 'react';
import { useClient } from './services-context';

export interface AutomationNotificationSink {
  show(title: string, body: string): void;
}

const browserNotifications: AutomationNotificationSink = {
  show: (title, body) => {
    if (typeof Notification === 'undefined' || Notification.permission === 'denied') {
      return;
    }
    new Notification(title, { body });
  },
};

export const useRemoteAutomationNotifications = (
  sink: AutomationNotificationSink = browserNotifications,
): void => {
  const client = useClient();
  useEffect(() => {
    if (client.kind !== 'remote') {
      return undefined;
    }
    return client.subscribe((event) => {
      if (event.type !== 'automation.notified') {
        return;
      }
      sink.show(event.data.title, event.data.body);
    });
  }, [client, sink]);
};
