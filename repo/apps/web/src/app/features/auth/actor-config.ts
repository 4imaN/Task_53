export type ActorKey = 'administrator' | 'manager' | 'moderator' | 'catalog-editor' | 'warehouse-clerk';

export type ActorConfig = {
  key: ActorKey;
  title: string;
  subtitle: string;
  note: string;
};

export const actorConfigs: ActorConfig[] = [
  {
    key: 'administrator',
    title: 'Administrator Access',
    subtitle: 'Full control over access, audit visibility, integrations, and system configuration.',
    note: 'Use this account for RBAC, audit, user administration, and full-system verification.'
  },
  {
    key: 'manager',
    title: 'Manager Access',
    subtitle: 'Operational dashboard, warehouse oversight, document approval, and metrics review.',
    note: 'Use this account to review throughput, warehouse controls, search, documents, and bulk operations.'
  },
  {
    key: 'moderator',
    title: 'Moderator Access',
    subtitle: 'Abuse report triage, reporter-safe case updates, department queue handling, and scoped search.',
    note: 'Use this account to test department moderation workflows, scoped search visibility, and inbox case notifications.'
  },
  {
    key: 'catalog-editor',
    title: 'Catalog Editor Access',
    subtitle: 'Catalog detail maintenance, reviews, questions, favorites, content management, and department-scoped search.',
    note: 'Use this account to manage item content, answer questions, and work through department-scoped catalog quality tasks.'
  },
  {
    key: 'warehouse-clerk',
    title: 'Warehouse Clerk Access',
    subtitle: 'Barcode-driven inventory lookup, receiving, moving, picking, and warehouse-scoped task queues.',
    note: 'Use this account to validate scan-driven workflows and assigned-warehouse visibility rules.'
  }
];
