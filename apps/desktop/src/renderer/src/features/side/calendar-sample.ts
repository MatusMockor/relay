export interface AgendaEvent {
  readonly day: number;
  readonly start: string;
  readonly end: string;
  readonly title: string;
  readonly sub: string;
  readonly color: string;
}

export const SAMPLE_AGENDA: readonly AgendaEvent[] = [
  {
    day: 0,
    start: '10:00',
    end: '10:15',
    title: 'Standup',
    sub: 'Partner API · Meet',
    color: 'var(--av-1)',
  },
  {
    day: 0,
    start: '11:00',
    end: '12:00',
    title: 'Refinement šprintu 47',
    sub: 'zasadačka Dunaj',
    color: 'var(--av-4)',
  },
  {
    day: 0,
    start: '14:00',
    end: '15:30',
    title: 'Review MR !412',
    sub: 'blok na sústredenie',
    color: 'var(--av-1)',
  },
  {
    day: 0,
    start: '16:00',
    end: '16:30',
    title: '1:1 s Luciou',
    sub: 'Delivery · zasadačka Váh',
    color: 'var(--av-3)',
  },
  {
    day: 1,
    start: '10:00',
    end: '10:15',
    title: 'Standup',
    sub: 'Partner API · Meet',
    color: 'var(--av-1)',
  },
  {
    day: 1,
    start: '12:00',
    end: '13:00',
    title: 'Obed v bistre na Obchodnej',
    sub: 'Tomáš a ďalší dvaja',
    color: 'var(--av-4)',
  },
  {
    day: 1,
    start: '14:00',
    end: '14:30',
    title: 'Deploy 2.15 na produkciu',
    sub: 'po výsledku load testu',
    color: 'var(--av-2)',
  },
  {
    day: 3,
    start: '10:00',
    end: '11:00',
    title: 'Retro šprintu 46',
    sub: 'zasadačka Dunaj',
    color: 'var(--av-5)',
  },
  {
    day: 3,
    start: '13:00',
    end: '14:30',
    title: 'Plánovanie Q1',
    sub: 'Partner API · odhady v MD',
    color: 'var(--av-1)',
  },
  {
    day: 4,
    start: '14:00',
    end: '15:00',
    title: 'Demo pre Denník Juh',
    sub: 'editor a náhľad článku',
    color: 'var(--av-5)',
  },
];

export const minutesOf = (value: string): number => {
  const [hours, minutes] = value.split(':');
  return Number(hours) * 60 + Number(minutes);
};
