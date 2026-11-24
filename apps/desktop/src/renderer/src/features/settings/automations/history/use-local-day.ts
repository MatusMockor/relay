import { useEffect, useState } from 'react';
import { startOfToday } from './undo-messages';

const msUntilNextDay = (now: Date): number => {
  const next = new Date(now);
  next.setHours(24, 0, 0, 0);
  return Math.max(next.getTime() - now.getTime(), 1_000);
};

export const useLocalDay = (): string => {
  const [day, setDay] = useState(() => startOfToday(new Date()));
  useEffect(() => {
    const timer = setTimeout(() => {
      setDay(startOfToday(new Date()));
    }, msUntilNextDay(new Date()));
    return () => {
      clearTimeout(timer);
    };
  }, [day]);
  return day;
};
