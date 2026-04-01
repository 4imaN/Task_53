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
    subtitle: 'Abuse report triage, reporter-safe case updates, and moderation queue handling.',
    note: 'Use this account to test moderation workflows and inbox case notifications.'
  },
  {
    key: 'catalog-editor',
    title: 'Catalog Editor Access',
    subtitle: 'Catalog detail maintenance, reviews, questions, favorites, and content management.',
    note: 'Use this account to manage item content, answer questions, and work through catalog quality tasks.'
  },
  {
    key: 'warehouse-clerk',
    title: 'Warehouse Clerk Access',
    subtitle: 'Barcode-driven inventory lookup, receiving, moving, picking, and assigned warehouse tasks.',
    note: 'Use this account to validate scan-driven workflows and assigned warehouse visibility rules.'
  }
];
