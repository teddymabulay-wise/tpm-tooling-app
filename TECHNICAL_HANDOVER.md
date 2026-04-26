# TPM Tooling App — Technical Handover Document

**Prepared by:** TPM Team (Teddy Mabulay)  
**Date:** 2026-04-26 (last updated 2026-04-26 — reflects implemented Workato migration stubs)  
**Target audience:** Software Engineering team taking ownership of the application  
**Deployment target:** Wise internal infrastructure  
**Repository:** `tpm-tooling-app-12c26600`

---

## Table of Contents

1. [Purpose and Context](#1-purpose-and-context)
2. [Architecture Overview](#2-architecture-overview)
3. [Tech Stack](#3-tech-stack)
4. [Project Structure](#4-project-structure)
5. [Routing](#5-routing)
6. [Pages and Features](#6-pages-and-features)
7. [Components](#7-components)
8. [Library and Business Logic](#8-library-and-business-logic)
9. [Data Sources](#9-data-sources)
10. [API Integration](#10-api-integration)
11. [Authentication](#11-authentication)
12. [State and Data Flow](#12-state-and-data-flow)
13. [Key Algorithms](#13-key-algorithms)
14. [Build and Dev Configuration](#14-build-and-dev-configuration)
15. [Security Assessment for Wise Deployment](#15-security-assessment-for-wise-deployment)
16. [Known Limitations and Technical Debt](#16-known-limitations-and-technical-debt)
17. [Deployment Checklist](#17-deployment-checklist)

---

## 1. Purpose and Context

The **TPM Tooling App** is an internal web application built by the Third-Party Management (TPM) team to support operational workflows around the team's use of **Omnea**, a third-party supplier management platform.

The app was built iteratively to solve concrete day-to-day operational problems that the Omnea platform's own UI does not address:

| Problem | Solution implemented in the app |
|---|---|
| Supplier materiality classification needs to be audited and cross-referenced against request data | Risk Audit, Materiality Audit pages |
| Supplier record fields need to be validated against intake request answers | Supplier Record Audit page |
| Copying suppliers from Production to QA is a slow manual process | Prod → QA Clone tool |
| QA environment accumulates stale suppliers that must be cleaned up periodically | QA Cleanup tool |
| Internal contact roles (budget-holder, business-owner, IT owner) need to be assigned in bulk | BSP Internal Contact tool |
| Omnea's API is undocumented for the team's use cases; every call needs trial and error | Omnea API Explorer |
| BC (Business Central) vendor migration requires batch-creating suppliers + profiles + bank accounts in Omnea | BC Vendor Simulator |
| Workflow structure (blocks, forms, questions, logic) is only accessible through Omnea's admin UI | Flows Metadata toolset |

The app is a **client-side only** React SPA. There is no dedicated backend server. All business logic runs in the browser. In production it makes direct HTTPS calls to `https://api.omnea.co`.

---

## 2. Architecture Overview

```
Browser (React SPA)
│
├── Vite dev proxy (development only)
│   └── /api/* → https://api.omnea.co
│   └── /__local_api/save-csv → writes to public/doc/ (dev only)
│
├── Static assets
│   └── public/doc/*.csv  ← reference data files served as static assets
│
└── External services (called directly from browser in production)
    ├── https://api.omnea.co          ← Omnea REST API (OAuth2, all tools)
    ├── https://api-qa.omnea.co       ← Omnea QA environment
    └── https://api-prod.omnea.co     ← Special unauthenticated request-forms endpoint
```

**Key architectural decisions:**

- **No backend.** The decision to keep this fully client-side was intentional: the app needed to be deployed quickly by a small team with no backend infrastructure. All secrets are baked into the Vite bundle at build time — see §15 for how this must be addressed for a Wise deployment.

- **No global state library.** State is managed entirely with React's `useState` and `useMemo`. `@tanstack/react-query` is installed (from the template boilerplate) but is not used for any data fetching — all fetches are manual `useEffect` + `useState` patterns.

- **CSV as the persistence layer.** The four workflow-metadata CSV files are the app's "database" for workflow configuration data. They live in `public/doc/` and are served as static assets. In development, a Vite middleware endpoint (`/__local_api/save-csv`) allows the app to write changes back to disk. In production, edits can only be exported and manually committed.

- **Environment switching in the browser.** The QA/Production environment toggle stores the active environment in `localStorage` and re-authenticates on demand. This allows switching between Omnea's two environments without re-deploying the app.

---

## 3. Tech Stack

| Category | Library | Version | Why chosen |
|---|---|---|---|
| Framework | React | 18.3.1 | Standard at Wise; hooks-based patterns throughout |
| Language | TypeScript | 5.8 | Full strict-mode types on all files |
| Build tool | Vite + SWC | 5.4 | Fast HMR; custom Vite plugin for local CSV save API |
| Router | react-router-dom | 6.30 | Declarative route tree; `<Outlet>` for nested layouts |
| UI components | shadcn/ui (Radix UI) | latest | Accessible, unstyled primitives; all in `src/components/ui/` |
| Styling | Tailwind CSS | 3.4 | Utility-first; `cn()` from `tailwind-merge` + `clsx` |
| Notifications | sonner | 1.7 | Toast notifications for success/error feedback |
| Charts | recharts | 2.15 | Used in Risk Audit materiality breakdown |
| Forms | react-hook-form + zod | 7.61 / 3.25 | Form validation in Simulator import dialogs |
| Date | date-fns + react-day-picker | 3.6 / 8.10 | Date range picker in Prod→QA Clone, QA Cleanup |
| Testing | vitest + @testing-library/react | 3.2 / 16 | Unit test runner (test coverage is minimal currently) |

**Notable non-standard inclusions:**
- `lovable-tagger` — A Lovable.dev component-tagging library added by the template generator. It wraps components with data attributes in development. It has no runtime impact in production and can be removed safely.

---

## 4. Project Structure

```
tpm-tooling-app-12c26600/
│
├── .env                          # OAuth2 credentials — see §15 (security)
├── package.json
├── vite.config.ts                # Proxy config + local CSV save middleware
├── tailwind.config.ts
├── tsconfig.json / tsconfig.app.json / tsconfig.node.json
├── vitest.config.ts
├── components.json               # shadcn/ui CLI config
│
├── src/
│   ├── main.tsx                  # ReactDOM.createRoot() entry point
│   ├── App.tsx                   # All routes + providers
│   ├── index.css / App.css       # Tailwind base + global styles
│   │
│   ├── pages/                    # One file per route
│   │   ├── AuditPage.tsx
│   │   ├── SupplierRecordAuditPage.tsx
│   │   ├── MaterialityAuditPage.tsx
│   │   ├── BSPContactPage.tsx
│   │   ├── ProdToQAClonePage.tsx
│   │   ├── QACleanupPage.tsx
│   │   ├── FlowsMetadataConfigPage.tsx
│   │   ├── FlowsMetadataViewPage.tsx
│   │   ├── LogicHelperPage.tsx
│   │   ├── OmneaAPIPage.tsx
│   │   ├── SimulatorPage.tsx
│   │   ├── NotFound.tsx
│   │   └── [legacy pages not in router — see §5]
│   │
│   ├── components/
│   │   ├── AppLayout.tsx         # Root layout: sidebar + header + Outlet; env toggle hidden on /tools/qa-cleanup
│   │   ├── AppSidebar.tsx        # Navigation sidebar
│   │   ├── PageErrorBoundary.tsx # React error boundary wrapping every route
│   │   ├── NavLink.tsx           # react-router NavLink with active styles
│   │   ├── OmneaEnvironmentProvider.tsx  # Env context + toggle
│   │   ├── omnea-environment-context.ts  # Context object definition
│   │   ├── StatusPill.tsx        # Colored classification badge
│   │   ├── CollapsibleSection.tsx # Accordion card section
│   │   ├── CSVUploader.tsx       # Drag-and-drop CSV file uploader
│   │   ├── CSVExportModal.tsx    # Column-select CSV download modal
│   │   ├── OmneaEndpointDetail.tsx       # API Explorer right panel + CSV lookup
│   │   ├── OmneaAPIResponseSection.tsx   # JSON / table response display
│   │   ├── OmneaRequestsSection.tsx      # Request-form data display
│   │   ├── MaterialityChecklist.tsx      # Materiality criteria display
│   │   ├── AddressSplitter.tsx           # Address parser demo
│   │   └── ui/                   # shadcn/ui primitives (30+ files)
│   │
│   ├── lib/
│   │   ├── utils.ts              # cn() className utility
│   │   ├── omnea-environment.ts  # Env config, localStorage read/write
│   │   ├── omnea-api-utils.ts    # Auth, fetch, pagination, batch helpers; Workato feature flag
│   │   ├── workato-api-utils.ts  # Workato proxy request layer (Sprint 1 — stubs active)
│   │   ├── auth.ts               # Wise SSO PKCE flow (Sprint 3 — stubs active)
│   │   ├── config-storage.ts     # Config CRUD: localStorage (local) / Workato (prod) (Sprint 6 — stubs active)
│   │   ├── api-contract-data.ts  # Static catalogue of all Omnea endpoints
│   │   ├── flows-metadata-types.ts       # TypeScript interfaces for CSV data
│   │   ├── flows-metadata-utils.ts       # CSV parse/export/transform suite
│   │   ├── materiality-rules.ts  # CSV-driven materiality classification engine
│   │   ├── simulator-data.ts     # Types and constants for Simulator
│   │   ├── simulator-executor.ts # 4-step API execution engine for Simulator
│   │   ├── csv-export-utils.ts   # Generic CSV flatten + download helpers
│   │   ├── address-utils.ts      # Address string parser
│   │   ├── mock-data.ts          # Static field mapping reference data
│   │   ├── store.ts              # Mock supplier/profile data for BSP Contact
│   │   └── audit-data.ts         # Demo data for audit pages
│   │
│   ├── features/
│   │   └── audit/
│   │       └── materiality/      # Materiality Audit sub-system
│   │           ├── components/   # MaterialityAuditPage sub-components
│   │           └── lib/
│   │               ├── tagRuleEngine.ts      # Tag derivation from Q&A answers
│   │               └── [other materiality helpers]
│   │
│   └── hooks/                    # (empty / minimal — no custom hooks yet)
│
├── public/
│   └── doc/                      # Static CSV files served as assets
│       ├── Omnea Flow Meta Data.csv
│       ├── Omnea Tag Meta data.csv
│       ├── Omnea Logic and Condition.csv
│       ├── Omnea Block Structure.csv
│       ├── Materiality Logic.csv
│       ├── supplier_request_mapping.csv
│       ├── form template.csv
│       ├── suppliers-export.csv
│       └── [others — see §9]
│
├── scripts/                      # Build/release automation
│   └── release.sh
│
└── claude-docs/                  # LLM context files for doc generation
```

---

## 5. Routing

All routes are defined in `src/App.tsx`. All authenticated routes are nested under `<AppLayout>`, which renders the sidebar and header.

```
/                                     → redirect to /tools/audit
│
└── AppLayout (sidebar + header)
    ├── /tools/audit                  → AuditPage
    ├── /tools/audit/supplier-record  → SupplierRecordAuditPage
    ├── /tools/audit/materiality      → MaterialityAuditPage
    ├── /tools/bsp-contact            → BSPContactPage
    ├── /tools/prod-to-qa-clone       → ProdToQAClonePage
    ├── /tools/qa-cleanup             → QACleanupPage
    ├── /flows-metadata/configuration → FlowsMetadataConfigPage
    ├── /flows-metadata/view          → FlowsMetadataViewPage
    ├── /flows-metadata/logic-helper  → LogicHelperPage
    ├── /omnea-api                    → OmneaAPIPage
    └── /simulator                    → SimulatorPage

*                                     → NotFound (404)
```

**Legacy / unused routes:** The following 11 page files that were previously dead code in `src/pages/` have been deleted as part of Sprint 7 cleanup: `Index.tsx`, `DashboardOverview.tsx`, `SuppliersPage.tsx`, `ProfilesPage.tsx`, `BankDetailsPage.tsx`, `FieldMappingPage.tsx`, `GovernancePage.tsx`, `SimulationPage.tsx`, `BCIntegrationPage.tsx`, `AuditAddSupplier.tsx`, `APIContractPage.tsx`.

---

## 6. Pages and Features

### 6.1 Risk Audit (`/tools/audit`)

**Purpose:** The primary audit tool. Fetches all Omnea suppliers, cross-references them against an uploaded request CSV, applies the materiality classification engine, and flags suppliers whose declared materiality level does not match the expected classification.

**Why built this way:** Omnea stores a `materialityLevel` tag per supplier, but the rules that determine that level are not enforced by Omnea itself. The TPM team needed a way to verify that every supplier's materiality classification was correct given the data in the system. A CSV-backed rules engine was chosen so the TPM team can update rules without a code deploy.

**Data flow:**
1. On mount: fetch all suppliers via `fetchAllOmneaPages("/v1/suppliers")` — cursor-paginated, loads up to 100,000 pages of 100 records
2. For each supplier, optionally fetch detail (`GET /v1/suppliers/:id`) — runs up to 80 concurrent requests using a semaphore pattern
3. User uploads a requests CSV — parsed client-side
4. `classifySupplier()` from `lib/materiality-rules.ts` is called per supplier using the combined supplier + request data
5. Results rendered in a filterable table with a recharts pie chart summary

**Custom materiality logic:** A user can replace the default `Materiality Logic.csv` with a custom CSV stored in `localStorage["audit-materiality-logic-csv"]`. A modal shows the parsed rule groups.

**Supplier tags import:** Users can upload a separate supplier export CSV to augment tag data for suppliers returned by the API (useful when the API doesn't return tags in list responses).

---

### 6.2 Supplier Record Audit (`/tools/audit/supplier-record`)

**Purpose:** Compares specific supplier profile fields (name, description, website, entity type, address, last assessment date) to the values captured in the request form at intake time. Surfaces field-by-field mismatches and allows one-click correction.

**Why built this way:** Suppliers are created at intake time, but the data entered in the request form and the data eventually stored on the supplier record can drift. This tool automates detection of that drift without requiring manual field-by-field comparison.

**Data flow:**
1. Fetch all suppliers + their individual detail records (up to 60 concurrent)
2. User uploads requests CSV
3. Load `supplier_request_mapping.csv` from `public/doc/` — defines which request CSV column maps to which supplier API field
4. For each matched supplier, diff each mapped field
5. Mismatch rows show a "Fix" button that calls `PATCH /v1/suppliers/:id` with the request value

**Field mapping:** The mapping CSV (`supplier_request_mapping.csv`) defines the relationship between request CSV columns and supplier API fields. The team can update this CSV to add new field comparisons.

---

### 6.3 Materiality Audit — Structured (`/tools/audit/materiality`)

**Purpose:** A more structured version of the materiality audit that derives expected tags from question answers and compares them to the tags actually stored on the supplier.

**Why built this way:** The Risk Audit classifies based on static rules. This tool works bottom-up: given what a supplier answered in their intake questionnaire, what tags _should_ they have? This detects cases where a supplier gave answers that should have triggered a tag (e.g., "Safeguarding = TRUE") but the tag was never applied in Omnea.

**Data flow:**
1. Fetch all suppliers from Omnea
2. User uploads a request steps CSV (all question answers per request)
3. `tagRuleEngine.ts` (`features/audit/materiality/lib/`) evaluates each `TAG_DEFINITIONS` entry per supplier's question answers
4. Derived tags compared to actual tags from the API
5. Discrepancies shown per supplier with tag-level diff

---

### 6.4 BSP Internal Contact Assignment (`/tools/bsp-contact`)

**Purpose:** Manage the assignment of internal contact roles to suppliers — budget-holder, business-owner, IT-owner, and other.

**Why built this way:** Omnea's UI requires navigating to each supplier individually to manage contacts. With dozens of suppliers needing contact updates after org changes, a bulk management interface was needed.

**Data flow:**
1. Uses a `mockSuppliers` list from `lib/store.ts` as seed data (this is not a full API load — it targets specific known suppliers)
2. For each supplier: `GET /v1/suppliers/:id/internal-contacts`
3. Edits staged in local state, then saved via `POST /v1/suppliers/:id/internal-contacts/batch`

---

### 6.5 Prod → QA Supplier Clone (`/tools/prod-to-qa-clone`)

**Purpose:** Copy suppliers and all associated data (profiles, internal contacts) from the Production Omnea environment to the QA environment.

**Why built this way:** QA testing requires realistic supplier data. Rather than creating synthetic test data, the team clones real production suppliers. The tool handles the entire process: preflight duplicate check, sequential creation, and per-entity status tracking.

**Data flow:**
1. User selects a date range → `GET /v1/suppliers` on **Production** with date filter
2. Preflight: `GET /v1/suppliers` on **QA** to detect name duplicates
3. Per supplier on prod: fetch profiles (`GET /v1/suppliers/:id/profiles`) and internal contacts (`GET /v1/suppliers/:id/internal-contacts`)
4. On QA: create supplier (`POST /v1/suppliers/batch`), create profiles (`POST /v1/suppliers/:id/profiles/batch`), create contacts (`POST /v1/suppliers/:id/internal-contacts/batch`)
5. `authEnvironment` is set explicitly per call — `"production"` for source, `"qa"` for destination — so both envs are used simultaneously regardless of the global toggle

---

### 6.6 QA Cleanup (`/tools/qa-cleanup`)

**Purpose:** Browse and bulk-delete suppliers and their associated resources in the QA environment.

**Why built this way:** QA accumulates stale suppliers from clone operations and test runs. Deleting them one by one through Omnea's UI is impractical. This tool adds multi-select batch deletion.

**Data flow:**
1. Fetch all QA suppliers with `fetchAllOmneaPages`
2. Per selected supplier: delete internal contacts, bank accounts, profiles, then the supplier itself (order matters — Omnea rejects deletion of a supplier with active profiles)
3. The page is explicitly scoped to QA only — it does not allow switching to Production while on this page (enforced by the environment context)

---

### 6.7 Omnea API Explorer (`/omnea-api`)

**Purpose:** A developer-facing tool for exploring, testing, and debugging Omnea API endpoints. Think of it as an embedded Postman scoped to the Omnea API with pre-filled endpoint definitions.

**Why built this way:** The Omnea API documentation is not always current, and endpoint behavior is often unclear. A tool that lets the team fire real requests with real credentials against real data, without leaving the browser, accelerated integration work significantly.

**Key sub-features:**

- **Endpoint browser:** `lib/api-contract-data.ts` defines ~50 endpoints across 10 collections (Authentication, Suppliers, Supplier Maintenance, Supplier Profile, Bank Account, Subsidiaries, Currencies, Departments, Custom Data, Request). Each entry defines the method, path, path parameters, query parameters, and request body schema.
- **Live execution:** Calls `makeOmneaRequest()` with the selected env credentials. Response shown as JSON or auto-detected table.
- **CSV Supplier Lookup:** Upload a CSV of supplier names; the tool fetches all Omnea suppliers and fuzzy-matches each CSV row against the full supplier list. Results are split into three groups: 100% match, partial match (≥72%), not found. If a supplier is not found in Omnea, the tool cross-references against an optional "ongoing requests" CSV. See §13.1 for the matching algorithm.
- **Request Form Viewer:** Enter a request UUID; the tool fetches `https://api-prod.omnea.co/requests/request-forms/:id` (an unauthenticated endpoint — see security note in §15.6) and renders all form steps and answers.

---

### 6.8 BC Vendor Simulator (`/simulator`)

**Purpose:** Batch-create Omnea suppliers, profiles, and bank accounts from a Business Central vendor export CSV.

**Why built this way:** The BC → Omnea migration involves creating hundreds of vendor records. Each record requires a 4-call API sequence. Doing this manually or via one-off scripts is error-prone; the Simulator provides a UI with per-row, per-step status tracking and a downloadable audit log.

**CSV format:** The tool accepts a specific column schema. Required columns: `legal_name`, `bc_vendor_no`, `subsidiary_name`, `country_iso2`. Optional columns cover registration numbers, website, entity type, address parts, bank details (IBAN, SWIFT, sort code), etc. Column definitions are in `lib/simulator-data.ts` (`CSV_REQUIRED_COLUMNS`, `CSV_OPTIONAL_COLUMNS`).

**Execution flow:**
1. CSV parsed and validated; each row classified as CREATE / UPDATE / SKIP / UNKNOWN intent
2. Preview table shows intent badges per row
3. On "Run": `executeRow()` from `lib/simulator-executor.ts` is called per row in controlled concurrency
4. Each row runs 4 sequential steps with real-time UI feedback
5. Full audit log downloadable as CSV on completion

See §13.4 for the 4-step execution detail.

---

### 6.9 Flows Metadata Configuration (`/flows-metadata/configuration`)

**Purpose:** Edit and maintain the four workflow-metadata CSV files:
- `Omnea Flow Meta Data.csv` — full workflow structure (blocks, forms, sections, questions)
- `Omnea Tag Meta data.csv` — tag-to-condition mappings
- `Omnea Logic and Condition.csv` — extracted named logic conditions
- `Omnea Block Structure.csv` — block routing and milestone graph

**Why built this way:** See `public/doc/wiki-workflow-metadata-current-implementation.md` for the full rationale. In summary: Omnea has no API endpoint that exposes workflow structure, so the team maintains it manually. This page provides a structured editor rather than requiring direct CSV editing.

**Key operations:**
- **Inline cell editing** on all four tables
- **Import from template CSV** — two-step wizard: choose block metadata → choose form name mappings; uses `buildFlowMetadataFromTemplateCSV()` to convert form template CSVs into `FlowMetadata` rows
- **Import tag via JSON** — paste an Omnea admin JSON export; `parseTagImportJSON()` extracts the tag name and condition
- **Import logic condition via JSON** — paste a condition blob; enriched with computed fields (operator types, condition count, action type)
- **Save to workspace** — in development, calls `POST /__local_api/save-csv` to write back to disk; in production, prompts download only
- **Column resizing** — column widths are drag-resizable and persisted in localStorage

---

### 6.10 Flows Metadata View (`/flows-metadata/view`)

**Purpose:** Read-only searchable, filterable, drill-down view of the loaded Flow Metadata.

**Why built this way:** The TPM team regularly needs to answer questions like "which questions in this workflow capture core data?" or "what logic condition governs this form section?" The view page provides an interactive explorer across the ~3,500-row metadata table without requiring the user to open a spreadsheet.

**Key features:**
- Four-panel card layout (Block Structure, Form Structure, Question Structure, Data Mapping)
- Every card value is a clickable filter toggle
- Toolbar dropdowns for Workflow, Block Type, Form, Assignees with scoped options (e.g. Block Type options narrow based on selected Workflow)
- Free-text search across all fields
- Full metadata table with grouping headers and clickable cell filters
- **Tags hover card** — on hover over a tag name, shows the tag conditions parsed into a table with AND/OR connector badges
- **Logic condition modal** — clicking a block/form/question logic condition opens a dialog with two tabs:
  - *Logic tree*: recursive `LogicNodeTree` component rendering the full condition tree
  - *Table*: flat or grouped (for Block Logic Condition) rendering using `extractTagConditionReferences()`; nested AND/OR groups are shown as highlighted card blocks

---

### 6.11 Logic Helper (`/flows-metadata/logic-helper`)

**Purpose:** Paste a raw Omnea logic condition JSON blob and get a human-readable breakdown with resolved question references.

**Why built this way:** Logic conditions are stored as escaped JSON strings in the CSV. Reading them raw is impractical. The Logic Helper parses the tree, resolves `questionId` references against the loaded metadata, and produces a summary table — useful when debugging why a form section or block is being skipped.

---

## 7. Components

### 7.1 AppLayout (`src/components/AppLayout.tsx`)

The root layout component. Renders inside every route. Contains:
- The `<AppSidebar>` (left nav)
- A sticky top header with: page title area, the QA/Production environment toggle (`Switch` component), and a confirmation dialog that fires when switching to Production (to prevent accidental mutations on live data)
- `<Outlet>` — where the active page renders

**Environment toggle:** Clicking the switch calls `setOmneaEnvironment()` which writes to `localStorage` and dispatches a `omnea-environment-changed` CustomEvent. All components consuming the context re-render with the new `apiBaseUrl` and credentials.

### 7.2 OmneaEnvironmentProvider (`src/components/OmneaEnvironmentProvider.tsx`)

React context provider that:
- Reads the initial environment from `localStorage["omnea-environment"]` (defaults to `"qa"`)
- Provides `{ environment, label, apiBaseUrl, clientId, clientSecret, setEnvironment }` to all descendants via `OmneaEnvironmentContext`
- Listens for the `omnea-environment-changed` window event and re-reads localStorage to sync state across components that may have triggered the change

The credential values (`clientId`, `clientSecret`) come directly from `import.meta.env.VITE_OMNEA_CLIENT_ID` etc. — they are baked into the bundle at build time.

### 7.3 OmneaEndpointDetail (`src/components/OmneaEndpointDetail.tsx`)

The most complex component in the app. Manages the right-hand panel of the API Explorer. Responsibilities:
- Renders input fields (path params, query params, request body) for the selected endpoint
- Executes the request via `makeOmneaRequest()`
- Houses the entire CSV Supplier Lookup sub-feature (file upload, fuzzy matching, ongoing-requests fallback, progress tracking, three result tables)
- Houses the Request Form Viewer sub-feature

See §13.1 for the fuzzy matching algorithm detail.

### 7.4 CSVUploader (`src/components/CSVUploader.tsx`)

Drag-and-drop + click-to-browse CSV uploader. Automatically:
- Detects encoding via `FileReader.readAsText()`
- Attempts to auto-map well-known column name patterns: `name/legal` → `name`, `tax/vat` → `vatNumber`, `address` → `address`
- Shows a preview table of the first few rows
- Fires `onFileLoaded(headers: string[], rows: Record<string, string>[])` callback

### 7.5 CollapsibleSection (`src/components/CollapsibleSection.tsx`)

Accordion card section with a title, optional count badge, and a chevron that toggles collapsed state. Used throughout the Flows Metadata View page to house card groups.

---

## 8. Library and Business Logic

### 8.1 `lib/omnea-api-utils.ts` — Core API Client

The central module for all Omnea API communication.

**Workato proxy feature flag (Sprint 1 — implemented):**

The top of `makeOmneaRequest` checks `VITE_USE_WORKATO_PROXY`. When `true`, all calls are delegated to `makeWorkatoRequest` in `workato-api-utils.ts` before any OAuth2 logic runs. When `false` (local dev default), the full direct-to-Omnea path below executes unchanged. This means the existing OAuth2 code is kept intact for local development — the security fix in production is achieved by `VITE_OMNEA_CLIENT_SECRET` being absent from the build, not by deleting the code.

**`getAccessTokenForConfig(config)`**
- Checks the module-level `cachedTokens` Map (keyed `"${env}:${clientId}"`); if a valid token exists and won't expire within 60 seconds, returns it
- Otherwise: POSTs to `{authUrl}/oauth2/token` with `client_credentials` grant and `scope: "public-api/read public-api/write"`
- Stores the response in the cache with `expiresAt = now + expiresIn - 60` seconds
- Called before every authenticated API request

**`makeOmneaRequest(path, options)`**
- Attaches `Authorization: Bearer {token}` header
- Sets a 30-second `AbortController` timeout
- In dev mode, prepends `/api` to the path so Vite proxy rewrites it to `https://api.omnea.co`
- In production, uses the `apiBaseUrl` from the environment config directly

**`fetchAllOmneaPages(basePath, options)`**
- Handles cursor-based pagination across multiple response formats: `nextCursor`, `next_cursor`, `links.next`, `meta.pageToken`
- Default `limit=100`, max 1,000 pages (100,000 records)
- Supports an `onProgress` callback for live count updates
- Returns all accumulated records as a flat array

**`fetchAllInternalContacts(supplierId, env)`**
Specialized paginator for internal contacts.

**`createSupplierProfilesBatch(supplierId, profiles, env)`** / **`createInternalContactsBatch()`**
Batch creation helpers used by ProdToQAClonePage.

### 8.2 `lib/materiality-rules.ts` — Classification Engine

A CSV-driven rules engine. The `Materiality Logic.csv` file defines rule groups:

| Column | Meaning |
|---|---|
| `classification` | `Material`, `Non-Material`, `Standard`, `Unclassified` |
| `group` | Groups within a classification are OR-ed; rules within a group are AND-ed |
| `source` | `supplier` or `request` — where to look for the field value |
| `field` | The field path on the supplier object or the request CSV column name |
| `operator` | `equals`, `contains`, `in`, `contains_any` |
| `value` | The comparison value; `in` uses pipe-delimited options |

**Classification priority:** Material → Non-Material → Standard → Unclassified. The first classification whose rules match wins.

**`classifySupplier(supplier, requests, rules)`:** Returns `{ classification, matchedGroup, explanation }`. The explanation lists which rules matched, used for the audit detail modal.

### 8.3 `lib/flows-metadata-utils.ts` — CSV Suite

**Parsing functions** (all use a custom RFC 4180 compliant CSV parser, not a library):
- `parseFlowsMetadataCSV(text)` → `FlowMetadata[]`
- `parseFlowTagsCSV(text)` → `FlowTag[]`
- `parseFlowLogicConditionsCSV(text)` → `FlowLogicCondition[]`
- `parseFlowBlockStructureCSV(text)` → `FlowBlockStructure[]`

**Why custom CSV parser?** The embedded logic condition JSON strings contain commas and newlines that break standard CSV parsers. The custom parser (`parseCSVLine()`) correctly handles RFC 4180 quoting — a `"` toggles the `inQuotes` state; doubled `""` inside quotes emits a literal `"`.

**`saveCSVToWorkspace(filename, csvText)`:**
POSTs to `POST /__local_api/save-csv` (development Vite middleware). In production, this call will 404 and the UI should fall back to download-only. **Important for deployment:** this endpoint is not available in a production build.

**`buildFlowMetadataFromTemplateCSV(templateText, blockContext, formName)`:**
Converts a form template CSV (question list) into `FlowMetadata` rows by injecting the block metadata from the import wizard's Step 1.

### 8.4 `lib/simulator-data.ts` + `lib/simulator-executor.ts`

**Types defined in `simulator-data.ts`:**
- `SupplierInput` — the parsed and validated representation of a single CSV row
- `SimStep` — one step in the 4-step execution sequence per supplier (`{ label, status, request, response, error }`)
- `RowIntent` — `CREATE | UPDATE | SKIP | UNKNOWN` classification of a CSV row's intended operation
- `CSV_REQUIRED_COLUMNS` / `CSV_OPTIONAL_COLUMNS` — the column contract for uploaded CSVs

**`executeRow()` in `simulator-executor.ts`:**
Runs the 4-step sequence for a single supplier row. Each step calls `onStepUpdate(stepIndex, partialStep)` to allow the UI to update in real time without waiting for the full row to complete:
1. Duplicate check via `GET /v1/suppliers?limit=100&search=...`
2. Create supplier via `POST /v1/suppliers/batch`
3. Create profile via `POST /v1/suppliers/:id/profiles`
4. Create bank account via `POST /v1/suppliers/:id/profiles/:profileId/bank-accounts`

On any step failure, all remaining steps are marked `skipped`.

### 8.5 `lib/omnea-environment.ts`

Thin wrapper over localStorage for environment persistence:
- `getOmneaEnvironment()` → `"qa" | "production"`
- `setOmneaEnvironment(env)` → writes to localStorage, dispatches `omnea-environment-changed` event
- `getOmneaEnvironmentConfig(env)` → returns `{ apiBaseUrl, authUrl, clientId, clientSecret }` using `import.meta.env.*` values

---

## 9. Data Sources

### 9.1 Live API Data

All API-backed pages fetch data from `https://api.omnea.co` (or `https://api-qa.omnea.co` for QA operations). See §10 for the full endpoint list.

### 9.2 Static CSV Files (`public/doc/`)

| File | Used by | Description |
|---|---|---|
| `Omnea Flow Meta Data.csv` | FlowsMetadataViewPage, FlowsMetadataConfigPage, LogicHelperPage, MaterialityAuditPage | Master workflow structure (~3,500 rows) |
| `Omnea Tag Meta data.csv` | FlowsMetadataViewPage, FlowsMetadataConfigPage | Tag rules per workflow (~40 rows) |
| `Omnea Logic and Condition.csv` | FlowsMetadataConfigPage | Extracted named logic conditions |
| `Omnea Block Structure.csv` | FlowsMetadataConfigPage | Block routing graph |
| `Materiality Logic.csv` | AuditPage | Classification rules (~50 rows) |
| `supplier_request_mapping.csv` | SupplierRecordAuditPage | Field mapping: request column → supplier field |
| `form template.csv` | FlowsMetadataConfigPage | Reference form template for import wizard |
| `suppliers-export.csv` | AuditPage (sample), OmneaAPIPage | Sample supplier export for column reference |

### 9.3 User-Uploaded CSVs

Several pages accept user-uploaded CSV files that are parsed entirely client-side and never sent to any server:
- `AuditPage` — supplier tags override CSV, requests CSV
- `SupplierRecordAuditPage` — requests CSV
- `MaterialityAuditPage` — request steps CSV
- `SimulatorPage` — BC vendor migration CSV
- `OmneaEndpointDetail` (within API Explorer) — supplier names CSV, ongoing requests CSV

### 9.4 localStorage

| Key | Contents | Used by |
|---|---|---|
| `omnea-environment` | `"qa"` or `"production"` | All pages via OmneaEnvironmentProvider |
| `audit-materiality-logic-csv` | User's custom materiality rules CSV text | AuditPage |
| `omnea_flow_metadata_v1` | Flow metadata rows (JSON) | FlowsMetadataConfigPage |
| `omnea_tags_v1` | Tag rows (JSON) | FlowsMetadataConfigPage |
| `omnea_logic_conditions_v1` | Logic condition rows (JSON) | FlowsMetadataConfigPage |
| `omnea_block_structure_v1` | Block structure rows (JSON) | FlowsMetadataConfigPage |
| `omnea_edit_columns_width_v1` | Column width preferences (JSON) | FlowsMetadataConfigPage |
| `omnea_tag_columns_width_v1` | Column width preferences (JSON) | FlowsMetadataConfigPage |
| `omnea_logic_columns_width_v1` | Column width preferences (JSON) | FlowsMetadataConfigPage |

---

## 10. API Integration

### 10.1 Base URLs

| Environment | API Base URL | Auth URL |
|---|---|---|
| QA | `https://api-qa.omnea.co` | `https://auth-qa.omnea.co` |
| Production | `https://api.omnea.co` | `https://auth.omnea.co` |

### 10.2 Endpoints Used

| Method | Path | Used by |
|---|---|---|
| `POST` | `/oauth2/token` | All authenticated pages (via `getAccessTokenForConfig`) |
| `GET` | `/v1/suppliers` | AuditPage, SupplierRecordAuditPage, MaterialityAuditPage, BSPContactPage, ProdToQAClonePage, QACleanupPage, SimulatorPage |
| `GET` | `/v1/suppliers/:id` | AuditPage (detail), SupplierRecordAuditPage (detail) |
| `POST` | `/v1/suppliers/batch` | SimulatorPage, OmneaEndpointDetail |
| `PATCH` | `/v1/suppliers/:id` | SupplierRecordAuditPage (apply fix) |
| `DELETE` | `/v1/suppliers/:id` | QACleanupPage |
| `GET` | `/v1/suppliers/:id/profiles` | ProdToQAClonePage |
| `POST` | `/v1/suppliers/:id/profiles` | SimulatorPage |
| `POST` | `/v1/suppliers/:id/profiles/batch` | ProdToQAClonePage |
| `DELETE` | `/v1/suppliers/:id/profiles/:id` | QACleanupPage |
| `POST` | `/v1/suppliers/:id/profiles/:id/bank-accounts` | SimulatorPage |
| `DELETE` | `/v1/suppliers/:id/profiles/:id/bank-accounts/:id` | QACleanupPage |
| `GET` | `/v1/suppliers/:id/internal-contacts` | BSPContactPage, ProdToQAClonePage |
| `POST` | `/v1/suppliers/:id/internal-contacts/batch` | BSPContactPage, ProdToQAClonePage |
| `DELETE` | `/v1/suppliers/:id/internal-contacts/:id` | QACleanupPage |
| `GET` | `/v1/subsidiaries` | LogicHelperPage, SimulatorPage |
| `GET` | `/v1/suppliers/:id/products-services` | ProdToQAClonePage |
| `GET` | `https://api-prod.omnea.co/requests/request-forms/:id` | OmneaAPIPage (unauthenticated, hardcoded prod) |

### 10.3 Concurrency Patterns

Several pages make a large number of API calls simultaneously. Two patterns are used:

**Semi-controlled concurrency (AuditPage — 80 concurrent):**
```typescript
// Supplier detail enrichment in AuditPage
const CONCURRENT_REQUESTS = 80;
const chunks = chunkArray(supplierIds, CONCURRENT_REQUESTS);
for (const chunk of chunks) {
  await Promise.all(chunk.map(id => fetchSupplierDetail(id)));
}
```

**Batch-all (SupplierRecordAuditPage — 60 concurrent):**
Similar chunked pattern with 60 concurrency.

These numbers were tuned empirically to balance speed against Omnea's rate limiting. No formal rate limit documentation from Omnea is available.

---

## 11. Authentication

### 11.1 Current State — Two Modes

Authentication now operates in one of two modes controlled by feature flags:

**Local development (no SSO configured):**
`VITE_DEV_BYPASS_AUTH=true` **or** `VITE_WISE_AUTH_URL` absent → `main.tsx` mounts the app immediately, skipping all SSO logic. The app authenticates to Omnea directly via OAuth2 client credentials (see §11.2).

**Production (SSO configured, Sprint 3 stubs active):**
`VITE_WISE_AUTH_URL` is present → `main.tsx` dynamically imports `auth.ts` and enforces the PKCE flow before mounting. The code is fully implemented and ready; it requires a live Wise OIDC application registration to activate (see `WORKATO_MIGRATION_PLAN.md` Sprint 3).

```typescript
// src/main.tsx — actual implementation
const DEV_BYPASS =
  import.meta.env.VITE_DEV_BYPASS_AUTH === "true" ||
  !import.meta.env.VITE_WISE_AUTH_URL;

if (DEV_BYPASS) {
  mount();
} else {
  import("@/lib/auth").then(({ isAuthenticated, redirectToLogin, handleCallback }) => {
    const code = new URLSearchParams(window.location.search).get("code");
    const state = new URLSearchParams(window.location.search).get("state");
    if (code && state) { handleCallback(code, state).then(() => mount()); }
    else if (!isAuthenticated()) { redirectToLogin(); }
    else { mount(); }
  });
}
```

### 11.2 Omnea OAuth2 Client Credentials Flow (local dev)

```
Browser
  │
  ├─── POST {authUrl}/oauth2/token
  │        grant_type=client_credentials
  │        client_id={VITE_OMNEA_CLIENT_ID}
  │        client_secret={VITE_OMNEA_CLIENT_SECRET}
  │        scope=public-api/read public-api/write
  │
  └─── ← { access_token, expires_in, token_type }
           Stored in module-level Map, keyed by "env:clientId"
           Expires 60 seconds before actual expiry
```

Tokens are cached in a module-level `Map<string, CachedToken>` in `lib/omnea-api-utils.ts`. The cache is per-tab and per-session — not persisted to localStorage. **This path is only used when `VITE_USE_WORKATO_PROXY=false` (local dev).** In production the Omnea credentials are absent from the build and this path is unreachable.

### 11.3 Wise SSO PKCE Flow (production — stub implemented)

`src/lib/auth.ts` implements the full PKCE flow:
- `redirectToLogin()` — generates a PKCE verifier + challenge, stores them in `sessionStorage`, redirects to `{VITE_WISE_AUTH_URL}/v1/authorize`
- `handleCallback(code, state)` — validates state, exchanges the code for an access token, stores it in `sessionStorage["wise_session_token"]`
- `isAuthenticated()` — checks the token exists and has not expired

The Wise access token is passed to Workato as `Authorization: Bearer {token}` on every request. Workato validates it against Wise's JWKS endpoint (configured in Sprint 3 Workato setup).

**Required to activate:** `VITE_WISE_AUTH_URL`, `VITE_WISE_CLIENT_ID`, `VITE_WISE_REDIRECT_URI` set in the deployment environment, and the Workato API Group updated to use JWT Bearer authentication.

### 11.4 Credential Sources

| Variable | Used for | Present in |
|---|---|---|
| `VITE_OMNEA_CLIENT_ID` | Omnea QA OAuth2 `client_id` | Local `.env` only |
| `VITE_OMNEA_CLIENT_SECRET` | Omnea QA OAuth2 `client_secret` | Local `.env` only — never in production build |
| `VITE_OMNEA_CLIENT_ID_PROD` | Omnea Production OAuth2 `client_id` | Local `.env` only |
| `VITE_OMNEA_CLIENT_SECRET_PROD` | Omnea Production OAuth2 `client_secret` | Local `.env` only — never in production build |
| `VITE_OMNEA_AUTH_URL` | Omnea auth server base URL | Local `.env` only |
| `VITE_WISE_AUTH_URL` | Wise OIDC endpoint | CI/CD only (triggers SSO guard when set) |
| `VITE_WISE_CLIENT_ID` | Wise public OIDC client ID | CI/CD only (safe to bundle — no secret) |
| `VITE_WISE_REDIRECT_URI` | OAuth2 redirect URI | CI/CD only |
| `VITE_WORKATO_PROXY_URL_QA` | Workato QA proxy base URL | CI/CD only (or local when testing proxy) |
| `VITE_WORKATO_PROXY_URL_PROD` | Workato Production proxy base URL | CI/CD only |

---

## 12. State and Data Flow

### 12.1 State Management Approach

The app uses no global state library. Every page manages its own local state via `useState`. The only cross-component state is:
- **Environment** — React Context (`OmneaEnvironmentContext`) provided by `OmneaEnvironmentProvider`
- **Sidebar open/close state** — Managed by shadcn's `SidebarProvider`

### 12.2 Caching

**In-component API cache (supplier list):** Several pages use a `useRef` to cache the fetched supplier list for the session, keyed by environment:

```typescript
const supplierCacheRef = useRef<{
  env: string;
  data: OmneaSupplier[];
  fetchedAt: number;
} | null>(null);
// TTL: 10 minutes
```

**Token cache:** Module-level Map in `omnea-api-utils.ts`, persists for the tab session.

**No shared cache between pages:** Navigating between pages triggers fresh data fetches. There is no React Query cache being used despite the library being installed.

### 12.3 React Query (Unused)

`@tanstack/react-query` is installed and `QueryClientProvider` wraps the app in `main.tsx`, but no page or component calls `useQuery`, `useMutation`, or any React Query hooks. It is carried over from the project template and can be removed without any impact.

---

## 13. Key Algorithms

### 13.1 Fuzzy Supplier Matching (`OmneaEndpointDetail.tsx`)

Used when running the CSV Supplier Lookup in the API Explorer. Each CSV row (a supplier name) is matched against the full list of Omnea suppliers.

**Stage 1 — Levenshtein fuzzy score:**
```typescript
function fuzzyScore(query: string, candidate: string): number {
  // Normalise: lowercase, collapse whitespace
  // Returns editDistance-based score in [0, 1]
  // Exact match → 1.0
  // Substring containment → 0.92
  // Otherwise: (maxLen - editDistance) / maxLen
}
```

**Stage 2 — Word match F1 score:**
```typescript
function wordMatchScore(query: string, candidate: string, noiseSet: Set<string>): number {
  const qWords = getMeaningfulWords(query, noiseSet);  // ≥4 chars, not in noise set
  const cWords = getMeaningfulWords(candidate, noiseSet);
  if (qWords.length < 2 || cWords.length === 0) return 0;
  const matched = qWords.filter(w => cWords.includes(w)).length;
  if (matched < 2) return 0;
  const recall = matched / qWords.length;
  const precision = matched / cWords.length;
  const f1 = (2 * recall * precision) / (recall + precision);
  return f1 * 0.95;  // cap at 0.95 to keep below exact-match score
}
```

The F1 scoring prevents false positives from shared common words. For example, "PHIL. CLEARING HOUSE CORP." and "Singapore Clearing House Pte. Ltd." both share "CLEARING" and "HOUSE" — but F1 penalises low precision (many unmatched words on the candidate side), bringing the score to ~63%, below the 0.72 threshold.

**Combined score:**
```typescript
const score = Math.max(fuzzyScore(q, c), wordMatchScore(q, c, noiseSet));
```

**Noise words stripped before matching:**
`sa sl bv nv ag ab as plc llc llp ltd ltda srl pty inc corp gmbh spa aps limited incorporated corporation company group holdings international the and of for co services solutions`

**Threshold:** 0.72 — results below this score are placed in "Not Found".

**Results split into three groups:**
- **100% match** — score = 1.0
- **Partial match** — 0.72 ≤ score < 1.0
- **Not found in Omnea** — then cross-referenced against the optional ongoing-requests CSV (a 2-column CSV: Supplier, State); if a name-fuzzy match is found there, shown as "In Ongoing Requests"

### 13.2 Logic Condition Parsing (`FlowsMetadataViewPage.tsx`)

**`extractTagConditionReferences(rawCondition: string)`**

Extracts a flat list of `{ questionId, value, operator, connector? }` from either:
- A **plain text** condition string (e.g. `MainAssessmentQ33 EQUAL Yes AND question-6 NOT_EQUAL <uuid>`)
- An **Omnea logic condition JSON** blob

Plain text path: splits on `\s+(AND|OR)\s+` with a capturing group so odd-indexed parts are the connectors. Each segment is matched against a list of known operators.

JSON path: recursively walks the condition tree. Any node that has both an `operator` property and a `primaryField` object is treated as a leaf condition. The identifier is extracted from `primaryField.questionId`, `primaryField.value`, or `primaryField.source` (in that priority order). The parent group type (`AND`/`OR`) is threaded down as the `connector` for subsequent siblings.

**Why custom parser instead of a library?** The Omnea condition format is proprietary and has no public schema. The parser was built incrementally as new condition types were discovered in real data.

### 13.3 Materiality Classification (`lib/materiality-rules.ts`)

The rules engine evaluates groups of rules in priority order:

```
For each classification in [Material, Non-Material, Standard]:
  For each group in classification:
    If ALL rules in group match → classification found, stop
If no classification matched → Unclassified
```

**Rule evaluation:**
- `source: "supplier"` — reads the field from the Omnea supplier object (supports dot-notation paths and `tags[]` array membership)
- `source: "request"` — reads from the uploaded requests CSV; at least one matching request must satisfy all conditions in the group
- `operator: "in"` — pipe-delimited list, e.g. `"Material|High"` matches if the field value is either
- `operator: "contains_any"` — the field (typically a comma/pipe-delimited tags string) contains any of the pipe-delimited values

### 13.4 BC Vendor Simulator Execution (`lib/simulator-executor.ts`)

Four sequential steps per CSV row:

```
Step 1: Duplicate check
  GET /v1/suppliers?limit=100&search={legalName}
  → If found: mark intent UPDATE, skip Step 2, use existing supplierId

Step 2: Create supplier
  POST /v1/suppliers/batch
  Body: [{ legalName, registrationNumber, countryCode, ... }]
  → 409 / "already exist" treated as soft duplicate (same as found in Step 1)
  → Capture supplierId from response

Step 3: Create profile
  POST /v1/suppliers/{supplierId}/profiles
  Body: { subsidiaryId (or subsidiaryName), entityType, ... }
  → Capture profileId from response

Step 4: Create bank account
  POST /v1/suppliers/{supplierId}/profiles/{profileId}/bank-accounts
  Body: { iban, swiftCode, sortCode, ... }
  (omitted if no bank data in CSV row)
```

Each step calls `onStepUpdate(stepIndex, { status, request, response, error })` immediately after completion so the UI card updates without waiting for the full row.

---

## 14. Build and Dev Configuration

### 14.1 `vite.config.ts`

Key configuration:
- Dev server on port `8080`, host `::` (all interfaces)
- SWC plugin for fast TypeScript compilation
- `lovable-tagger` plugin in development (no production effect)
- Path alias: `@` → `./src`
- **Proxy:** `"/api"` → `"https://api.omnea.co"` — rewrites all `/api/*` paths to the Omnea API, bypassing browser CORS in development
- **Custom Vite middleware (`configureServer`):** Handles `POST /__local_api/save-csv` requests. Reads a JSON body `{ filename, content }`, validates the filename against an allowlist (`ALLOWED_CSV_FILES`), and writes the file to `public/doc/{filename}`. This middleware **only runs in the dev server** — it is not available in production builds.

```
ALLOWED_CSV_FILES:
  - Omnea Flow Meta Data.csv
  - Omnea Tag Meta data.csv
  - Omnea Logic and Condition.csv
  - Omnea Block Structure.csv
```

### 14.2 Build Output

`npm run build` produces a `dist/` directory with:
- `index.html`
- Static JS bundles (inlined with all `VITE_*` environment variables)
- `public/doc/*.csv` copied as-is

The output is a fully static site — no server-side rendering, no Node.js runtime required. Any static file server (nginx, S3 + CloudFront, etc.) can serve it.

### 14.3 Available Scripts

| Script | Command | Purpose |
|---|---|---|
| `dev` | `vite` | Start dev server on `:8080` |
| `build` | `tsc -b && vite build` | Type-check then bundle |
| `preview` | `vite preview` | Serve built `dist/` locally |
| `test` | `vitest` | Run unit tests |
| `lint` | `eslint .` | Lint check |

---

## 15. Security Assessment for Wise Deployment

This section identifies every security concern relevant to Wise's deployment approval process, with a severity rating and recommended remediation.

---

### 15.1 [CRITICAL] OAuth2 Client Secrets Baked Into the Frontend Bundle

**What:** Both QA and Production OAuth2 client secrets are stored in `.env` as `VITE_*` variables. Because Vite inlines all `VITE_*` variables into the JavaScript bundle as string literals, the secrets are readable by anyone who can load the built app in a browser (DevTools → Sources → search for the secret).

**Current `.env`:**
```
VITE_OMNEA_CLIENT_ID=...
VITE_OMNEA_CLIENT_SECRET=...
VITE_OMNEA_CLIENT_ID_PROD=...
VITE_OMNEA_CLIENT_SECRET_PROD=...
```

**Risk:** Any user of the app can extract the credentials and make arbitrary Omnea API calls as the service account — including reading all supplier data, creating/deleting suppliers in production, and accessing any other scope the credentials permit.

**Required remediation:** Introduce a lightweight backend proxy (e.g. a Node.js/Express service, a Cloudflare Worker, or an internal API Gateway) that:
1. Holds the client credentials as server-side environment variables (never sent to the browser)
2. Accepts authenticated requests from the frontend (e.g. short-lived session cookie or Wise SSO token)
3. Fetches an Omnea OAuth2 token server-side, attaches it, and forwards the request to the Omnea API
4. The frontend never receives the Omnea access token

---

### 15.2 [CRITICAL] `.env` File Committed to the Repository

**What:** The `.env` file containing both QA and Production credentials is committed to the git repository and tracked in version history.

**Risk:** Anyone with repository read access (past or present) has access to the credentials. Credentials must be considered compromised until rotated.

**Required remediation:**
1. Rotate both QA and Production client credentials with Omnea immediately
2. Remove `.env` from git history (`git filter-repo` or `BFG Repo Cleaner`)
3. Add `.env` to `.gitignore` (currently not present)
4. Store credentials in a secrets manager (Wise HashiCorp Vault, AWS Secrets Manager, etc.)

---

### 15.3 [HIGH] No Authentication on the Frontend Application Itself

**What:** The app has no login page, no session management, and no identity verification. Anyone who can reach the deployed URL can use the full app, including the Production environment tools that mutate live Omnea supplier data.

**Risk:** Unauthorised users can delete suppliers, clone data, assign internal contacts, or run batch operations on production data.

**Status (2026-04-26):** Frontend implementation complete — `src/lib/auth.ts` (PKCE flow) and `src/main.tsx` (auth guard) are implemented and ready. The guard activates automatically when `VITE_WISE_AUTH_URL` is present in the deployment environment. **Pending:** Wise OIDC application registration + Workato API Group JWT Bearer configuration (Sprint 3 Workato-side work).

**Required remaining:** Register the app in Wise's identity provider, configure `VITE_WISE_AUTH_URL`, `VITE_WISE_CLIENT_ID`, `VITE_WISE_REDIRECT_URI` in CI/CD, and update Workato API Groups to validate the JWT.

---

### 15.4 [HIGH] CORS — Direct Browser-to-API Calls in Production

**What:** In development, the Vite proxy avoids CORS by routing all `/api/*` requests through the dev server. In a production build, the browser makes requests directly to `https://api.omnea.co` from whatever origin the app is deployed on. If the Omnea API does not include the deployed origin in its `Access-Control-Allow-Origin` headers, all API calls will fail.

**Required remediation:**
- Confirm with Omnea that `https://api.omnea.co` allows CORS from the Wise deployment origin
- OR introduce a backend proxy (§15.1) that removes the need for CORS entirely

---

### 15.5 [HIGH] Destructive Operations Without Confirmation (QA Cleanup)

**What:** The QA Cleanup page allows bulk deletion of suppliers, profiles, bank accounts, and internal contacts. While the page is scoped to QA, the environment toggle is accessible in the header. A user on Production who navigates to the cleanup page could delete production data.

**Status (2026-04-26): Resolved in frontend.** Three controls implemented:
1. **Hard production block** — When `environment === "production"`, the entire page content is hidden and a red "QA Cleanup is locked in Production" screen is shown. The `hidden` CSS class is applied to all interactive content.
2. **Typed confirmation** — All three delete buttons (profiles, banks, contacts) now open a modal requiring the user to type `DELETE` (exact case) before the action can proceed. The confirm button is disabled until the phrase matches.
3. **Environment toggle hidden** — The QA/Production toggle in the header is hidden when the pathname is `/tools/qa-cleanup`, preventing environment switching while on this page.

A complementary server-side guard will be added in Workato (Sprint 4) to reject DELETE calls to the Production connection.

---

### 15.6 [MEDIUM] Unauthenticated Request to `api-prod.omnea.co`

**What:** In `OmneaAPIPage.tsx`, the Request Form Viewer tab calls `https://api-prod.omnea.co/requests/request-forms/:id` directly without any `Authorization` header. This endpoint is hardcoded to production and is unauthenticated.

**Risk:** If this endpoint returns sensitive request data without authentication (personal details, supplier information, financial data), it represents an information disclosure risk. The call also bypasses the environment switch — it always hits production regardless of the active environment.

**Required remediation:**
- Understand whether `requests/request-forms/:id` requires authentication (the team should verify this)
- If it returns sensitive data, add authentication
- If it must remain unauthenticated, document the business justification

---

### 15.7 [MEDIUM] localStorage Contains Business Configuration Data

**What:** The app stores workflow configuration data (tag rules, logic conditions, block structure) in localStorage. localStorage is:
- Device and browser-specific
- Accessible to any JavaScript executing on the same origin (XSS risk)
- Not encrypted

**Risk:** If the app is subject to XSS (e.g. via a malicious dependency), an attacker could exfiltrate the stored configuration. Additionally, a team member editing tags/logic on one machine will not see those edits on another machine.

**Assessment:** The data stored is internal configuration (not personal data, not credentials), so the risk is medium. However, the cross-device sync problem is a real operational limitation.

**Required remediation:**
- Move configuration storage from localStorage to a shared backend store (e.g. a small database or the Omnea API once it supports workflow metadata endpoints)
- As a minimum: document the localStorage limitation in team onboarding

---

### 15.8 [LOW] `/__local_api/save-csv` Dev Endpoint

**What:** The Vite development server exposes a `POST /__local_api/save-csv` endpoint that writes files to disk. This is implemented in `vite.config.ts`'s `configureServer` hook and does not exist in production builds.

**Assessment:** No risk in production — the endpoint is physically absent from the built output. In development, it only allows writing to four specific files (allowlist enforced). Low risk.

---

### 15.9 [LOW] `lovable-tagger` Development Dependency

**What:** `lovable-tagger` is a component-tagging library added by the Lovable.dev code generation tool. In production builds it is a no-op.

**Required action:** Audit the `lovable-tagger` package for any telemetry or data exfiltration. If the package pings a Lovable.dev endpoint in development, consider removing it.

---

### 15.10 [INFO] Content Security Policy

**What:** There is no `Content-Security-Policy` header configured. CSP would restrict which origins the app can connect to, reducing XSS impact.

**Recommended:** After the backend proxy is in place, add a strict CSP:
```
Content-Security-Policy:
  default-src 'self';
  connect-src 'self' https://api.omnea.co https://api-qa.omnea.co https://auth.omnea.co https://auth-qa.omnea.co;
  script-src 'self';
  style-src 'self' 'unsafe-inline';
```

---

### 15.11 [INFO] No Rate Limiting or Abuse Prevention

**What:** The app can issue hundreds of concurrent API calls (80 at a time for AuditPage detail enrichment). There is no debounce on manual API Explorer calls.

**Consideration:** Confirm with Omnea that their API has rate limiting in place and the app's concurrency settings are within acceptable thresholds. If the app is used by multiple simultaneous users, aggregate API load may exceed limits.

---

## 16. Known Limitations and Technical Debt

| Area | Issue | Status | Impact |
|---|---|---|---|
| **No backend** | OAuth2 secrets baked into the bundle | Proxy layer implemented (Sprint 1 ✅); Workato recipes pending | Critical until Workato is wired |
| **No auth** | Anyone with the URL can use the app | Auth code implemented (Sprint 3 ✅); Wise OIDC registration pending | Critical until OIDC is configured |
| **CSV as database** | ~3,500-row metadata CSV manually maintained | No change — CSV remains the source of truth | No automated sync; data drifts from actual Omnea state |
| **localStorage fragility** | Tags and logic conditions are browser/device-specific | `config-storage.ts` stub implemented (Sprint 6 ✅); Workato Data Tables pending | Edits made by one user are not seen by others |
| **React Query unused** | Installed but not used; all fetching is manual | No change | Technical debt; inconsistent data fetching patterns |
| **Legacy page files** | 11 unused page files in `src/pages/` | **Deleted** (Sprint 7 ✅) | Resolved |
| **`lovable-tagger`** | Template artefact with potential telemetry | Pending audit (Sprint 7) | Should be audited and removed |
| **No test coverage** | vitest is configured but tests are minimal | No change | Regressions undetected |
| **Committed `.env`** | Production credentials in git history | `.env` was already in `.gitignore`; git history scrub pending (Sprint 0) | Must be rotated and removed (§15.2) |
| **No error boundary** | Unhandled errors crash the whole page | **`PageErrorBoundary` wrapping all routes** (Sprint 7 ✅) | Resolved |
| **Hardcoded concurrency** | 80/60 concurrent requests tuned empirically | No change | May hit Omnea rate limits with large datasets |
| **No pagination in UI** | Some pages load all records into memory | No change | Memory pressure with very large datasets |
| **`api-prod.omnea.co` hardcode** | Request Form Viewer always hits production | Fix implemented in Workato recipe design (Sprint 2 — awaiting recipe deployment) | Bypasses environment toggle (§15.6) |
| **QA Cleanup safety** | Bulk deletes reachable from Production | **Hard block + typed confirmation + toggle hidden** (Sprint 5 ✅) | Resolved at frontend level |

---

## 17. Deployment Checklist

Before the application can be approved for hosting on Wise infrastructure, the following steps must be completed. Items marked ⛔ are blockers for security clearance.

### Security Blockers

- [ ] ⛔ **Rotate OAuth2 credentials.** The committed `.env` credentials (both QA and Production) must be treated as compromised and rotated with Omnea immediately.
- [ ] ⛔ **Remove `.env` from git history.** Use `git filter-repo` or `BFG Repo Cleaner` to scrub the file from all commits. `.env` is already in `.gitignore` — no new commits will include it.
- [ ] ⛔ **Deploy Workato proxy recipes.** `src/lib/workato-api-utils.ts` and the feature flag in `makeOmneaRequest` are implemented. Set `VITE_USE_WORKATO_PROXY=true` in CI/CD once Workato recipes are verified. See `WORKATO_MIGRATION_PLAN.md` Sprints 1–4.
- [ ] ⛔ **Activate Wise SSO.** `src/lib/auth.ts` and `src/main.tsx` auth guard are implemented. Set `VITE_WISE_AUTH_URL`, `VITE_WISE_CLIENT_ID`, `VITE_WISE_REDIRECT_URI` in CI/CD, and configure Workato API Groups to validate the JWT. See `WORKATO_MIGRATION_PLAN.md` Sprint 3.
- [ ] ⛔ **Confirm CORS configuration with Omnea** (or confirm it is no longer needed once Workato proxy is active — Workato calls Omnea server-side so CORS from the browser becomes irrelevant).

### Pre-Deployment

- [ ] **Route `api-prod.omnea.co` call through Workato** — `OmneaAPIPage.tsx` still calls the endpoint directly; fix is designed in `WORKATO_MIGRATION_PLAN.md` Sprint 2 (§15.6).
- [x] ~~**Lock QA Cleanup to QA environment**~~ — **Done.** Hard production block, typed `DELETE` confirmation, and env toggle hidden on `/tools/qa-cleanup` (§15.5).
- [ ] **Audit `lovable-tagger`** for any external telemetry; remove if not needed.
- [x] ~~**Add a `.gitignore` entry for `.env`**~~ — **Already present** in `.gitignore`.
- [ ] **Add a Content Security Policy header** to the web server or CDN configuration (§15.10).

### Infrastructure

- [ ] Configure static file serving (nginx, S3 + CloudFront, or equivalent). The build output in `dist/` is a pure static site.
- [ ] Ensure the `public/doc/` CSV files are included in the deployment (they are copied into `dist/` by the Vite build).
- [ ] The `/__local_api/save-csv` dev endpoint does not exist in production builds — no action needed, but document that CSV save-back only works locally.
- [ ] Set appropriate cache headers: HTML files should have `Cache-Control: no-cache`; JS/CSS bundles (content-hashed filenames) can have long cache TTLs.

### Post-Deployment

- [ ] Verify all 11 active routes load correctly in the production build.
- [ ] Test the environment toggle (QA → Production) with the new proxy configuration. Note: toggle is intentionally hidden on `/tools/qa-cleanup`.
- [ ] Confirm API concurrency settings do not trigger rate limiting at normal team usage volumes.
- [ ] Run a smoke test of the Simulator against QA environment (not Production) before enabling Production access.
- [x] ~~**React error boundaries**~~ — **Done.** All routes wrapped in `<PageErrorBoundary>` — page crashes are contained without taking down the whole app.
- [x] ~~**Delete legacy page files**~~ — **Done.** 11 unused pages removed.

---

*Document prepared by TPM Team — 2026-04-26. For questions: teddmabulay@gmail.com*
