import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { type HistoryEntry, HistoryRecorder } from '../src/features/history/history-recorder';
import type { NavLocation } from '../src/features/history/nav-location';
import { NavigationHistory } from '../src/features/history/navigation-history';
import { uiLocationStore } from '../src/features/history/ui-location-store';
import { closeSearch, openSearch, selectFolder } from '../src/features/mail/navigation';
import { demoIds } from '../src/data/demo/seed/ids';
import { INITIAL_UI, setUi, useUiStore } from '../src/state/ui-store';

const SENT = { kind: 'view', view: 'sent' } as const;

describe('history recorder on the ui store', () => {
  let recorder: HistoryRecorder<NavLocation>;
  let stop: () => void = () => undefined;

  beforeEach(() => {
    useUiStore.setState(INITIAL_UI);
    recorder = new HistoryRecorder(
      new NavigationHistory<HistoryEntry<NavLocation>>(),
      uiLocationStore,
    );
    stop = recorder.start();
  });
  afterEach(() => {
    stop();
    useUiStore.setState(INITIAL_UI);
  });

  it('records a new location for each navigation and walks back through them', () => {
    selectFolder(SENT);
    setUi({ openThreadId: demoIds.thread('c-lunch') });

    recorder.go('back');
    expect(useUiStore.getState().openThreadId).toBeNull();
    expect(useUiStore.getState().folder).toEqual(SENT);
    recorder.go('back');
    expect(useUiStore.getState().folder).toEqual(INITIAL_UI.folder);
    expect(recorder.can('back')).toBe(false);
  });

  it('does not record typing into the search', () => {
    openSearch();
    setUi({ query: 'o' });
    setUi({ query: 'ob' });
    setUi({ query: 'obed' });

    recorder.go('back');

    expect(useUiStore.getState().searchOpen).toBe(false);
    expect(useUiStore.getState().query).toBe('');
    expect(recorder.can('back')).toBe(false);
  });

  it('does not record the changes it applies itself', () => {
    selectFolder(SENT);
    recorder.go('back');

    expect(recorder.can('back')).toBe(false);
    recorder.go('forward');
    expect(useUiStore.getState().folder).toEqual(SENT);
    expect(recorder.can('forward')).toBe(false);
    expect(recorder.can('back')).toBe(true);
  });

  it('clears the forward locations after a new navigation', () => {
    selectFolder(SENT);
    recorder.go('back');
    openSearch();

    expect(recorder.can('forward')).toBe(false);
    closeSearch();
    recorder.go('back');
    expect(useUiStore.getState().searchOpen).toBe(true);
  });

  it('ignores changes made while a dialog other than the settings is open', () => {
    setUi({ overlay: { kind: 'palette' } });
    selectFolder(SENT);
    setUi({ overlay: null });

    recorder.go('back');

    expect(useUiStore.getState().folder).toEqual(INITIAL_UI.folder);
    expect(recorder.can('back')).toBe(false);
  });

  it('records the settings section and the automation view', () => {
    setUi({ overlay: { kind: 'settings', section: 'accounts', adding: false } });
    setUi({ overlay: { kind: 'settings', section: 'automations', adding: false } });
    setUi({
      overlay: {
        kind: 'settings',
        section: 'automations',
        adding: false,
        automation: { kind: 'detail', key: 'rule-1' },
      },
    });

    recorder.go('back');
    expect(useUiStore.getState().overlay).toEqual({
      kind: 'settings',
      section: 'automations',
      adding: false,
      automation: { kind: 'list' },
    });
    recorder.go('back');
    expect(useUiStore.getState().overlay).toMatchObject({ section: 'accounts' });
    recorder.go('back');
    expect(useUiStore.getState().overlay).toBeNull();
  });

  it('replaces the current location quietly', () => {
    selectFolder(SENT);
    recorder.quietly(() => {
      setUi({ openThreadId: demoIds.thread('c-lunch') });
    });

    recorder.go('back');

    expect(useUiStore.getState().folder).toEqual(INITIAL_UI.folder);
    recorder.go('forward');
    expect(useUiStore.getState().openThreadId).toBe(demoIds.thread('c-lunch'));
  });

  it('tells subscribers when going back or forward becomes possible', () => {
    const seen: string[] = [];
    const unsubscribe = recorder.subscribe(() => {
      seen.push(`${String(recorder.can('back'))}:${String(recorder.can('forward'))}`);
    });
    selectFolder(SENT);
    recorder.go('back');
    recorder.go('forward');
    unsubscribe();
    selectFolder(INITIAL_UI.folder);
    expect(seen).toEqual(['true:false', 'false:true', 'true:false']);
  });
});
