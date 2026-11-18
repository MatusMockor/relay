import {
  NOTIFICATION_BODY_MAX,
  NOTIFICATION_TITLE_MAX,
  type NotificationRequest,
} from '@relay/shared';

const ELLIPSIS = '…';

const fitText = (text: string, max: number): string => {
  if (text.length <= max) {
    return text;
  }
  const kept: string[] = [];
  let length = ELLIPSIS.length;
  for (const character of text) {
    if (length + character.length > max) {
      break;
    }
    kept.push(character);
    length += character.length;
  }
  return `${kept.join('')}${ELLIPSIS}`;
};

export const fitNotification = (notification: NotificationRequest): NotificationRequest => ({
  ...notification,
  title: fitText(notification.title, NOTIFICATION_TITLE_MAX),
  body: fitText(notification.body, NOTIFICATION_BODY_MAX),
});
