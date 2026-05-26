import { useState, useMemo } from 'react';
import { ChevronDown, ChevronUp, Shield } from 'lucide-react';

// ── Permission catalog ──────────────────────────────────────
const CATEGORIES = [
  {
    key: 'assets',
    label: 'Assets',
    permissions: ['assets:view', 'assets:create', 'assets:edit', 'assets:delete'],
  },
  {
    key: 'reports',
    label: 'Reports',
    permissions: ['reports:view'],
  },
  {
    key: 'suppliers',
    label: 'Suppliers & Procurement',
    permissions: ['suppliers:view', 'suppliers:create', 'suppliers:edit', 'suppliers:delete'],
  },
  {
    key: 'purchase-requests',
    label: 'Purchase Requests',
    permissions: ['purchase-requests:view', 'purchase-requests:create', 'purchase-requests:approve'],
  },
  {
    key: 'issuances',
    label: 'Issuances',
    permissions: ['issuances:view', 'issuances:create', 'issuances:edit', 'issuances:return'],
  },
  {
    key: 'audit',
    label: 'Audit',
    permissions: ['audit:view', 'audit:export'],
  },
  {
    key: 'users',
    label: 'Users',
    permissions: ['users:view', 'users:create', 'users:edit'],
  },
  {
    key: 'backups',
    label: 'Backups',
    permissions: ['backups:view', 'backups:create'],
  },
  {
    key: 'settings',
    label: 'Settings',
    permissions: ['settings:view'],
  },
  {
    key: 'notifications',
    label: 'Notifications',
    permissions: ['notifications:view'],
  },
] as const;

const ALL_PERMISSIONS = CATEGORIES.flatMap((c) => c.permissions);

// ── Role presets ────────────────────────────────────────────
const ROLE_PRESETS: Record<string, string[]> = {
  ADMIN: ALL_PERMISSIONS,
  STAFF_ADMIN: [
    'assets:view', 'assets:create', 'assets:edit', 'assets:delete',
    'reports:view',
    'suppliers:view', 'suppliers:create', 'suppliers:edit', 'suppliers:delete',
    'purchase-requests:view', 'purchase-requests:create', 'purchase-requests:approve',
    'issuances:view', 'issuances:create', 'issuances:edit', 'issuances:return',
    'audit:view', 'audit:export',
    'users:view',
    'notifications:view',
  ],
  STAFF: [
    'assets:view',
    'reports:view',
    'suppliers:view',
    'purchase-requests:view', 'purchase-requests:create',
    'issuances:view',
    'audit:view',
    'notifications:view',
  ],
  GUEST: [
    'assets:view',
    'reports:view',
  ],
};

export function getDefaultPermissions(role: string): string[] {
  return ROLE_PRESETS[role] || ALL_PERMISSIONS;
}

// ── Format helper ───────────────────────────────────────────
function formatPermLabel(perm: string): string {
  const [, action] = perm.split(':');
  if (!action) return perm;
  return action
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

// ── Props ───────────────────────────────────────────────────
interface Props {
  selected: string[];
  onChange: (permissions: string[]) => void;
}

export function PermissionChecklist({ selected, onChange }: Props) {
  const [openCategories, setOpenCategories] = useState<Record<string, boolean>>({});

  const toggleCategory = (key: string) =>
    setOpenCategories((prev) => ({ ...prev, [key]: !prev[key] }));

  const selectedSet = useMemo(() => new Set(selected), [selected]);

  const isCategoryFullySelected = (perms: readonly string[]) =>
    perms.every((p) => selectedSet.has(p));

  const isCategoryPartiallySelected = (perms: readonly string[]) =>
    perms.some((p) => selectedSet.has(p)) && !isCategoryFullySelected(perms);

  const countSelected = (perms: readonly string[]) =>
    perms.filter((p) => selectedSet.has(p)).length;

  // ── Toggle helpers ──────────────────────────────────────
  const togglePermission = (perm: string) => {
    const next = selectedSet.has(perm)
      ? selected.filter((p) => p !== perm)
      : [...selected, perm];
    onChange(next);
  };

  const toggleCategoryAll = (perms: readonly string[], enabled: boolean) => {
    if (enabled) {
      onChange(selected.filter((p) => !perms.includes(p)));
    } else {
      const next = new Set(selected);
      perms.forEach((p) => next.add(p));
      onChange([...next]);
    }
  };

  // ── Apply role preset ───────────────────────────────────
  const applyPreset = (role: string) => {
    onChange(ROLE_PRESETS[role] || []);
  };

  // ── Brand color style ───────────────────────────────────
  const brandOrange = '#f8931f';
  const brandNavy = '#012061';

  const presetBtnClass =
    'inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-[11px] font-medium transition-colors hover:opacity-90';

  const presetBtnStyle = (role: string) => {
    const active =
      ROLE_PRESETS[role] &&
      ROLE_PRESETS[role].length === selected.length &&
      ROLE_PRESETS[role].every((p) => selectedSet.has(p));
    return active
      ? {
          backgroundColor: brandOrange,
          borderColor: brandOrange,
          color: '#fff',
        }
      : {
          borderColor: '#d1d5db',
          color: brandNavy,
        };
  };

  return (
    <div className="space-y-3">
      {/* ── Label ── */}
      <div className="flex items-center gap-2">
        <Shield className="h-4 w-4 text-[#f8931f]" />
        <span className="text-xs font-medium text-slate-700 dark:text-slate-300">
          Permissions
        </span>
      </div>

      {/* ── Role presets ── */}
      {/* GUEST preset hidden — no permissions defined */}
      <div className="flex flex-wrap gap-1.5">
        {(['ADMIN', 'STAFF_ADMIN', 'STAFF'] as const).map((role) => (
          <button
            key={role}
            type="button"
            onClick={() => applyPreset(role)}
            className={presetBtnClass}
            style={presetBtnStyle(role)}
          >
            {role.replace('_', '-')}
          </button>
        ))}
      </div>

      {/* ── Category grid ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-y-1 gap-x-3">
        {CATEGORIES.map((cat) => {
          const isOpen = openCategories[cat.key] ?? true;
          const fullySel = isCategoryFullySelected(cat.permissions);
          const partial = isCategoryPartiallySelected(cat.permissions);
          const cnt = countSelected(cat.permissions);

          return (
            <div
              key={cat.key}
              className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 overflow-hidden"
            >
              {/* Category header */}
              <button
                type="button"
                onClick={() => toggleCategory(cat.key)}
                className="w-full flex items-center justify-between px-3 py-2 hover:bg-slate-50 dark:hover:bg-slate-750 transition-colors"
              >
                <div className="flex items-center gap-2 min-w-0">
                  {/* Check/uncheck all checkbox */}
                  <span
                    className={`relative flex h-4 w-4 shrink-0 items-center justify-center rounded border-2 transition-colors ${
                      fullySel
                        ? 'border-[#f8931f] bg-[#f8931f]'
                        : partial
                        ? 'border-[#f8931f] bg-white dark:bg-slate-800'
                        : 'border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800'
                    }`}
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleCategoryAll(cat.permissions, fullySel);
                    }}
                  >
                    {fullySel && (
                      <svg
                        className="h-3 w-3 text-white"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={3}
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                    {partial && (
                      <span
                        className="h-1.5 w-1.5 rounded-full"
                        style={{ backgroundColor: brandOrange }}
                      />
                    )}
                  </span>

                  <span className="text-xs font-medium text-[#012061] dark:text-slate-200 truncate">
                    {cat.label}
                  </span>

                  {/* Selected count */}
                  <span className="text-[10px] text-slate-400 dark:text-slate-500">
                    {cnt}/{cat.permissions.length}
                  </span>
                </div>

                {isOpen ? (
                  <ChevronUp className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                ) : (
                  <ChevronDown className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                )}
              </button>

              {/* Permission checkboxes */}
              {isOpen && (
                <div className="px-3 pb-2 space-y-0.5 border-t border-slate-100 dark:border-slate-700">
                  {cat.permissions.map((perm) => (
                    <label
                      key={perm}
                      className="flex items-center gap-2 py-1 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-750 rounded px-1 -mx-1 transition-colors"
                    >
                      <span
                        className={`relative flex h-4 w-4 shrink-0 items-center justify-center rounded border-2 transition-colors ${
                          selectedSet.has(perm)
                            ? 'border-[#f8931f] bg-[#f8931f]'
                            : 'border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800'
                        }`}
                      >
                        {selectedSet.has(perm) && (
                          <svg
                            className="h-3 w-3 text-white"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                            strokeWidth={3}
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              d="M5 13l4 4L19 7"
                            />
                          </svg>
                        )}
                      </span>
                      <input
                        type="checkbox"
                        className="sr-only"
                        checked={selectedSet.has(perm)}
                        onChange={() => togglePermission(perm)}
                      />
                      <span className="text-xs text-slate-600 dark:text-slate-400">
                        {formatPermLabel(perm)}
                      </span>
                    </label>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
