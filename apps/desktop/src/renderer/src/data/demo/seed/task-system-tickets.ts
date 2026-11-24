import type { ExternalTaskStatus, TaskPriority } from '@relay/shared';

export interface DemoTicketSeed {
  readonly key: string;
  readonly title: string;
  readonly priority: TaskPriority;
  readonly status: ExternalTaskStatus;
  readonly projectName: string | null;
  readonly dueInDays: number | null;
  readonly updatedHoursAgo: number;
}

const TODO: ExternalTaskStatus = { name: 'To Do', category: 'todo' };
const IN_PROGRESS: ExternalTaskStatus = { name: 'In Progress', category: 'inProgress' };
const REVIEW: ExternalTaskStatus = { name: 'Code Review', category: 'inProgress' };

export const DEMO_TICKETS: readonly DemoTicketSeed[] = [
  {
    key: 'ACME-142',
    title: 'Platby kartou padajú pri 3D Secure overení',
    priority: 'urgent',
    status: IN_PROGRESS,
    projectName: 'Acme Web',
    dueInDays: 0,
    updatedHoursAgo: 1,
  },
  {
    key: 'ACME-139',
    title: 'Export faktúr do CSV nezachová diakritiku',
    priority: 'high',
    status: TODO,
    projectName: 'Acme Web',
    dueInDays: 2,
    updatedHoursAgo: 5,
  },
  {
    key: 'MOB-58',
    title: 'Push notifikácie chodia dvakrát po aktualizácii aplikácie',
    priority: 'high',
    status: REVIEW,
    projectName: 'Acme Mobile',
    dueInDays: null,
    updatedHoursAgo: 8,
  },
  {
    key: 'ACME-131',
    title: 'Pridať filter podľa stavu objednávky do administrácie',
    priority: 'medium',
    status: TODO,
    projectName: 'Acme Web',
    dueInDays: 7,
    updatedHoursAgo: 26,
  },
  {
    key: 'OPS-17',
    title: 'Predĺžiť TLS certifikát pre staging prostredie',
    priority: 'medium',
    status: IN_PROGRESS,
    projectName: 'Acme Ops',
    dueInDays: 4,
    updatedHoursAgo: 30,
  },
  {
    key: 'MOB-44',
    title: 'Zjednotiť ikony v spodnej navigácii',
    priority: 'low',
    status: TODO,
    projectName: 'Acme Mobile',
    dueInDays: null,
    updatedHoursAgo: 72,
  },
  {
    key: 'ACME-120',
    title: 'Aktualizovať texty v pätičke webu',
    priority: 'low',
    status: TODO,
    projectName: 'Acme Web',
    dueInDays: 14,
    updatedHoursAgo: 96,
  },
  {
    key: 'ACME-97',
    title: 'Preskúmať možnosti tmavého režimu v e-mailových šablónach',
    priority: 'none',
    status: TODO,
    projectName: null,
    dueInDays: null,
    updatedHoursAgo: 240,
  },
];

export const DEMO_NEW_TICKETS: readonly DemoTicketSeed[] = [
  {
    key: 'NEW-1',
    title: 'Nastaviť prístupy pre nový tím',
    priority: 'medium',
    status: TODO,
    projectName: 'Onboarding',
    dueInDays: 3,
    updatedHoursAgo: 2,
  },
  {
    key: 'NEW-2',
    title: 'Prejsť dokumentáciu k API',
    priority: 'none',
    status: TODO,
    projectName: 'Onboarding',
    dueInDays: null,
    updatedHoursAgo: 6,
  },
];
