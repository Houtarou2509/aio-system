# AIO-System Feature Roadmap

## 1. Dedicated Reports Page ✅
Done. 5 panels: Inventory Valuation, Asset Utilization, Maintenance Cost Analysis, Warranty Calendar, Activity Timeline.
3 new server endpoints: /api/reports/inventory-valuation, asset-utilization, maintenance-costs.
Page: /aio-system/reports

## 2. Asset Disposal / Write-Off Workflow ✅
Done. Post /api/assets/:id/dispose with DisposalMethod enum (DONATED/SOLD/SCRAPPED/RETURNED_TO_VENDOR/OTHER).
DisposeAssetModal + dispose button in bulk toolbar + asset detail modal header.

## 3. Vendor / Supplier Management ✅
Done. Supplier model with full CRUD. SuppliersPage with table, SupplierFormModal.
Asset gets optional supplierId FK. Page: /aio-system/suppliers

## 4. Global / Federated Search ✅
Done. GET /api/search?q=term — searches assets, personnel, issuances, audit, suppliers.
GlobalSearchModal: Cmd+K overlay with categorized results, keyboard navigation, debounced input.
Page: triggered globally via Cmd+K / Ctrl+K

## 5. Dashboard Widget Customization ✅
Done. 6 toggleable + reorderable widgets via CustomizePanel slide-in panel.
Preferences persisted to localStorage (key: aio_dashboard_layout).

## 6. Purchase / Procurement Requests ✅
Done. PurchaseRequest model with PENDING/APPROVED/REJECTED workflow.
Admin approve creates asset automatically. Page: /aio-system/purchase-requests
