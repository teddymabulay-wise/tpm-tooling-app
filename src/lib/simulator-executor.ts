/**
 * Simulator Executor
 * Makes real Omnea API calls for each row in the simulation.
 * Each step emits updates via onStepUpdate so the UI can react in real time.
 *
 * Endpoints:
 *   GET  /v1/suppliers                          — preflight duplicate check
 *   POST /v1/suppliers/batch                    — create supplier
 *   POST /v1/suppliers/:id/profiles             — create supplier profile
 *   POST /v1/suppliers/:id/profiles/:id/bank-accounts — create bank account
 */

import { makeOmneaRequest } from '@/lib/omnea-api-utils';
import { getOmneaEnvironmentConfig } from '@/lib/omnea-environment';
import type { SupplierInput, BankInput, SimStep, SimStepStatus, OmneaRecord, AuditLogEntry } from '@/lib/simulator-data';

export type StepUpdateFn = (stepIndex: number, update: Partial<SimStep>) => void;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function now(): string {
  return new Date().toISOString();
}

function extractErrorMessage(errorData: unknown): string | undefined {
  if (!errorData || typeof errorData !== 'object') return undefined;
  const d = errorData as Record<string, unknown>;
  if (typeof d.message === 'string' && d.message) return d.message;
  if (typeof d.error === 'string' && d.error) return d.error;
  if (Array.isArray(d.errors) && d.errors.length > 0) {
    const first = d.errors[0];
    if (typeof first === 'string') return first;
    if (first && typeof first === 'object' && 'message' in first) {
      return String((first as Record<string, unknown>).message);
    }
  }
  return undefined;
}

/** Unwrap `{ data: [{ id }] }` (batch) or `{ data: { id } }` or `{ id }` shapes */
function extractId(data: unknown): string | null {
  if (!data || typeof data !== 'object') return null;
  const obj = data as Record<string, unknown>;
  if (Array.isArray(obj.data) && obj.data.length > 0) {
    const first = obj.data[0] as Record<string, unknown>;
    if (typeof first.id === 'string') return first.id;
  }
  if (obj.data && typeof obj.data === 'object' && !Array.isArray(obj.data)) {
    const nested = obj.data as Record<string, unknown>;
    if (typeof nested.id === 'string') return nested.id;
  }
  if (typeof obj.id === 'string') return obj.id;
  return null;
}

function extractItems(data: unknown): Record<string, unknown>[] {
  if (Array.isArray(data)) return data as Record<string, unknown>[];
  if (data && typeof data === 'object') {
    const obj = data as Record<string, unknown>;
    if (Array.isArray(obj.data)) return obj.data as Record<string, unknown>[];
  }
  return [];
}

// ─── Step definitions (4 steps) ───────────────────────────────────────────────

export function buildInitialSteps(base: string): SimStep[] {
  return [
    {
      id: 1,
      actor: 'GET',
      phase: 'preflight',
      path: `${base}/v1/suppliers`,
      detail: 'Checking for existing supplier',
      status: 'pending',
    },
    {
      id: 2,
      actor: 'POST',
      phase: 'supplier',
      path: `${base}/v1/suppliers/batch`,
      status: 'pending',
    },
    {
      id: 3,
      actor: 'POST',
      phase: 'profile',
      path: `${base}/v1/suppliers/:id/profiles`,
      status: 'pending',
    },
    {
      id: 4,
      actor: 'POST',
      phase: 'bank',
      path: `${base}/v1/suppliers/:id/profiles/:id/bank-accounts`,
      status: 'pending',
    },
  ];
}

// ─── Row executor ─────────────────────────────────────────────────────────────

export interface ExecuteRowResult {
  record: OmneaRecord;
  auditEntries: AuditLogEntry[];
  stepStatuses: SimStepStatus[];
}

export async function executeRow(
  supplier: SupplierInput,
  bank: BankInput,
  onStepUpdate: StepUpdateFn,
): Promise<ExecuteRowResult> {
  const config = getOmneaEnvironmentConfig();
  const base = config.apiBaseUrl;
  const auditEntries: AuditLogEntry[] = [];
  const stepStatuses: SimStepStatus[] = ['pending', 'pending', 'pending', 'pending'];

  function update(stepIndex: number, upd: Partial<SimStep>) {
    if (upd.status) stepStatuses[stepIndex] = upd.status;
    onStepUpdate(stepIndex, upd);
  }

  function skipRemaining(from: number) {
    for (let k = from; k < 4; k++) {
      update(k, { status: 'skipped', timestamp: now() });
    }
  }

  // ── Step 1 (preflight): Check for existing supplier ────────────────────────
  const listPath = `${base}/v1/suppliers`;
  update(0, { status: 'running', path: listPath, timestamp: now() });

  let existingSupplierId: string | null = null;

  const checkRes = await makeOmneaRequest<unknown>(listPath, {
    method: 'GET',
    params: { limit: '100' },
  });

  if (checkRes.error || !checkRes.data) {
    // Non-fatal — treat as "no duplicate found" and continue
    update(0, {
      status: 'warning',
      httpStatus: checkRes.statusCode || undefined,
      path: listPath,
      detail: 'Could not verify duplicates — proceeding',
      errorMessage: checkRes.error ?? undefined,
      timestamp: now(),
    });
    auditEntries.push({ timestamp: now(), method: 'GET', path: '/v1/suppliers', supplier: supplier.legalName, httpStatus: checkRes.statusCode || null, status: 'warning', detail: 'Duplicate check failed — proceeding anyway', errorMessage: checkRes.error ?? undefined });
  } else {
    const items = extractItems(checkRes.data);
    const nameLower = supplier.legalName.toLowerCase();
    const match = items.find(
      (s) =>
        String(s.name ?? '').toLowerCase() === nameLower ||
        String(s.legalName ?? '').toLowerCase() === nameLower,
    );

    if (match && typeof match.id === 'string') {
      existingSupplierId = match.id;
      update(0, {
        status: 'warning',
        httpStatus: checkRes.statusCode,
        path: listPath,
        detail: `Duplicate found — ID: ${existingSupplierId}`,
        timestamp: now(),
      });
      auditEntries.push({ timestamp: now(), method: 'GET', path: '/v1/suppliers', supplier: supplier.legalName, httpStatus: checkRes.statusCode, status: 'warning', detail: `Duplicate found: ${existingSupplierId}` });
    } else {
      update(0, {
        status: 'success',
        httpStatus: checkRes.statusCode,
        path: listPath,
        detail: 'No duplicate found',
        timestamp: now(),
      });
      auditEntries.push({ timestamp: now(), method: 'GET', path: '/v1/suppliers', supplier: supplier.legalName, httpStatus: checkRes.statusCode, status: 'success', detail: 'No duplicate found' });
    }
  }

  // ── Step 2: Create Supplier (or skip if duplicate found) ───────────────────
  let supplierId = existingSupplierId;
  const batchPath = `${base}/v1/suppliers/batch`;

  if (existingSupplierId) {
    // Reuse existing supplier — skip creation
    update(1, {
      status: 'skipped',
      path: batchPath,
      detail: `Using existing supplier: ${existingSupplierId}`,
      timestamp: now(),
    });
    auditEntries.push({ timestamp: now(), method: 'POST', path: '/v1/suppliers/batch', supplier: supplier.legalName, httpStatus: null, status: 'skipped', detail: `Skipped — using existing ${existingSupplierId}` });
  } else {
    update(1, { status: 'running', path: batchPath, timestamp: now() });

    const suppRes = await makeOmneaRequest<unknown>(batchPath, {
      method: 'POST',
      body: {
        suppliers: [
          {
            name: supplier.legalName,
            ...(supplier.legalNameRegistered && { legalName: supplier.legalNameRegistered }),
            ...(supplier.taxNumber && { taxNumber: supplier.taxNumber }),
            ...(supplier.entityType && { entityType: supplier.entityType }),
            ...(supplier.description && { description: supplier.description }),
            ...(supplier.website && { website: supplier.website }),
            isPreferred: supplier.isPreferred ?? false,
            isReseller: supplier.isReseller ?? false,
            ...((supplier.addressStreet1 || supplier.city || supplier.countryIso2) && {
              address: {
                ...(supplier.addressStreet1 && { street1: supplier.addressStreet1 }),
                ...(supplier.addressStreet2 && { street2: supplier.addressStreet2 }),
                ...(supplier.city && { city: supplier.city }),
                ...(supplier.stateProvince && { state: supplier.stateProvince }),
                ...(supplier.postCode && { zipCode: supplier.postCode }),
                country: supplier.countryIso2,
              },
            }),
            customFields: {
              ...(supplier.brn && { 'corporate-registration-number': supplier.brn }),
              ...(supplier.materialityLevel && { 'materiality-level': supplier.materialityLevel }),
              ...(supplier.infosecCriticalityTier && { 'infosec-criticality-tier': supplier.infosecCriticalityTier }),
              ...(supplier.infosecSensitivityTier && { 'infosec-sensitivity-tier': supplier.infosecSensitivityTier }),
              ...(supplier.entityTypeCf && { 'entity-type': supplier.entityTypeCf }),
              ...(supplier.supportsCif && { 'supports-cif-1': supplier.supportsCif }),
              ...(supplier.nameOfParentEntity && { 'name-of-parent-entity': supplier.nameOfParentEntity }),
            },
          },
        ],
      },
    });

    if (suppRes.error || !suppRes.data) {
      const errMsg = extractErrorMessage(suppRes.errorData) ?? suppRes.error ?? 'Failed to create supplier';
      const isDup = suppRes.statusCode === 409 || errMsg.toLowerCase().includes('duplicate') || errMsg.toLowerCase().includes('already exist');
      update(1, { status: isDup ? 'warning' : 'error', httpStatus: suppRes.statusCode || undefined, path: batchPath, errorMessage: errMsg, timestamp: now() });
      auditEntries.push({ timestamp: now(), method: 'POST', path: '/v1/suppliers/batch', supplier: supplier.legalName, httpStatus: suppRes.statusCode || null, status: isDup ? 'warning' : 'error', detail: 'Create supplier', errorMessage: errMsg });
      skipRemaining(2);
      return {
        record: { supplierId: '', supplierName: supplier.legalName, subsidiaryName: supplier.subsidiaryName, profileId: '', bankAccountId: '', outcome: isDup ? 'duplicate' : 'failed' },
        auditEntries,
        stepStatuses,
      };
    }

    supplierId = extractId(suppRes.data);
    if (!supplierId) {
      const errMsg = 'Batch create returned no supplier ID';
      update(1, { status: 'error', httpStatus: suppRes.statusCode, path: batchPath, errorMessage: errMsg, timestamp: now() });
      auditEntries.push({ timestamp: now(), method: 'POST', path: '/v1/suppliers/batch', supplier: supplier.legalName, httpStatus: suppRes.statusCode, status: 'error', detail: 'Create supplier', errorMessage: errMsg });
      skipRemaining(2);
      return {
        record: { supplierId: '', supplierName: supplier.legalName, subsidiaryName: supplier.subsidiaryName, profileId: '', bankAccountId: '', outcome: 'failed' },
        auditEntries,
        stepStatuses,
      };
    }

    update(1, { status: 'success', httpStatus: suppRes.statusCode, path: batchPath, detail: `ID: ${supplierId}`, timestamp: now() });
    auditEntries.push({ timestamp: now(), method: 'POST', path: '/v1/suppliers/batch', supplier: supplier.legalName, httpStatus: suppRes.statusCode, status: 'success', detail: `Supplier created: ${supplierId}` });
  }

  if (!supplierId) {
    skipRemaining(2);
    return {
      record: { supplierId: '', supplierName: supplier.legalName, subsidiaryName: supplier.subsidiaryName, profileId: '', bankAccountId: '', outcome: 'failed' },
      auditEntries,
      stepStatuses,
    };
  }

  // ── Step 3: Create Supplier Profile ────────────────────────────────────────
  const profilePath = `${base}/v1/suppliers/${supplierId}/profiles`;
  update(2, { status: 'running', path: profilePath, timestamp: now() });

  // Use resolved subsidiaryId if available, else fall back to name
  const profileBody = supplier.subsidiaryId
    ? { subsidiary: { id: supplier.subsidiaryId } }
    : { subsidiary: { name: supplier.subsidiaryName } };

  const profRes = await makeOmneaRequest<unknown>(profilePath, {
    method: 'POST',
    body: profileBody,
  });

  if (profRes.error || !profRes.data) {
    const errMsg = extractErrorMessage(profRes.errorData) ?? profRes.error ?? 'Failed to create profile';
    update(2, { status: 'error', httpStatus: profRes.statusCode || undefined, path: profilePath, errorMessage: errMsg, timestamp: now() });
    auditEntries.push({ timestamp: now(), method: 'POST', path: `/v1/suppliers/${supplierId}/profiles`, supplier: supplier.legalName, httpStatus: profRes.statusCode || null, status: 'error', detail: 'Create profile', errorMessage: errMsg });
    update(3, { status: 'skipped', timestamp: now() });
    stepStatuses[3] = 'skipped';
    return {
      record: { supplierId, supplierName: supplier.legalName, subsidiaryName: supplier.subsidiaryName, profileId: '', bankAccountId: '', outcome: 'partial' },
      auditEntries,
      stepStatuses,
    };
  }

  const profileId = extractId(profRes.data) ?? '';
  if (!profileId) {
    const errMsg = 'Create profile returned no ID';
    update(2, { status: 'error', httpStatus: profRes.statusCode, path: profilePath, errorMessage: errMsg, timestamp: now() });
    auditEntries.push({ timestamp: now(), method: 'POST', path: `/v1/suppliers/${supplierId}/profiles`, supplier: supplier.legalName, httpStatus: profRes.statusCode, status: 'error', detail: 'Create profile', errorMessage: errMsg });
    update(3, { status: 'skipped', timestamp: now() });
    stepStatuses[3] = 'skipped';
    return {
      record: { supplierId, supplierName: supplier.legalName, subsidiaryName: supplier.subsidiaryName, profileId: '', bankAccountId: '', outcome: 'partial' },
      auditEntries,
      stepStatuses,
    };
  }

  update(2, { status: 'success', httpStatus: profRes.statusCode, path: profilePath, detail: `Profile ID: ${profileId}`, timestamp: now() });
  auditEntries.push({ timestamp: now(), method: 'POST', path: `/v1/suppliers/${supplierId}/profiles`, supplier: supplier.legalName, httpStatus: profRes.statusCode, status: 'success', detail: `Profile created: ${profileId}` });

  // ── Step 4: Create Bank Account ─────────────────────────────────────────────
  const bankPath = `${base}/v1/suppliers/${supplierId}/profiles/${profileId}/bank-accounts`;
  update(3, { status: 'running', path: bankPath, timestamp: now() });

  const bankRes = await makeOmneaRequest<unknown>(bankPath, {
    method: 'POST',
    body: {
      bankName: bank.bankName,
      accountNumber: bank.accountNumber,
      ...(bank.iban      ? { iban: bank.iban }           : {}),
      ...(bank.swiftCode ? { swiftCode: bank.swiftCode } : {}),
      ...(bank.sortCode  ? { sortCode: bank.sortCode }   : {}),
      address: { country: bank.addressCountry },
    },
  });

  if (bankRes.error || !bankRes.data) {
    const errMsg = extractErrorMessage(bankRes.errorData) ?? bankRes.error ?? 'Failed to create bank account';
    update(3, { status: 'error', httpStatus: bankRes.statusCode || undefined, path: bankPath, errorMessage: errMsg, timestamp: now() });
    auditEntries.push({ timestamp: now(), method: 'POST', path: `/v1/suppliers/${supplierId}/profiles/${profileId}/bank-accounts`, supplier: supplier.legalName, httpStatus: bankRes.statusCode || null, status: 'error', detail: 'Create bank account', errorMessage: errMsg });
    return {
      record: { supplierId, supplierName: supplier.legalName, subsidiaryName: supplier.subsidiaryName, profileId, bankAccountId: '', outcome: 'partial' },
      auditEntries,
      stepStatuses,
    };
  }

  const bankAccountId = extractId(bankRes.data) ?? '';
  update(3, { status: 'success', httpStatus: bankRes.statusCode, path: bankPath, detail: `Bank account ID: ${bankAccountId}`, timestamp: now() });
  auditEntries.push({ timestamp: now(), method: 'POST', path: `/v1/suppliers/${supplierId}/profiles/${profileId}/bank-accounts`, supplier: supplier.legalName, httpStatus: bankRes.statusCode, status: 'success', detail: `Bank account created: ${bankAccountId}` });

  return {
    record: { supplierId, supplierName: supplier.legalName, subsidiaryName: supplier.subsidiaryName, profileId, bankAccountId, outcome: 'created' },
    auditEntries,
    stepStatuses,
  };
}
