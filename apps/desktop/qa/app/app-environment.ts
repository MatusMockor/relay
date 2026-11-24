import { accessSync, constants } from 'node:fs';
import { delimiter, join } from 'node:path';

const AI_CLIS: readonly string[] = ['claude', 'codex'];

const hasExecutable = (dir: string, name: string): boolean => {
  try {
    accessSync(join(dir, name), constants.X_OK);
    return true;
  } catch (_error) {
    return false;
  }
};

export const pathWithoutAiClis = (pathEnv: string): string =>
  pathEnv
    .split(delimiter)
    .filter((dir) => dir !== '' && !AI_CLIS.some((name) => hasExecutable(dir, name)))
    .join(delimiter);

const STRIPPED: readonly string[] = [
  'ELECTRON_RENDERER_URL',
  'ELECTRON_RUN_AS_NODE',
  'NODE_OPTIONS',
];

export const appEnvironment = (
  profileHome: string,
  extra: Readonly<Record<string, string>>,
): Record<string, string> => {
  const inherited = Object.entries(process.env).filter(
    (entry): entry is [string, string] => entry[1] !== undefined && !STRIPPED.includes(entry[0]),
  );
  return {
    ...Object.fromEntries(inherited),
    HOME: profileHome,
    XDG_CONFIG_HOME: join(profileHome, '.config'),
    XDG_CACHE_HOME: join(profileHome, '.cache'),
    PATH: pathWithoutAiClis(process.env.PATH ?? ''),
    RELAY_DEV_ALLOW_PLAINTEXT_MAIL: '1',
    ...extra,
  };
};
