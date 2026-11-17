import type { UpdateDisabledReason } from '@relay/shared/ipc';

export interface UpdatePlatformFacts {
  readonly platform: string;
  readonly isPackaged: boolean;
  readonly appImage: string | undefined;
  readonly packageType: string | null;
}

export type UpdateAvailability =
  | { readonly enabled: true }
  | { readonly enabled: false; readonly reason: UpdateDisabledReason };

type PlatformPolicy = (facts: UpdatePlatformFacts) => UpdateAvailability;

const ENABLED: UpdateAvailability = { enabled: true };

const disabled = (reason: UpdateDisabledReason): UpdateAvailability => ({
  enabled: false,
  reason,
});

const linuxPolicy: PlatformPolicy = ({ appImage, packageType }) => {
  const isAppImage = appImage !== undefined && appImage.trim() !== '';
  if (packageType !== null || !isAppImage) {
    return disabled('manual-package');
  }
  return ENABLED;
};

const POLICIES: Readonly<Record<string, PlatformPolicy>> = {
  darwin: () => ENABLED,
  linux: linuxPolicy,
};

export const resolveUpdateAvailability = (facts: UpdatePlatformFacts): UpdateAvailability => {
  if (!facts.isPackaged) {
    return disabled('development');
  }
  const policy = POLICIES[facts.platform];
  if (policy === undefined) {
    return disabled('unsupported-platform');
  }
  return policy(facts);
};
