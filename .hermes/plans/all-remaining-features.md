# Remaining Features — Combined Implementation Plan

> **For Hermes:** Dispatch all three as parallel delegate_task subagents.

**Goal:** Implement Vendor/Supplier Management, Global/Federated Search, and Purchase/Procurement Requests in one pass.

**Architecture:** Three independent feature sets dispatched in parallel. Each adds a new Prisma model, CRUD endpoints, a React page, and sidebar/router wiring.

**Tech Stack:** Prisma migrations, Express + Zod, React + TailwindCSS + shadcn/ui + Chart.js + Lucide

---

## Feature A: Vendor / Supplier Management

**Data model:** `Supplier` table (id, name, contactPerson, email, phone, website, notes, createdAt, updatedAt). `Asset` gets optional `supplierId` FK.

**Endpoints:** `GET/POST /api/suppliers`, `PUT/DELETE /api/suppliers/:id`

**UI:** `SuppliersPage` with table (name, contact, email, phone, asset count), Add/Edit modal. Asset form gets supplier dropdown.

**Files:** `server/prisma/schema.prisma`, `server/src/services/supplier.service.ts`, `server/src/routes/supplier.routes.ts`, `client/src/pages/SuppliersPage.tsx`, `client/src/components/suppliers/SupplierFormModal.tsx`, modify `client/src/components/assets/AssetFormModal.tsx`, `client/src/App.tsx`, `client/src/components/AppLayout.tsx`

---

## Feature B: Global/Federated Search

**Endpoint:** `GET /api/search?q=term` — searches assets (name, serial, property#), personnel (fullName, email), issuances (asset names + personnel names), audit logs (summary, action), suppliers (name, contactPerson). Returns `{ assets: [...], personnel: [...], issuances: [...], audit: [...], suppliers: [...] }` capped at 5 per category.

**UI:** `Cmd+K` modal overlay with search input, results grouped by category with icons. Keyboard navigation (up/down arrows, enter to navigate to detail page). Triggered by `Ctrl+K` or `/` key globally.

**Files:** `server/src/services/search.service.ts`, `server/src/routes/search.routes.ts`, `client/src/components/search/GlobalSearchModal.tsx`, modify `client/src/App.tsx` (render modal globally)

---

## Feature C: Purchase/Procurement Requests

**Data model:** `PurchaseRequest` table (id, assetName, type, reason, status: PENDING/APPROVED/REJECTED, requestedById, approvedById?, approvedAt?, notes?, createdAt). `User` gets `purchaseRequests` and `approvedRequests` relations.

**Endpoints:** `GET/POST /api/purchase-requests`, `PATCH /api/purchase-requests/:id/approve`, `PATCH /api/purchase-requests/:id/reject`. On approve, creates an Asset entry automatically.

**UI:** `PurchaseRequestsPage` — Staff see their own requests + create new. Admin sees all requests with Approve/Reject buttons. New request modal. Approval confirmation dialog.

**Files:** `server/prisma/schema.prisma`, `server/src/services/purchase-request.service.ts`, `server/src/routes/purchase-request.routes.ts`, `client/src/pages/PurchaseRequestsPage.tsx`, `client/src/components/purchase/NewRequestModal.tsx`, modify `client/src/App.tsx`, `client/src/components/AppLayout.tsx`

---

## Dispatch Strategy

All three features are independent — no shared files between them aside from `App.tsx` and `AppLayout.tsx` (which need merging). Dispatch order:

1. Dispatch all 3 in parallel via `delegate_task` with `tasks` array
2. After all complete, do a final merge of App.tsx and AppLayout.tsx
3. Run `prisma migrate dev` for all schema changes
4. Verify TypeScript compiles
5. End-to-end browser verification
