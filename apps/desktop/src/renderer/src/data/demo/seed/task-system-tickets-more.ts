import type { ExternalTaskStatus } from '@relay/shared';
import type { DemoTicketSeed } from './task-system-tickets';

const TODO: ExternalTaskStatus = { name: 'Todo', category: 'todo' };
const BACKLOG: ExternalTaskStatus = { name: 'Backlog', category: 'todo' };
const IN_PROGRESS: ExternalTaskStatus = { name: 'In Progress', category: 'inProgress' };
const IN_REVIEW: ExternalTaskStatus = { name: 'In Review', category: 'inProgress' };
const OPEN: ExternalTaskStatus = { name: 'Open', category: 'todo' };

export const DEMO_LINEAR_TICKETS: readonly DemoTicketSeed[] = [
  {
    key: 'APP-87',
    title: 'Offline režim stratí rozpísanú odpoveď po reštarte',
    priority: 'urgent',
    status: IN_PROGRESS,
    projectName: 'Mobilná aplikácia',
    dueInDays: 1,
    updatedHoursAgo: 2,
  },
  {
    key: 'APP-91',
    title: 'Zrýchliť načítanie zoznamu objednávok',
    priority: 'high',
    status: IN_REVIEW,
    projectName: 'Mobilná aplikácia',
    dueInDays: 5,
    updatedHoursAgo: 9,
  },
  {
    key: 'DES-12',
    title: 'Navrhnúť prázdne stavy pre nový dashboard',
    priority: 'medium',
    status: TODO,
    projectName: 'Dizajn systém',
    dueInDays: null,
    updatedHoursAgo: 20,
  },
  {
    key: 'APP-64',
    title: 'Zjednotiť formát dátumov v nastaveniach',
    priority: 'low',
    status: BACKLOG,
    projectName: 'Mobilná aplikácia',
    dueInDays: null,
    updatedHoursAgo: 50,
  },
  {
    key: 'DES-9',
    title: 'Preskúmať tmavé varianty ikon',
    priority: 'none',
    status: BACKLOG,
    projectName: 'Dizajn',
    dueInDays: null,
    updatedHoursAgo: 120,
  },
];

export const DEMO_GITHUB_TICKETS: readonly DemoTicketSeed[] = [
  {
    key: 'acme-sk/zakaznicky-portal-frontend#1287',
    title: 'Formulár reklamácie neodošle prílohy väčšie ako 5 MB',
    priority: 'high',
    status: { name: 'in progress', category: 'inProgress' },
    projectName: 'acme-sk/zakaznicky-portal-frontend',
    dueInDays: 3,
    updatedHoursAgo: 4,
  },
  {
    key: 'acme-sk/api#342',
    title: 'Dokumentovať limity stránkovania v API',
    priority: 'none',
    status: OPEN,
    projectName: 'acme-sk/api',
    dueInDays: null,
    updatedHoursAgo: 30,
  },
];
