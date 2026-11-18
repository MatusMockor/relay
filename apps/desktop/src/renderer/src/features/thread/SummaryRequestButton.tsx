import { Spark } from '@relay/ui';

export interface SummaryRequestButtonProps {
  readonly onRequest: () => void;
  readonly detailed: boolean;
}

export function SummaryRequestButton({ onRequest, detailed }: SummaryRequestButtonProps) {
  return (
    <button
      type="button"
      className={detailed ? 'btn ghost sum-ask more' : 'btn sum-ask'}
      onClick={onRequest}
    >
      <Spark />
      {detailed ? 'Podrobné zhrnutie' : 'Zhrnúť vlákno'}
    </button>
  );
}
