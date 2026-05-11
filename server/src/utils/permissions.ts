export const ALL_PERMISSIONS = {
  'assets:view': 'View Assets',
  'assets:create': 'Create Assets',
  'assets:edit': 'Edit Assets',
  'assets:delete': 'Delete Assets',
  'reports:view': 'View Reports',
  'suppliers:view': 'View Suppliers',
  'suppliers:create': 'Create Suppliers',
  'suppliers:edit': 'Edit Suppliers',
  'suppliers:delete': 'Delete Suppliers',
  'purchase-requests:view': 'View Purchase Requests',
  'purchase-requests:create': 'Create Purchase Requests',
  'purchase-requests:approve': 'Approve Purchase Requests',
  'issuances:view': 'View Issuances',
  'issuances:create': 'Create Issuances',
  'issuances:edit': 'Edit Issuances',
  'audit:view': 'View Audit Trail',
  'audit:export': 'Export Audit Data',
  'users:view': 'View Users',
  'users:create': 'Create Users',
  'users:edit': 'Edit Users',
  'backups:view': 'View Backups',
  'backups:create': 'Create Backups',
  'settings:view': 'View Settings',
  'notifications:view': 'View Notifications',
} as const;

export type PermissionKey = keyof typeof ALL_PERMISSIONS;

export const DEFAULT_PERMISSIONS: Record<string, PermissionKey[]> = {
  ADMIN: Object.keys(ALL_PERMISSIONS) as PermissionKey[],
  STAFF_ADMIN: [
    'assets:view', 'assets:create', 'assets:edit',
    'reports:view',
    'suppliers:view', 'suppliers:create', 'suppliers:edit',
    'purchase-requests:view', 'purchase-requests:create', 'purchase-requests:approve',
    'issuances:view', 'issuances:create', 'issuances:edit',
    'audit:view', 'audit:export',
    'notifications:view',
  ],
  STAFF: [
    'assets:view',
    'reports:view',
    'issuances:view',
    'audit:view',
    'notifications:view',
  ],
  GUEST: [],
};

export function parsePermissions(raw: string | null | undefined): PermissionKey[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((k): k is PermissionKey => k in ALL_PERMISSIONS) : [];
  } catch {
    return [];
  }
}

export function getDefaultPermissions(role: string): PermissionKey[] {
  return DEFAULT_PERMISSIONS[role] ?? DEFAULT_PERMISSIONS.STAFF;
}
