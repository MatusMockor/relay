export interface FolderTreeEntry<Value> {
  readonly path: string;
  readonly delimiter: string | null;
  readonly value: Value;
}

export interface FolderTreeNode<Value> {
  readonly key: string;
  readonly name: string;
  readonly value: Value | null;
  readonly children: readonly FolderTreeNode<Value>[];
}

interface DraftNode<Value> {
  readonly key: string;
  readonly name: string;
  value: Value | null;
  readonly children: Map<string, DraftNode<Value>>;
}

const segmentsOf = (path: string, delimiter: string | null): string[] => {
  if (delimiter === null || delimiter === '') {
    return [path];
  }
  const segments = path.split(delimiter).filter((segment) => segment !== '');
  return segments.length === 0 ? [path] : segments;
};

const childOf = <Value>(
  level: Map<string, DraftNode<Value>>,
  key: string,
  name: string,
): DraftNode<Value> => {
  const known = level.get(name);
  if (known !== undefined) {
    return known;
  }
  const created: DraftNode<Value> = { key, name, value: null, children: new Map() };
  level.set(name, created);
  return created;
};

const insert = <Value>(root: Map<string, DraftNode<Value>>, entry: FolderTreeEntry<Value>) => {
  const segments = segmentsOf(entry.path, entry.delimiter);
  const joiner = entry.delimiter ?? '';
  let level = root;
  let node: DraftNode<Value> | undefined;
  for (const [index, segment] of segments.entries()) {
    node = childOf(level, segments.slice(0, index + 1).join(joiner), segment);
    level = node.children;
  }
  if (node !== undefined) {
    node.value = entry.value;
  }
};

const byName = <Value>(left: FolderTreeNode<Value>, right: FolderTreeNode<Value>): number =>
  left.name.localeCompare(right.name, 'sk');

const finish = <Value>(level: Map<string, DraftNode<Value>>): FolderTreeNode<Value>[] =>
  [...level.values()]
    .map((node) => ({
      key: node.key,
      name: node.name,
      value: node.value,
      children: finish(node.children),
    }))
    .sort(byName);

export const buildFolderTree = <Value>(
  entries: readonly FolderTreeEntry<Value>[],
): FolderTreeNode<Value>[] => {
  const root = new Map<string, DraftNode<Value>>();
  entries.forEach((entry) => {
    insert(root, entry);
  });
  return finish(root);
};
