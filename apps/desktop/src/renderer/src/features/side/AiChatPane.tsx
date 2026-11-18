import type { AiRunnerKind } from '@relay/shared';
import { Kbd, Spark } from '@relay/ui';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { queryKeys } from '../../data/hooks/query-keys';
import { useThreadDetail, useUserSettings } from '../../data/hooks/use-mail-queries';
import { useUiStore } from '../../state/ui-store';
import { useMailActions } from '../mail/MailActionsProvider';
import { ChatAnswer } from './ChatAnswer';
import { setChatDraft, useChat } from './chat-store';
import { RUNNERS, runnerLabelOf } from './runner-labels';
import { doneStepLabel } from './step-labels';
import { useChatRuns } from './use-chat-runs';

export function AiChatPane() {
  const queryClient = useQueryClient();
  const { current } = useMailActions();
  const openThreadId = useUiStore((state) => state.openThreadId);
  const settings = useUserSettings();
  const { turns, queued, draft: question } = useChat();
  const [runner, setRunner] = useState<AiRunnerKind | null>(null);
  const log = useRef<HTMLDivElement>(null);
  const activeRunner = runner ?? settings.data?.ai.defaultRunner ?? 'claude';
  const thread = current?.kind === 'thread' ? current.thread : null;
  const threadId = openThreadId ?? thread?.id ?? null;
  const openDetail = useThreadDetail(openThreadId);
  const subject = openThreadId === null ? thread?.subject : openDetail.data?.thread.subject;
  const runnerLabel = runnerLabelOf(activeRunner);
  const runs = useChatRuns({ runner: activeRunner, runnerLabel, threadId });
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
      ? ['Čo mám dnes vybaviť?', 'Zhrň neprečítané']
      : ['Zhrň toto vlákno', 'Priprav odpoveď', 'Čo mám dnes vybaviť?'];
  return (
    <div className="spane chatpane" role="tabpanel" aria-label="AI">
      <div className="chat-ctx">
        <span className="ctx">
          Kontext: <b>{threadId === null ? 'celá schránka' : (subject ?? 'vlákno')}</b>
        </span>
        <span className="runner" role="group" aria-label="Spustiť cez">
          {RUNNERS.map(([kind, label]) => (
            <button
              key={kind}
              type="button"
              className={kind === activeRunner ? 'on' : undefined}
              aria-pressed={kind === activeRunner}
              title={`Spustiť cez ${label}`}
              onClick={() => {
                setRunner(kind);
                void queryClient.invalidateQueries({ queryKey: queryKeys.runners() });
              }}
            >
              {label}
            </button>
          ))}
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
                    {running ? step : doneStepLabel(step)}
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
      <label className="chat-in">
        <Spark />
        <input
          id="chat-q"
          placeholder="Spýtaj sa na poštu…"
          autoComplete="off"
          spellCheck={false}
          aria-label="Otázka pre AI"
          value={question}
          onChange={(event) => {
            setChatDraft(event.target.value);
          }}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              event.currentTarget.blur();
              return;
            }
            if (event.key === 'Enter') {
              event.preventDefault();
              submit(question);
            }
          }}
        />
        <Kbd keys={['A']} />
      </label>
    </div>
  );
}
