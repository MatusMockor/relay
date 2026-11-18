import { Button, Icon, Spark } from '@relay/ui';
import { MOD } from '../../lib/platform-keys';
import { SendHint } from './SendHint';

export interface ComposeFooterProps {
  readonly empty: boolean;
  readonly onAi: () => void;
  readonly onAttach: () => void;
  readonly onSchedule: (button: HTMLElement) => void;
  readonly onSend: () => void;
}

export function ComposeFooter({ empty, onAi, onAttach, onSchedule, onSend }: ComposeFooterProps) {
  return (
    <div className="cmp-f">
      <Button
        variant="ghost"
        title={`${empty ? 'Napíše správu' : 'Prepíše text'} podľa pokynu (${MOD}J)`}
        onClick={onAi}
      >
        <Spark />
        {empty ? 'Napísať s AI' : 'Upraviť s AI'}
      </Button>
      <Button variant="ghost" title={`Priložiť súbory (${MOD}⇧A)`} onClick={onAttach}>
        <Icon name="clip" />
        Priložiť
      </Button>
      <span className="sp" />
      <Button
        id="nm-sched"
        title={`Odošle sa neskôr (${MOD}⇧↵)`}
        onClick={(event) => {
          onSchedule(event.currentTarget);
        }}
      >
        <Icon name="clock" />
        Naplánovať odoslanie
      </Button>
      <SendHint />
      <Button variant="primary" onClick={onSend} title={`Odoslať (${MOD}Enter)`}>
        Odoslať
      </Button>
    </div>
  );
}
