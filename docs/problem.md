# Problem: User Permissions Not Persisting After Save

## Environment

- **Project location:** `/home/reggie/.hermes/workspace/aio-system`
- **Dev server:** Vite (port 3000) + Express/ts-node-dev (port 3001)
- **Production VM:** `10.170.59.190:3000` (PM2-managed)
- **DB:** PostgreSQL (local: `aio_system`, prod: `aio_system_db`)
- **Frontend:** React + TypeScript + Vite (served at `/aio-system/`)
- **Backend:** Express + Prisma + TypeScript

## The Symptom

When editing a user's permissions via the **Edit User** modal:

1. Open a user (e.g., `uppi@gie.com` with role STAFF)
2. The PermissionChecklist shows the default STAFF permissions (`assets:view` only)
3. User checks additional boxes (e.g., `assets:create`, `assets:edit`)
4. Clicks **Update User** — toast says "User updated successfully"
5. Closes modal, re-opens it → permissions are **back to default STAFF presets**
6. Refresh page, re-open → **same thing**, defaults every time

## Verified Facts

- The **backend PUT endpoint saves correctly** — tested via curl:
  ```
  PUT /api/users/:id → permissions: ['assets:view','assets:create','assets:edit',...]
  GET /api/users → returns same permissions ✅
  ```
- The **database stores the correct values** (checked via psql)
- The **Vite dev server proxy works** (tested PUT through port 3000)
- The issue happens in **incognito/private mode** too (no PWA cache)
- It happens with **existing users** AND **newly created users**

## Root Cause Analysis

The issue is on the **frontend** side, specifically in how the modal state resets between opens.

### Flow:
1. User clicks "Update User" → `handleEditUser()` sends PUT request
2. On success: `setEditingUser(null)` → React **unmounts** EditUserModal
3. `await fetchUsers()` re-fetches the user list
4. User clicks "Edit" again → `setEditingUser(u)` → React **mounts** EditUserModal fresh
5. Because the component unmounts and remounts, all `useRef` values reset to initial values

### The Bug in the `isInitialMount` Approach

The original fix used:

```typescript
const isInitialMount = useRef(true);

useEffect(() => {
    if (isInitialMount.current) {
        isInitialMount.current = false;
        return;  // ← Skip first render
    }
    setPermissions(getDefaultPermissions(form.role));
}, [form.role, isSelf]);
```

**Problem:** `useRef(true)` gets reset to `true` **every time** the component unmounts and remounts. Since `handleEditUser` calls `setEditingUser(null)` before `await fetchUsers()`, the modal unmounts. When the user clicks Edit again, the component mounts fresh → `isInitialMount.current` is `true` again → the effect fires and skips... but the `useState(user.permissions || getDefaultPermissions(user.role))` already had the right value for the first render.

Actually, the real problem is subtler. Since `useRef(true)` initializes to `true` on every mount, and the modal is being **unmounted then remounted** each time you edit, `isInitialMount.current` is always `true` — causing the effect to skip every time. That means the role-change guard **never fires even when it should**.

### The Fix

Replace the `isInitialMount` ref with a `prevRoleRef` that compares against the previous role value:

```typescript
const prevRoleRef = useRef(form.role);

useEffect(() => {
    if (form.role !== prevRoleRef.current) {
        prevRoleRef.current = form.role;
        if (!isSelf) {
            setPermissions(getDefaultPermissions(form.role));
        }
    }
}, [form.role, isSelf]);
```

This way:
- On **initial mount**, `form.role === prevRoleRef.current` → **skips** the overwrite (preserves `user.permissions`)
- If admin **changes the role dropdown** from "Staff" to "Admin" → `form.role !== prevRoleRef.current` → applies the new role defaults
- Works correctly across **mount/unmount cycles** since the comparison is value-based, not mount-count-based

### Key Files:

#### `client/src/pages/UserManagementPage.tsx` (lines 103-137)
```typescript
const handleEditUser = async (data: {...}) => {
    // ...PUT request...
    const result = await res.json();
    // On success:
    setEditingUser(null);
    await fetchUsers();  // ← re-fetches user list from API
};
```

#### `client/src/pages/UserManagementPage.tsx` (lines 47-62)
```typescript
const fetchUsers = useCallback(async () => {
    const res = await fetch('/api/users', {
        headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    if (!data.success) throw new Error(...);
    setUsers(data.data);  // ← sets users state from API response
}, [accessToken]);
```

**When user clicks "Edit":**
```typescript
setEditingUser(u);  // ← u comes from the users[] state
```

#### `client/src/components/users/EditUserModal.tsx` (lines 46-47)
```typescript
const [permissions, setPermissions] = useState<string[]>(
    user.permissions || getDefaultPermissions(user.role)
);
```

#### `client/src/components/users/EditUserModal.tsx` (lines 60-68)
```typescript
const isInitialMount = useRef(true);

useEffect(() => {
    if (isInitialMount.current) {
        isInitialMount.current = false;
        return;
    }
    if (!isSelf) {
        setPermissions(getDefaultPermissions(form.role));
    }
}, [form.role, isSelf]);
```

### BACKEND files:

#### `server/src/routes/user.routes.ts` (lines 17-27 - SAFE_SELECT)
```typescript
const SAFE_SELECT = {
  id: true,
  username: true,
  fullName: true,
  email: true,
  role: true,
  status: true,
  permissions: true,  // ← MUST be true
  lastLogin: true,
  createdAt: true,
};
```

#### `server/src/routes/user.routes.ts` (lines 35-42 - serializeUser)
```typescript
function serializeUser(user: any) {
  if (!user) return user;
  try {
    return { ...user, permissions: JSON.parse(user.permissions) };
  } catch {
    return { ...user, permissions: [] };
  }
}
```

#### `server/src/routes/user.routes.ts` (lines 113-168 - PUT handler)
```typescript
router.put('/:id', validate(updateUserSchema), async (req: Request, res: Response) => {
    const { fullName, username, email, role, password, permissions } = req.body;
    // ...
    if (permissions !== undefined) {
        if (!isValidPermissions(permissions)) {
            return error(res, 'Invalid permission keys provided', 400);
        }
        data.permissions = JSON.stringify(permissions);
    } else if (role !== undefined && role !== existing.role) {
        data.permissions = JSON.stringify(DEFAULT_PERMISSIONS[role] ?? []);
    }
    // ...
    return success(res, serializeUser(user), 200);
});
```

#### `server/src/routes/user.routes.ts` (lines 44-66 - GET handler)
```typescript
router.get('/', async (req: Request, res: Response) => {
    const [users, total] = await Promise.all([
        prisma.user.findMany({
            select: SAFE_SELECT,
            // ...
        }),
        prisma.user.count(),
    ]);
    return success(res, users.map(serializeUser), 200, {...});
});
```

#### `server/src/routes/user.schema.ts` (lines 13-22)
```typescript
export const updateUserSchema = z.object({
  fullName: z.string().min(1).max(200).optional(),
  username: z.string().min(3).max(50).optional(),
  email: z.string().email().optional(),
  role: z.enum(['ADMIN', 'STAFF_ADMIN', 'STAFF', 'GUEST']).optional(),
  password: z.string().min(6).max(100).optional(),
  permissions: z.array(z.string()).optional(),
}).refine(d => d.fullName || d.username || d.email || d.role || d.password || d.permissions, {
  message: 'Provide at least one field to update',
});
```

#### `client/src/components/users/PermissionChecklist.tsx` (lines 61-86 - ROLE_PRESETS)
```typescript
const ROLE_PRESETS: Record<string, string[]> = {
  ADMIN: ALL_PERMISSIONS,
  STAFF_ADMIN: [/* full access minus settings/backups/users:create/edit */],
  STAFF: [
    'assets:view',                    // ← default: only view
    'reports:view',
    'suppliers:view',
    'purchase-requests:view', 'purchase-requests:create',
    'issuances:view',
    'audit:view',
    'notifications:view',
  ],
  GUEST: ['assets:view', 'reports:view'],
};
```

### The `useRef isInitialMount` fix in EditUserModal:
This fix prevents the `useEffect` from running on initial mount (which would overwrite the user's actual saved permissions with role defaults). It **skips the first render** so the initial `useState(user.permissions)` value is preserved. The effect only runs when the admin **changes the role dropdown** after the modal is already open.

## What Works vs What Doesn't

| Action | Result |
|--------|--------|
| PUT via curl to save custom permissions | ✅ Saves to DB correctly |
| GET via curl after PUT | ✅ Returns correct permissions array |
| Save via browser UI → toast "successful" | ✅ Server returns 200 |
| DB query after save | ✅ Column has correct JSON array |
| Re-open Edit modal | ❌ Shows defaults again |

## Key Clue

The API returns the correct permissions after save. But the **browser re-fetch** after save (in `handleEditUser`'s `await fetchUsers()`) might be hitting a cached response, or the `EditUserModal` component is re-initializing with stale state.

Try debugging by:
1. Adding a `console.log` in `fetchUsers()` to see what the API actually returns
2. Adding a `console.log` in `EditUserModal` to see what `user.permissions` is on initial render
3. Checking if the `serializeUser` function is being called in both GET and PUT

## Additional Context

- PWA service worker is active (vite-plugin-pwa with `registerType: 'autoUpdate'`)
- Workbox runtime caching caches `/api/(auth/me|dashboard|assets?)` with NetworkFirst strategy
- The `users` endpoint is NOT in the runtime caching patterns
- But the service worker might still interfere — unregister it for testing
