import { hasMessageBody, type Message } from '@relay/shared';
import { useMessageBody } from '../../data/hooks/use-message-body';
import { MessageBody } from './MessageBody';
import { TextBody } from './TextBody';

export const OFFLINE_NOTICE = 'Táto správa nie je uložená offline. Zobrazí sa, keď budeš online.';
export const GONE_NOTICE = 'Správu sa nepodarilo načítať zo servera.';

function SnippetWith({ message, notice }: { readonly message: Message; readonly notice: string }) {
  return (
    <div className="msg-remote">
      <TextBody text={message.snippet} />
      <p className={`msg-offline${notice === GONE_NOTICE ? ' gone' : ''}`} role="status">
        {notice}
      </p>
    </div>
  );
}

export function RemoteBody({ message }: { readonly message: Message }) {
  const body = useMessageBody(message);
  const result = body.data;
  if (result !== undefined && hasMessageBody(result)) {
    return (
      <MessageBody
        subject={message.subject}
        snippet={message.snippet}
        textBody={result.textBody}
        htmlBody={result.htmlBody}
      />
    );
  }
  if (result?.status === 'offline') {
    return <SnippetWith message={message} notice={OFFLINE_NOTICE} />;
  }
  if (result?.status === 'gone' || body.isError) {
    return <SnippetWith message={message} notice={GONE_NOTICE} />;
  }
  return (
    <div className="msg-remote" aria-busy="true">
      <TextBody text={message.snippet} />
      <div className="msg-skeleton" aria-label="Načítavam správu zo servera">
        <span />
        <span />
        <span />
      </div>
    </div>
  );
}
