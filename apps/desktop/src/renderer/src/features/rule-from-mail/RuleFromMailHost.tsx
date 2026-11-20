import type { ThreadId } from '@relay/shared';
import {
  useAutomations,
  useThreadDetail,
  useUserSettings,
} from '../../data/hooks/use-mail-queries';
import { useUnsubscribeOptions } from '../../data/hooks/use-unsubscribe-options';
import { useUiStore } from '../../state/ui-store';
import { useAccountsModel } from '../mail/use-accounts-model';
import { closeOverlay } from './close-overlay';
import { latestReceived } from './latest-received';
import { mailRuleOptions } from './mail-rule-options';
import { isNewsletterSource } from './newsletter-source';
import { RuleFromMailForm } from './RuleFromMailForm';
import { RuleFromMailSheet } from './RuleFromMailSheet';

const notice = (text: string) => (
  <p className="rfm-lead" role="status">
    {text}
  </p>
);

interface RuleFromMailContentProps {
  readonly threadId: ThreadId;
  readonly onClose: () => void;
}

function RuleFromMailContent({ threadId, onClose }: RuleFromMailContentProps) {
  const detail = useThreadDetail(threadId);
  const unsubscribe = useUnsubscribeOptions(threadId);
  const automations = useAutomations();
  const settings = useUserSettings();
  const { accounts, byId } = useAccountsModel();
  if (detail.isError || automations.isError) {
    return notice('Mail sa nepodarilo načítať.');
  }
  if (!detail.data || automations.data === undefined || unsubscribe.isPending) {
    return notice('Načítavam mail…');
  }
  const account = byId.get(detail.data.thread.accountId);
  const ownEmails = accounts.map((item) => item.email);
  const message = latestReceived(detail.data.messages, ownEmails);
  if (account === undefined || message === null) {
    return notice('V konverzácii nie je žiadny prijatý mail.');
  }
  return (
    <RuleFromMailForm
      account={account}
      accounts={accounts}
      options={mailRuleOptions({
        from: message.from,
        subject: message.subject,
        newsletter: isNewsletterSource(message, detail.data.messages, ownEmails, unsubscribe.data),
      })}
      existing={automations.data}
      runner={settings.data?.ai.defaultRunner ?? 'claude'}
      onClose={onClose}
    />
  );
}

export function RuleFromMailHost() {
  const overlay = useUiStore((state) => state.overlay);
  if (overlay?.kind !== 'ruleFromMail') {
    return null;
  }
  const close = closeOverlay(overlay);
  return (
    <RuleFromMailSheet key={overlay.threadId} onClose={close}>
      <RuleFromMailContent threadId={overlay.threadId} onClose={close} />
    </RuleFromMailSheet>
  );
}
