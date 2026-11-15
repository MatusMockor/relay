export type PowerListener = () => void;

export interface PowerEvents {
  onSuspend(listener: PowerListener): () => void;
  onResume(listener: PowerListener): () => void;
}
