import type { Message } from '@relay/shared';
import { Avatar, Icon, IconButton } from '@relay/ui';
import { messageTimeLabel } from '../../lib/dates';
import { AttachmentList } from './AttachmentList';
import { HtmlMailFrame } from './HtmlMailFrame';
import { MessageCopies } from './MessageCopies';
import { MeAvatar } from '../shell/MeAvatar';
import { TextBody } from './TextBody';

export interface MessageViewProps {
  readonly message: Message;
  readonly mine: boolean;
  readonly recipientName: string;
  readonly onCollapse?: () => void;
  readonly onForward?: () => void;
}

export function MessageView({
  message,
  mine,
  recipientName,
  onCollapse,
  onForward,
}: MessageViewProps) {
  const name = mine ? 'Ty' : (message.from?.name ?? message.from?.email ?? 'Neznámy');
  const header = (
    <>
      {mine ? (
        <MeAvatar name={message.from?.name ?? message.from?.email} />
      ) : (
        <Avatar
          name={message.from?.name ?? message.from?.email ?? '?'}
          seed={message.from?.email}
        />
      )}
      <div>
        <b>{name}</b>
        <small>{mine ? `pre ${recipientName}` : 'pre teba'}</small>
        <MessageCopies message={message} />
      </div>
      <time dateTime={message.date}>{messageTimeLabel(message.date, new Date())}</time>
    </>
  );
  return (
    <article className={`msg${mine ? ' mine' : ''}`} aria-label={`Správa od ${name}`}>
      <div className="mh">
        {onCollapse === undefined ? (
          <div className="mh-main">{header}</div>
        ) : (
          <button type="button" className="mh-main" onClick={onCollapse}>
            {header}
          </button>
        )}
        {onForward === undefined ? null : (
          <IconButton label="Preposlať túto správu" onClick={onForward}>
            <Icon name="forwardMail" />
          </IconButton>
        )}
      </div>
      {message.htmlBody !== null ? (
        <HtmlMailFrame html={message.htmlBody} title={`Obsah správy: ${message.subject}`} />
      ) : (
        <TextBody text={message.textBody ?? message.snippet} />
      )}
      <AttachmentList attachments={message.attachments} />
    </article>
  );
}

export function CollapsedMessage({
  message,
  mine,
  onExpand,
}: {
  readonly message: Message;
  readonly mine: boolean;
  readonly onExpand: () => void;
}) {
  return (
    <button type="button" className="m-c" onClick={onExpand}>
      {mine ? (
        <MeAvatar size="sm" name={message.from?.name ?? message.from?.email} />
      ) : (
        <Avatar
          name={message.from?.name ?? message.from?.email ?? '?'}
          seed={message.from?.email}
          size="sm"
        />
      )}
      <b>{mine ? 'Ty' : (message.from?.name ?? message.from?.email)}</b>
      <span className="s">{message.snippet}</span>
      <time>{messageTimeLabel(message.date, new Date())}</time>
    </button>
  );
}
