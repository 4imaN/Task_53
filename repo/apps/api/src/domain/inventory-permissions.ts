export const INVENTORY_SCAN_PERMISSION = 'inventory.scan' as const;
export const INVENTORY_COUNT_PERMISSION = 'inventory.count' as const;
export const INVENTORY_ADJUST_PERMISSION = 'inventory.adjust' as const;

export const documentCreatePermissionByType = {
  receiving: 'inventory.receive',
  shipping: 'inventory.pick',
  transfer: 'inventory.move',
  cycle_count: INVENTORY_COUNT_PERMISSION,
  adjustment: INVENTORY_ADJUST_PERMISSION
} as const;

export type DocumentCreationType = keyof typeof documentCreatePermissionByType;

export const getDocumentCreatePermission = (documentType: DocumentCreationType) =>
  documentCreatePermissionByType[documentType];

export const inventoryDocumentCreatePermissions = [
  ...new Set(Object.values(documentCreatePermissionByType))
] as readonly string[];
