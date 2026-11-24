import { HtmlMailFrame } from './HtmlMailFrame';
import { TextBody } from './TextBody';

export interface MessageBodyProps {
  readonly subject: string;
  readonly snippet: string;
  readonly textBody: string | null;
  readonly htmlBody: string | null;
}

export function MessageBody({ subject, snippet, textBody, htmlBody }: MessageBodyProps) {
  if (htmlBody !== null) {
    return <HtmlMailFrame html={htmlBody} title={`Obsah správy: ${subject}`} />;
  }
  return <TextBody text={textBody ?? snippet} />;
}
