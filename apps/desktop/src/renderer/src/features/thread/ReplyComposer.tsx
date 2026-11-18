import type { MailAccount, ThreadDetail } from '@relay/shared';
import { AccountSquare, type AnchorRect, Avatar, Button, ConfirmDialog, Spark } from '@relay/ui';
import { useEffect, useRef, useState } from 'react';
import { describeError } from '../../data/errors';
import { useClient } from '../../data/hooks/services-context';
import { MOD } from '../../lib/platform-keys';
import { SendHint } from '../compose/SendHint';
import { showToast } from '../../state/toast-store';
import { type ReplyState, setUi } from '../../state/ui-store';
import { rewriteText } from '../ai/run-ai';
import { AiBar, BusyOverlay } from '../compose/AiBar';
import { AccountMenu } from '../folders/AccountMenu';
import { rectOf } from '../folders/rect';
import { useMailActions } from '../mail/MailActionsProvider';
import { replyRecipients, replySubject } from '../mail/reply-draft';
import { accountLike, useAccountsModel } from '../mail/use-accounts-model';

const patchReply = (patch: Partial<ReplyState>) => {
  setUi((state) => ({ reply: state.reply === null ? null : { ...state.reply, ...patch } }));
};

let rewriteRun = 0;

const finishRewrite = (
  run: number,
  threadId: ReplyState['threadId'],
  patch: Partial<ReplyState>,
) => {
  setUi((state) =>
    run === rewriteRun && state.reply?.threadId === threadId && state.reply.busy
      ? { reply: { ...state.reply, ...patch, busy: false } }
      : {},
  );
};

export function ReplyComposer({
  detail,
  reply,
}: {
  readonly detail: ThreadDetail;
  readonly reply: ReplyState;
}) {
  const actions = useMailActions();
  const client = useClient();
  const model = useAccountsModel();
  const ref = useRef<HTMLTextAreaElement>(null);
  const [confirming, setConfirming] = useState(false);
  const [fromAnchor, setFromAnchor] = useState<AnchorRect | null>(null);
  const account: MailAccount | undefined =
    model.byId.get(reply.accountId) ?? model.primary ?? undefined;
  const recipient = replyRecipients(detail, new Set(model.accounts.map((item) => item.email)))[0];
  const recipientName = recipient?.name ?? recipient?.email ?? '';
  useEffect(() => {
    const area = ref.current;
    if (area === null || reply.aiOpen) {
      return;
    }
    area.focus();
    area.setSelectionRange(area.value.length, area.value.length);
  }, [reply.aiOpen, reply.busy]);
  const save = () => {
    if (account === undefined) {
      setUi({ reply: null });
      return;
    }
    void actions.compose.saveReplyDraft(detail, account, model.accounts).catch((error: unknown) => {
      showToast(describeError(error));
    });
  };
  const askSend = () => {
    if (reply.text.trim() === '') {
      showToast('Odpoveď je prázdna');
      return;
    }
    setConfirming(true);
  };
  const rewrite = (instruction: string) => {
    if (reply.busy) {
      return;
    }
    const { threadId } = reply;
    rewriteRun += 1;
    const run = rewriteRun;
    const base =
      reply.text.trim() === ''
        ? (detail.replySuggestions[0]?.body ??
          'Ahoj, ďakujem za správu. Pozriem sa na to a ozvem sa.')
        : reply.text;
    patchReply({ aiOpen: false, busy: true });
    rewriteText(client, base, instruction === '' ? 'vylepšiť' : instruction)
      .then((text) => {
        finishRewrite(run, threadId, { text });
      })
      .catch((error: unknown) => {
        finishRewrite(run, threadId, {});
        showToast(`AI nedokončila úpravu: ${describeError(error)}`);
      });
  };
  return (
    <div className={`cmp${reply.busy ? ' busy' : ''}`} id="cmp">
      <div className="cmp-h">
        <span>Pre</span>
        <span className="to-chip">
          <Avatar name={recipientName} seed={recipient?.email} size="sm" />
          <span className="to-n" title={recipientName}>
            {recipientName}
          </span>
        </span>
        {model.multi && account !== undefined ? (
          <button
            type="button"
            className="from"
            aria-label={`Odosielateľ: ${account.email}. Zmeniť účet`}
            onClick={(event) => {
              setFromAnchor(rectOf(event.currentTarget));
            }}
          >
            <AccountSquare account={accountLike(account)} small />
            <span>z {account.email}</span>
          </button>
        ) : null}
        <span className="s">{replySubject(detail.thread.subject)}</span>
      </div>
      <div className="cmp-b">
        <textarea
          ref={ref}
          id="cmp-t"
          rows={4}
          placeholder="Napíš odpoveď…"
          aria-label="Odpoveď"
          readOnly={reply.busy}
          value={reply.text}
          onChange={(event) => {
            patchReply({ text: event.target.value });
          }}
          onKeyDown={(event) => {
            const mod = event.metaKey || event.ctrlKey;
            if (event.key === 'Escape') {
              event.preventDefault();
              save();
              return;
            }
            if (mod && event.key === 'Enter') {
              event.preventDefault();
              askSend();
              return;
            }
            if (mod && event.key.toLowerCase() === 'j') {
              event.preventDefault();
              patchReply({ aiOpen: !reply.aiOpen });
            }
          }}
        />
        {reply.busy ? <BusyOverlay label="Upravujem…" /> : null}
      </div>
      {reply.aiOpen ? (
        <AiBar
          placeholder="Ako upraviť?"
          chips={['kratšie', 'formálnejšie', 'pridať termín']}
          onRun={rewrite}
          onClose={() => {
            patchReply({ aiOpen: false });
          }}
        />
      ) : null}
      <div className="cmp-f">
        <Button
          variant="ghost"
          title={`Prepíše koncept podľa pokynu (${MOD}J)`}
          onClick={() => {
            patchReply({ aiOpen: !reply.aiOpen });
          }}
        >
          <Spark />
          Upraviť s AI
        </Button>
        <span className="sp" />
        <Button title="Uložiť ako koncept (Esc)" onClick={save}>
          Zavrieť
        </Button>
        <Button variant="primary" onClick={askSend} title={`Odoslať (${MOD}Enter)`}>
          Odoslať
          <SendHint />
        </Button>
      </div>
      {confirming && account !== undefined ? (
        <ConfirmDialog
          title={`Odoslať ${recipientName}${model.multi ? ` z účtu ${account.displayName}` : ''}?`}
          text={reply.text}
          confirmLabel="Odoslať"
          onCancel={() => {
            setConfirming(false);
          }}
          onConfirm={() => {
            setConfirming(false);
            actions.compose.sendReply({
              detail,
              text: reply.text,
              account,
              accounts: model.accounts,
              draftId: reply.draftId,
            });
          }}
        />
      ) : null}
      {fromAnchor === null ? null : (
        <AccountMenu
          anchor={fromAnchor}
          title="Odoslať z účtu"
          accounts={model.accounts}
          current={reply.accountId}
          withAll={false}
          onClose={() => {
            setFromAnchor(null);
          }}
          onPick={(id) => {
            const picked = model.byId.get(id);
            if (picked !== undefined) {
              patchReply({ accountId: picked.id });
            }
          }}
        />
      )}
    </div>
  );
}
