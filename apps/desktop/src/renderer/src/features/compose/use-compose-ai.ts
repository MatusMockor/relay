import { useState } from 'react';
import { describeError } from '../../data/errors';
import { useClient } from '../../data/hooks/services-context';
import { showToast } from '../../state/toast-store';
import { composeText, rewriteText } from '../ai/run-ai';
import type { AiBarProps } from './AiBar';

export interface ComposeAiOptions {
  readonly body: string;
  readonly setBody: (body: string) => void;
  readonly saving: boolean;
  readonly recipientName: string | null;
}

export const useComposeAi = ({ body, setBody, saving, recipientName }: ComposeAiOptions) => {
  const client = useClient();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const empty = body.trim() === '';
  const run = (instruction: string) => {
    if (busy || saving) {
      return;
    }
    setOpen(false);
    setBusy(true);
    const work = empty
      ? composeText(client, instruction, recipientName)
      : rewriteText(client, body, instruction === '' ? 'vylepšiť' : instruction);
    work
      .then((text) => {
        setBody(text);
      })
      .catch((error: unknown) => {
        showToast(`AI nedokončila text: ${describeError(error)}`);
      })
      .finally(() => {
        setBusy(false);
      });
  };
  const bar: AiBarProps = {
    placeholder: empty ? 'Čo má AI napísať?' : 'Ako upraviť?',
    chips: empty
      ? ['navrhni termín', 'poďakuj', 'ospravedlnenie']
      : ['kratšie', 'formálnejšie', 'pridať termín'],
    onRun: run,
    onClose: () => {
      setOpen(false);
    },
  };
  return {
    open,
    busy,
    empty,
    bar,
    toggle: () => {
      setOpen((value) => !value);
    },
    close: () => {
      setOpen(false);
    },
  };
};

export type ComposeAi = ReturnType<typeof useComposeAi>;
