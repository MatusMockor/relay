import { Button } from '@relay/ui';
import { useAppContext } from '../../data/hooks/services-context';
import { AddAccountForm } from '../accounts/AddAccountForm';
import { OnboardingFrame } from './OnboardingFrame';

export function AccountStep() {
  const { session } = useAppContext();
  const done = () => {
    session.finishOnboarding();
  };
  return (
    <OnboardingFrame
      title="Pridať e-mailový účet"
      lead="Pripoj schránku cez Google alebo IMAP. Nastavenia servera doplníme podľa adresy, ty len skontroluješ heslo."
      step={3}
    >
      <AddAccountForm onDone={done} />
      <Button variant="ghost" onClick={done}>
        Preskočiť, pridám neskôr
      </Button>
    </OnboardingFrame>
  );
}
