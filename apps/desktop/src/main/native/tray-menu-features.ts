export interface TrayMenuFeatures {
  readonly headers: boolean;
  readonly sublabels: boolean;
}

const versionParts = (version: string): readonly [number, number] => {
  const [major = '0', minor = '0'] = version.split('.');
  return [Number.parseInt(major, 10) || 0, Number.parseInt(minor, 10) || 0];
};

const atLeast = (version: string, major: number, minor: number): boolean => {
  const [actualMajor, actualMinor] = versionParts(version);
  return actualMajor > major || (actualMajor === major && actualMinor >= minor);
};

export const trayMenuFeaturesOf = (
  platform: NodeJS.Platform,
  systemVersion: string,
): TrayMenuFeatures => {
  if (platform !== 'darwin') {
    return { headers: false, sublabels: false };
  }
  return { headers: atLeast(systemVersion, 14, 0), sublabels: atLeast(systemVersion, 14, 4) };
};
