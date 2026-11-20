import { useAccountsModel } from '../../mail/use-accounts-model';
import { SectionHeader } from '../SectionHeader';
import { SplitDetail } from '../splits/SplitDetail';
import { SplitList } from '../splits/SplitList';
import { SplitQuickAdd } from '../splits/SplitQuickAdd';
import { showSplit, useOpenedSplit } from '../splits/split-view';
import { useSplitEditor } from '../splits/use-split-editor';

export function SplitsSection() {
  const editor = useSplitEditor();
  const { accounts } = useAccountsModel();
  const openedId = useOpenedSplit();
  const opened = editor.splits.find((split) => split.id === openedId);
  const showList = () => {
    showSplit(null);
  };
  if (opened !== undefined) {
    return (
      <SplitDetail
        key={opened.id}
        split={opened}
        accounts={accounts}
        disabled={editor.locked}
        onBack={showList}
        onSave={editor.save}
        onRemove={() => {
          editor.remove(opened.id);
          showList();
        }}
      />
    );
  }
  return (
    <>
      <SectionHeader title="Split Inbox">
        Splity rozdelia Doručenú poštu na tematické záložky. Pravidlá bežia pri každej
        synchronizácii, zhora nadol. Všetko ostatné ostáva v Dôležitých. Poradie zmeníš potiahnutím.
      </SectionHeader>
      <SplitList
        splits={editor.splits}
        unsupported={editor.unsupported}
        accounts={accounts}
        disabled={editor.locked}
        onOpen={showSplit}
        onMove={editor.reorder}
      />
      <SplitQuickAdd
        order={editor.splits.length}
        disabled={editor.locked}
        onAdd={(input) => {
          editor.add(input, showSplit);
        }}
      />
    </>
  );
}
