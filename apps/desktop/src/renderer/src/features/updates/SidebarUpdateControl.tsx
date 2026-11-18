import { useState } from 'react';
import { useAppContext } from '../../data/hooks/services-context';
import { checkFeedback } from './check-feedback';
import { reportUpdateFailure } from './report-update-failure';
import { describeUpdateButton, type UpdateButtonAction } from './update-button-view';
import { UpdateButton } from './UpdateButton';
import { useUpdateCheck } from './use-update-check';
import { useUpdateStatus } from './use-update-status';

export function SidebarUpdateControl() {
  const { platform, now } = useAppContext();
  const clock = () => now?.() ?? new Date();
  const [revealedAt, setRevealedAt] = useState(clock);
  const status = useUpdateStatus(platform);
  const { settled, check } = useUpdateCheck(platform, status);
  const view = describeUpdateButton(status, settled, revealedAt);
  const actions: Readonly<Record<UpdateButtonAction, () => void>> = {
    check,
    install: () => {
      platform.installUpdate().catch(reportUpdateFailure);
    },
  };
  return (
    <>
      {view !== null && (
        <UpdateButton
          view={view}
          onAction={(action) => {
            actions[action]();
          }}
          onReveal={() => {
            setRevealedAt(clock());
          }}
        />
      )}
      <span className="sr-only" role="status">
        {checkFeedback(settled)}
      </span>
    </>
  );
}
