import type { Split, SplitInput } from '@relay/shared';
import { Button, Field, Icon, IconButton, Switch } from '@relay/ui';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { describeError } from '../../../data/errors';
import { queryKeys } from '../../../data/hooks/query-keys';
import { useClient } from '../../../data/hooks/services-context';
import { useSplits } from '../../../data/hooks/use-mail-queries';
import { showToast } from '../../../state/toast-store';
import { useNameColors } from '../../colors/use-name-colors';
import { useAccountsModel } from '../../mail/use-accounts-model';
import { SectionHeader } from '../SectionHeader';
import { describeRule, readableRule } from './split-rules';

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
  const colors = useNameColors();
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
      <SectionHeader title="Split Inbox">
        Splity rozdelia Doručenú poštu na tematické záložky. Pravidlá bežia pri každej
        synchronizácii, zhora nadol. Všetko ostatné ostáva v Dôležitých.
      </SectionHeader>
      {list.map((split) => {
        const account = split.accountId === null ? null : model.byId.get(split.accountId);
        return (
          <div className="rule" key={split.id}>
            <b>
              <span className="dot-slot">
                <span className="acc-dot" style={{ ['--a' as string]: colors.of(split.name) }} />
              </span>
              {split.name}
            </b>
            <p>
              {split.accountId === null ? 'Všetky účty' : `Účet ${account?.displayName ?? ''}`}
              {split.exclusive ? ' · vyberie maily z Dôležitých' : ''}
            </p>
            <span className="rule-chips" title={split.rules.map(describeRule).join(' OR ')}>
              {split.rules.map((rule, index) => (
                <span className="rule-run" key={`${rule.type}-${String(index)}`}>
                  {index > 0 ? <span className="kw">alebo</span> : null}
                  <span className="rule-chip">{readableRule(rule)}</span>
                </span>
              ))}
            </span>
            <span className="cnt">
              <IconButton
                label={`Odstrániť split ${split.name}`}
                disabled={locked}
                onClick={() => {
                  save(list.filter((item) => item.id !== split.id).map(toInput));
                }}
              >
                <Icon name="trash" />
              </IconButton>
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
            </span>
          </div>
        );
      })}
      <div className="split-add">
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
        <Button onClick={add} disabled={locked}>
          Pridať split
        </Button>
      </div>
    </>
  );
}
