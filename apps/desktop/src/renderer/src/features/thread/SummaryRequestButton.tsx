import { Spark } from '@relay/ui';

export function SummaryRequestButton({ onRequest }: { readonly onRequest: () => void }) {
  return (
    <button type="button" className="btn sum-ask" onClick={onRequest}>
      <Spark />
      Zhrnúť vlákno
    </button>
  );
}
