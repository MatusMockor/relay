import { DEFAULT_MODEL_SELECTION } from '@relay/shared';
import { Icon } from '@relay/ui';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { queryKeys } from '../../data/hooks/query-keys';
import { useThreadDetail, useUserSettings } from '../../data/hooks/use-mail-queries';
import { useUiStore } from '../../state/ui-store';
import type { ModelChoice } from '../ai/model-choice/model-choice';
import { RUNNER_LABELS } from '../ai/model-choice/model-labels';
import { useMailActions } from '../mail/MailActionsProvider';
import { ChatAnswer } from './ChatAnswer';
import { ChatComposer } from './chat-composer/ChatComposer';
import { setChatChoice, setChatDraft, useChat } from './chat-store';
import { finishedStepLabel } from './step-labels';
import { useChatRuns } from './use-chat-runs';

export function AiChatPane() {
  const queryClient = useQueryClient();
  const { current } = useMailActions();
  const openThreadId = useUiStore((state) => state.openThreadId);
  const settings = useUserSettings();
  const { turns, queued, draft: question, choice: override } = useChat();
  const log = useRef<HTMLDivElement>(null);
  const choice = override ?? settings.data?.ai.defaultModel ?? DEFAULT_MODEL_SELECTION;
  const thread = current?.kind === 'thread' ? current.thread : null;
  const threadId = openThreadId ?? thread?.id ?? null;
  const openDetail = useThreadDetail(openThreadId);
  const subject = openThreadId === null ? thread?.subject : openDetail.data?.thread.subject;
  const runs = useChatRuns({
    override,
    runnerLabel: RUNNER_LABELS[choice.runner],
    threadId,
  });
  const changeChoice = (next: ModelChoice) => {
    setChatChoice(next);
    if (next.runner !== choice.runner) {
      void queryClient.invalidateQueries({ queryKey: queryKeys.runners() });
    }
  };
  const submit = (text: string) => {
    if (runs.ask(text)) {
      setChatDraft('');
    }
  };
  const createTask = () => {
    if (runs.createTask(question)) {
      setChatDraft('');
    }
  };
  useEffect(() => {
    if (queued !== null) {
      submit(queued);
    }
  });
  useEffect(() => {
    const element = log.current;
    if (element !== null) {
      element.scrollTop = element.scrollHeight;
    }
  }, [turns]);
  const examples =
    threadId === null
      ? ['Čo dnes vybaviť?', 'Zhrň neprečítané']
      : ['Zhrň toto vlákno', 'Priprav odpoveď', 'Čo dnes vybaviť?'];
  return (
    <div className="spane chatpane" role="tabpanel" aria-label="AI">
      <div className="chat-ctx">
        <span
          className="ctx"
          role="group"
          title={threadId === null ? undefined : subject}
          aria-label={`Kontext: ${threadId === null ? 'celá schránka' : (subject ?? 'vlákno')}`}
        >
          <Icon name="inbox" size={13} />
          <b>{threadId === null ? 'Celá schránka' : (subject ?? 'Vlákno')}</b>
        </span>
      </div>
      <div className="chat-log" ref={log}>
        <div className="chat-day">Dnes</div>
        {turns.length === 0 ? (
          <p className="chat-empty">
            Spýtaj sa na čokoľvek z pošty. AI vidí len to, čo jej dovolíš, a nikdy nič neodošle bez
            tvojho potvrdenia.
          </p>
        ) : null}
        {turns.map((turn) => (
          <div className="turn" key={turn.id}>
            <div className="bub">{turn.question}</div>
            <div className="steps">
              {turn.steps.map((step, index) => {
                const running = turn.status === 'running' && index === turn.steps.length - 1;
                return (
                  <div key={index} className={running ? 'run' : undefined}>
                    {running ? step : finishedStepLabel(step, turn.status)}
                  </div>
                );
              })}
            </div>
            {turn.answer === '' ? null : (
              <ChatAnswer
                text={turn.answer}
                references={turn.references}
                failed={turn.status === 'error'}
              />
            )}
            {turn.foot === '' ? null : <div className="ans-foot">{turn.foot}</div>}
          </div>
        ))}
      </div>
      <div className="chat-ex">
        {examples.map((example) => (
          <button
            key={example}
            type="button"
            className="chipb"
            title={example}
            onClick={() => {
              submit(example);
            }}
          >
            {example}
          </button>
        ))}
        {threadId === null ? null : (
          <button
            type="button"
            className="chipb"
            title="AI vytvorí úlohu z otvoreného vlákna, text v poli použije ako upresnenie"
            disabled={runs.running}
            onClick={createTask}
          >
            Vytvoriť úlohu
          </button>
        )}
      </div>
      <ChatComposer
        question={question}
        running={runs.running}
        choice={choice}
        onQuestion={setChatDraft}
        onSubmit={() => {
          submit(question);
        }}
        onChoice={changeChoice}
      />
    </div>
  );
}
