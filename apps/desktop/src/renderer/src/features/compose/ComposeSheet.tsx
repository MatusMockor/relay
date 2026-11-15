import type { Address, DraftContent, DraftId } from '@relay/shared';
import { AccountSquare, Button, Icon, IconButton, Kbd, Sheet, Spark } from '@relay/ui';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { describeError } from '../../data/errors';
import { queryKeys } from '../../data/hooks/query-keys';
import { useClient } from '../../data/hooks/services-context';
import { MOD } from '../../lib/platform-keys';
import { showToast } from '../../state/toast-store';
import { type ComposeInit, setUi, useUiStore } from '../../state/ui-store';
import { composeText, rewriteText } from '../ai/run-ai';
import { rectOf } from '../folders/rect';
import { useMailActions } from '../mail/MailActionsProvider';
import { accountLike, useAccountsModel } from '../mail/use-accounts-model';
import { AiBar, BusyOverlay } from './AiBar';
import { ComposePopups, type Popup } from './ComposePopups';
import { RecipientField } from './RecipientField';

function ComposeForm({ init }: { readonly init: ComposeInit }) {
  const model = useAccountsModel();
  const scope = useUiStore((state) => state.scope);
  const client = useClient();
  const queryClient = useQueryClient();
  const actions = useMailActions();
  const fallback =
    init.accountId ?? (scope === 'all' ? model.primary?.id : scope) ?? model.accounts[0]?.id;
  const [accountId, setAccountId] = useState(fallback);
  const [to, setTo] = useState<Address | null>(
    init.toEmail === undefined ? null : { name: init.toName ?? null, email: init.toEmail },
  );
  const [subject, setSubject] = useState(init.subject ?? '');
  const [body, setBody] = useState(init.body ?? '');
  const [aiOpen, setAiOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [popup, setPopup] = useState<Popup>(null);
  const account = accountId === undefined ? undefined : model.byId.get(accountId);
  const close = () => {
    setUi({ overlay: null });
  };
  const content = (): DraftContent | null =>
    account === undefined || to === null
      ? null
      : {
          accountId: account.id,
          to: [to],
          cc: [],
          bcc: [],
          subject: subject.trim(),
          body: body.trim(),
          inReplyToThreadId: null,
          inReplyToMessageId: null,
          attachments: [],
        };
  const saveAndClose = () => {
    close();
    if (account === undefined || (body.trim() === '' && subject.trim() === '')) {
      return;
    }
    const draft = {
      accountId: account.id,
      to: to === null ? [] : [to],
      cc: [],
      bcc: [],
      subject: subject.trim(),
      body,
      inReplyToThreadId: null,
      inReplyToMessageId: null,
    };
    const saving =
      init.draftId === undefined
        ? client.createDraft(draft)
        : client.updateDraft(init.draftId as DraftId, draft);
    void saving
      .then(() => queryClient.invalidateQueries({ queryKey: queryKeys.drafts() }))
      .then(() => {
        showToast('Koncept uložený do Konceptov');
      })
      .catch((error: unknown) => {
        showToast(describeError(error));
      });
  };
  const validate = (): DraftContent | null => {
    if (to === null) {
      showToast('Doplň, komu správu posielaš');
      return null;
    }
    if (body.trim() === '') {
      showToast('Správa je prázdna');
      return null;
    }
    return content();
  };
  const runAi = (instruction: string) => {
    setAiOpen(false);
    setBusy(true);
    const work =
      body.trim() === ''
        ? composeText(client, instruction, to?.name ?? null)
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
  const onKey = (event: KeyboardEvent) => {
    const mod = event.metaKey || event.ctrlKey;
    if (mod && event.key === 'Enter') {
      event.preventDefault();
      if (event.shiftKey) {
        const button = document.getElementById('nm-sched');
        if (validate() !== null && button !== null) {
          setPopup({ kind: 'schedule', anchor: rectOf(button) });
        }
        return true;
      }
      if (validate() !== null) {
        setPopup({ kind: 'confirm' });
      }
      return true;
    }
    if (mod && event.key.toLowerCase() === 'j') {
      event.preventDefault();
      setAiOpen((value) => !value);
      return true;
    }
    if (event.key === 'Escape' && aiOpen) {
      event.preventDefault();
      setAiOpen(false);
      return true;
    }
    return false;
  };
  const empty = body.trim() === '';
  const recipientName = to?.name ?? to?.email ?? '';
  return (
    <Sheet label="Nová správa" className="nm" onClose={saveAndClose} onKey={onKey}>
      <div className="nm-h">
        <b>{init.draftId === undefined ? 'Nová správa' : 'Koncept'}</b>
        <span className="sp" />
        <span className="mono">Esc uloží do Konceptov</span>
        <IconButton label="Zavrieť a uložiť" onClick={saveAndClose}>
          <Icon name="x" />
        </IconButton>
      </div>
      <div className="nm-f">
        <span className="lb">Od</span>
        {account === undefined ? null : (
          <button
            type="button"
            id="nm-from"
            className="from-btn"
            aria-haspopup="menu"
            aria-label={`Od: ${account.displayName}, ${account.email}. Zmeniť účet`}
            onClick={(event) => {
              setPopup({ kind: 'from', anchor: rectOf(event.currentTarget) });
            }}
          >
            <AccountSquare account={accountLike(account)} small />
            <span>{account.displayName}</span>
            <small>{account.email}</small>
            <Icon name="down" />
          </button>
        )}
      </div>
      <RecipientField
        value={to}
        onChange={setTo}
        autoFocus={to === null}
        onDone={() => {
          document.getElementById('nm-subj')?.focus();
        }}
      />
      <div className="nm-f">
        <span className="lb">Predmet</span>
        <input
          id="nm-subj"
          placeholder="O čom píšeš"
          autoComplete="off"
          aria-label="Predmet"
          value={subject}
          onChange={(event) => {
            setSubject(event.target.value);
          }}
        />
      </div>
      <div className={`cmp-b${busy ? ' busy' : ''}`}>
        <textarea
          id="nm-t"
          placeholder={`Napíš správu, alebo nechaj AI: ${MOD}J`}
          aria-label="Text správy"
          readOnly={busy}
          value={body}
          onChange={(event) => {
            setBody(event.target.value);
          }}
        />
        {busy ? <BusyOverlay label={empty ? 'Píšem…' : 'Upravujem…'} /> : null}
      </div>
      {aiOpen ? (
        <AiBar
          placeholder={empty ? 'Čo má AI napísať?' : 'Ako upraviť?'}
          chips={
            empty
              ? ['navrhni termín', 'poďakuj', 'ospravedlnenie']
              : ['kratšie', 'formálnejšie', 'pridať termín']
          }
          onRun={runAi}
          onClose={() => {
            setAiOpen(false);
          }}
        />
      ) : null}
      <div className="cmp-f">
        <Button
          variant="ghost"
          title={`${empty ? 'Napíše správu' : 'Prepíše text'} podľa pokynu (${MOD}J)`}
          onClick={() => {
            setAiOpen((value) => !value);
          }}
        >
          <Spark />
          {empty ? 'Napísať s AI' : 'Upraviť s AI'}
        </Button>
        <span className="sp" />
        <Button
          id="nm-sched"
          title={`Odošle sa neskôr (${MOD}⇧↵)`}
          onClick={(event) => {
            if (validate() !== null) {
              setPopup({ kind: 'schedule', anchor: rectOf(event.currentTarget) });
            }
          }}
        >
          <Icon name="clock" />
          Naplánovať odoslanie
        </Button>
        <Button
          variant="primary"
          onClick={() => {
            if (validate() !== null) {
              setPopup({ kind: 'confirm' });
            }
          }}
        >
          Odoslať <Kbd keys={[`${MOD}↵`]} />
        </Button>
      </div>
      <ComposePopups
        popup={popup}
        title={`Odoslať ${recipientName}${model.multi && account !== undefined ? ` z účtu ${account.displayName}` : ''}?`}
        body={body}
        accountId={accountId}
        onClose={() => {
          setPopup(null);
        }}
        onAccount={setAccountId}
        onSend={(date) => {
          const ready = content();
          setPopup(null);
          if (ready !== null) {
            close();
            actions.compose.sendNew(ready, init, date);
          }
        }}
      />
    </Sheet>
  );
}

export function ComposeHost() {
  const overlay = useUiStore((state) => state.overlay);
  if (overlay?.kind !== 'compose') {
    return null;
  }
  return <ComposeForm init={overlay.init} />;
}
