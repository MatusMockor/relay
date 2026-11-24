// @vitest-environment jsdom
import { fireEvent, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { firstRunning, historyClient, historyText, openSync } from './support/history-settings';
import { renderApp, resetStores } from './support/render-app';

const FAILED = 'Priebeh sťahovania histórie sa nepodarilo načítať.';

describe('older mail progress read failures', () => {
  beforeEach(() => {
    resetStores();
  });

  afterEach(() => {
    resetStores();
  });

  it('shows the failure instead of hiding the row and recovers on retry', async () => {
    const { client, history } = historyClient(firstRunning);
    history.failReads(true);
    renderApp({ demo: () => client });
    const sheet = await openSync();

    await waitFor(() => {
      expect(historyText(sheet)).toContain(FAILED);
    });
    expect(within(sheet).queryByRole('progressbar')).toBeNull();

    history.failReads(false);
    fireEvent.click(within(sheet).getByRole('button', { name: 'Skúsiť znova' }));

    await waitFor(() => {
      expect(historyText(sheet)).toContain('Sťahujem históriu: 12 340 z 48 000 správ');
    });
    expect(historyText(sheet)).not.toContain(FAILED);
    expect(history.reads).toBe(2);
  });

  it('keeps the cached progress when a background refresh fails', async () => {
    const { client, history, publish } = historyClient(firstRunning);
    renderApp({ demo: () => client });
    const sheet = await openSync();
    await waitFor(() => {
      expect(historyText(sheet)).toContain('Sťahujem históriu: 12 340 z 48 000 správ');
    });

    history.failReads(true);
    await publish({ stored: 24_000 });

    await waitFor(() => {
      expect(history.reads).toBe(2);
    });
    expect(historyText(sheet)).toContain('Sťahujem históriu: 12 340 z 48 000 správ');
    expect(historyText(sheet)).not.toContain(FAILED);
    expect(within(sheet).getByRole('progressbar').getAttribute('aria-valuenow')).toBe('26');
  });

  it('still hides the row for a successful empty progress list', async () => {
    const { client, history } = historyClient();
    renderApp({ demo: () => client });
    const sheet = await openSync();

    await waitFor(() => {
      expect(history.reads).toBe(1);
    });
    expect(within(sheet).queryByText('Staršia pošta')).toBeNull();
  });
});
