import type { AiEvent, RuleSuggestion, RuleSuggestRequest } from '@relay/shared';
import type { MailClient, Unsubscribe } from '../../../../data/MailClient';

export interface RuleSuggestHandlers {
  readonly onDone: (suggestion: RuleSuggestion) => void;
  readonly onError: (message: string) => void;
}

const INVALID = 'AI nevrátila platný návrh pravidla. Skús pravidlo opísať inak.';

const failureMessage = (event: Extract<AiEvent, { type: 'failed' }>): string =>
  event.code === 'invalid_output' || event.message.startsWith('invalid_output')
    ? INVALID
    : `Pravidlo sa nepodarilo navrhnúť: ${event.message}`;

export const runRuleSuggest = (
  client: MailClient,
  request: RuleSuggestRequest,
  handlers: RuleSuggestHandlers,
): Unsubscribe => {
  const run: { finished: boolean; stop: Unsubscribe | null } = { finished: false, stop: null };
  const unsubscribe = client.runAi({ input: { kind: 'ruleSuggest', ...request } }, (event) => {
    if (run.finished || (event.type !== 'completed' && event.type !== 'failed')) {
      return;
    }
    run.finished = true;
    run.stop?.();
    if (event.type === 'failed') {
      handlers.onError(failureMessage(event));
      return;
    }
    if (event.output.kind !== 'ruleSuggest') {
      handlers.onError(INVALID);
      return;
    }
    handlers.onDone(event.output.suggestion);
  });
  run.stop = unsubscribe;
  if (run.finished) {
    unsubscribe();
  }
  return () => {
    run.finished = true;
    unsubscribe();
  };
};
