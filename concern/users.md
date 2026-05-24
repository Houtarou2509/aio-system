# Users Page Context

> URL: `/aio-system/users`
> Route protection: `ADMIN` only (`ProtectedRoute requiredRole="ADMIN"`)

---

## Overview

The **Users** page is an admin-only management interface for creating, editing, activating/deactivating system accounts, and assigning role-based permissions. It lives under the **Admin Hub (Settings)** gateway but is directly accessible via `/users` for admins.

---

## Tech Stack

| Layer       | Technology                                       |
|-------------|--------------------------------------------------|
| Frontend    | React 18, TypeScript, Vite                       |
| UI Library  | Tailwind CSS, Lucide React icons                  |
| Routing     | React Router v6 (BrowserRouter, basename `/aio-system`) |
| State       | React `useState`/`useEffect`/`useCallback`        |
| Auth        | JWT (accessToken + refreshToken), `AuthContext`   |
| API Client  | Native `fetch` with `Bearer` token from `AuthContext` |
| Backend     | Express.js, TypeScript                           |
| Validation  | Zod (server schemas), manual client-side checks   |
| ORM         | Prisma Client                                     |
| Database    | PostgreSQL 16                                      |
| Passwords   | bcryptjs (hash + compare)                          |
| Permissions | Custom permission-key system (`resource:action` format, JSON string in DB) |

---

## Folder Map — File Locations

```
aio-system/
├── client/src/
│   ├── App.tsx                                    # Route: <Route path="users" element={<ProtectedRoute requiredRole="ADMIN"><UserManagementPage /></ProtectedRoute>} />
│   ├── context/
│   │   └── AuthContext.tsx                        # useAuth() — provides accessToken, currentUser, login/logout
│   ├── components/
│   │   ├── AppLayout.tsx                         # Sidebar nav (Admin Hub → Users quick-link is in SettingsPage)
│   │   ├── auth/
│   │   │   ├── ProtectedRoute.tsx                 # Role gate: blocks non-ADMIN from /users
│   │   │   └── PermissionGate.tsx                 # Fine-grained permission gate (users:view)
│   │   └── users/
│   │       ├── index.ts                           # Barrel export: AddUserModal, EditUserModal
│   │       ├── AddUserModal.tsx                   # "Add User" modal form
│   │       ├── EditUserModal.tsx                  # "Edit User" modal form
│   │       └── PermissionChecklist.tsx            # Categorized permission checkboxes + role preset buttons
│   ├── pages/
│   │   ├── UserManagementPage.tsx                 # Main page component (table + KPIs + filters)
│   │   └── SettingsPage.tsx                      # Admin Hub — has "Users & Permissions" accordion → QuickLink to /users
│   └── lib/
│       └── api.ts                                # API base config, auth interceptor
│
├── server/src/
│   ├── index.ts                                   # Route registration: app.use('/api/users', userRoutes)
│   ├── middleware/
│   │   ├── auth.ts                               # authenticate (JWT verify), requireRole/authorize, hasPermission
│   │   └── permissions.ts                        # ALL_PERMISSIONS map, PERMISSION_KEYS, DEFAULT_PERMISSIONS per role
│   ├── routes/
│   │   ├── user.routes.ts                        # GET/POST /api/users, PUT /api/users/:id, PATCH /api/users/:id/status
│   │   └── user.schema.ts                       # Zod: createUserSchema, updateUserSchema, updateUserStatusSchema
│   └── utils/
│       └── permissions.ts                        # parsePermissions helper, PermissionKey type
│
├── server/prisma/
│   └── schema.prisma                             # model User { ... } + enum Role { ADMIN, STAFF_ADMIN, STAFF, GUEST }
```

---

## Database Model — `User`

```prisma
model User {
  id                String    @id @default(uuid())
  username          String    @unique
  email             String    @unique
  passwordHash      String
  role              Role      @default(STAFF)
  permissions       String    @default("[]")        // JSON-stringified array of permission keys
  twoFactorSecret   String?
  twoFactorEnabled  Boolean   @default(false)
  backupCodes       String    @default("[]")
  fullName          String?
  status            String    @default("active")    // "active" | "inactive"
  lastLogin         DateTime?
  createdAt         DateTime  @default(now())
  updatedAt         DateTime  @updatedAt

  // Relations
  assignments            Assignment[]
  returnedAssignments    Assignment[]         @relation("AssignmentReturnedBy")
  issuedAgreementDocuments      AgreementDocument[] @relation("AgreementDocumentIssuedBy")
  uploadedAgreementDocuments    AgreementDocument[] @relation("AgreementDocumentSignedUploadedBy")
  auditLogs              AuditLog[]           @relation("AuditLogUser")
}

enum Role {
  ADMIN
  STAFF_ADMIN
  STAFF
  GUEST
}
```

- `permissions` is stored as a **JSON string** (e.g. `'["assets:view","assets:create"]'`). It's parsed with `JSON.parse()` on read and stringified with `JSON.stringify()` on write — both on the server side.
- `passwordHash` is never returned to the client (excluded via `SAFE_SELECT`).

---

## API Endpoints

All routes require `authenticate` middleware (valid JWT) **and** `requireRole(['ADMIN'])`.

| Method | Endpoint                | Validation Schema       | Description                              |
|--------|-------------------------|-------------------------|------------------------------------------|
| GET    | `/api/users`            | —                       | Paginated list (query: `page`, `limit`)  |
| POST   | `/api/users`            | `createUserSchema`      | Create a new user                        |
| PUT    | `/api/users/:id`         | `updateUserSchema`      | Update user fields (including password)  |
| PATCH  | `/api/users/:id/status`  | `updateUserStatusSchema`| Toggle active/inactive                   |

### GET /api/users — Response Shape

```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "username": "jdoe",
      "fullName": "John Doe",
      "email": "jdoe@example.com",
      "role": "STAFF",
      "status": "active",
      "permissions": ["assets:view", "reports:view"],
      "lastLogin": "2026-05-20T08:00:00.000Z",
      "createdAt": "2026-01-15T10:00:00.000Z"
    }
  ],
  "meta": { "page": 1, "limit": 20, "total": 5, "totalPages": 1 }
}
```

### POST /api/users — Request Body

```json
{
  "fullName": "Jane Doe",
  "username": "janedoe",
  "email": "jane@example.com",
  "password": "secret123",
  "role": "STAFF_ADMIN",
  "permissions": ["assets:view", "assets:create"]   // optional; defaults to role preset if omitted
}
```

- Unique checks: `username` and `email` must not already exist (HTTP 409 if conflict).
- Password is hashed with `bcryptjs` (salt rounds: 10) before storage.
- If `permissions` is omitted, `DEFAULT_PERMISSIONS[role]` is used from `server/src/middleware/permissions.ts`.

### PUT /api/users/:id — Request Body

```json
{
  "fullName": "Jane Updated",
  "username": "janedoe2",
  "email": "jane2@example.com",
  "role": "ADMIN",
  "password": "newpass123",         // optional — omit to keep existing
  "permissions": ["assets:view"]    // optional — if role changes without explicit perms, new role defaults apply
}
```

- If `role` changes and no explicit `permissions` are provided, the server auto-assigns `DEFAULT_PERMISSIONS[newRole]`.
- Cannot change own role (frontend blocks the dropdown; server doesn't explicitly enforce self-role-change but the UX prevents it).

### PATCH /api/users/:id/status

```json
{ "status": "inactive" }
```

- Server blocks deactivating your own account: `if (status === 'inactive' && req.user!.id === id) → 403`.

---

## Roles & Permission System

### Roles

| Role         | Description                                  | Nav Visibility                     |
|--------------|----------------------------------------------|-------------------------------------|
| `ADMIN`      | Full system access, all permissions         | Everything                          |
| `STAFF_ADMIN`| Asset + issuance management, no user admin  | Profiles, Issuances, Lookup, Audit  |
| `STAFF`      | View-only for most things                    | Dashboard, Assets (view), Reports   |
| `GUEST`      | Minimal read-only                             | Dashboard only                      |

### Permission Keys (server-side source of truth)

Defined in `server/src/middleware/permissions.ts`:

```
assets:view, assets:create, assets:edit, assets:delete
reports:view
suppliers:view, suppliers:create, suppliers:edit, suppliers:delete
purchase-requests:view, purchase-requests:create, purchase-requests:approve
issuances:view, issuances:create, issuances:edit, issuances:return
audit:view, audit:export
users:view, users:create, users:edit
backups:view, backups:create
settings:view
notifications:view
```

### Default Permission Presets by Role

**ADMIN**: All 22 permissions.

**STAFF_ADMIN**:
`assets:view/create/edit`, `reports:view`, `suppliers:view/create/edit`, `purchase-requests:view/create/approve`, `issuances:view/create/edit/return`, `audit:view/export`, `users:view`, `notifications:view`

**STAFF**:
`assets:view`, `reports:view`, `issuances:view`, `audit:view`, `notifications:view`

**GUEST**:
(none / empty array)

### Client-side PermissionChecklist

`client/src/components/users/PermissionChecklist.tsx` mirrors these presets with:
- 10 collapsible **categories** (Assets, Reports, Suppliers, Purchase Requests, Issuances, Audit, Users, Backups, Settings, Notifications)
- Category-level **toggle all** checkboxes
- Per-permission **individual** checkboxes
- **Role preset buttons** at the top (ADMIN / STAFF-ADMIN / STAFF / GUEST) — clicking a preset fills in that role's default set
- Selected count indicator per category (e.g. `3/4`)

When creating a user, the `AddUserModal` auto-applies default permissions when the role dropdown changes. When editing, `EditUserModal` does the same **unless** it's a self-edit (you editing your own account), in which case permissions stay as-is to avoid accidental lockout.

---

## UI Layout — UserManagementPage

```
┌──────────────────────────────────────────────────────────────┐
│  STICKY NAVY HEADER (bg-[#012061])                          │
│  [Users icon] "Users"              [Export CSV] [Add User]   │
├──────────────────────────────────────────────────────────────┤
│  KPI TILES (3-column grid)                                  │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐         │
│  │ Total Users  │ │   Admins     │ │   Active     │         │
│  │     N        │ │     N        │ │     N        │         │
│  └──────────────┘ └──────────────┘ └──────────────┘         │
├──────────────────────────────────────────────────────────────┤
│  FILTER BAR                                                  │
│  [🔍 Search name/username/email] [Role: All ▾] [Status: All ▾]│
├──────────────────────────────────────────────────────────────┤
│  DATA TABLE                                                  │
│  ┌────────┬────────┬────────┬────────────┬──────────┐       │
│  │ User   │ Role   │ Status │ Last Login │ Actions  │       │
│  │ (avatar│ (badge)│ (pill) │            │ ✏️ 🔒/🔓 │       │
│  │ +name  │        │        │            │          │       │
│  │ +email)│        │        │            │          │       │
│  └────────┴────────┴────────┴────────────┴──────────┘       │
└──────────────────────────────────────────────────────────────┘
```

### Table Columns

| Column      | Content                                                       |
|-------------|---------------------------------------------------------------|
| User        | Avatar circle (initials, navy bg) + fullName + email below   |
| Role        | Pill badge — navy bg for ADMIN/STAFF_ADMIN, slate for others |
| Status      | Green "Active" pill / gray "Inactive" pill                    |
| Last Login  | Formatted date or italic "Never"                              |
| Actions     | Edit (✏️) button + Deactivate (🔒)/Activate (🔓) toggle      |

### Action Rules

- **Edit**: Opens `EditUserModal` with pre-filled form
- **Deactivate**: Shows `window.confirm()`, then calls `PATCH /api/users/:id/status` with `{status: "inactive"}`. **Disabled for your own account** (isSelf check).
- **Activate**: Calls same endpoint with `{status: "active"}`. No confirmation needed.
- **Export CSV**: Downloads `users-export-YYYY-MM-DD.csv` with columns: ID, Username, Full Name, Email, Role, Status, Last Login, Created At.

### Client-side Filtering

All filtering is **local** (no server-side search). The page fetches all users via `GET /api/users` (ignoring pagination params from the response), then filters in memory:

- **Search**: Matches against `username`, `fullName`, `email` (case-insensitive)
- **Role filter**: Exact match on `role` string
- **Status filter**: Exact match on `status` string

---

## Modal Forms

### AddUserModal

**Trigger**: "Add User" button in header.

Fields:
1. Full Name (required)
2. Username (required, 3-20 chars, alphanumeric + underscore)
3. Email (required, valid email format)
4. Password (required, min 8 chars, show/hide toggle)
5. Confirm Password (required, must match)
6. Role (select: ADMIN, STAFF-ADMIN, STAFF, GUEST)
7. Permissions (PermissionChecklist component)

Client validation runs first. Server returns 409 for username/email conflicts, which are mapped to field-level errors.

### EditUserModal

**Trigger**: Edit icon on a table row.

Fields: Same as AddUserModal except:
- Pre-filled with existing user data
- No password fields by default — click "Reset Password" to reveal them
- Role dropdown is **disabled** when editing your own account (`isSelf`)
- When role changes (non-self), permissions auto-reset to that role's defaults

---

## Access Control Flow

```
Browser → React Router
  ├── ProtectedRoute checks: is user authenticated? → No → redirect to /login
  ├── ProtectedRoute checks: requiredRole="ADMIN" → No → redirect to /
  └── UserManagementPage renders

API calls → Authorization header: Bearer <accessToken>
  ├── Server: authenticate middleware → JWT verify → attach req.user
  ├── Server: requireRole(['ADMIN']) → check req.user.role === 'ADMIN'
  └── Route handler executes (Prisma query, validation, response)
```

---

## Entry Points to /users

1. **Direct URL**: `http://localhost:3000/aio-system/users` (ADMIN only)
2. **SettingsPage (Admin Hub)**: "Users & Permissions" accordion → "Manage Users" QuickLink → `/users`
3. **Sidebar**: Not directly in sidebar nav. Accessed through Admin Hub.