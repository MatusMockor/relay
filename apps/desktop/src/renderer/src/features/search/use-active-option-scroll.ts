import { useEffect } from 'react';

export const scrollOptionIntoView = (id: string | undefined): void => {
  const option = id === undefined ? null : document.getElementById(id);
  if (option === null || typeof option.scrollIntoView !== 'function') {
    return;
  }
  option.scrollIntoView({ block: 'nearest' });
};

export const useActiveOptionScroll = (id: string | undefined): void => {
  useEffect(() => {
    scrollOptionIntoView(id);
  }, [id]);
};
