# AIO-System — Users Module Improvement Prompts
> Generated: 2026-05-22
> Module: User Management (`/aio-system/users`)
> Format: OpenClaw two-block prompt structure (Global Context + Phase block)

---

## Improvement 1 (CRITICAL): Server-Side Self-Role-Change Block

### Phase 1 — Backend enforcement

```
=== GLOBAL CONTEXT ===
Project: AIO-System (All-In-One Office Asset Inventory System)
Repo: /home/reggie/.hermes/workspace/aio-system
Stack: Node.js / TypeScript / Express / Prisma ORM / PostgreSQL
Frontend: React 18 + TypeScript + Vite + TailwindCSS + shadcn/ui
Monorepo workspaces: server, client, shared
Full-file output is required. No partial snippets.

=== PHASE 1: Enforce server-side block on self-role and self-permission escalation ===

PROBLEM STATEMENT:
The frontend blocks an admin from changing their own role via a disabled
dropdown in EditUserModal. However, the server does NOT enforce this.
Any authenticated ADMIN can send:
  PUT /api/users/<own-id> { role: "ADMIN", permissions: [...all] }
via Postman, curl, or the browser console and the server will accept it.
A STAFF user with users:edit permission can also escalate their own
permissions upward without restriction.
This is a critical security gap — frontend-only protection is not protection.

ROOT CAUSE:
server/src/routes/user.routes.ts PUT /api/users/:id handler has no
check comparing req.user.id against the target :id for role/permission
field changes.

SOLUTION REQUIREMENTS:
1. In server/src/routes/user.routes.ts, in the PUT /:id handler,
   add the following guards BEFORE the Prisma update call:

   a. Self-role-change block:
      if (req.user!.id === id && body.role && body.role !== req.user!.role) {
        return res.status(403).json({
          success: false,
          error: 'You cannot change your own role.'
        })
      }

   b. Self-permission-escalation block:
      If req.user!.id === id and body.permissions is provided,
      check that the new permissions array does not contain any key
      that is NOT already in req.user!.permissions.
      If it does → return 403:
        { success: false,
          error: 'You cannot grant yourself permissions you do not already have.' }

   c. Role-based permission ceiling:
      If req.user!.role !== 'ADMIN' and body.permissions is provided,
      ensure none of the requested permissions exceed what
      DEFAULT_PERMISSIONS[req.user!.role] allows.
      If any exceed → return 403:
        { success: false,
          error: 'You cannot assign permissions beyond your role level.' }

2. These guards apply to ALL authenticated users calling PUT /api/users/:id,
   not just ADMIN. A STAFF user with users:edit should not be able to
   escalate themselves.

3. Do not change the existing self-deactivation block in
   PATCH /api/users/:id/status — it is already correctly implemented.

4. Full file output required for server/src/routes/user.routes.ts.

VERIFICATION AFTER THIS PHASE:
Log in as ADMIN. Via Postman, PUT /api/users/<own-id> with { role: "STAFF" }.
Confirm 403: "You cannot change your own role."
Log in as STAFF_ADMIN with users:edit. PUT /api/users/<own-id> with
{ permissions: [...all permissions] }.
Confirm 403: "You cannot grant yourself permissions you do not already have."
Log in as ADMIN. PUT /api/users/<other-id> with a new role.
Confirm update succeeds normally (guard only applies to self).
```

---

## Improvement 2: Audit Log for User Management Actions

### Phase 2 — Wire logAudit() into user routes

```
=== GLOBAL CONTEXT ===
Project: AIO-System (All-In-One Office Asset Inventory System)
Repo: /home/reggie/.hermes/workspace/aio-system
Stack: Node.js / TypeScript / Express / Prisma ORM / PostgreSQL
Frontend: React 18 + TypeScript + Vite + TailwindCSS + shadcn/ui
Monorepo workspaces: server, client, shared
Full-file output is required. No partial snippets.

=== PHASE 2: Add audit log entries for all user management actions ===

PROBLEM STATEMENT:
The audit system (logAudit() from auditLog.service.ts) logs issuances,
returns, agreements, and lookups — but NOT user management actions.
User creation, role changes, permission changes, and deactivation are
the most sensitive actions in the system. If a rogue ADMIN creates an
account or escalates permissions, there is currently no audit record.

SOLUTION REQUIREMENTS:
1. In server/src/routes/user.routes.ts, add logAudit() calls
   (fire-and-forget: logAudit(...).catch(() => {})) after each
   successful operation:

   a. POST /api/users — after user is created:
      logAudit({
        userId: req.user!.id,
        action: 'user.created',
        entityType: 'User',
        entityId: newUser.id,
        metadata: { username: newUser.username, role: newUser.role },
        ipAddress: req.ip
      })

   b. PUT /api/users/:id — after user is updated:
      Build a changeSummary object showing only what changed:
        { field: 'role', from: oldRole, to: newRole }
        { field: 'status', from: oldStatus, to: newStatus }
        { field: 'permissions', from: oldPerms, to: newPerms }
        { field: 'password', changed: true }  // never log actual password
      logAudit({
        userId: req.user!.id,
        action: 'user.updated',
        entityType: 'User',
        entityId: id,
        metadata: { changes: changeSummary, targetUsername: existingUser.username },
        ipAddress: req.ip
      })

   c. PATCH /api/users/:id/status — after status is changed:
      logAudit({
        userId: req.user!.id,
        action: 'user.status_changed',
        entityType: 'User',
        entityId: id,
        metadata: {
          targetUsername: existingUser.username,
          newStatus: body.status
        },
        ipAddress: req.ip
      })

   d. If password is reset inside PUT (password field is present in body):
      Add to the changeSummary: { field: 'password', changed: true }
      This is already covered by (b) above — ensure it is included
      in the changes metadata even if no other field changed.

2. To build changeSummary in (b), fetch the existing user BEFORE the
   update (a findUnique call), compare old vs new values, and only
   include fields that actually changed. Never include passwordHash
   in the metadata.

3. Import logAudit from server/src/services/auditLog.service.ts.
   All logAudit calls must be fire-and-forget and must never block
   the response or throw to the caller.

4. Full file output required for server/src/routes/user.routes.ts.

VERIFICATION AFTER THIS PHASE:
Create a new user via POST /api/users.
Query: SELECT action, metadata FROM "AuditLog" WHERE action = 'user.created'
  ORDER BY "createdAt" DESC LIMIT 1;
Confirm row exists with correct username and role in metadata.

Update a user's role via PUT /api/users/:id.
Query AuditLog for action = 'user.updated'.
Confirm metadata.changes includes { field: 'role', from: '...', to: '...' }.

Deactivate a user via PATCH /api/users/:id/status.
Query AuditLog for action = 'user.status_changed'.
Confirm metadata.newStatus = 'inactive' and targetUsername is correct.
```

---

## Improvement 3: Replace window.confirm() with shadcn/ui Dialog

### Phase 3 — Frontend deactivation confirmation dialog

```
=== GLOBAL CONTEXT ===
Project: AIO-System (All-In-One Office Asset Inventory System)
Repo: /home/reggie/.hermes/workspace/aio-system
Stack: Node.js / TypeScript / Express / Prisma ORM / PostgreSQL
Frontend: React 18 + TypeScript + Vite + TailwindCSS + shadcn/ui
Monorepo workspaces: server, client, shared
Full-file output is required. No partial snippets.

=== PHASE 3: Replace window.confirm() with shadcn/ui Dialog for user deactivation ===

PROBLEM STATEMENT:
The deactivate action in UserManagementPage.tsx uses window.confirm()
for the confirmation step. window.confirm() is a native browser dialog
that cannot be styled, looks inconsistent across operating systems,
can be suppressed by some browsers, and breaks the visual consistency
of the rest of the app which uses shadcn/ui Dialog for all confirmations.

SOLUTION REQUIREMENTS:
1. In client/src/pages/UserManagementPage.tsx:
   - Remove the window.confirm() call from the deactivate action handler.
   - Add a confirmation Dialog state:
       const [deactivateTarget, setDeactivateTarget] = useState<User | null>(null)
   - When the Deactivate button is clicked, set deactivateTarget to
     the target user and open the dialog instead of calling confirm().
   - The Dialog content:
       Title: "Deactivate User"
       Body: "Are you sure you want to deactivate <fullName> (@<username>)?
              They will immediately lose access to the system."
       Buttons:
         - "Cancel" → closes dialog, clears deactivateTarget
         - "Deactivate" (danger style, bg-[#7B1113] text-white) →
           calls PATCH /api/users/:id/status { status: 'inactive' },
           closes dialog on success, refreshes user list, shows toast.
   - Activate action (no confirmation needed) remains as-is — direct
     API call without a dialog.
   Full file output required.

2. Brand/style rules:
   - Navy: #012061, Orange: #f8931f, Danger/red: #7B1113.
   - Use shadcn/ui Dialog, DialogContent, DialogHeader,
     DialogTitle, DialogDescription, Button.
   - Match existing modal patterns in the page.
   - Deactivate button: bg-[#7B1113] hover:bg-[#9B1115] text-white.
   - Cancel button: outline variant.

3. Confirm the Dialog import is present in the file header.
   Missing shadcn/ui import = blank white page.

VERIFICATION AFTER THIS PHASE:
Open /aio-system/users.
Click Deactivate on a non-self user.
Confirm styled Dialog opens (not browser native confirm).
Confirm Dialog shows the correct user's name and username.
Click Cancel → confirm nothing changes.
Click Deactivate → confirm user status changes to Inactive.
Confirm your own Deactivate button is still disabled (isSelf guard intact).
```

---

## Improvement 4: 2FA Status Column and Admin Reset

### Phase 4-A — Backend 2FA reset endpoint

```
=== GLOBAL CONTEXT ===
Project: AIO-System (All-In-One Office Asset Inventory System)
Repo: /home/reggie/.hermes/workspace/aio-system
Stack: Node.js / TypeScript / Express / Prisma ORM / PostgreSQL
Frontend: React 18 + TypeScript + Vite + TailwindCSS + shadcn/ui
Monorepo workspaces: server, client, shared
Full-file output is required. No partial snippets.

=== PHASE 4-A: Add admin 2FA reset endpoint ===

PROBLEM STATEMENT:
The User model has twoFactorSecret, twoFactorEnabled, and backupCodes
fields, meaning 2FA is implemented. However, if a user loses their 2FA
device and all backup codes, an admin has no way to reset their 2FA
from the UI or the API. The user is permanently locked out.

SOLUTION REQUIREMENTS:
1. In server/src/routes/user.routes.ts, add:
   DELETE /api/users/:id/2fa
   - requireRole(['ADMIN'])
   - Blocks resetting your own 2FA via this admin endpoint:
     if (req.user!.id === id) → 403:
       { success: false,
         error: 'Use your account settings to manage your own 2FA.' }
   - Updates the target user:
     twoFactorSecret: null,
     twoFactorEnabled: false,
     backupCodes: '[]'
   - Calls logAudit({
       userId: req.user!.id,
       action: 'user.2fa_reset',
       entityType: 'User',
       entityId: id,
       metadata: { targetUsername: user.username },
       ipAddress: req.ip
     })
   - Returns: { success: true, message: '2FA has been reset for <username>.' }
   Full file output required for server/src/routes/user.routes.ts.

2. Confirm GET /api/users response includes twoFactorEnabled boolean
   in each user row (check SAFE_SELECT — add it if not already present).
   passwordHash and twoFactorSecret must never be returned.
   Full file output required only if SAFE_SELECT is changed.

VERIFICATION AFTER THIS PHASE:
Enable 2FA on a test account.
DELETE /api/users/<test-id>/2fa as ADMIN.
Confirm response: { success: true, message: '2FA has been reset...' }
Query DB: confirm twoFactorEnabled = false, twoFactorSecret = null.
Confirm AuditLog row with action: user.2fa_reset.
Attempt DELETE /api/users/<own-id>/2fa → confirm 403.
GET /api/users → confirm twoFactorEnabled field is present in each row.
```

### Phase 4-B — 2FA status badge and reset button in UI

```
=== GLOBAL CONTEXT ===
(same as Phase 4-A global context block)

=== PHASE 4-B: Show 2FA status in user table and add admin reset button ===

PROBLEM STATEMENT:
After Phase 4-A added the backend 2FA reset endpoint, the Users page must
surface 2FA status per user and give admins a one-click reset for locked-out
users.

SOLUTION REQUIREMENTS:
1. In client/src/pages/UserManagementPage.tsx:
   - Add a "2FA" column to the user table between Status and Last Login:
     - twoFactorEnabled: true  → green badge "Enabled"
     - twoFactorEnabled: false → gray badge "Off"
   - In the Actions column, add a reset 2FA icon button (ShieldOff from
     lucide-react) that appears only when twoFactorEnabled is true.
   - Clicking it opens a confirmation Dialog:
       Title: "Reset 2FA"
       Body: "<fullName>'s two-factor authentication will be disabled.
              They will need to set it up again on next login."
       Buttons:
         - "Cancel"
         - "Reset 2FA" (danger style, #7B1113)
   - On confirm, DELETE /api/users/:id/2fa.
   - On success, refresh user list and show toast:
     "2FA has been reset for <fullName>."
   - Reset button is hidden for your own account (isSelf check).
   Full file output required.

2. Confirm ShieldOff is imported from lucide-react in the file header.
   Missing icon import = blank white page.

3. Brand/style rules:
   - Navy: #012061, Orange: #f8931f, Danger: #7B1113.
   - 2FA Enabled badge: green (bg-green-100 text-green-800).
   - 2FA Off badge: gray (bg-gray-100 text-gray-600).
   - ShieldOff button: small icon button, red tint on hover.

VERIFICATION AFTER THIS PHASE:
Open /aio-system/users.
Confirm 2FA column appears with correct badge per user.
For a user with 2FA enabled, confirm ShieldOff button appears in Actions.
Click ShieldOff → confirm confirmation Dialog opens.
Click Reset 2FA → confirm badge changes to "Off" and toast appears.
Confirm ShieldOff button is hidden for your own account row.
```

---

## Improvement 5: Password Policy Enforcement

### Phase 5-A — Backend password strength and forced change

```
=== GLOBAL CONTEXT ===
Project: AIO-System (All-In-One Office Asset Inventory System)
Repo: /home/reggie/.hermes/workspace/aio-system
Stack: Node.js / TypeScript / Express / Prisma ORM / PostgreSQL
Frontend: React 18 + TypeScript + Vite + TailwindCSS + shadcn/ui
Monorepo workspaces: server, client, shared
Full-file output is required. No partial snippets.

=== PHASE 5-A: Add password strength enforcement and mustChangePassword flag ===

PROBLEM STATEMENT:
Password validation is currently only min 8 characters. Newly created users
get an admin-set password and are never required to change it. There is no
strength requirement (uppercase, number, special char). For a system
handling asset accountability documents and signed agreements, these are
real security gaps.

SOLUTION REQUIREMENTS:
1. In server/prisma/schema.prisma, add to User model:
   - mustChangePassword  Boolean  @default(false)

   Generate migration:
   cd server && npx prisma migrate dev --name add_must_change_password_to_user
   Full file output required for schema.

2. In server/src/routes/user.schema.ts, update the password validation
   in createUserSchema and the password field in updateUserSchema:
   password: z.string()
     .min(8, 'Password must be at least 8 characters')
     .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
     .regex(/[0-9]/, 'Password must contain at least one number')
     .regex(/[^A-Za-z0-9]/, 'Password must contain at least one special character')
   Full file output required.

3. In server/src/routes/user.routes.ts:
   - POST /api/users (create): set mustChangePassword: true on the
     new user record. Admin-set passwords should always require a change.
   - PUT /api/users/:id (update, password reset by admin):
     If password field is present in body and req.user!.id !== id
     (admin resetting someone else's password), set mustChangePassword: true.
     If the user is resetting their own password, set mustChangePassword: false.
   Full file output required.

4. In the auth login route (server/src/routes/auth.routes.ts or similar):
   After successful login, if user.mustChangePassword is true:
   - Return the normal JWT tokens BUT include in the response body:
     { ..., mustChangePassword: true }
   - Do not block the login — let the frontend handle the redirect.
   Full file output required only if auth routes are changed.

VERIFICATION AFTER THIS PHASE:
POST /api/users with password: "weakpass" → confirm 400 with strength error.
POST /api/users with password: "Str0ng!Pass" → confirm user created.
Query DB: confirm mustChangePassword = true on new user.
Admin resets another user's password via PUT → confirm mustChangePassword = true.
User resets own password via PUT → confirm mustChangePassword = false.
Login as new user → confirm response includes mustChangePassword: true.
```

### Phase 5-B — Frontend forced password change flow

```
=== GLOBAL CONTEXT ===
(same as Phase 5-A global context block)

=== PHASE 5-B: Add forced password change screen on first login ===

PROBLEM STATEMENT:
After Phase 5-A added the mustChangePassword flag and the login response
now returns it, the frontend must intercept this flag after login and
redirect the user to a password change screen before they can access
any other part of the system.

SOLUTION REQUIREMENTS:
1. In client/src/context/AuthContext.tsx:
   - After a successful login response, check if mustChangePassword is true.
   - If true, store a flag in AuthContext state: mustChangePassword: boolean.
   - Do not store it in localStorage — keep it in memory only for the session.
   Full file output required.

2. Create client/src/pages/ChangePasswordPage.tsx:
   - Simple centered card page (not inside AppLayout — no sidebar).
   - Title: "Change Your Password"
   - Subtitle: "Your password was set by an administrator.
                Please set a new password to continue."
   - Fields:
     - New Password (required, show/hide toggle)
     - Confirm New Password (required, must match)
   - Client-side strength indicator (simple: weak/medium/strong label
     based on length + character variety).
   - On submit: PUT /api/users/<currentUser.id> { password: newPassword }
   - On success: clear mustChangePassword flag in AuthContext,
     redirect to / (Dashboard).
   - User cannot navigate away — if mustChangePassword is true and they
     try to access any route, redirect to /change-password.
   Full file output required.

3. In client/src/App.tsx:
   - Add route: /change-password → ChangePasswordPage (no ProtectedRoute
     role requirement, just must be authenticated).
   - In ProtectedRoute or App-level logic: if mustChangePassword is true
     and current path is not /change-password, redirect to /change-password.
   Full file output required.

4. Brand/style rules:
   - Navy: #012061, Orange: #f8931f.
   - Card centered on page, white background, navy header bar.
   - Strength indicator: red (weak) → orange (medium) → green (strong).
   - Submit button: navy bg-[#012061] text-white.

VERIFICATION AFTER THIS PHASE:
Create a new user via the admin Users page.
Log in as the new user.
Confirm redirect to /change-password immediately after login.
Confirm attempting to navigate to /assets redirects back to /change-password.
Submit a weak password → confirm client-side validation error.
Submit a valid strong password → confirm redirect to Dashboard.
Confirm mustChangePassword = false in DB after successful change.
Log in again → confirm no redirect to /change-password (normal login flow).
```

---

## Improvement 6: GUEST Role — Hide or Implement

### Phase 6 — Hide GUEST from user creation form

```
=== GLOBAL CONTEXT ===
Project: AIO-System (All-In-One Office Asset Inventory System)
Repo: /home/reggie/.hermes/workspace/aio-system
Stack: Node.js / TypeScript / Express / Prisma ORM / PostgreSQL
Frontend: React 18 + TypeScript + Vite + TailwindCSS + shadcn/ui
Monorepo workspaces: server, client, shared
Full-file output is required. No partial snippets.

=== PHASE 6: Hide GUEST role from user creation until it is fully implemented ===

PROBLEM STATEMENT:
The GUEST role exists in the Role enum and appears in the role dropdown
of AddUserModal and EditUserModal. However, GUEST has zero permissions,
dashboard-only nav, and no guest login/token generation flow documented
or implemented. An admin creating a GUEST account gets a user with no
access to anything — a confusing dead end. Until GUEST is fully
implemented (scoped read-only access, guest link generation, etc.),
it should be hidden from the user-facing role selectors.

SOLUTION REQUIREMENTS:
1. In client/src/components/users/AddUserModal.tsx:
   - Remove GUEST from the role <select> or Select dropdown options.
   - Add a comment above the role options:
     {/* GUEST role hidden until guest link flow is implemented */}
   Full file output required.

2. In client/src/components/users/EditUserModal.tsx:
   - Remove GUEST from the role dropdown options.
   - Exception: if the user being edited ALREADY has role = 'GUEST'
     (an existing guest account), keep GUEST visible in the dropdown
     for that edit session only, so the admin can reassign them to a
     real role without the dropdown being broken.
     Condition: show GUEST option only if editingUser.role === 'GUEST'.
   Full file output required.

3. In client/src/components/users/PermissionChecklist.tsx:
   - Remove the GUEST preset button from the role preset buttons row.
   - Add comment: {/* GUEST preset hidden — no permissions defined */}
   Full file output required.

4. DO NOT remove GUEST from:
   - server/prisma/schema.prisma Role enum (would break existing rows)
   - server/src/middleware/permissions.ts DEFAULT_PERMISSIONS (keep for
     reference when GUEST is eventually implemented)
   - Any backend role checks or guards

5. In server/src/routes/user.schema.ts, if createUserSchema has a
   role enum that includes GUEST, add a refinement:
   .refine(val => val !== 'GUEST', {
     message: 'GUEST role is not available for direct user creation.'
   })
   Full file output required only if schema is changed.

VERIFICATION AFTER THIS PHASE:
Open Add User modal → confirm GUEST is not in the role dropdown.
Open Edit User modal for a STAFF user → confirm GUEST is not visible.
Open Edit User modal for an existing GUEST user → confirm GUEST IS visible
  (so admin can reassign them).
PermissionChecklist → confirm GUEST preset button is gone.
POST /api/users with role: "GUEST" → confirm 400 validation error
  (if schema refinement is added).
All other roles (ADMIN, STAFF_ADMIN, STAFF) still work normally.
```

---

## Improvement 7: Server-Side Pagination and Filtering

### Phase 7 — Move filtering to backend query params

```
=== GLOBAL CONTEXT ===
Project: AIO-System (All-In-One Office Asset Inventory System)
Repo: /home/reggie/.hermes/workspace/aio-system
Stack: Node.js / TypeScript / Express / Prisma ORM / PostgreSQL
Frontend: React 18 + TypeScript + Vite + TailwindCSS + shadcn/ui
Monorepo workspaces: server, client, shared
Full-file output is required. No partial snippets.

=== PHASE 7: Move user list filtering to server-side query params ===

PROBLEM STATEMENT:
GET /api/users fetches ALL users and the frontend filters in memory.
Pagination params exist in the response (meta.page, meta.totalPages)
but are ignored client-side. With a small user count this works, but
it is architecturally wrong — the table shows everything regardless of
the page param, and as the org grows this becomes a performance problem.
This phase moves search, role, and status filtering to the server.

SOLUTION REQUIREMENTS:
1. In server/src/routes/user.routes.ts, update GET /api/users:
   Accept query params:
   - page: number (default: 1)
   - limit: number (default: 20)
   - search: string (partial match on username, fullName, email)
   - role: Role enum value (exact match)
   - status: 'active' | 'inactive' (exact match)

   Build Prisma where clause dynamically:
   const where: Prisma.UserWhereInput = {
     ...(search ? {
       OR: [
         { username: { contains: search, mode: 'insensitive' } },
         { fullName: { contains: search, mode: 'insensitive' } },
         { email: { contains: search, mode: 'insensitive' } },
       ]
     } : {}),
     ...(role ? { role: role as Role } : {}),
     ...(status ? { status } : {}),
   }

   Return paginated response with correct meta:
   {
     success: true,
     data: [...users],
     meta: { page, limit, total, totalPages }
   }
   Full file output required.

2. In client/src/pages/UserManagementPage.tsx:
   - Remove the client-side in-memory filtering logic.
   - Pass search, role, status as query params to GET /api/users.
   - Debounce the search input (300ms) before triggering a new fetch.
   - Honor the meta.totalPages response to show pagination controls
     at the bottom of the table:
       [← Prev]  Page 1 of N  [Next →]
   - On filter change, reset to page 1.
   - On mount, fetch page 1 with no filters.
   Full file output required.

3. The Export CSV button should export ONLY the currently filtered
   results (pass same search/role/status params to the export call),
   not all users.
   Update the CSV export logic accordingly.
   Full file output required only if export logic is in a separate function.

VERIFICATION AFTER THIS PHASE:
GET /api/users?search=john → confirm only users matching "john" returned.
GET /api/users?role=STAFF → confirm only STAFF users returned.
GET /api/users?status=inactive → confirm only inactive users returned.
GET /api/users?page=2&limit=5 → confirm second page returned with correct meta.
Open Users page → type in search box → confirm table updates after 300ms debounce.
Apply role filter → confirm only matching roles shown.
Confirm pagination controls appear when total > limit.
Export CSV with role filter active → confirm CSV contains only filtered users.
```

---

## Improvement 8: Inactive Account Flagging

### Phase 8 — Frontend inactive account warning badges

```
=== GLOBAL CONTEXT ===
Project: AIO-System (All-In-One Office Asset Inventory System)
Repo: /home/reggie/.hermes/workspace/aio-system
Stack: Node.js / TypeScript / Express / Prisma ORM / PostgreSQL
Frontend: React 18 + TypeScript + Vite + TailwindCSS + shadcn/ui
Monorepo workspaces: server, client, shared
Full-file output is required. No partial snippets.

=== PHASE 8: Flag stale active accounts by last login age in Users table ===

PROBLEM STATEMENT:
The Users page shows lastLogin per user but does not surface when an
active account has not been used in a long time. Ex-staff accounts that
were never deactivated are a security risk — they have valid credentials
and active sessions potentially still cached. A visual warning for
accounts inactive 60+ days prompts admins to review and deactivate them.

SOLUTION REQUIREMENTS:
1. In client/src/pages/UserManagementPage.tsx:
   - In the Last Login column, add an inactivity badge next to the date
     based on the following rules (computed client-side from lastLogin):

     - lastLogin is null (never logged in) AND account is active:
       → Orange badge: "Never Logged In"

     - lastLogin is more than 90 days ago AND status is 'active':
       → Red badge: "90d+ Inactive"  (bg-[#7B1113] text-white)

     - lastLogin is between 60-90 days ago AND status is 'active':
       → Orange badge: "60d+ Inactive"  (bg-[#f8931f] text-white)

     - lastLogin is less than 60 days ago OR account is 'inactive':
       → No badge (show date only)

   - Badges are informational only — no action attached.
     The existing Deactivate button handles the action.

   - Add a KPI tile to the existing 3-column KPI grid (expand to 4 columns):
     "Stale Accounts" — count of active users with lastLogin > 60 days
     or lastLogin is null. Computed client-side from the fetched user list.
     Tile uses orange border/icon to signal attention needed.

2. Add a "Stale" quick filter option to the Status filter dropdown:
   Options: All | Active | Inactive | Stale (60d+)
   When "Stale" is selected, show only active users with lastLogin
   older than 60 days or null.
   This filter is client-side (no backend change needed).

3. The isSelf account row should never show an inactivity badge
   (you are clearly active if you are logged in viewing this page).

4. Full file output required for client/src/pages/UserManagementPage.tsx.

BRAND/STYLE:
- 90d+ badge: bg-[#7B1113] text-white text-xs rounded px-1.5 py-0.5
- 60d+ badge: bg-[#f8931f] text-white text-xs rounded px-1.5 py-0.5
- Never badge: bg-[#f8931f] text-white text-xs rounded px-1.5 py-0.5
- Stale KPI tile: orange left border or icon accent.

VERIFICATION AFTER THIS PHASE:
Open /aio-system/users.
Set a test user's lastLogin to 95 days ago in DB directly.
Confirm red "90d+ Inactive" badge appears next to their last login date.
Set another user's lastLogin to 70 days ago.
Confirm orange "60d+ Inactive" badge appears.
Set a user's lastLogin to null (never logged in, active).
Confirm orange "Never Logged In" badge appears.
Select "Stale (60d+)" from status filter.
Confirm only stale users are shown.
Confirm KPI tile "Stale Accounts" count is correct.
Confirm your own account row has no inactivity badge.
```

---

## Recommended Run Order

```
Phase 1  → Server-side self-role block     [CRITICAL — run first]
Phase 2  → Audit log for user actions      [run immediately after Phase 1]
Phase 3  → Replace window.confirm()        [quick UI polish]
Phase 4A → 2FA reset backend endpoint
Phase 4B → 2FA status badge + reset UI
Phase 5A → Password policy backend
Phase 5B → Forced password change frontend
Phase 6  → Hide GUEST role
Phase 7  → Server-side pagination          [low urgency, do last]
Phase 8  → Inactive account flagging       [cosmetic, do last]
```

> **Note:** Phases 1 and 2 should be run back-to-back in the same session.
> Phase 1 is a security fix and Phase 2 creates the audit record of who
> ran that fix — they belong together.
