export interface PageRequest {
  readonly cursor: string | null;
  readonly limit: number;
}

export interface Page<Item> {
  readonly items: Item[];
  readonly nextCursor: string | null;
}
