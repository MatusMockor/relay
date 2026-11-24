import type { ElectronApplication } from 'playwright';

export type HostOverrides = Readonly<Record<string, string>>;

export const GMAIL_HOSTS = ['imap.gmail.com', 'imap.googlemail.com'] as const;

export const loopbackFor = (hosts: readonly string[]): HostOverrides =>
  Object.fromEntries(hosts.map((host) => [host, '127.0.0.1']));

const patchSource = (overrides: HostOverrides): string => `(() => {
  const targets = ${JSON.stringify(overrides)};
  const dns = process.getBuiltinModule('node:dns');
  const original = dns.lookup;
  Object.assign(dns, {
    lookup: function (hostname, ...rest) {
      const address = targets[String(hostname).toLowerCase()];
      const callback = rest[rest.length - 1];
      if (address === undefined || typeof callback !== 'function') {
        return original.call(dns, hostname, ...rest);
      }
      const options = rest.length > 1 ? rest[0] : undefined;
      const all = typeof options === 'object' && options !== null && options.all === true;
      process.nextTick(() => (all ? callback(null, [{ address, family: 4 }]) : callback(null, address, 4)));
      return undefined;
    },
  });
  return Object.keys(targets);
})()`;

export const applyHostOverrides = async (
  electron: ElectronApplication,
  overrides: HostOverrides,
): Promise<void> => {
  await electron.evaluate(patchSource(overrides));
};
