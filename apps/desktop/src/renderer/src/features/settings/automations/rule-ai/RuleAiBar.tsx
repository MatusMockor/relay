import {
  type AccountId,
  type MailAccount,
  RULE_SENTENCE_MAX_LENGTH,
  type RuleSuggestion,
} from '@relay/shared';
import { Button, Spark } from '@relay/ui';
import { useEffect, useRef, useState } from 'react';
import { SuggestionExplanation } from './SuggestionExplanation';
import type { SuggestionNote } from './suggestion-note';
import { useRuleSuggest } from './use-rule-suggest';

export interface RuleAiBarProps {
  readonly accountId: AccountId | null;
  readonly accounts: readonly MailAccount[];
  readonly disabled: boolean;
  readonly note: SuggestionNote | null;
  readonly focus?: boolean;
  readonly onSuggest: (suggestion: RuleSuggestion, sentence: string) => void;
}

export function RuleAiBar({
  accountId,
  accounts,
  disabled,
  note,
  focus = false,
  onSuggest,
}: RuleAiBarProps) {
  const [sentence, setSentence] = useState(note?.sentence ?? '');
  const { busy, error, suggest } = useRuleSuggest(accountId, accounts);
  const field = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (focus) {
      field.current?.focus();
    }
  }, [focus]);
  return (
    <section className="au-ai" aria-label="Opíš pravidlo" aria-busy={busy}>
      <form
        className="au-ai-row"
        onSubmit={(event) => {
          event.preventDefault();
          suggest(sentence, (suggestion) => {
            onSuggest(suggestion, sentence.trim());
          });
        }}
      >
        <Spark />
        <input
          ref={field}
          className="au-ai-in"
          aria-label="Opíš pravidlo vlastnými slovami"
          placeholder="Opíš pravidlo vlastnými slovami…"
          autoComplete="off"
          value={sentence}
          maxLength={RULE_SENTENCE_MAX_LENGTH}
          disabled={disabled}
          readOnly={busy}
          onChange={(event) => {
            setSentence(event.target.value);
          }}
        />
        <Button
          type="submit"
          variant="primary"
          disabled={disabled || busy || sentence.trim() === ''}
        >
          {busy ? 'Navrhujem…' : 'Navrhnúť pravidlo'}
        </Button>
      </form>
      {error === null ? null : (
        <p className="au-ai-err" role="alert">
          {error}
        </p>
      )}
      {note === null ? null : <SuggestionExplanation note={note} />}
    </section>
  );
}
