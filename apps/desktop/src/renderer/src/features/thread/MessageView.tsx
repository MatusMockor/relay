import type { Message } from '@relay/shared';
import { Avatar } from '@relay/ui';
import { messageTimeLabel } from '../../lib/dates';
import { AttachmentList } from './AttachmentList';
import { HtmlMailFrame } from './HtmlMailFrame';
import { TextBody } from './TextBody';

export interface MessageViewProps {
  readonly message: Message;
  readonly mine: boolean;
  readonly recipientName: string;
  readonly onCollapse?: () => void;
}

export function MessageView({ message, mine, recipientName, onCollapse }: MessageViewProps) {
  const name = mine ? 'Ty' : (message.from?.name ?? message.from?.email ?? 'Neznámy');
  const header = (
    <>
      <Avatar name={message.from?.name ?? message.from?.email ?? '?'} seed={message.from?.email} />
      <div>
        <b>{name}</b>
        <small>{mine ? `pre ${recipientName}` : 'pre teba'}</small>
      </div>
      <time dateTime={message.date}>{messageTimeLabel(message.date, new Date())}</time>
    </>
  );
  return (
    <article className={`msg${mine ? ' mine' : ''}`} aria-label={`Správa od ${name}`}>
      {onCollapse === undefined ? (
        <div className="mh">{header}</div>
      ) : (
        <button type="button" className="mh" onClick={onCollapse}>
          {header}
        </button>
      )}
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
      <Avatar
        name={message.from?.name ?? message.from?.email ?? '?'}
        seed={message.from?.email}
        size="sm"
      />
      <b>{mine ? 'Ty' : (message.from?.name ?? message.from?.email)}</b>
      <span className="s">{message.snippet}</span>
      <time>{messageTimeLabel(message.date, new Date())}</time>
    </button>
  );
}
