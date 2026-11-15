import { createContext, useContext, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { type LayerNode, pushLayer } from './layers';

export const LayerContext = createContext<LayerNode | null>(null);

export const useLayer = (onKey: (event: KeyboardEvent) => void): LayerNode => {
  const parent = useContext(LayerContext);
  const [node] = useState<LayerNode>(() => ({ parent }));
  const handler = useRef(onKey);
  useLayoutEffect(() => {
    handler.current = onKey;
  });
  useEffect(
    () =>
      pushLayer((event) => {
        handler.current(event);
      }, node),
    [node],
  );
  return node;
};
