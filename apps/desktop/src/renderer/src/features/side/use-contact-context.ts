import type { Address } from '@relay/shared';
import { useEffect, useRef, useState } from 'react';
import { useClient } from '../../data/hooks/services-context';
import { useUserSettings } from '../../data/hooks/use-mail-queries';
import { systemTimeZone } from '../calendar/calendar-time';
import type { ChatTurn } from './chat-store';
import { reduceTurn } from './chat-turn-reducer';
import { runnerLabelOf } from './runner-labels';

export const contextQuestion = (recipient: Address): string =>
  `Na čom sme s touto osobou zostali? Osoba: ${recipient.name ?? recipient.email} <${recipient.email}>. ` +
  'Pozri si našu poslednú spoločnú poštu a odpovedz jednou až dvoma vetami: o čom bola reč a čo ostalo otvorené.';

const freshTurn = (question: string): ChatTurn => ({
  id: 0,
  question,
  steps: [],
  answer: '',
  references: [],
  status: 'running',
  foot: '',
});

export const useContactContext = (recipient: Address) => {
  const client = useClient();
  const settings = useUserSettings();
  const [turn, setTurn] = useState<ChatTurn | null>(null);
  const stop = useRef<(() => void) | null>(null);
  const email = recipient.email.toLowerCase();
  useEffect(
    () => () => {
      stop.current?.();
      stop.current = null;
      setTurn(null);
    },
    [email],
  );
  const run = () => {
    stop.current?.();
    const runner = settings.data?.ai.defaultRunner ?? 'claude';
    const question = contextQuestion(recipient);
    const started = performance.now();
    setTurn(freshTurn(question));
    stop.current = client.runAi(
      {
        input: {
          kind: 'chatAnswer',
          question,
          threadId: null,
          history: [],
          timeZone: systemTimeZone(),
        },
        runner,
      },
      (event) => {
        setTurn((current) =>
          current === null
            ? null
            : { ...current, ...reduceTurn(event, runnerLabelOf(runner), started)(current) },
        );
      },
    );
  };
  return { turn, run, running: turn?.status === 'running' };
};
