import { NO_UNSUBSCRIBE, type ThreadSummary, type UnsubscribeOptions } from '@relay/shared';
import { MailClientError } from '../errors';

const DEMO_UNSUBSCRIBE: Readonly<Record<string, UnsubscribeOptions>> = {
  'redakcia@frontend-tyzdennik.sk': {
    oneClick: true,
    url: 'https://frontend-tyzdennik.sk/odhlasit',
    mailto: null,
  },
  'news@badevdays.sk': {
    oneClick: false,
    url: null,
    mailto: { to: 'odhlasit@badevdays.sk', subject: 'Odhlásiť', body: null },
  },
};

export const demoUnsubscribeFor = (email: string): UnsubscribeOptions | undefined =>
  DEMO_UNSUBSCRIBE[email.toLowerCase()];

export const demoUnsubscribeOptions = (thread: ThreadSummary): UnsubscribeOptions =>
  thread.participants
    .map((address) => demoUnsubscribeFor(address.email))
    .find((options) => options !== undefined) ?? NO_UNSUBSCRIBE;

export const demoUnsubscribe = (thread: ThreadSummary, confirmed: string): void => {
  const options = demoUnsubscribeOptions(thread);
  if (!options.oneClick) {
    throw new MailClientError({
      code: 'validation_failed',
      message: 'Odosielateľ nepodporuje odhlásenie jedným klikom',
    });
  }
  if (options.url !== confirmed) {
    throw new MailClientError({ code: 'conflict', message: 'Odkaz na odhlásenie sa zmenil' });
  }
};
