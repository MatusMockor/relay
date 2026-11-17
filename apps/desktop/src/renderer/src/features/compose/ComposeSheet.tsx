import type { Draft, DraftContent, DraftId } from '@relay/shared';
import { Sheet } from '@relay/ui';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { describeError } from '../../data/errors';
import { queryKeys } from '../../data/hooks/query-keys';
import { MOD } from '../../lib/platform-keys';
import { showToast } from '../../state/toast-store';
import { type ComposeInit, setUi, useUiStore } from '../../state/ui-store';
import { rectOf } from '../folders/rect';
import { useMailActions } from '../mail/MailActionsProvider';
import { useAccountsModel } from '../mail/use-accounts-model';
import { AiBar, BusyOverlay } from './AiBar';
import { AttachmentChips } from './attachments/AttachmentChips';
import { filesOf, inputsFromFiles } from './attachments/attachment-inputs';
import { readyAttachments } from './attachments/compose-attachment';
import { useComposeAttachments } from './attachments/use-compose-attachments';
import { useFileDrop } from './attachments/use-file-drop';
import { ComposeFooter } from './ComposeFooter';
import { ComposeHeader } from './ComposeHeader';
import { ComposePopups, type Popup } from './ComposePopups';
import { discardCompose } from './compose-discard';
import { composeContent, composeStart } from './compose-start';
import { composeProblem } from './compose-validation';
import { RECIPIENT_INPUT_IDS, type RecipientKind } from './recipients/compose-recipients';
import { RecipientRows } from './recipients/RecipientRows';
import { useAttachmentPicker } from './use-attachment-picker';
import { useComposeAi } from './use-compose-ai';
import { useComposeDraft } from './use-compose-draft';
import { composeShortcut } from './compose-shortcuts';

function ComposeForm({ init }: { readonly init: ComposeInit }) {
  const model = useAccountsModel();
  const scope = useUiStore((state) => state.scope);
  const queryClient = useQueryClient();
  const actions = useMailActions();
  const fallback =
    init.accountId ?? (scope === 'all' ? model.primary?.id : scope) ?? model.accounts[0]?.id;
  const [chosenAccountId, setAccountId] = useState(init.accountId);
  const accountId = chosenAccountId ?? fallback;
  const account = accountId === undefined ? undefined : model.byId.get(accountId);
  const [start] = useState(() =>
    composeStart(
      init,
      queryClient
        .getQueryData<Draft[]>(queryKeys.drafts())
        ?.find((draft) => draft.id === init.draftId),
    ),
  );
  const [recipients, setRecipients] = useState(start.recipients);
  const [visible, setVisible] = useState(start.visible);
  const [subject, setSubject] = useState(start.subject);
  const [body, setBody] = useState(start.body);
  const [saving, setSaving] = useState(false);
  const [popup, setPopup] = useState<Popup>(null);
  const draft = useComposeDraft((init.draftId ?? null) as DraftId | null);
  const contentWith = (attachments: Draft['attachments']): DraftContent | null =>
    account === undefined
      ? null
      : composeContent({ accountId: account.id, recipients, subject, body, attachments, init });
  const attachments = useComposeAttachments({
    initial: start.attachments,
    ensureDraft: () => draft.ensure(() => contentWith([])),
  });
  const content = () => contentWith(readyAttachments(attachments.items));
  const ai = useComposeAi({
    body,
    setBody,
    saving,
    recipientName: recipients.to[0]?.address.name ?? null,
  });
  const picker = useAttachmentPicker(attachments);
  const drop = useFileDrop((files) => {
    attachments.add(inputsFromFiles(files));
  });
  const forwarded = useRef(false);
  useEffect(() => {
    if (forwarded.current || init.forward === undefined || init.forward.attachmentCount === 0) {
      return;
    }
    forwarded.current = true;
    attachments.forward(init.forward.messageId, init.forward.attachmentCount);
  });
  const autosave = useRef<() => void>(() => undefined);
  autosave.current = () => {
    const ready = content();
    const worth = body.trim() !== '' || subject.trim() !== '' || draft.current() !== null;
    if (ready !== null && worth && !saving) {
      draft.schedule(ready);
    }
  };
  const touched = useRef(false);
  useEffect(() => {
    if (!touched.current) {
      touched.current = true;
      return;
    }
    autosave.current();
  }, [recipients, subject, body]);
  const close = () => {
    setUi((state) =>
      state.overlay?.kind === 'compose' && state.overlay.init === init ? { overlay: null } : {},
    );
  };
  const saveAndClose = () => {
    if (saving) {
      return;
    }
    const ready = content();
    const empty = body.trim() === '' && subject.trim() === '' && attachments.items.length === 0;
    if (ready === null || empty) {
      draft.cancelScheduled();
      const discard = init.draftId === undefined ? draft.discard() : Promise.resolve();
      void discard.catch(() => undefined);
      close();
      return;
    }
    setSaving(true);
    draft.save(ready).then(
      () => {
        close();
        showToast('Koncept uložený do Konceptov');
        void queryClient.invalidateQueries({ queryKey: queryKeys.drafts() });
      },
      (error: unknown) => {
        setSaving(false);
        showToast(`Koncept sa nepodarilo uložiť: ${describeError(error)}`);
      },
    );
  };
  const validate = (): DraftContent | null => {
    if (saving) {
      return null;
    }
    const problem = composeProblem({
      recipients,
      body,
      attachments: attachments.items,
      removing: attachments.removing,
    });
    if (problem !== null) {
      showToast(problem);
      return null;
    }
    return content();
  };
  const reveal = (kind: RecipientKind) => {
    setVisible((current) => new Set([...current, kind]));
    setTimeout(() => document.getElementById(RECIPIENT_INPUT_IDS[kind])?.focus(), 0);
  };
  const askSchedule = (button: HTMLElement | null) => {
    if (validate() !== null && button !== null) {
      setPopup({ kind: 'schedule', anchor: rectOf(button) });
    }
  };
  const askSend = () => {
    if (validate() !== null) {
      setPopup({ kind: 'confirm' });
    }
  };
  const onKey = composeShortcut({
    send: askSend,
    schedule: () => {
      askSchedule(document.getElementById('nm-sched'));
    },
    reveal,
    attach: picker.pick,
    discard: () => {
      if (!saving) {
        discardCompose({
          init,
          draft,
          snapshot: {
            accountId,
            recipients,
            subject,
            body,
            hasAttachments: attachments.items.length > 0,
          },
          close,
        });
      }
    },
    ai,
  });
  const first = recipients.to[0]?.address;
  const recipientName = first?.name ?? first?.email ?? '';
  const more = recipients.to.length + recipients.cc.length + recipients.bcc.length - 1;
  return (
    <Sheet label="Nová správa" className="nm" onClose={saveAndClose} onKey={onKey}>
      <div
        className="nm-drop"
        {...drop.handlers}
        onPaste={(event) => {
          const files = filesOf(event.clipboardData.files);
          if (files.length > 0) {
            event.preventDefault();
            attachments.add(inputsFromFiles(files));
          }
        }}
      >
        <ComposeHeader
          title={init.draftId === undefined ? 'Nová správa' : 'Koncept'}
          account={account}
          onClose={saveAndClose}
          onPickAccount={(button) => {
            setPopup({ kind: 'from', anchor: rectOf(button) });
          }}
        />
        <RecipientRows
          recipients={recipients}
          visible={visible}
          readOnly={saving}
          autoFocus={recipients.to.length === 0}
          onChange={(kind, entries) => {
            if (!saving) {
              setRecipients((current) => ({ ...current, [kind]: entries }));
            }
          }}
          onReveal={reveal}
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
            readOnly={saving}
            value={subject}
            onChange={(event) => {
              if (!saving) {
                setSubject(event.target.value);
              }
            }}
          />
        </div>
        <div className={`cmp-b${ai.busy ? ' busy' : ''}`}>
          <textarea
            id="nm-t"
            placeholder={`Napíš správu, alebo nechaj AI: ${MOD}J`}
            aria-label="Text správy"
            readOnly={ai.busy || saving}
            value={body}
            onChange={(event) => {
              if (!saving) {
                setBody(event.target.value);
              }
            }}
          />
          {ai.busy ? <BusyOverlay label={ai.empty ? 'Píšem…' : 'Upravujem…'} /> : null}
        </div>
        <AttachmentChips items={attachments.items} onRemove={attachments.remove} />
        {ai.open ? <AiBar {...ai.bar} /> : null}
        <ComposeFooter
          empty={ai.empty}
          onAi={ai.toggle}
          onAttach={picker.pick}
          onSchedule={askSchedule}
          onSend={askSend}
        />
        {picker.fallback}
        {drop.active ? <div className="nm-drop-hint">Pusti súbory sem a priložia sa</div> : null}
      </div>
      <ComposePopups
        popup={popup}
        title={`Odoslať ${recipientName}${more > 0 ? ` a ďalším (${String(more)})` : ''}${model.multi && account !== undefined ? ` z účtu ${account.displayName}` : ''}?`}
        body={body}
        accountId={accountId}
        onClose={() => {
          setPopup(null);
        }}
        onAccount={setAccountId}
        onSend={(date) => {
          const ready = content();
          setPopup(null);
          if (ready === null) {
            return;
          }
          close();
          draft.whenSettled((draftId) => {
            actions.compose.sendNew(ready, { ...init, draftId: draftId ?? undefined }, date);
          });
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
