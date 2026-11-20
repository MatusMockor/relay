export interface OfflineWindowPolicy {
  cutoff(): Promise<Date | null>;
}
