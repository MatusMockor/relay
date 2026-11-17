export class DisjointSet {
  private readonly parents: number[];

  constructor(size: number) {
    this.parents = Array.from({ length: size }, (_, index) => index);
  }

  root(index: number): number {
    let current = index;
    while (this.parents[current] !== current) {
      const parent = this.parents[current] ?? current;
      this.parents[current] = this.parents[parent] ?? parent;
      current = parent;
    }
    return current;
  }

  join(left: number, right: number): void {
    this.parents[this.root(left)] = this.root(right);
  }

  sizes(): Map<number, number> {
    const sizes = new Map<number, number>();
    this.parents.forEach((_, index) => {
      const root = this.root(index);
      sizes.set(root, (sizes.get(root) ?? 0) + 1);
    });
    return sizes;
  }
}
