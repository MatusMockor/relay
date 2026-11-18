import type { Split, SplitInput } from '@relay/shared';
import { Button, Field } from '@relay/ui';
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
import { SplitRow } from './SplitRow';

const toInput = (split: Split): SplitInput => ({
  id: split.id,
  accountId: split.accountId,
  name: split.name,
  order: split.order,
  rules: split.rules,
  exclusive: split.exclusive,
  hideTasks: split.hideTasks,
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
  const scopeOf = (split: Split): string =>
    split.accountId === null
      ? 'Všetky účty'
      : `Účet ${model.byId.get(split.accountId)?.displayName ?? ''}`;
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
        hideTasks: false,
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
      {list.map((split) => (
        <SplitRow
          key={split.id}
          split={split}
          scope={scopeOf(split)}
          color={colors.of(split.name)}
          locked={locked}
          onRemove={() => {
            save(list.filter((item) => item.id !== split.id).map(toInput));
          }}
          onChange={(flags) => {
            save(
              list.map((item) =>
                item.id === split.id ? { ...toInput(item), ...flags } : toInput(item),
              ),
            );
          }}
        />
      ))}
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
