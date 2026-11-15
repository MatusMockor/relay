import { useSessionStore } from '../../session/session-store';
import { AccountStep } from './AccountStep';
import { AuthStep } from './AuthStep';
import { ServerStep } from './ServerStep';
import { WelcomeStep } from './WelcomeStep';

export function OnboardingScreen() {
  const step = useSessionStore((state) => state.step);
  if (step === 'server') {
    return <ServerStep />;
  }
  if (step === 'auth') {
    return <AuthStep />;
  }
  if (step === 'account') {
    return <AccountStep />;
  }
  return <WelcomeStep />;
}
