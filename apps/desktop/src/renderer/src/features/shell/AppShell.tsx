import { cx, ResizeHandle } from '@relay/ui';
import { type CSSProperties, useEffect } from 'react';
import { useRealtimeSync } from '../../data/hooks/use-realtime-sync';
import { useRemoteAutomationNotifications } from '../../data/hooks/use-remote-automation-notifications';
import { useUserSettings } from '../../data/hooks/use-mail-queries';
import { setUi, useUiStore } from '../../state/ui-store';
import { FolderSidebar } from '../folders/FolderSidebar';
import { useKeyboard } from '../keyboard/use-keyboard';
import { ThreadList } from '../list/ThreadList';
import { MailActionsProvider } from '../mail/MailActionsProvider';
import { useNotificationNavigation } from '../mail/use-notification-navigation';
import { RightPanel } from '../side/RightPanel';
import { ThreadView } from '../thread/ThreadView';
import { useLayoutPersistence } from './layout-persistence';
import { OverlayHost } from './OverlayHost';
import { TopBar } from './TopBar';
import { LIMITS, useLayout } from './use-layout';

const resize = (key: 'sidebar' | 'rightPanel') => (width: number) => {
  setUi((state) => ({ widths: { ...state.widths, [key]: width } }));
};

function Shell() {
  useKeyboard();
  useRealtimeSync();
  useRemoteAutomationNotifications();
  useNotificationNavigation();
  const commit = useLayoutPersistence();
  const layout = useLayout();
  const inThread = useUiStore((state) => state.openThreadId !== null);
  const composing = useUiStore((state) => state.overlay?.kind === 'compose');
  const settings = useUserSettings();
  useEffect(() => {
    document.body.classList.toggle('dense', settings.data?.density === 'compact');
  }, [settings.data?.density]);
  return (
    <div
      className={cx('app', composing && 'composing')}
      style={
        {
          '--side-w': `${String(layout.rightPanel)}px`,
          '--fold-w': `${String(layout.leftVisible ? layout.sidebar : 0)}px`,
        } as CSSProperties
      }
    >
      {layout.leftVisible ? (
        <>
          <FolderSidebar width={layout.sidebar} />
          <ResizeHandle
            edge="left"
            label="Šírka priečinkov"
            controls="fold"
            width={layout.sidebar}
            limits={LIMITS.sidebar}
            onResize={resize('sidebar')}
            onCollapse={() => {
              setUi({ leftUser: false });
            }}
            onCommit={commit}
          />
        </>
      ) : null}
      <main className="a-main">
        <TopBar leftVisible={layout.leftVisible} />
        {inThread ? <ThreadView /> : <ThreadList />}
      </main>
      {layout.rightPanel > 0 ? (
        <>
          <ResizeHandle
            edge="right"
            label="Šírka pravého panela"
            controls="side"
            width={layout.rightPanel}
            limits={LIMITS.rightPanel}
            onResize={resize('rightPanel')}
            onCollapse={() => {
              setUi({ rightOpen: false });
            }}
            onCommit={commit}
          />
          <RightPanel width={layout.rightPanel} />
        </>
      ) : null}
      <OverlayHost />
    </div>
  );
}

export function AppShell() {
  return (
    <MailActionsProvider>
      <Shell />
    </MailActionsProvider>
  );
}
