import { Icon } from '@relay/ui';
import { useState } from 'react';
import { useAppContext } from '../../data/hooks/services-context';
import { OnboardingFrame } from './OnboardingFrame';

export function WelcomeStep() {
  const { session, platform } = useAppContext();
  const [leaving, setLeaving] = useState(false);
  return (
    <OnboardingFrame
      title="Vitaj v Relay"
      lead="Pošta s AI, ktorá sa ovláda z klávesnice. Vyber si, ako chceš začať. Rozhodnutie môžeš neskôr zmeniť v Nastaveniach."
    >
      <div className="paths">
        <button
          type="button"
          className="path"
          disabled={leaving}
          onClick={() => {
            setLeaving(true);
            session.continueOffline().catch(() => {
              setLeaving(false);
            });
          }}
        >
          <span className="pic">
            <Icon name="device" />
          </span>
          <span>
            <b>Pokračovať bez účtu</b>
            <span>
              {platform.kind === 'electron'
                ? 'Pošta aj AI bežia len na tomto počítači.'
                : 'V prehliadači sa otvorí ukážka s ukážkovými dátami.'}
            </span>
          </span>
          <Icon name="forward" />
        </button>
        <button
          type="button"
          className="path"
          disabled={leaving}
          onClick={() => {
            session.goTo('server', null);
          }}
        >
          <span className="pic">
            <Icon name="server" />
          </span>
          <span>
            <b>Pripojiť k serveru</b>
            <span>Synchronizácia 24/7, viac zariadení a AI na serveri.</span>
          </span>
          <Icon name="forward" />
        </button>
      </div>
    </OnboardingFrame>
  );
}
