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
  sent: ['Zatiaľ nič odoslané', 'Odpovede a nové správy, ktoré pošleš, nájdeš tu.'],
  drafts: ['Žiadne koncepty', 'Rozpísaná správa sa uloží, keď v nej stlačíš [Esc].'],
  scheduled: ['Nič naplánované', 'Pri písaní novej správy zvoľ Naplánovať odoslanie.'],
  trash: ['Kôš je prázdny', 'Konverzácie zmazané cez [#] sa presunú sem.'],
  tasks: ['Žiadne úlohy', 'Žiadna úloha z Jiry teraz nečaká na teba.'],
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
  const [title, text] = EMPTY[view] ?? [
    'Nič s týmto štítkom',
    'V Doručenej pošte teraz nie je nič s týmto štítkom.',
  ];
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
