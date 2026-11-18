import type { ThreadDetail } from '@relay/shared';
import { Kbd, Spark } from '@relay/ui';
import { useUserSettings } from '../../data/hooks/use-mail-queries';
import { setUi } from '../../state/ui-store';
import { centerRect } from '../folders/rect';
import { threadItem } from '../mail/list-items';
import { useMailActions } from '../mail/MailActionsProvider';
import { isAutomated } from './automated';

export interface NextActionsProps {
  readonly detail: ThreadDetail;
  readonly pending: boolean;
}

export function NextActions({ detail, pending }: NextActionsProps) {
  const actions = useMailActions();
  const settings = useUserSettings();
  const { thread } = detail;
  const bot = isAutomated(thread.participants[0]);
  const suggestions =
    settings.data?.ai.features.replySuggestions === false
      ? []
      : detail.replySuggestions.slice(0, 3);
  const reply = (text?: string) => {
    actions.compose.startReply(thread.id, thread.accountId, text);
  };
  const quick = (
    <>
      <button
        type="button"
        className="sug"
        onClick={() => {
          actions.thread.markDone(threadItem(thread));
        }}
      >
        <Kbd keys={['E']} />
        Hotovo
      </button>
      <button
        type="button"
        className="sug"
        onClick={() => {
          setUi({ overlay: { kind: 'remind', threadId: thread.id, anchor: centerRect() } });
        }}
      >
        <Kbd keys={['H']} />
        Pripomenúť
      </button>
      <button
        type="button"
        className="sug"
        onClick={() => {
          actions.compose.replyAll(thread.id);
        }}
      >
        <Kbd keys={['⇧', 'R']} />
        Odpovedať všetkým
      </button>
      <button
        type="button"
        className="sug"
        onClick={() => {
          actions.compose.forward(thread.id);
        }}
      >
        <Kbd keys={['F']} />
        Preposlať
      </button>
    </>
  );
  const own = (ghost: boolean) => (
    <button
      type="button"
      className={ghost ? 'sug ghost' : 'sug'}
      onClick={() => {
        reply();
      }}
    >
      <Kbd keys={['R']} />
      {thread.hasDraft ? 'Pokračovať v koncepte' : bot ? 'Odpovedať' : 'Napísať vlastnú'}
    </button>
  );
  const replies = settings.data?.ai.features.replySuggestions !== false;
  if (!bot && replies && pending && suggestions.length === 0) {
    return (
      <div className="t-next" aria-busy="true">
        <h4>
          <Spark />
          Navrhnuté odpovede
        </h4>
        <span className="note">
          <i className="wait-dot" />
          AI pripravuje návrhy odpovedí…
        </span>
        <div className="sugs">
          {quick}
          {own(false)}
        </div>
      </div>
    );
  }
  if (bot || suggestions.length === 0) {
    return (
      <div className="t-next">
        <div className="sugs">
          {bot ? own(false) : null}
          {quick}
          {bot ? null : own(false)}
        </div>
      </div>
    );
  }
  return (
    <div className="t-next">
      <h4>
        <Spark />
        Navrhnuté odpovede
      </h4>
      <div className="sugs">
        {suggestions.map((suggestion, index) => (
          <button
            key={suggestion.id}
            type="button"
            className="sug"
            title={suggestion.body}
            onClick={() => {
              reply(suggestion.body);
            }}
          >
            <Kbd keys={[String(index + 1)]} />
            {suggestion.label}
          </button>
        ))}
        {own(true)}
      </div>
    </div>
  );
}
