import type { Device, User } from '@relay/shared';
import { create } from 'zustand';
import type { RealtimeStatus } from '../data/remote/RealtimeConnection';
import type { AppServices } from './services';

export type SessionPhase = 'booting' | 'onboarding' | 'ready';
export type OnboardingStep = 'welcome' | 'server' | 'auth' | 'account';

export interface SessionState {
  readonly phase: SessionPhase;
  readonly step: OnboardingStep;
  readonly services: AppServices | null;
  readonly pendingServerUrl: string | null;
  readonly user: User | null;
  readonly device: Device | null;
  readonly realtime: RealtimeStatus;
}

export const INITIAL_SESSION: SessionState = {
  phase: 'booting',
  step: 'welcome',
  services: null,
  pendingServerUrl: null,
  user: null,
  device: null,
  realtime: 'offline',
};

export const useSessionStore = create<SessionState>(() => INITIAL_SESSION);
