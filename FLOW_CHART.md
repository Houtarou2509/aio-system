# AIO-System — Application Flow Chart

> Generated: 2026-04-24
> Format: Mermaid diagrams

---

## 1. System Architecture Overview

```mermaid
flowchart TB
    subgraph Client["Client (React + Vite)"]
        direction TB
        Pages["Pages"]
        Components["Components"]
        Hooks["Custom Hooks"]
        Context["Auth Context"]
        Lib["API Client / Utils"]
        
        Pages --> Components
        Components --> Hooks
        Components --> Context
        Hooks --> Lib
        Context --> Lib
    end

    subgraph Server["Server (Express + TypeScript)"]
        direction TB
        Routes["Routes (API Endpoints)"]
        Middleware["Middleware (Auth / Audit / Validate)"]
        Services["Services (Business Logic)"]
        Jobs["Cron Jobs"]
        
        Routes --> Middleware
        Middleware --> Services
        Jobs --> Services
    end

    subgraph Data["Data Layer"]
        direction TB
        Prisma["Prisma ORM"]
        DB[("Database<br/>PostgreSQL / SQLite")]
        FS[("File System<br/>Uploads / Backups")]
        
        Prisma --> DB
        Services --> FS
    end

    Client -->|"HTTP / REST<br/>Bearer JWT"| Server
    Server -->|"Prisma Client"| Data
    
    style Client fill:#e1f5fe
    style Server fill:#e8f5e9
    style Data fill:#fff3e0
```

---

## 2. Authentication Flow

```mermaid
flowchart LR
    User([User]) --> Login["POST /api/auth/login"]
    Login --> Validate{"Valid credentials?"}
    Validate -->|No| Error["401 Unauthorized"]
    Validate -->|Yes| Check2FA{"2FA enabled?"}
    Check2FA -->|No| IssueTokens["Issue access + refresh tokens"]
    Check2FA -->|Yes| Verify2FA["POST /api/auth/2fa/verify<br/>Verify TOTP code"]
    Verify2FA -->|Invalid| Error
    Verify2FA -->|Valid| IssueTokens
    IssueTokens --> Store["Store tokens in<br/>localStorage"]
    Store --> Dashboard["Redirect to<br/>Dashboard"]
    
    Dashboard --> Protected["Access protected routes<br/>via ProtectedRoute"]
    Protected --> RoleGate["RoleGate checks<br/>user role"]
    RoleGate -->|Allowed| Render["Render component"]
    RoleGate -->|Denied| Forbidden["403 Forbidden"]
    
    style User fill:#e3f2fd
    style IssueTokens fill:#c8e6c9
    style Error fill:#ffcdd2
    style Forbidden fill:#ffcdd2
```

---

## 3. Asset Lifecycle Flow

```mermaid
flowchart TB
    subgraph Create["Create Asset"]
        C1["Admin/Staff-Admin<br/>opens Add Asset modal"] --> C2["Fill form + image upload"]
        C2 --> C3["AI Suggest type/manufacturer<br/>(optional)"]
        C3 --> C4["POST /api/assets"]
        C4 --> C5["Audit log: CREATE"]
        C5 --> C6["Asset created<br/>Status: AVAILABLE"]
    end

    subgraph Use["Asset Usage"]
        U1["Staff requests asset"] --> U2["POST /api/assets/:id/request"]
        U2 --> U3{"Admin approves?"}
        U3 -->|Approved| U4["POST /api/assets/:id/checkout"]
        U3 -->|Denied| U5["Status: DENIED"]
        U4 --> U6["Status: ASSIGNED"]
        U4 --> U7["Audit log: CHECKOUT"]
        
        U6 --> U8["Staff returns asset"]
        U8 --> U9["POST /api/assets/:id/return"]
        U9 --> U10["Status: AVAILABLE"]
        U9 --> U11["Audit log: RETURN"]
    end

    subgraph Maintain["Maintenance"]
        M1["Schedule maintenance<br/>(one-time / recurring)"] --> M2["Status: pending/overdue"]
        M2 --> M3["Mark done"] --> M4["Log maintenance record"]
        M4 --> M5{"Frequent repair?<br/>>3 in 12 months"}
        M5 -->|Yes| M6["Flag: frequentRepair"]
        M5 -->|No| M7["Normal"]
    end

    subgraph End["End of Life"]
        E1["Admin retires asset"] --> E2["Status: RETIRED"]
        E2 --> E3["Soft delete<br/>(deletedAt set)"]
        E3 --> E4["Audit log: DELETE"]
    end

    Create --> Use
    Use --> Maintain
    Maintain --> Use
    Use --> End
    Maintain --> End

    style Create fill:#e8f5e9
    style Use fill:#e3f2fd
    style Maintain fill:#fff8e1
    style End fill:#fce4ec
```

---

## 4. Dashboard Data Flow

```mermaid
flowchart LR
    subgraph Dashboard["Dashboard Page"]
        Widgets["DashboardWidgets"]
        
        subgraph Cards["Summary Cards"]
            Total["Total Assets"]
            Assigned["Total Assigned"]
            Maint["Under Maintenance"]
            Available["Available"]
        end
        
        subgraph Charts["Charts"]
            StatusChart["Status<br/>Doughnut"]
            TypeChart["Type<br/>Bar"]
            LocChart["Location<br/>Horizontal Bar"]
            AgeChart["Age<br/>Doughnut"]
        end
        
        subgraph Lists["Lists"]
            Upcoming["Upcoming Maintenance"]
            Warranties["Warranties Expiring"]
            Activity["Activity Feed"]
        end
    end

    API1["GET /api/dashboard/stats"] --> Widgets
    API2["GET /api/maintenance/upcoming"] --> Upcoming
    API3["GET /api/dashboard/warranties-expiring"] --> Warranties
    API4["GET /api/dashboard/location-stats"] --> LocChart
    API5["GET /api/dashboard/age-stats"] --> AgeChart
    
    Widgets --> Cards
    Widgets --> Charts
    Widgets --> Lists
    
    style Dashboard fill:#e1f5fe
```

---

## 5. Request / Approval Workflow

```mermaid
sequenceDiagram
    actor Staff
    actor Admin
    participant Client
    participant API as API Server
    participant DB as Database
    participant Audit as Audit Log

    Staff->>Client: Request asset
    Client->>API: POST /api/assets/:id/request
    API->>DB: Create assignment with<br/>requestStatus: PENDING
    API->>Audit: Log: CREATE assignment
    API-->>Client: Success
    
    Admin->>Client: Open Pending Requests modal
    Client->>API: GET /api/assets/requests?status=PENDING
    API->>DB: Query pending requests
    API-->>Client: List of pending requests
    
    alt Approve
        Admin->>Client: Click Approve
        Client->>API: PATCH /api/assets/request/:id/approve
        API->>DB: Update status to APPROVED
        API->>Audit: Log: UPDATE assignment
        API-->>Client: Success
    else Deny
        Admin->>Client: Click Deny + reason
        Client->>API: PATCH /api/assets/request/:id/deny<br/>{ denialNote }
        API->>DB: Update status to DENIED
        API->>Audit: Log: UPDATE assignment
        API-->>Client: Success
    end
```

---

## 6. Maintenance Notification Flow

```mermaid
flowchart TB
    subgraph Cron["Daily Cron (09:00 SGT)"]
        Start["Start notification check"] --> ScanWarranty["Scan warranty_expiry<br/>within 30 days"]
        ScanWarranty --> WarrantyExists{"Any found?"}
        WarrantyExists -->|Yes| CreateWarranty["Create notification<br/>WARRANTY_EXPIRING"]
        WarrantyExists -->|No| ScanMaint
        CreateWarranty --> ScanMaint["Scan maintenance_schedules<br/>overdue + not completed"]
        
        ScanMaint --> MaintExists{"Any found?"}
        MaintExists -->|Yes| CreateMaint["Create notification<br/>MAINTENANCE_OVERDUE"]
        MaintExists -->|No| EndCron
        CreateMaint --> EndCron["End"]
    end

    subgraph Client["Client Side"]
        Bell["NotificationBell<br/>component"]
        Bell --> Poll["Poll every 60s<br/>GET /api/notifications"]
        Poll --> Display["Display unread<br/>with badge count"]
        Display --> Dismiss["User clicks Dismiss"]
        Dismiss --> Patch["PATCH /api/notifications/:id/read"]
        Patch --> Remove["Remove from list"]
    end

    Cron -->|"Creates notifications"| Client
    
    style Cron fill:#fff8e1
    style Client fill:#e3f2fd
```

---

## 7. Backup Flow

```mermaid
flowchart LR
    subgraph Manual["Manual Trigger"]
        M1["Admin clicks<br/>Run Backup"] --> M2["POST /api/backups/now"]
    end

    subgraph Auto["Automatic (Daily 02:00 SGT)"]
        A1["Cron triggers"] --> A2["runBackup() service"]
    end

    subgraph Process["Backup Process"]
        P1["Dump database"] --> P2["Encrypt with<br/>AES-256-GCM"]
        P2 --> P3{"S3 configured?"}
        P3 -->|Yes| P4["Upload to S3"]
        P3 -->|No| P5["Save locally"]
        P4 --> P6["Log to BackupLog"]
        P5 --> P6
    end

    subgraph Optional["Optional Integrations"]
        O1["Google Drive<br/>(if configured)"]
    end

    M2 --> Process
    A2 --> Process
    P6 --> Optional

    style Manual fill:#e8f5e9
    style Auto fill:#fff8e1
    style Process fill:#e3f2fd
```

---

## 8. Data Flow — Asset CRUD with Audit

```mermaid
sequenceDiagram
    actor User
    participant Client as React Client
    participant API as Express API
    participant Service as Service Layer
    participant Prisma as Prisma ORM
    participant DB as SQLite/PostgreSQL
    participant Audit as Audit Service

    %% CREATE
    User->>Client: Fill asset form + submit
    Client->>API: POST /api/assets
    API->>Service: assetService.create()
    Service->>Prisma: prisma.asset.create()
    Prisma->>DB: INSERT asset
    DB-->>Prisma: New asset record
    Prisma-->>Service: Asset object
    Service->>Audit: auditLog.create({ action: CREATE })
    Audit->>DB: INSERT audit_log
    Service-->>API: Result
    API-->>Client: { success: true, data: asset }

    %% READ
    User->>Client: View assets list
    Client->>API: GET /api/assets?status=...
    API->>Service: assetService.list(filters)
    Service->>Prisma: prisma.asset.findMany()
    Prisma->>DB: SELECT assets
    DB-->>Prisma: Asset records
    Prisma-->>Service: Assets + count
    Service-->>API: Paginated result
    API-->>Client: { success: true, data, meta }

    %% UPDATE
    User->>Client: Edit asset + save
    Client->>API: PUT /api/assets/:id
    API->>Service: assetService.update(id, changes)
    Service->>Prisma: prisma.asset.update()
    Prisma->>DB: UPDATE asset
    DB-->>Prisma: Updated record
    Prisma-->>Service: Asset object
    Service->>Audit: auditLog.create({ action: UPDATE, field, oldValue, newValue })
    Audit->>DB: INSERT audit_log
    Service-->>API: Result
    API-->>Client: { success: true, data: asset }

    %% DELETE (Soft)
    User->>Client: Delete asset
    Client->>API: DELETE /api/assets/:id
    API->>Service: assetService.softDelete(id)
    Service->>Prisma: prisma.asset.update({ deletedAt: now })
    Prisma->>DB: UPDATE asset SET deletedAt
    DB-->>Prisma: Updated record
    Service->>Audit: auditLog.create({ action: DELETE })
    Audit->>DB: INSERT audit_log
    Service-->>API: Result
    API-->>Client: { success: true }
```

---

## 9. Component Hierarchy — Asset Page

```mermaid
flowchart TB
    AssetsPage["AssetsPage"] --> AssetTable["AssetTable"]
    AssetsPage --> AssetDetailModal["AssetDetailModal"]
    AssetsPage --> AssetFormModal["AssetFormModal"]
    AssetsPage --> ImportAssetsModal["ImportAssetsModal"]
    AssetsPage --> QRScannerModal["QRScannerModal"]
    AssetsPage --> PendingRequestsModal["PendingRequestsModal"]
    
    AssetDetailModal --> Overview["Overview Tab"]
    AssetDetailModal --> FinancialsTab["FinancialsTab"]
    AssetDetailModal --> HistoryTab["History Tab"]
    AssetDetailModal --> MaintenanceTab["MaintenanceTab"]
    AssetDetailModal --> AuditTimeline["AuditTimeline"]
    AssetDetailModal --> GuestTokenManager["GuestTokenManager"]
    
    MaintenanceTab --> ScheduleMaintenanceModal["ScheduleMaintenanceModal"]
    
    AssetsPage --> FilterSidebar["AssetFilterSidebar"]
    FilterSidebar --> SavedFilters["useSavedFilters"]
    
    AssetsPage --> useAssets["useAssets hook"]
    AssetsPage --> useLookupOptions["useLookupOptions hook"]
    
    style AssetsPage fill:#e1f5fe
```

---

## 10. Database Entity Relationships

```mermaid
erDiagram
    USER ||--o{ ASSIGNMENT : makes
    USER ||--o{ AUDIT_LOG : performs
    USER ||--o{ LABEL_TEMPLATE : creates
    ASSET ||--o{ ASSIGNMENT : has
    ASSET ||--o{ MAINTENANCE_LOG : has
    ASSET ||--o{ MAINTENANCE_SCHEDULE : has
    ASSET ||--o{ GUEST_TOKEN : has
    ASSET ||--o{ NOTIFICATION : generates
    ASSET }|--|| LOOKUP_VALUE : references_type
    ASSET }|--|| LOOKUP_VALUE : references_manufacturer
    ASSET }|--|| LOOKUP_VALUE : references_location

    USER {
        string id PK
        string username UK
        string email UK
        string passwordHash
        Role role
        string twoFactorSecret
        boolean twoFactorEnabled
        string backupCodes
        string fullName
        string status
        datetime lastLogin
    }

    ASSET {
        string id PK
        string name
        string type
        string manufacturer
        string serialNumber UK
        decimal purchasePrice
        datetime purchaseDate
        AssetStatus status
        string location
        string imageUrl
        string propertyNumber
        string remarks
        string assignedTo
        datetime warrantyExpiry
        string warrantyNotes
        datetime deletedAt
    }

    ASSIGNMENT {
        string id PK
        string assetId FK
        string userId FK
        string assignedTo
        datetime assignedAt
        datetime returnedAt
        string condition
        string notes
        RequestStatus requestStatus
        string requestNote
    }

    MAINTENANCE_LOG {
        string id PK
        string assetId FK
        string technicianName
        string description
        decimal cost
        datetime date
    }

    MAINTENANCE_SCHEDULE {
        string id PK
        string assetId FK
        string title
        datetime scheduledDate
        string notes
        string status
        datetime completedAt
        string frequency
    }

    AUDIT_LOG {
        string id PK
        string entityType
        string entityId
        string action
        string field
        string oldValue
        string newValue
        string performedById FK
        datetime performedAt
        string ipAddress
    }

    GUEST_TOKEN {
        string id PK
        string assetId FK
        string token UK
        datetime expiresAt
        int maxAccess
        int accessCount
    }

    LABEL_TEMPLATE {
        string id PK
        string name
        string format
        string config
        string createdById FK
    }

    BACKUP_LOG {
        string id PK
        BackupStatus status
        string destination
        string filePath
        int encryptedSize
    }

    LOOKUP_VALUE {
        int id PK
        LookupCategory category
        string value
        boolean isActive
    }

    NOTIFICATION {
        string id PK
        NotificationType type
        string message
        string assetId FK
        boolean isRead
    }
```

---

## Legend

| Color | Meaning |
|-------|---------|
| 🟦 Light Blue | Client / UI |
| 🟩 Light Green | Success / Create operations |
| 🟨 Light Yellow | Cron / Scheduled jobs |
| 🟧 Light Orange | Data / Database |
| 🟥 Light Red | Error / Deny / End of life |

---

*End of flow chart documentation*
