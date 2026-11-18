import { Icon, Kbd } from '@relay/ui';
import { type MouseEvent, useRef } from 'react';
import type { ModelChoice } from '../../ai/model-choice/model-choice';
import { ModelTrigger } from './ModelTrigger';
import { ReasoningTrigger } from './ReasoningTrigger';

export interface ChatComposerProps {
  readonly question: string;
  readonly running: boolean;
  readonly choice: ModelChoice;
  readonly onQuestion: (text: string) => void;
  readonly onSubmit: () => void;
  readonly onChoice: (next: ModelChoice) => void;
}

export function ChatComposer({
  question,
  running,
  choice,
  onQuestion,
  onSubmit,
  onChoice,
}: ChatComposerProps) {
  const input = useRef<HTMLInputElement>(null);
  const focusInput = (event: MouseEvent<HTMLDivElement>) => {
    const target = event.target;
    if (!(target instanceof Element) || !event.currentTarget.contains(target)) {
      return;
    }
    if (target.closest('button, input, .ov') !== null) {
      return;
    }
    event.preventDefault();
    input.current?.focus();
  };
  return (
    <div className="chat-in" onMouseDown={focusInput}>
      <input
        ref={input}
        id="chat-q"
        placeholder="Spýtaj sa na poštu…"
        autoComplete="off"
        spellCheck={false}
        aria-label="Otázka pre AI"
        value={question}
        onChange={(event) => {
          onQuestion(event.target.value);
        }}
        onKeyDown={(event) => {
          if (event.nativeEvent.isComposing) {
            return;
          }
          if (event.key === 'Escape') {
            event.currentTarget.blur();
            return;
          }
          if (event.key === 'Enter' && !event.defaultPrevented) {
            event.preventDefault();
            onSubmit();
          }
        }}
      />
      <div className="cbar">
        <ModelTrigger value={choice} onChange={onChoice} />
        <ReasoningTrigger value={choice} onChange={onChoice} />
        <span className="cend">
          <Kbd keys={['A']} />
          <button
            type="button"
            className="send"
            aria-label="Odoslať otázku"
            title="Odoslať (Enter)"
            disabled={running || question.trim() === ''}
            onClick={onSubmit}
          >
            <Icon name="arrowUp" size={14} strokeWidth={1.9} />
          </button>
        </span>
      </div>
    </div>
  );
}
