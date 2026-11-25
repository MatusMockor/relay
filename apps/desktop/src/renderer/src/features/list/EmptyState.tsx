import { Button, FolderIcon, Icon, Kbd } from '@relay/ui';
import type { FolderView } from '@relay/shared';
import { folderIconOf } from '../folders/folder-icons';
import { KeyHint } from '../shell/KeyHint';
import { selectFolder } from '../mail/navigation';

const EMPTY: Readonly<Partial<Record<FolderView, readonly [string, string]>>> = {
  reminders: [
    'Nič nečaká na pripomenutie',
    'Konverzácie odložené cez [H] sa sem vrátia v nastavený čas.',
  ],
  done: ['Zatiaľ nič vybavené', 'Konverzácie, ktoré vybavíš cez [E], nájdeš tu.'],
  archive: ['Archív je prázdny', 'Archivované konverzácie nájdeš tu.'],
  sent: ['Zatiaľ nič odoslané', 'Odpovede a nové správy, ktoré pošleš, nájdeš tu.'],
  drafts: ['Žiadne koncepty', 'Rozpísaná správa sa uloží, keď v nej stlačíš [Esc].'],
  scheduled: ['Nič naplánované', 'Pri písaní novej správy zvoľ Naplánovať odoslanie.'],
  spam: [
    'Žiadny spam',
    'Konverzácie nahlásené cez [!] a nevyžiadaná pošta zo servera sa zobrazia tu.',
  ],
  trash: ['Kôš je prázdny', 'Konverzácie zmazané cez [#] sa presunú sem.'],
  tasks: [
    'Žiadne úlohy',
    'Úlohy z mailov, z AI a ručne vytvorené sa tu zobrazia zoradené podľa priority.',
  ],
  mailbox: ['Priečinok je prázdny', 'V tomto priečinku teraz nie je žiadna konverzácia.'],
  label: ['Nič s týmto štítkom', 'Žiadna konverzácia mimo Koša a Spamu nemá tento štítok.'],
};

export function InboxZero({ splitName }: { readonly splitName: string | null }) {
  const line =
    splitName === null
      ? 'V Dôležitých nič nečaká. Keď príde niečo podstatné, uvidíš to tu.'
      : `V splite ${splitName} je všetko vybavené.`;
  return (
    <div className="zero">
      <div className="zero-in">
        <h2>Všetko vybavené</h2>
        <p>{line}</p>
        <div className="go">
          <Button
            onClick={() => {
              selectFolder({ kind: 'view', view: 'done' });
            }}
          >
            Hotovo <Kbd keys={['G', 'E']} />
          </Button>
        </div>
      </div>
      <div className="horizon" />
    </div>
  );
}

export function EmptyFolder({ view }: { readonly view: FolderView }) {
  const [title, text] = EMPTY[view] ?? ['Nič tu nie je', 'Tento priečinok je teraz prázdny.'];
  return (
    <div className="zero small">
      <div className="zero-in">
        <span className="zero-ic" aria-hidden="true">
          <FolderIcon name={folderIconOf(view)} />
        </span>
        <h2>{title}</h2>
        <p>
          <KeyHint text={text} />
        </p>
      </div>
    </div>
  );
}

export function NoHits({ query }: { readonly query: string }) {
  return (
    <div className="zero small">
      <div className="zero-in">
        <span className="zero-ic" aria-hidden="true">
          <Icon name="search" size={18} />
        </span>
        <h2>Nič sa nenašlo</h2>
        <p>
          {`Pre „${query.trim()}“ tu nie je žiadna konverzácia. `}
          <KeyHint text="Skús iný priečinok, alebo hľadanie zruš klávesom [Esc]." />
        </p>
      </div>
    </div>
  );
}

export function InitialSyncState({
  accountName,
  text,
  ratio,
}: {
  readonly accountName: string | null;
  readonly text: string;
  readonly ratio: number | null;
}) {
  const title = accountName === null ? 'Načítavam poštu…' : `Načítavam ${accountName}…`;
  return (
    <div className="zero small" role="status" aria-live="polite">
      <div className="zero-in">
        <span className="zero-ic sync-spin" aria-hidden="true">
          <Icon name="refresh" size={18} />
        </span>
        <h2>{title}</h2>
        <p>{text}</p>
        <div
          className={ratio === null ? 'sync-bar indeterminate' : 'sync-bar'}
          role="progressbar"
          aria-label={title}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={ratio === null ? undefined : Math.round(ratio * 100)}
        >
          <i style={ratio === null ? undefined : { width: `${String(ratio * 100)}%` }} />
        </div>
      </div>
    </div>
  );
}
