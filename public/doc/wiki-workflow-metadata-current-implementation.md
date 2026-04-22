# Workflow Metadata — Current Implementation

**Document type:** Current state / as-built  
**Date:** 2026-04-21  
**Related document:** `wiki-workflow-metadata-api-request.md` — describes the API endpoints we are requesting from Omnea to replace this implementation.

---

## Overview

The TPM tooling app has two pages dedicated to Omnea workflow metadata:

| Route | Purpose |
|---|---|
| `/flows-metadata/view` | Read-only interactive explorer — filter, search and drill into workflow structure |
| `/flows-metadata/configuration` | Edit and maintain the metadata, tags, and logic conditions |

Both pages are powered entirely by **static CSV files** that are manually maintained. There is no live connection to Omnea for this data. This document describes how the data is structured, how each page works, and the exact data flow from file to screen.

---

## 1. Data Sources

Three CSV files are stored under `public/doc/` and served as static assets:

| File | Purpose | Current size |
|---|---|---|
| `Omnea Flow Meta Data.csv` | Main workflow structure — one row per question | ~3,514 rows |
| `Omnea Tag Meta data.csv` | Tag rules per workflow | ~40 rows |
| `Omnea Logic and Condition.csv` | Named logic conditions by scope | Separate from main CSV |

### 1.1 Omnea Flow Meta Data.csv

This is the primary dataset. It is a **flat/denormalised table**: every row represents a single question, and the block and form context is repeated on each row.

**Columns:**

```
Workflow Name, Block Type, Block Name, Block Duration, Block Assignees,
Block Logic Name, Block Logic Condition,
Form Name, Form Section, Form Section Logic Name, Form Section Logic Condition,
Question Type, Question ID, Question Title, Question Description,
Question Logic Name, Question Logic Condition,
Question Core Data
```

**Example rows:**

```
New Service or Third Party Onboarding, Intake, Initial Intake, , , , ,
  New Purchase Request (V0.3), Vendor Information, , ,
  Product, product, Service provider, Please provide the legal name of the provider, , ,

New Service or Third Party Onboarding, Intake, Initial Intake, , , , ,
  New Purchase Request (V0.3), Vendor Information, , ,
  website, productWebsite, Website, , , ,
```

Both rows belong to the same block (`Initial Intake`) and the same form section (`Vendor Information`). The block and form context is duplicated across every question row — there is no normalised parent/child structure in the CSV.

**Logic condition columns** (`Block Logic Condition`, `Form Section Logic Condition`, `Question Logic Condition`) store the full condition as a **JSON string** embedded in the CSV cell. Example:

```json
{"type":"AND","items":[{"operator":"EQUAL","primaryField":{"questionId":"isRenewal","value":"isRenewal"},"secondaryField":{"value":"true"}}]}
```

When the value is `NA` or empty, the row has no logic condition.

### 1.2 Omnea Tag Meta data.csv

**Columns:**

```
Workflow Name, Tag Name, Tag Conditions
```

Tag conditions are stored as a human-readable string expression rather than structured JSON:

```
New Service or Third Party Onboarding, Safeguarding = TRUE, MainAssessmentQ33 EQUAL Yes
```

### 1.3 Omnea Logic and Condition.csv

**Columns:**

```
Workflow Name, Scope, Logic Name, Logic Condition
```

This file is a deduplicated extract of all named logic rules. `Scope` is one of `block`, `formSection`, or `question`. `Logic Condition` is the same JSON string format as in the main metadata CSV.

This file is currently empty in the repo and is populated manually when logic conditions are exported from the configuration page.

---

## 2. TypeScript Data Model

The three CSV files map directly to three TypeScript interfaces defined in `src/lib/flows-metadata-types.ts`:

```typescript
// One row = one question, carrying full block + form context
interface FlowMetadata {
  id?: string;
  workflow: string;
  blockType: string;
  blockName: string;
  blockDuration: string;
  assignees: string;
  blockLogicName: string;
  blockLogicCondition: string;   // raw JSON string or "NA"
  formName: string;
  formSection: string;
  formSectionLogicName: string;
  formSectionLogicCondition: string;  // raw JSON string or "NA"
  questionType: string;
  questionId: string;
  questionTitle: string;
  description: string;
  questionLogicName: string;
  questionLogicCondition: string;    // raw JSON string or "NA"
  coreDataSource: string;
  required?: string;    // legacy field, not in current export
}

interface FlowTag {
  id?: string;
  workflow: string;
  tagName: string;
  tagConditions: string;
}

interface FlowLogicCondition {
  id?: string;
  workflow: string;
  scope: string;
  logicName: string;
  logicCondition: string;    // raw JSON string
  // Derived fields computed at load time:
  conditionTypes?: string;
  action?: string;
  sourceCount?: string;
  operatorTypes?: string;
  conditionSummary?: string;
}
```

---

## 3. View Page — `/flows-metadata/view`

### 3.1 Data loading

On mount, the page fetches both CSV files in parallel:

```typescript
const [metadataResponse, tagsResponse] = await Promise.all([
  fetch("/doc/Omnea Flow Meta Data.csv"),
  fetch("/doc/Omnea Tag Meta data.csv").catch(() => null),
]);
```

The raw CSV text is parsed by `parseFlowsMetadataCSV()` and `parseFlowTagsCSV()` from `src/lib/flows-metadata-utils.ts`. The parsed arrays are held in React state (`data`, `tagData`). There is no caching and no persistence — data is re-fetched on every page load directly from the static file.

### 3.2 Filtering

The page maintains a `filters` state object mapping field names to selected values, plus a free-text `searchText`. Filtering is done entirely client-side via `useMemo` over the full dataset:

- Each toolbar dropdown (Workflow, Block Type, Form, Assignees) offers scoped options — i.e. the available Block Type options change based on the active Workflow filter.
- Any cell in the main table is clickable and acts as a filter toggle.
- The filter cards (Block Structure, Form Structure, Question Structure, Data Mapping sections) are also clickable — clicking a value sets or clears that field filter.
- A free-text search checks all fields simultaneously.

Active filters are displayed as removable badge pills beneath the toolbar.

### 3.3 Display structure

The page is organised into four visual sections:

| Section | Cards shown |
|---|---|
| **Block Structure** | Block Type, Block Name (grouped by type), Block Duration, Block Assignees, Block Logic Condition |
| **Form Structure** | Form Name (grouped by block type), Form Section (grouped by block name) |
| **Question Structure** | Question Type, Question ID (grouped by form), Question Title (grouped by section), Question Description, Question Logic Condition |
| **Data Mapping** | Core Data (grouped by question title) — only rows where `coreDataSource` is set |

Below all the cards is the **Metadata Table** — a horizontally scrollable full-detail table showing all 18 columns, grouped into column header groups (Workflow, Block, Form, Question, Core Data). Every cell is a clickable filter button.

### 3.4 Logic condition parsing

Logic condition strings (stored as raw JSON in the CSV) are parsed on the fly in the view page using local functions (`extractLogicPairs`, `extractLogicDetails`, `deriveConditionSummary`). These traverse the condition tree to extract human-readable summaries like:

```
isRenewal = true
supplier.type IN (Company, Partnership, ...)
```

### 3.5 Tags

The Tags card (within the Overview section) shows the tag rules from the second CSV filtered by the active Workflow filter. Tags are not filterable by clicking — they are display-only in the view page.

---

## 4. Configuration Page — `/flows-metadata/configuration`

The configuration page is the editing layer. It has three tabs:

| Tab | Manages |
|---|---|
| **Metadata** | The main `FlowMetadata` rows — inline cell editing, add/delete rows, import from template |
| **Tags** | `FlowTag` rows — inline editing, JSON import |
| **Logic Conditions** | `FlowLogicCondition` rows — inline editing, JSON import |

### 4.1 Data loading and persistence

**Metadata** is always loaded fresh from the CSV file on page mount. It is never stored in `localStorage` because at ~3,500 rows it would exceed browser storage quotas. Changes are held in React state until the user explicitly saves (which writes the updated CSV back to the workspace).

**Tags** have a two-tier loading strategy:
1. On load, check `localStorage` key `omnea_tags_v1`. If present, use it.
2. If not present, fetch `Omnea Tag Meta data.csv` and parse it.
3. If the tags CSV is missing, fall back to extracting tags from the main flow CSV using `extractTagsFromFlowsCSV()`.

Any edits to tags are saved to `localStorage` immediately upon clicking Save. The user can also export to CSV.

**Logic conditions** follow the same two-tier strategy with `localStorage` key `omnea_logic_conditions_v1`:
1. Check `localStorage`. If present, use it (and enrich with computed summary fields).
2. If not, fetch `Omnea Logic and Condition.csv`.
3. If missing, fall back to extracting logic conditions from the main flow CSV using `extractLogicConditionsFromMetadata()`.

Column widths for all three tables are persisted in `localStorage` separately (`omnea_edit_columns_width_v1`, `omnea_tag_columns_width_v1`, `omnea_logic_columns_width_v1`) and are drag-resizable.

### 4.2 Metadata tab — editing

The metadata table is a wide inline-editable grid. Each cell is a text input. Supported operations:

- **Edit cell** — click any cell and type
- **Add row** — appends a blank row at the bottom
- **Delete rows** — checkbox-select rows and delete
- **Rename a form** — dialog to find-and-replace a form name across all rows that reference it
- **Delete a form** — dialog to remove all rows associated with a form name
- **Search** — free-text filter across all columns
- **Reload** — re-fetches the CSV from disk, discarding unsaved changes
- **Save** — writes the current state back to the workspace CSV via `saveCSVToWorkspace()`
- **Export** — downloads the current state as a CSV file

### 4.3 Importing a new flow block (template import)

The most complex operation in the configuration page is importing a new block from a **form template CSV**. This is a two-step dialog wizard:

**Step 1 — Block metadata.** The user selects or types:
- Workflow name (autocomplete from existing workflows)
- Block type (`Intake`, `Task`, `Trigger Integration`, `Supplier Portal`)
- Block name (autocomplete or free text)
- Block duration (optional)
- Block assignees (optional)
- Block logic name and condition (optional)
- One or more form template CSV files to upload

**Step 2 — Form name mapping.** Each uploaded CSV file corresponds to a form. The user maps each file to a form name (autocomplete from existing forms or free text).

The template CSV format is a simple question list. `buildFlowMetadataFromTemplateCSV()` in `flows-metadata-utils.ts` converts it into `FlowMetadata` rows by injecting the block context from Step 1 and the form name from Step 2.

The resulting rows are appended to the existing metadata table. The user then saves to persist.

### 4.4 Tags tab — editing and JSON import

The tags table is inline-editable (workflow, tag name, tag conditions). The **Add Tag** dialog supports pasting a raw JSON tag definition (as exported from Omnea's admin UI). The JSON is parsed by `parseTagImportJSON()` which extracts the tag name and condition string. A live preview is shown before confirming the import.

Operations: inline edit, add via JSON import, delete selected rows, save to localStorage + export to CSV.

### 4.5 Logic conditions tab — editing and JSON import

The logic conditions table is inline-editable. The **Add Logic Condition** dialog supports pasting the raw JSON condition object (same format stored in the CSV). The user also selects:
- Workflow (autocomplete)
- Scope: `block`, `formSection`, or `question`
- Optionally the specific section or question it applies to (autocomplete from the loaded metadata)
- Logic name (free text or autocomplete from existing logic names)

On import, the JSON is parsed and enriched with computed summary fields (operator types, condition count, action type, source count) via `parseLogicConditionJSON()` and `enrichLogicRowsWithDetails()`.

Operations: inline edit, add via JSON import, delete selected rows, save to localStorage + export to CSV.

---

## 5. Current Data Flow (end to end)

```
Omnea Admin UI
    │
    │  (manual export — CSV download)
    ▼
public/doc/Omnea Flow Meta Data.csv     (~3,500 rows)
public/doc/Omnea Tag Meta data.csv      (~40 rows)
public/doc/Omnea Logic and Condition.csv
    │
    │  fetch() on page load
    ▼
parseFlowsMetadataCSV()  /  parseFlowTagsCSV()  /  parseFlowLogicConditionsCSV()
    │
    │  plain JavaScript arrays
    ▼
React state  (data, tagData, logicRows)
    │
    ├── View page:  client-side filter + display (no persistence)
    │
    └── Config page:
           │  tags / logic edits
           ▼
         localStorage  (omnea_tags_v1, omnea_logic_conditions_v1)
           │  metadata edits
           ▼
         saveCSVToWorkspace()  →  updated CSV written back to public/doc/
```

---

## 6. How the CSVs Are Kept Up to Date (Manual Process)

There is no automated sync. The current process is:

1. A workflow changes in Omnea (block added, question renamed, logic condition updated, tag added).
2. A team member notices the change or is notified.
3. They export the updated workflow data from the Omnea admin UI.
4. They manually update one or more of the three CSV files in `public/doc/`.
5. They use the **Configuration page** to make the changes (add/edit/delete rows or import a block from a template CSV).
6. They click **Save** — which writes the updated CSV back.
7. The updated file is committed to git and deployed.

For logic conditions and tags, the process is similar but the data is additionally saved to `localStorage` so it survives page refreshes without a re-deploy.

---

## 7. Known Limitations of the Current Approach

| Limitation | Impact |
|---|---|
| **No live sync** | Any workflow change in Omnea is invisible until someone manually updates the CSV. The view page always shows the state at last export, not current state. |
| **No change detection** | There is no diff or audit trail. If a question was renamed or removed, there is no alert. |
| **Manual overhead** | Every workflow change requires a human to export, edit, save, commit, and deploy. |
| **localStorage fragility (tags/logic)** | Tags and logic conditions stored in `localStorage` are browser-specific and device-specific. A team member on a different machine or browser will see the CSV state, not local edits. |
| **CSV size** | The main metadata CSV is ~3,500 rows and growing. It cannot be stored in `localStorage` (quota limits). Large CSV reads slow down page load slightly and block rendering until parsed. |
| **Logic conditions as JSON strings** | Storing structured condition trees as escaped JSON strings inside a CSV cell is fragile. Any manual edit to the CSV risks corrupting the JSON. |
| **No validation** | There is no check that question IDs referenced in logic conditions actually exist in the workflow. A stale reference goes undetected. |
| **No historical state** | It is not possible to answer "what did this workflow look like 3 months ago?" without consulting git history. |

---

*Document prepared by TPM Team — 2026-04-21*
