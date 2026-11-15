import type { ThreadId } from '@relay/shared';
import { useQueryClient } from '@tanstack/react-query';
import { findCachedThread } from '../../data/hooks/thread-cache';
import { openThread } from '../mail/navigation';
import { parseAnswer } from './answer-links';

function ThreadLink({ threadId }: { readonly threadId: ThreadId }) {
  const queryClient = useQueryClient();
  const subject = findCachedThread(queryClient, threadId)?.subject ?? '';
  return (
    <button
      type="button"
      className="ans-link"
      onClick={() => {
        openThread(threadId);
      }}
    >
      {subject.trim() === '' ? 'Otvoriť vlákno' : subject}
    </button>
  );
}

export interface ChatAnswerProps {
  readonly text: string;
  readonly references: readonly ThreadId[];
  readonly failed: boolean;
}

export function ChatAnswer({ text, references, failed }: ChatAnswerProps) {
  if (failed) {
    return <div className="ans err">{text}</div>;
  }
  const { parts, related } = parseAnswer(text, references);
  return (
    <div className="ans">
      <span>
        {parts.map((part, index) =>
          part.kind === 'text' ? (
            <span key={index}>{part.text}</span>
          ) : (
            <ThreadLink key={index} threadId={part.threadId} />
          ),
        )}
      </span>
      {related.length === 0 ? null : (
        <div className="ans-refs" role="group" aria-label="Súvisiace vlákna">
          {related.map((threadId) => (
            <ThreadLink key={threadId} threadId={threadId} />
          ))}
        </div>
      )}
    </div>
  );
}
