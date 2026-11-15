import type { Split, SplitInput, SplitRule } from '@relay/shared';
import { AccountDot, Button, Field, Switch } from '@relay/ui';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { describeError } from '../../../data/errors';
import { queryKeys } from '../../../data/hooks/query-keys';
import { useClient } from '../../../data/hooks/services-context';
import { useSplits } from '../../../data/hooks/use-mail-queries';
import { showToast } from '../../../state/toast-store';
import { accountLike, useAccountsModel } from '../../mail/use-accounts-model';
import { SettingRow } from '../SettingRow';

export const describeRule = (rule: SplitRule): string => {
  if (rule.type === 'fromDomain') {
    return `from:@${rule.domain}`;
  }
  if (rule.type === 'fromAddress') {
    return `from:${rule.address}`;
  }
  if (rule.type === 'subjectRegex') {
    return `subject:/${rule.pattern}/${rule.caseSensitive ? '' : 'i'}`;
  }
  if (rule.type === 'header') {
    return `header:${rule.name}~${rule.pattern}`;
  }
  return `jira:${rule.projectKeys.join(',') || '*'}`;
};

const toInput = (split: Split): SplitInput => ({
  id: split.id,
  accountId: split.accountId,
  name: split.name,
  order: split.order,
  rules: split.rules,
  exclusive: split.exclusive,
});

export function SplitsSection() {
  const splits = useSplits();
  const client = useClient();
  const queryClient = useQueryClient();
  const model = useAccountsModel();
  const [name, setName] = useState('');
  const [domain, setDomain] = useState('');
  const [saving, setSaving] = useState(false);
  const list = [...(splits.data ?? [])].sort((a, b) => a.order - b.order);
  const locked = saving || splits.data === undefined;
  const save = (next: SplitInput[]) => {
    if (locked) {
      return;
    }
    setSaving(true);
    client
      .replaceSplits(next.map((split, order) => ({ ...split, order })))
      .then((saved) => {
        queryClient.setQueryData(queryKeys.splits(), saved);
        void queryClient.invalidateQueries({ queryKey: queryKeys.threadLists() });
      })
      .catch((error: unknown) => {
        showToast(describeError(error));
      })
      .finally(() => {
        setSaving(false);
      });
  };
  const add = () => {
    if (locked) {
      return;
    }
    if (name.trim() === '' || !/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(domain.trim())) {
      showToast('Doplň názov splitu a doménu odosielateľa, napríklad firma.sk');
      return;
    }
    save([
      ...list.map(toInput),
      {
        accountId: null,
        name: name.trim(),
        order: list.length,
        exclusive: true,
        rules: [{ type: 'fromDomain', domain: domain.trim().replace(/^@/, '') }],
      },
    ]);
    setName('');
    setDomain('');
  };
  return (
    <>
      <h2>Split Inbox</h2>
      <p className="lead">
        Splity rozdelia Doručenú poštu na tematické záložky. Pravidlá bežia pri každej
        synchronizácii, zhora nadol. Všetko ostatné ostáva v Dôležitých.
      </p>
      {list.map((split) => {
        const account = split.accountId === null ? null : model.byId.get(split.accountId);
        return (
          <div className="rule" key={split.id}>
            <b>
              {account === null || account === undefined ? null : (
                <AccountDot account={accountLike(account)} />
              )}{' '}
              {split.name}
            </b>
            <p>
              {split.accountId === null ? 'Všetky účty' : `Účet ${account?.displayName ?? ''}`}
              {split.exclusive ? ' · vyberie maily z Dôležitých' : ''}
            </p>
            <span className="mono">{split.rules.map(describeRule).join(' OR ')}</span>
            <span className="cnt">
              <Switch
                checked={split.exclusive}
                label={`Výlučný split ${split.name}`}
                disabled={locked}
                onChange={(exclusive) => {
                  save(
                    list.map((item) =>
                      item.id === split.id ? { ...toInput(item), exclusive } : toInput(item),
                    ),
                  );
                }}
              />
              <Button
                variant="danger"
                disabled={locked}
                onClick={() => {
                  save(list.filter((item) => item.id !== split.id).map(toInput));
                }}
              >
                Odstrániť
              </Button>
            </span>
          </div>
        );
      })}
      <div className="form">
        <div className="fld-2">
          <Field
            label="Nový split"
            placeholder="napr. Klienti"
            value={name}
            onChange={(event) => {
              setName(event.target.value);
            }}
          />
          <Field
            label="Doména"
            placeholder="firma.sk"
            value={domain}
            onChange={(event) => {
              setDomain(event.target.value);
            }}
          />
        </div>
        <div className="btns">
          <Button onClick={add} disabled={locked}>
            Pridať split
          </Button>
        </div>
      </div>
      <SettingRow
        title="Pravidlá sa synchronizujú"
        scope="synced"
        description="Rovnaké splity uvidíš na všetkých zariadeniach."
      />
    </>
  );
}
