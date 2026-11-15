import type { SplitId } from '@relay/shared/domain';
import type { SplitMatcher, SplitMatchInput } from '../../../src';

export class GatedSplitMatcher implements SplitMatcher {
  private holding = false;
  private held: (() => void)[] = [];

  constructor(private readonly inner: SplitMatcher) {}

  get heldCount(): number {
    return this.held.length;
  }

  hold(): void {
    this.holding = true;
  }

  stopHolding(): void {
    this.holding = false;
  }

  releaseHeld(): void {
    this.held.splice(0).forEach((release) => {
      release();
    });
  }

  async match(input: SplitMatchInput): Promise<SplitId[]> {
    if (this.holding) {
      await new Promise<void>((resolve) => {
        this.held.push(resolve);
      });
    }
    return this.inner.match(input);
  }
}
