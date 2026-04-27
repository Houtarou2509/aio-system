# `assignedTo` Relationship Flow — AIO System

## Current State (How it works now)

```
┌─────────────────────────────────────────────────────────┐
│                    ASSET TABLE                          │
│  ┌──────────┬──────────────┬────────────┬──────────┐   │
│  │ id       │ name         │ status     │ assignedTo│   │
│  ├──────────┼──────────────┼────────────┼──────────┤   │
│  │ a1       │ Laptop       │ ASSIGNED   │ "jhon"    │   │
│  │ a2       │ Monitor      │ AVAILABLE  │ null      │   │
│  │ a3       │ Printer      │ ASSIGNED   │ "maria"   │   │
│  └──────────┴──────────────┴────────────┴──────────┘   │
│                                                         │
│  ⚠️  assignedTo = plain string (not a FK!)              │
│      Pulled from Lookup table ("assigned-to" category)  │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│                 ASSIGNMENT TABLE                         │
│  ┌──────────┬──────────┬──────────┬────────────┬──────┐│
│  │ id       │ assetId  │ userId   │ assignedTo │status││
│  ├──────────┼──────────┼──────────┼────────────┼──────┤│
│  │ as1      │ a1       │ u10      │ "jhon"     │PEND  ││
│  │ as2      │ a2       │ u11      │ "maria"     │APPR  ││
│  └──────────┴──────────┴──────────┴────────────┴──────┘│
│                                                         │
│  ⚠️  assignedTo here = also a plain string              │
│      userId = FK to User, but assignedTo ≠ userId       │
│      On APPROVE → asset.assignedTo = assignment.assignedTo │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│                 LOOKUP TABLE ("assigned-to")            │
│  ┌──────────┬──────────────┬──────────┐                │
│  │ id       │ category     │ value    │                │
│  ├──────────┼──────────────┼──────────┤                │
│  │ l1       │ assigned-to  │ "jhon"    │                │
│  │ l2       │ assigned-to  │ "maria"   │                │
│  └──────────┴──────────────┴──────────┘                │
│                                                         │
│  ⚠️  Just a dropdown of names — no link to User table  │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│                  AUDIT LOG                              │
│  entityType: "Assignment"  action: "REQUEST"            │
│  field: "requestStatus"  newValue: "PENDING"            │
│  ⚠️  No mention of WHO requested WHAT asset in the log │
└─────────────────────────────────────────────────────────┘
```

## The Problem

```
                     INVENTORY LOOKUP              ASSET TABLE
                    ┌──────────────┐           ┌──────────────┐
                    │ assigned-to  │           │ assignedTo   │
                    │ dropdown     │────┬─────▶│ (string)     │
                    │ "jhon"       │    │      │ "jhon"       │
                    │ "maria"      │    │      └──────────────┘
                    └──────────────┘    │
                                        │    No relation to:
                                        │
                                        │    ┌──────────────┐    ┌──────────┐
                                        │    │ ASSIGNMENT   │    │ USER     │
                                        │    │ userId ──────┼───▶│ id       │
                                        │    │ assignedTo   │    │ username │
                                        │    │ "jhon" ✗─────│    │ "jhon"   │
                                        │    └──────────────┘    └──────────┘
                                        │
                                        │    ⚠️  String "jhon" ≠ FK to User
                                        │    ⚠️  No guarantee "jhon" in Lookup = User
                                        │    ⚠️  Audit says "PENDING" but not WHO or WHAT
                                        └──────────────────────────────────────
```

## What Should It Look Like? (You tell me!)

Here are the key questions:

1. **Should `assignedTo` be a real User relation?**
   - Currently it's a free-text string from Lookup
   - Option A: Keep as Lookup dropdown (names like "jhon")
   - Option B: Link to User table via userId (normalized)

2. **When Staff requests an asset, should it auto-set `assignedTo`?**
   - Currently: on APPROVE, `asset.assignedTo = user.username`
   - This means Asset.assignedTo mirrors Assignment.assignedTo

3. **Should the Audit Trail show human-readable messages?**
   - Currently: `field: "requestStatus", newValue: "PENDING"`
   - Should be: `"Staff jhon requested asset Laptop"`

4. **Should Lookup "assigned-to" auto-sync with Users?**
   - Currently: Lookup values are manually added/migrated
   - Could auto-populate from User table instead
```

## Flow Diagrams

### Current Request Flow
```
Staff clicks "Request"
        │
        ▼
POST /api/assets/request
        │
        ├─ Create Assignment (requestStatus: PENDING, assignedTo: user.username)
        ├─ Create AuditLog (action: REQUEST, newValue: "PENDING")
        └─ Return 201
        │
        ▼
Admin sees in PendingRequestsModal
        │
        ├─ Approve → PATCH /api/assets/request/:id/approve
        │     ├─ Assignment.requestStatus = APPROVED
        │     ├─ Asset.status = ASSIGNED
        │     ├─ Asset.assignedTo = user.username  ← copied from Assignment
        │     └─ AuditLog (action: APPROVE)
        │
        └─ Deny → PATCH /api/assets/request/:id/deny
              ├─ Assignment.requestStatus = DENIED
              └─ AuditLog (action: DENY)
```

### Where the Disconnect Is
```
Lookup "assigned-to" values          User table
       │                                │
       │  (no relation)                 │  (has relation via userId)
       ▼                                ▼
  Asset.assignedTo ◄── copied ─── Assignment.assignedTo
  (string)                              (string)
       │
       └─ Also editable directly in AssetFormModal
          (no validation, no audit of WHO assigned to WHOM)
```

---

## 👋 Your Turn!

Which of these bother you? Pick any:

- **A)** `assignedTo` should be linked to User (not free-text Lookup)
- **B)** Lookup "assigned-to" should auto-sync from User table
- **C)** Audit trail should show "jhon requested Laptop" not just "PENDING"
- **D)** Asset.assignedTo shouldn't be editable directly — only via Assignment flow
- **E)** Something else entirely?

Tell me what feels broken and I'll fix the flow.