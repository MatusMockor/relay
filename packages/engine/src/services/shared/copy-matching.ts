import type { Message } from '@relay/shared/domain';

export const sameGmailMail = (left: Message, right: Message): boolean => {
  if (left.id === right.id) {
    return true;
  }
  if (left.emailId !== null && right.emailId !== null) {
    return left.emailId === right.emailId;
  }
  return left.messageIdHeader !== null && left.messageIdHeader === right.messageIdHeader;
};

export const sameGmailBody = (message: Message, donor: Message): boolean =>
  message.emailId === donor.emailId;
