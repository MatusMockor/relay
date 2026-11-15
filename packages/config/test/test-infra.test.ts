import { describe, expect, it } from 'vitest';
import { resolveTestInfra } from '../test-infra/index';

describe('resolveTestInfra', () => {
  it('defaults to the ports from docker-compose.test.yml', () => {
    const infra = resolveTestInfra({});
    expect(infra.postgres.url).toBe('postgres://relay:relay@127.0.0.1:5433/relay_test');
    expect(infra.greenmail).toMatchObject({
      host: '127.0.0.1',
      imapPort: 3143,
      smtpPort: 3025,
      apiUrl: 'http://127.0.0.1:8086',
      user: { email: 'relay@relay.test', login: 'relay@relay.test', password: 'relay-secret' },
    });
  });

  it('reads overrides from the environment and ignores invalid ports', () => {
    const infra = resolveTestInfra({
      GREENMAIL_HOST: 'greenmail',
      GREENMAIL_IMAP_PORT: '1143',
      GREENMAIL_SMTP_PORT: 'x',
    });
    expect(infra.greenmail.host).toBe('greenmail');
    expect(infra.greenmail.imapPort).toBe(1143);
    expect(infra.greenmail.smtpPort).toBe(3025);
  });
});
