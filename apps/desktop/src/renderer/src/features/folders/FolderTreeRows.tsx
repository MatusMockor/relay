import { FolderIcon, Icon } from '@relay/ui';
import type { CSSProperties, ReactNode } from 'react';
import { toggleCollapsed, useUiStore } from '../../state/ui-store';
import type { FolderTreeNode } from './folder-tree';

export interface TreeLeaf {
  readonly icon: ReactNode;
  readonly on: boolean;
  readonly count: number;
  readonly title: string;
  readonly onSelect: () => void;
}

interface FolderTreeRowsProps<Value> {
  readonly nodes: readonly FolderTreeNode<Value>[];
  readonly scope: string;
  readonly depth?: number;
  readonly leafOf: (value: Value) => TreeLeaf;
}

const depthStyle = (depth: number): CSSProperties => ({ ['--depth' as string]: depth });

function Toggle({
  name,
  collapsed,
  onToggle,
}: {
  readonly name: string;
  readonly collapsed: boolean;
  readonly onToggle: () => void;
}) {
  return (
    <button
      type="button"
      className={`ft-tw${collapsed ? ' shut' : ''}`}
      aria-expanded={!collapsed}
      aria-label={`${collapsed ? 'Rozbaliť' : 'Zbaliť'} ${name}`}
      onClick={onToggle}
    >
      <Icon name="down" size={12} />
    </button>
  );
}

function Leaf({ name, leaf }: { readonly name: string; readonly leaf: TreeLeaf | null }) {
  if (leaf === null) {
    return (
      <span className="f ft-gap" title={name}>
        <FolderIcon name="folder" />
        <span className="fl">{name}</span>
      </span>
    );
  }
  return (
    <button
      type="button"
      className={`f${leaf.on ? ' on' : ''}`}
      title={leaf.title}
      aria-current={leaf.on ? 'page' : undefined}
      onClick={leaf.onSelect}
    >
      {leaf.icon}
      <span className="fl">{name}</span>
      {leaf.count > 0 ? <span className="n">{leaf.count}</span> : null}
    </button>
  );
}

export function FolderTreeRows<Value>({
  nodes,
  scope,
  depth = 0,
  leafOf,
}: FolderTreeRowsProps<Value>) {
  const collapsed = useUiStore((state) => state.collapsed);
  return (
    <>
      {nodes.map((node) => {
        const key = `${scope}:${node.key}`;
        const shut = collapsed[key] === true;
        const hasChildren = node.children.length > 0;
        return (
          <div key={key} className="ft-node">
            <div className="ft-row" style={depthStyle(depth)}>
              {hasChildren ? (
                <Toggle
                  name={node.name}
                  collapsed={shut}
                  onToggle={() => {
                    toggleCollapsed(key);
                  }}
                />
              ) : (
                <span className="ft-tw" aria-hidden="true" />
              )}
              <Leaf name={node.name} leaf={node.value === null ? null : leafOf(node.value)} />
            </div>
            {hasChildren && !shut ? (
              <FolderTreeRows
                nodes={node.children}
                scope={scope}
                depth={depth + 1}
                leafOf={leafOf}
              />
            ) : null}
          </div>
        );
      })}
    </>
  );
}
