import { useEffect, useState } from 'react';

const PREVIEW_DEBOUNCE_MS = 400;

export const useDebouncedKey = (key: string): string => {
  const [settled, setSettled] = useState(key);
  useEffect(() => {
    const timer = setTimeout(() => {
      setSettled(key);
    }, PREVIEW_DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
    };
  }, [key]);
  return settled;
};
