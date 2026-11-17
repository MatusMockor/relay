import type { UpdateStatus } from '@relay/shared';
import { Button } from '@relay/ui';
import { type ReactNode, useState } from 'react';
import { useAppContext } from '../../data/hooks/services-context';
import { useUpdateStatus } from './use-update-status';

const INSTALL_FAILED = 'install-failed';

const promptKey = (status: UpdateStatus | null): string | null => {
  if (status?.kind === 'ready' || status?.kind === 'installing') {
    return status.version;
  }
  if (status?.kind === 'error' && status.failed === 'install') {
    return INSTALL_FAILED;
  }
  return null;
};

function PromptFrame({
  title,
  detail,
  children,
}: {
  readonly title: string;
  readonly detail: string;
  readonly children: ReactNode;
}) {
  return (
    <section className="update-prompt" role="status" aria-live="polite">
      <div className="update-prompt-text">
        <strong>{title}</strong>
        <span>{detail}</span>
      </div>
      <div className="update-prompt-actions">{children}</div>
    </section>
  );
}

export function UpdatePrompt() {
  const { platform } = useAppContext();
  const status = useUpdateStatus(platform);
  const [dismissed, setDismissed] = useState<string | null>(null);
  const [requested, setRequested] = useState(false);
  const key = promptKey(status);
  if (key === null || key === dismissed) {
    return null;
  }
  const dismiss = () => {
    setDismissed(key);
    setRequested(false);
  };
  if (key === INSTALL_FAILED) {
    return (
      <PromptFrame
        title="Aktualizáciu sa nepodarilo nainštalovať"
        detail="Relay to skúsi znova pri ďalšej kontrole aktualizácií."
      >
        <Button variant="ghost" onClick={dismiss}>
          Zavrieť
        </Button>
      </PromptFrame>
    );
  }
  const restarting = status?.kind === 'installing' || requested;
  const restart = () => {
    setRequested(true);
    platform.installUpdate().catch(() => {
      setRequested(false);
    });
  };
  return (
    <PromptFrame
      title="Nová verzia je pripravená"
      detail={`Relay ${key} sa nainštaluje po reštarte.`}
    >
      <Button variant="ghost" disabled={restarting} onClick={dismiss}>
        Neskôr
      </Button>
      <Button variant="primary" disabled={restarting} onClick={restart}>
        {restarting ? 'Reštartujem…' : 'Reštartovať'}
      </Button>
    </PromptFrame>
  );
}
