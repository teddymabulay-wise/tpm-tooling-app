# API Request: Workflow Metadata Endpoints

**Requested by:** TPM Team  
**Date:** 2026-04-21  
**Priority:** High  
**Context:** This document describes three new read-only API endpoints we are requesting Omnea to add to its public API. It explains the use case, the data we currently manage manually, the downstream impact, and the exact shape of response we need.

---

## 1. Background and Problem Statement

The TPM team maintains a tooling application that consumes detailed metadata about Omnea workflows — their block structure, form layout, question definitions, conditional logic, and tag rules. This metadata is central to how the team operates: it is used to understand what data Omnea collects, map questions to internal systems, audit workflow configuration changes, and model downstream automation.

**Today, this data is maintained as static CSV files** that are manually exported and uploaded into the tooling app whenever a workflow changes. There is no programmatic way to retrieve it. This creates three concrete problems:

1. **Staleness.** Any workflow change in Omnea goes undetected until someone notices and manually re-exports. There is no way to compare current state against a baseline.
2. **Operational overhead.** Keeping the CSVs current requires manual intervention on every update — block added, form section renamed, question re-ordered, logic condition changed.
3. **Blocked automation.** Several downstream processes (data mapping validation, materiality audit logic, request step analysis) depend on knowing the current structure of workflows. Without a live API, these cannot be kept reliable.

---

## 2. What We Are Asking For

We are requesting **three new read endpoints** that expose the same data currently available only through manual CSV export:

| # | Endpoint | What it returns |
|---|---|---|
| 1 | `GET /v1/workflows/metadata` | Full flattened workflow structure — blocks, forms, sections, questions, logic, core data mapping |
| 2 | `GET /v1/workflows/tags` | Tag rules per workflow — tag name and the condition expression that triggers it |
| 3 | `GET /v1/workflows/logic-conditions` | Logic conditions per scope (block / form section / question) — name and full condition JSON |

All three endpoints should support cursor-based pagination consistent with the rest of the Omnea public API (`limit` + `cursor` params, `nextCursor` in response).

---

## 3. Data Model

### 3.1 Workflow Metadata — `GET /v1/workflows/metadata`

The response is a paginated list of **metadata rows**. Each row represents one question within a workflow and carries the full context of where it sits: which workflow, which block, which form, which form section, and what logic governs its visibility.

This is a denormalised / flattened format — the same block or form section appears on multiple rows (one per question). This matches the way the data is consumed: the tooling app builds the hierarchy client-side from the flat list.

#### Request

```
GET /v1/workflows/metadata
    ?limit=100
    &cursor=<opaque cursor>
    &workflowId=<optional filter by workflow ID>
```

#### Response

```json
{
  "data": [
    {
      "workflowId": "abc123",
      "workflowName": "New Service or Third Party Onboarding",

      "blockType": "Intake",
      "blockName": "Initial Intake",
      "blockDuration": "3 days",
      "blockAssignees": "Procurement Team",
      "blockLogicName": "Skip if renewal",
      "blockLogicCondition": {
        "type": "AND",
        "items": [
          {
            "operator": "EQUAL",
            "primaryField": { "questionId": "isRenewal", "value": "isRenewal" },
            "secondaryField": { "value": "true" }
          }
        ]
      },

      "formName": "New Purchase Request (V0.3)",
      "formSection": "Vendor Information",
      "formSectionLogicName": null,
      "formSectionLogicCondition": null,

      "questionType": "Product",
      "questionId": "product",
      "questionTitle": "Service provider",
      "questionDescription": "Please provide the legal name of the provider",
      "questionRequired": true,
      "questionLogicName": null,
      "questionLogicCondition": null,

      "coreDataSource": "supplier.name"
    }
  ],
  "meta": {
    "nextCursor": "eyJpZCI6IjEyMyJ9",
    "totalCount": 3514
  }
}
```

#### Field definitions

| Field | Type | Notes |
|---|---|---|
| `workflowId` | string | Stable UUID for the workflow |
| `workflowName` | string | Display name |
| `blockType` | string | e.g. `Intake`, `Task`, `Trigger Integration`, `Supplier Portal` |
| `blockName` | string | Name of the block within the workflow |
| `blockDuration` | string \| null | SLA duration if set |
| `blockAssignees` | string \| null | Comma-separated assignee names or group names |
| `blockLogicName` | string \| null | Name of the skip/show logic rule on the block |
| `blockLogicCondition` | object \| null | Full condition tree (see logic condition shape below) |
| `formName` | string \| null | Name of the form attached to the block |
| `formSection` | string \| null | Section within the form |
| `formSectionLogicName` | string \| null | Name of the section-level visibility rule |
| `formSectionLogicCondition` | object \| null | Condition tree scoped to the form section |
| `questionType` | string \| null | Field type: `Product`, `website`, `dropdown`, `text`, `date`, etc. |
| `questionId` | string \| null | Stable identifier used in logic references and data mapping |
| `questionTitle` | string \| null | Human-readable label shown to the user |
| `questionDescription` | string \| null | Help text shown beneath the question |
| `questionRequired` | boolean \| null | Whether the question is mandatory |
| `questionLogicName` | string \| null | Name of the question-level visibility rule |
| `questionLogicCondition` | object \| null | Condition tree controlling question visibility |
| `coreDataSource` | string \| null | Dot-notation path to the Omnea core data field this question maps to (e.g. `supplier.name`, `supplier.registrationNumber`) |

#### Logic condition shape

Logic conditions are stored in Omnea's existing condition tree format. We are already parsing this format client-side. We would like the API to return the parsed object, not a JSON string:

```json
{
  "type": "AND" | "OR",
  "items": [
    {
      "operator": "EQUAL" | "NOT_EQUAL" | "CONTAINS" | ...,
      "primaryField": {
        "questionId": "string",
        "value": "string",
        "source": "string"
      },
      "secondaryField": {
        "value": "string | number | boolean",
        "id": "string",
        "source": "string"
      }
    }
  ]
}
```

---

### 3.2 Workflow Tags — `GET /v1/workflows/tags`

Tags are applied to a request (intake submission) based on rule conditions. They drive downstream categorisation, routing, and reporting. Knowing which tags exist and what triggers them is essential for impact analysis.

#### Request

```
GET /v1/workflows/tags
    ?limit=100
    &cursor=<opaque cursor>
    &workflowId=<optional filter>
```

#### Response

```json
{
  "data": [
    {
      "workflowId": "abc123",
      "workflowName": "New Service or Third Party Onboarding",
      "tagName": "Safeguarding = TRUE",
      "tagCondition": "MainAssessmentQ33 EQUAL Yes"
    },
    {
      "workflowId": "abc123",
      "workflowName": "New Service or Third Party Onboarding",
      "tagName": "Tier D (TP)",
      "tagCondition": "question-6 NOT_EQUAL <uuid> AND derivedFields.risk.aggregate EQUAL 0"
    }
  ],
  "meta": {
    "nextCursor": null,
    "totalCount": 40
  }
}
```

#### Field definitions

| Field | Type | Notes |
|---|---|---|
| `workflowId` | string | Workflow this tag belongs to |
| `workflowName` | string | Display name |
| `tagName` | string | The tag value that is applied (e.g. `Safeguarding = TRUE`, `Tier D (TP)`) |
| `tagCondition` | string | The condition expression that triggers this tag. Currently a human-readable string; ideally a structured condition object matching the logic condition shape above |

---

### 3.3 Logic Conditions — `GET /v1/workflows/logic-conditions`

This endpoint surfaces the complete set of named logic rules across all scopes (block, form section, question), which is what the Configuration page manages. It is the canonical list of all conditional display rules in a workflow.

#### Request

```
GET /v1/workflows/logic-conditions
    ?limit=100
    &cursor=<opaque cursor>
    &workflowId=<optional filter>
    &scope=block|formSection|question    (optional filter)
```

#### Response

```json
{
  "data": [
    {
      "workflowId": "abc123",
      "workflowName": "New Service or Third Party Onboarding",
      "scope": "block",
      "logicName": "Skip if renewal",
      "logicCondition": {
        "type": "AND",
        "items": [
          {
            "operator": "EQUAL",
            "primaryField": { "questionId": "isRenewal", "value": "isRenewal" },
            "secondaryField": { "value": "true" }
          }
        ]
      }
    }
  ],
  "meta": {
    "nextCursor": null,
    "totalCount": 87
  }
}
```

#### Field definitions

| Field | Type | Notes |
|---|---|---|
| `workflowId` | string | Workflow this rule belongs to |
| `workflowName` | string | |
| `scope` | `"block"` \| `"formSection"` \| `"question"` | What the logic is attached to |
| `logicName` | string | Human-readable name for the rule (used for cross-referencing in the metadata endpoint) |
| `logicCondition` | object | Condition tree (same shape as described in §3.1) |

---

## 4. Use Cases and Downstream Impact

### 4.1 Workflow Structure Explorer (`/flows-metadata/view`)

The view page allows the TPM team to interactively explore the full structure of all Omnea workflows — blocks, forms, sections, questions, and logic. It is used to:

- Understand what data Omnea collects at each step of a workflow
- Identify which questions feed which downstream systems via `coreDataSource` mapping
- Cross-reference a question ID found in a request response against its human-readable label and context
- Audit block assignees and SLA durations across workflows

**Today:** The page fetches from a static CSV file (`/doc/Omnea Flow Meta Data.csv`, currently ~3,500 rows). This file must be manually updated.

**With the API:** The page would call `GET /v1/workflows/metadata` on load, always showing current state. The team could detect structural changes (questions added/removed, logic rules changed) without any manual intervention.

### 4.2 Workflow Configuration Management (`/flows-metadata/configuration`)

The configuration page is used to:

- Edit and maintain the metadata table (add/remove rows, correct field values)
- Manage tag rules and the conditions that trigger them
- Manage logic conditions — view, edit and validate the condition JSON for each named rule
- Import workflow structure from a template CSV (block types: Intake, Task, Trigger Integration, Supplier Portal)
- Export the current state to CSV for sharing or archiving

**Today:** All edits are local (saved to `localStorage` and exported as CSV). There is no ability to validate local edits against Omnea's live state or detect drift.

**With the API:** The configuration page could:
- Load the live baseline from Omnea and show a diff against locally saved edits
- Validate that question IDs referenced in logic conditions actually exist in the current workflow
- Flag stale rows (questions that have been removed from Omnea since the last sync)

### 4.3 Downstream automation use cases

Beyond the two pages above, several other processes in the tooling app depend on knowing the current workflow structure:

| Use case | How it depends on workflow metadata |
|---|---|
| **Request step analysis** | Maps request form responses back to question IDs to label what data was collected at each step |
| **Materiality audit** | Logic conditions on blocks and sections determine which questions are shown to a supplier — needed to assess completeness of responses |
| **Data mapping validation** | `coreDataSource` field links a question to a canonical supplier data field (e.g. `supplier.registrationNumber`). Used to verify that key fields are being collected |
| **Simulator** | Uses question IDs and form structure to simulate what a supplier would see when filling out a request |
| **Tag impact analysis** | Understanding which tag conditions reference which questions is needed to model what happens when a question is changed or removed |

---

## 5. Why This Cannot Be Solved Client-Side

The data is not available through any existing Omnea API. The current endpoints expose:

- Supplier records and their profiles (`/v1/suppliers`)
- Request submissions (`/requests/request-forms/{id}`)
- Subsidiaries, bank accounts, departments, etc.

None of these expose the **definition** of the workflow — the form structure, question metadata, block configuration, or conditional logic. This structural data is only accessible today by exporting from the Omnea admin UI.

---

## 6. Pagination and Performance Notes

The `GET /v1/workflows/metadata` endpoint will return a large dataset (~3,500+ rows for a single workflow today). We request that it follow the same cursor pagination pattern as the existing list endpoints:

- Default `limit=100`, max `limit=100`
- `nextCursor` returned in `meta` when more pages exist
- Filtering by `workflowId` to scope responses

The Tags and Logic Conditions endpoints are smaller in volume (~40 and ~90 rows respectively) but should also be paginated for consistency.

---

## 7. Summary of Requested Endpoints

| Method | Path | Description |
|---|---|---|
| `GET` | `/v1/workflows/metadata` | Flattened workflow structure: blocks, forms, questions, logic, core data |
| `GET` | `/v1/workflows/tags` | Tag rules and trigger conditions per workflow |
| `GET` | `/v1/workflows/logic-conditions` | Named logic rules by scope (block / form section / question) |

All three:
- Read-only (`GET`)
- Authenticated with Bearer token (same OAuth2 client credentials flow as existing endpoints)
- Cursor-paginated
- Filterable by `workflowId`

---

*Document prepared by TPM Team — for questions contact teddmabulay@gmail.com*
