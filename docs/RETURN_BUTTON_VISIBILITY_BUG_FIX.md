# AIO-System — Return Button Not Visible Bug Fix
> Generated: 2026-05-22
> Module: Issuances (`/aio-system/issuances`)
> Symptom: Amber Return button not visible for ADMIN with issuances:return permission
> Format: OpenClaw two-block prompt structure (Global Context + Phase block)

---

## Bug Summary

The row-level amber Return (↻) button in the Issuances table is not
visible even when:
- The logged-in user is ADMIN
- The issuances:return permission is confirmed present on the user
- The issuance row is active (not yet returned)

The button is wrapped in `<PermissionGate permissions={['issuances:return']}>`,
so the cause is either upstream of the gate (permission not reaching it
correctly) or a secondary visibility condition adjacent to the gate
(returnedAt check, accountabilityStatus check, or row status filter)
that is evaluating incorrectly and hiding the button regardless of permission.

---

## Phase 1 — Diagnose and fix Return button visibility in IssuancesPage

```
=== GLOBAL CONTEXT ===
Project: AIO-System (All-In-One Office Asset Inventory System)
Repo: /home/reggie/.hermes/workspace/aio-system
Stack: Node.js / TypeScript / Express / Prisma ORM / PostgreSQL
Frontend: React 18 + TypeScript + Vite + TailwindCSS + shadcn/ui
Monorepo workspaces: server, client, shared
Full-file output is required. No partial snippets.

=== PHASE 1: Fix amber Return button not visible for ADMIN with issuances:return permission ===

BUG REPORT:
The row-level amber Return (↻) button in the Issuances table is not
visible. Confirmed conditions:
  - User role: ADMIN
  - Permission issuances:return: confirmed present on user record
  - Issuance rows are active (not yet returned)
  - The button is wrapped in <PermissionGate permissions={['issuances:return']}>

SYMPTOM:
Button is completely absent from the DOM — not just disabled or grayed.

ROOT CAUSE CANDIDATES:
Check ALL of the following in this exact order before writing any fix.
The actual cause must be identified from the code before changing anything.

CANDIDATE A — PermissionGate not receiving permissions from AuthContext:
  In client/src/components/auth/PermissionGate.tsx:
  - How does it read permissions? From useAuth()? From props?
  - Does useAuth() return permissions as a parsed array or a JSON string?
  - If permissions is stored as a JSON string in the User object and
    PermissionGate compares it against a string array, the includes()
    check always fails → button never renders.
  Fix if found: ensure permissions is parsed (JSON.parse) before the
  includes() check inside PermissionGate.

CANDIDATE B — ADMIN role bypasses permission assignment at login:
  In server/src/middleware/auth.ts or the JWT payload construction:
  - When an ADMIN logs in, is their permissions array explicitly set
    to ALL_PERMISSIONS, or does it default to an empty array assuming
    ADMIN always passes all checks?
  - If the JWT payload has permissions: [] for ADMIN (because the
    code assumes ADMIN is checked by role not by permission array),
    but PermissionGate checks the permissions array — the gate fails.
  Fix if found: in PermissionGate, add an ADMIN role bypass:
    const { currentUser } = useAuth()
    if (currentUser?.role === 'ADMIN') return <>{children}</>
    // then do the normal permission check

CANDIDATE C — Secondary visibility condition on the row hides the button:
  In client/src/pages/IssuancesPage.tsx, find where the Return button
  is rendered. Look for ALL conditions wrapping it beyond PermissionGate:
  Common culprits:
    a. issuance.returnedAt !== null  → hides if returnedAt is not null
    b. issuance.accountabilityStatus !== 'PENDING_SIGNATURE'
       → hides if status is wrong value
    c. issuance.status !== 'active' or similar row-level status field
    d. A tab filter (e.g. "Active" tab) that is not showing the rows
       you expect — meaning the rows visible on screen may already be
       filtered to a state where the return button is conditionally hidden
    e. row.asset?.status === 'ASSIGNED' check that evaluates false
       because the asset status is a different casing or value
  Fix if found: correct the specific condition that is evaluating wrong.

CANDIDATE D — PermissionGate import or usage error in IssuancesPage:
  In client/src/pages/IssuancesPage.tsx:
  - Is PermissionGate imported correctly?
  - Is the permissions prop spelled correctly?
    <PermissionGate permissions={['issuances:return']}> ← correct
    <PermissionGate permission={['issuances:return']}>  ← wrong (singular)
    <PermissionGate permissions={['issuance:return']}>  ← wrong (typo)
  - Is the permission key 'issuances:return' an exact match to what
    is defined in server/src/middleware/permissions.ts PERMISSION_KEYS?
  Fix if found: correct the prop name or permission key string.

CANDIDATE E — PermissionGate renders null for empty children or wrong node:
  In client/src/components/auth/PermissionGate.tsx:
  - If the gate evaluates to false, does it return null, false, or <></>?
  - If it returns false (not null), React renders nothing — this is fine.
  - But if the children prop is somehow undefined or the gate wraps
    a fragment that contains nothing, the button may not be passed in.
  Fix if found: ensure the Return button JSX is correctly inside the gate.

INVESTIGATION STEPS TO INCLUDE IN THE FIX:
Before writing the fix, add a temporary console.log in PermissionGate:
  console.log('[PermissionGate]', {
    required: permissions,
    userPermissions: currentUser?.permissions,
    userRole: currentUser?.role,
    result: permissions.every(p => currentUser?.permissions?.includes(p))
  })
Run the app, open the Issuances page, and check the browser console.
This log reveals exactly which candidate is the real cause.
Remove the console.log in the final fix output.

SOLUTION REQUIREMENTS (apply whichever candidates are confirmed):
1. Fix the root cause identified above — do not apply all fixes blindly.
   Only fix what the console.log and code inspection confirm is wrong.

2. If Candidate B (ADMIN role bypass) is the cause:
   In client/src/components/auth/PermissionGate.tsx, add ADMIN bypass:
   - If currentUser.role === 'ADMIN', render children unconditionally.
   - This matches how hasPermission() works on the backend where ADMIN
     always passes all permission checks.
   Full file output required.

3. If Candidate A (JSON string not parsed) is the cause:
   In client/src/components/auth/PermissionGate.tsx:
   - Parse permissions safely before includes() check:
     const userPerms = Array.isArray(currentUser?.permissions)
       ? currentUser.permissions
       : JSON.parse(currentUser?.permissions ?? '[]')
   Full file output required.

4. If Candidate C (secondary condition) is the cause:
   In client/src/pages/IssuancesPage.tsx:
   - Fix the specific condition that incorrectly hides the button.
   - Add a comment explaining the correct visibility logic:
     // Show Return button only if: user has permission AND row is active
     // Active = returnedAt is null AND accountabilityStatus !== 'RETURNED'
   Full file output required.

5. If Candidate D (typo/wrong key) is the cause:
   In client/src/pages/IssuancesPage.tsx:
   - Fix the permission key or prop name.
   Full file output required.

6. Regardless of root cause — after fixing, add a defensive comment
   in IssuancesPage.tsx above the Return button block:
   // Return button visibility:
   // 1. PermissionGate: user must have issuances:return
   // 2. Row condition: returnedAt must be null (not yet returned)
   // 3. ADMIN role always passes PermissionGate regardless of permission array

FILES MOST LIKELY TO CHANGE:
- client/src/components/auth/PermissionGate.tsx  (Candidates A, B, E)
- client/src/pages/IssuancesPage.tsx             (Candidates C, D)

FILES TO READ BUT LIKELY NOT CHANGE:
- client/src/context/AuthContext.tsx              (understand permissions shape)
- server/src/middleware/permissions.ts            (verify permission key spelling)

VERIFICATION AFTER THIS PHASE:
1. Log in as ADMIN.
2. Open /aio-system/issuances.
3. Confirm amber Return (↻) button is now visible on active issuance rows.
4. Click the Return button → confirm Return Modal opens.
5. Submit a return with condition: Good → confirm issuance is marked returned.
6. Confirm the returned row no longer shows the Return button.
7. Log in as STAFF (no issuances:return permission).
8. Confirm Return button is NOT visible for STAFF → PermissionGate still works.
9. Log in as STAFF_ADMIN (has issuances:return).
10. Confirm Return button IS visible for STAFF_ADMIN.
11. Check that Bulk Return and Return Station still work normally.
```

---

## Phase 2 — Regression check for all three return paths

```
=== GLOBAL CONTEXT ===
(same as Phase 1 global context block)

=== PHASE 2: Verify all three return paths work correctly after Phase 1 fix ===

PROBLEM STATEMENT:
After Phase 1 fixes the button visibility, all three return paths must
be verified to work end-to-end. The root cause fix may have touched
PermissionGate or row condition logic that is shared across the row-level
button, the bulk return action, and the Return Station modal. A regression
in any of these would leave return workflows broken for some users.

VERIFICATION CHECKLIST (no code changes expected — this is a test phase):

PATH 1 — Row-level Return button:
  □ Amber ↻ button visible on active rows for ADMIN and STAFF_ADMIN
  □ Button NOT visible on already-returned rows
  □ Button NOT visible for STAFF (no issuances:return permission)
  □ Clicking opens Return Modal with condition dropdown and note field
  □ Submitting with condition: Good marks the row as returned
  □ Asset status changes to AVAILABLE in the Assets table
  □ AuditLog row created with action: issuance.returned

PATH 2 — Bulk Return:
  □ Checkboxes appear on active rows
  □ "Return Selected" button appears in bulk toolbar when rows selected
  □ Clicking opens Return Modal for all selected rows
  □ Submitting bulk return marks all selected rows as returned
  □ Assets for all returned rows change to AVAILABLE

PATH 3 — Return Station:
  □ "Return Station" button visible at top of page
  □ Clicking opens Return Station modal
  □ Searching by name/serial/property number finds active issuances
  □ Selecting and returning from Return Station marks the row as returned
  □ Asset status changes to AVAILABLE

IF any path fails during verification, create a follow-up fix prompt
targeting only that specific path's handler or modal component.
Do not mix fixes for multiple paths in one prompt — one path per phase.

FINAL CONFIRMATION QUERY:
Run in PostgreSQL to confirm a test return was written correctly:
  SELECT
    a.id,
    a."returnedAt",
    a."returnCondition",
    a."accountabilityStatus",
    ast.status AS "assetStatus"
  FROM "Assignment" a
  JOIN "Asset" ast ON ast.id = a."assetId"
  WHERE a."returnedAt" IS NOT NULL
  ORDER BY a."returnedAt" DESC
  LIMIT 5;

Expected: returnedAt is set, returnCondition is populated,
accountabilityStatus = 'RETURNED', assetStatus = 'AVAILABLE'.
```

---

## Most Likely Root Cause (Based on Symptoms)

Given that:
- Role is ADMIN
- Permission `issuances:return` is confirmed present on the user record
- The button is completely absent (not just disabled)

**Candidate B is the most probable cause.**

Most systems store ADMIN permissions as an empty array `[]` in the DB
because ADMIN is expected to bypass checks by role — but if `PermissionGate`
checks the array instead of the role, ADMIN gets blocked by their own
empty permissions array. The console.log in Phase 1 will confirm this
immediately.

The fix is a single ADMIN bypass at the top of `PermissionGate.tsx`:
```tsx
if (currentUser?.role === 'ADMIN') return <>{children}</>
```
This mirrors exactly how `hasPermission()` works on the backend.
