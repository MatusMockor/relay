import { describe, expect, it } from 'vitest';
import { canonicalServerUrl } from '../src/data/remote/TokenStore';
import { DeferredQueue } from '../src/features/mail/send-queue';
import { tokens } from './support/fixtures';
import { DEFAULT_DEVICE_SETTINGS } from '@relay/shared';
import { createBrowserPlatform } from '../src/platform/BrowserPlatform';
import { memoryStorage } from './support/render-app';

describe('token storage keys', () => {
  it('canonicalizes server URLs', () => {
    expect(canonicalServerUrl('HTTPS://Mail.Example:443/')).toBe('https://mail.example');
    expect(canonicalServerUrl('https://mail.example/Relay/')).toBe('https://mail.example/Relay');
  });

  it('does not share browser sessions between http and https', async () => {
    const platform = createBrowserPlatform(memoryStorage());
    await platform.tokenStore('https://mail.example').save(tokens('secure'));
    expect(await platform.tokenStore('http://mail.example').load()).toBeNull();
    expect((await platform.tokenStore('https://mail.example/').load())?.accessToken).toBe('secure');
  });
});

describe('browser device settings', () => {
  it('falls back to defaults when reading the storage fails', async () => {
    const platform = createBrowserPlatform({
      getItem: () => {
        expect.fail('storage read must be guarded');
      },
      setItem: () => undefined,
    });
    expect(await platform.deviceSettings()).toEqual(DEFAULT_DEVICE_SETTINGS);
  });
});

describe('DeferredQueue', () => {
  it('commits pending sends immediately on flush and never twice', async () => {
    const queue = new DeferredQueue();
    const commits: string[] = [];
    const pending = queue.enqueue(60_000, () => {
      commits.push('send');
      return Promise.resolve();
    });
    await queue.flushAll();
    expect(commits).toEqual(['send']);
    expect(pending.cancel()).toBe(false);
    await queue.flushAll();
    expect(commits).toEqual(['send']);
  });
});
