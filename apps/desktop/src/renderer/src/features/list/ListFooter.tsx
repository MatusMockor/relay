import { Button } from '@relay/ui';
import type { ListPaging } from '../../data/hooks/use-thread-list-paging';

export function ListFooter({ paging }: { readonly paging: ListPaging }) {
  if (paging.failed) {
    return (
      <div className="a-more" role="status">
        <span>Staršie konverzácie sa nepodarilo načítať.</span>
        <Button onClick={paging.retry}>Skúsiť znova</Button>
      </div>
    );
  }
  if (paging.loadingMore) {
    return (
      <div className="a-more" role="status">
        Načítavam staršie konverzácie…
      </div>
    );
  }
  return null;
}
