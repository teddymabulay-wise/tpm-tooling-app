import { useState, useRef, useCallback, Fragment } from 'react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Upload, Play, Download, CheckCircle2, XCircle, Loader2,
  AlertTriangle, RotateCcw, StopCircle, ChevronDown, ArrowRight,
} from 'lucide-react';
import { toast } from 'sonner';
import { fetchAllOmneaPages, makeOmneaRequest } from '@/lib/omnea-api-utils';
import { getOmneaEnvironmentConfig } from '@/lib/omnea-environment';

// ─── Types ────────────────────────────────────────────────────────────────────

type StepStatus = 'idle' | 'running' | 'done' | 'error' | 'skipped';
type EntityIntent = 'CREATE' | 'UPDATE' | 'SKIP' | 'UNKNOWN';

interface SimRow {
  _id: string;
  // required parsed fields
  bc_vendor_no: string;
  legal_name: string;
  registration_no: string;
  vat_no: string;
  wise_entity: string;
  country_code: string;
  payment_terms: string;
  vendor_posting_group: string; // normalised to upper
  iban: string;
  account_number: string;
  // optional parsed fields
  address_street1: string;
  address_street2: string;
  city: string;
  post_code: string;
  swift_code: string;
  bank_name: string;
  bank_country: string;
  currency_code: string;
  finance_contact_email: string;
  website: string;
  payment_method: string;
  gln: string;
  eori_number: string;
  ic_partner_code: string;
  // mapped CSV fields from new column spec (fields not already declared above)
  description?: string;
  subsidiary_name?: string;
  country_iso2?: string;
  bank_account_no?: string;
  bank_country_iso2?: string;
  bank_swift_code?: string;
  legal_name_registered?: string;
  tax_number?: string;
  entity_type?: string;
  is_preferred?: string;
  is_reseller?: string;
  state_province?: string;
  brn?: string;
  materiality_level?: string;
  infosec_criticality_tier?: string;
  infosec_sensitivity_tier?: string;
  entity_type_cf?: string;
  supports_cif?: string;
  name_of_parent_entity?: string;
  sort_code?: string;
  // Profile columns
  profile_subsidiary_id?: string;
  profile_subsidiary_name?: string;
  profile_state?: string;
  profile_payment_method_id?: string;
  profile_payment_terms_id?: string;
  profile_relationship_owner_email?: string;
  // Bank columns (prefixed)
  bank_account_name?: string;
  bank_currency_code?: string;
  bank_iban?: string;
  bank_sort_code?: string;
  bank_is_primary?: string;
  bank_address_street1?: string;
  bank_address_city?: string;
  bank_address_zip_code?: string;
  // runtime state
  state?: string;
  supplierIntent?: EntityIntent;
  profileIntent?: EntityIntent;
  bankIntent?: EntityIntent;
  preflightDone?: boolean;
  preflightSupplierId?: string;
  preflightProfileSubsidiaryId?: string; // subsidiary UUID if profile already exists
  preflightBankId?: string;              // bank account UUID if already attached to profile
  status: 'pending' | 'running' | 'duplicate' | 'created' | 'error' | 'skipped';
  steps_completed: number;
  step_statuses: StepStatus[];
  omnea_supplier_id?: string;
  omnea_profile_id?: string;
  omnea_bank_id?: string;
  stale_bank_id?: string;
  existing_omnea_id?: string;
  error_message?: string;
  error_step?: number;       // index (0-5) of the step that failed
  error_raw?: string;        // raw API response body, JSON-stringified
  warnings: string[];
}

// ─── Constants ────────────────────────────────────────────────────────────────

type ColSpec = { name: string; required: boolean; mapsTo: string };
type ColGroup = { label: string; endpoint: string; columns: ColSpec[] };

const COLUMN_GROUPS: ColGroup[] = [
  {
    label: 'Supplier',
    endpoint: 'POST /v1/suppliers/batch',
    columns: [
      { name: 'legal_name',            required: true,  mapsTo: 'suppliers[].name' },
      { name: 'bc_vendor_no',          required: true,  mapsTo: 'remoteId (PATCH handshake → Step 4a)' },
      { name: 'legal_name_registered', required: false, mapsTo: 'suppliers[].legalName' },
      { name: 'tax_number',            required: false, mapsTo: 'suppliers[].taxNumber' },
      { name: 'entity_type',           required: false, mapsTo: 'suppliers[].entityType (company | individual)' },
      { name: 'description',           required: false, mapsTo: 'suppliers[].description' },
      { name: 'website',               required: false, mapsTo: 'suppliers[].website' },
      { name: 'is_preferred',          required: false, mapsTo: 'suppliers[].isPreferred' },
      { name: 'is_reseller',           required: false, mapsTo: 'suppliers[].isReseller' },
    ],
  },
  {
    label: 'Address',
    endpoint: 'POST /v1/suppliers/batch → address',
    columns: [
      { name: 'country_iso2',    required: true,  mapsTo: 'address.country (ISO-2)' },
      { name: 'address_street1', required: false, mapsTo: 'address.street1' },
      { name: 'address_street2', required: false, mapsTo: 'address.street2' },
      { name: 'city',            required: false, mapsTo: 'address.city' },
      { name: 'state_province',  required: false, mapsTo: 'address.state (US suppliers only)' },
      { name: 'post_code',       required: false, mapsTo: 'address.zipCode' },
    ],
  },
  {
    label: 'Custom Fields',
    endpoint: 'POST /v1/suppliers/batch → customFields',
    columns: [
      { name: 'brn',                     required: false, mapsTo: "customFields['corporate-registration-number']" },
      { name: 'materiality_level',        required: false, mapsTo: "customFields['materiality-level']" },
      { name: 'infosec_criticality_tier', required: false, mapsTo: "customFields['infosec-criticality-tier']" },
      { name: 'infosec_sensitivity_tier', required: false, mapsTo: "customFields['infosec-sensitivity-tier']" },
      { name: 'entity_type_cf',           required: false, mapsTo: "customFields['entity-type']" },
      { name: 'supports_cif',             required: false, mapsTo: "customFields['supports-cif-1']" },
      { name: 'name_of_parent_entity',    required: false, mapsTo: "customFields['name-of-parent-entity']" },
    ],
  },
  {
    label: 'Supplier Profile',
    endpoint: 'POST /v1/suppliers/:id/profiles',
    columns: [
      { name: 'subsidiary_name',                  required: true,  mapsTo: 'subsidiary.name (fallback lookup)' },
      { name: 'profile_subsidiary_id',            required: false, mapsTo: 'subsidiary.id' },
      { name: 'profile_subsidiary_name',          required: false, mapsTo: 'subsidiary.name (display)' },
      { name: 'profile_state',                    required: false, mapsTo: 'state (active | archived | inactive)' },
      { name: 'profile_payment_method_id',        required: false, mapsTo: 'paymentMethod.id' },
      { name: 'profile_payment_terms_id',         required: false, mapsTo: 'paymentTerms.id' },
      { name: 'profile_relationship_owner_email', required: false, mapsTo: "customFields['supplierProfileRelationshipOwner']" },
    ],
  },
  {
    label: 'Bank Account',
    endpoint: 'POST /v1/suppliers/:id/profiles/:id/bank-accounts',
    columns: [
      { name: 'bank_name',             required: true,  mapsTo: 'bankName' },
      { name: 'bank_account_no',       required: true,  mapsTo: 'accountNumber' },
      { name: 'bank_swift_code',       required: true,  mapsTo: 'swiftCode' },
      { name: 'bank_country_iso2',     required: true,  mapsTo: 'address.country' },
      { name: 'bank_account_name',     required: false, mapsTo: 'accountName' },
      { name: 'bank_currency_code',    required: false, mapsTo: 'currency.code' },
      { name: 'bank_iban',             required: false, mapsTo: 'iban' },
      { name: 'bank_sort_code',        required: false, mapsTo: 'sortCode' },
      { name: 'bank_is_primary',       required: false, mapsTo: 'isPrimary (default: true)' },
      { name: 'bank_address_street1',  required: false, mapsTo: 'address.street1' },
      { name: 'bank_address_city',     required: false, mapsTo: 'address.city' },
      { name: 'bank_address_zip_code', required: false, mapsTo: 'address.zipCode' },
    ],
  },
];

// Derived flat lists used by the parser and validator
const REQUIRED_COLS = COLUMN_GROUPS.flatMap(g => g.columns).filter(c => c.required).map(c => c.name);

const STEP_LABELS = [
  'Create supplier', 'Create profile', 'Create bank',
  'Patch supplier', 'Patch profile', 'Patch bank',
] as const;

const WIZARD_STEPS = ['Upload CSV', 'Pre-flight', 'Simulation', 'Results'] as const;

let currencyIdByCodePromise: Promise<Map<string, string>> | null = null;

async function getCurrencyIdByCode(baseUrl: string): Promise<Map<string, string>> {
  if (!currencyIdByCodePromise) {
    currencyIdByCodePromise = (async () => {
      const currencies = await fetchAllOmneaPages<Record<string, unknown>>(`${baseUrl}/v1/currencies`);
      const byCode = new Map<string, string>();

      currencies.forEach((currency) => {
        const id = typeof currency.id === 'string' ? currency.id : '';
        const code = typeof currency.code === 'string' ? currency.code.trim().toUpperCase() : '';
        if (id && code) {
          byCode.set(code, id);
        }
      });

      return byCode;
    })().catch((error) => {
      currencyIdByCodePromise = null;
      throw error;
    });
  }

  return currencyIdByCodePromise;
}

// ─── RFC 4180-compliant CSV parser ────────────────────────────────────────────

function parseCSVRFC4180(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let field = '';
  let row: string[] = [];
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const next = text[i + 1];

    if (inQuotes) {
      if (ch === '"' && next === '"') { field += '"'; i++; }
      else if (ch === '"') { inQuotes = false; }
      else { field += ch; }
    } else {
      if (ch === '"') { inQuotes = true; }
      else if (ch === ',') { row.push(field); field = ''; }
      else if (ch === '\r' && next === '\n') {
        row.push(field); field = ''; rows.push(row); row = []; i++;
      } else if (ch === '\n' || ch === '\r') {
        row.push(field); field = ''; rows.push(row); row = [];
      } else { field += ch; }
    }
  }
  if (field || row.length > 0) { row.push(field); rows.push(row); }

  if (rows.length < 2) return [];

  const headers = rows[0].map(h => h.trim().toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, ''));
  return rows
    .slice(1)
    .filter(r => r.some(v => v.trim() !== ''))
    .map(r => {
      const obj: Record<string, string> = {};
      headers.forEach((h, i) => { obj[h] = (r[i] ?? '').trim(); });
      return obj;
    });
}

// ─── CSV template download ────────────────────────────────────────────────────

function downloadCSVTemplate() {
  const headers = [
    // Required (8)
    'legal_name', 'bc_vendor_no', 'subsidiary_name', 'country_iso2',
    'bank_name', 'bank_account_no', 'bank_swift_code', 'bank_country_iso2',
    // Supplier optional (19)
    'legal_name_registered', 'tax_number', 'entity_type', 'description',
    'website', 'is_preferred', 'is_reseller',
    'address_street1', 'address_street2', 'city', 'state_province', 'post_code',
    'brn', 'materiality_level', 'infosec_criticality_tier',
    'infosec_sensitivity_tier', 'entity_type_cf', 'supports_cif', 'name_of_parent_entity',
    // Profile optional (6)
    'profile_subsidiary_id', 'profile_subsidiary_name', 'profile_state',
    'profile_payment_method_id', 'profile_payment_terms_id', 'profile_relationship_owner_email',
    // Bank optional (8)
    'bank_account_name', 'bank_currency_code', 'bank_iban', 'bank_sort_code',
    'bank_is_primary', 'bank_address_street1', 'bank_address_city', 'bank_address_zip_code',
  ];
  const example = [
    // Required (8)
    'Beta Supplies Ltd',
    'V0002',
    'Wise Payments Limited',
    'GB',
    'HSBC UK Bank PLC',
    '98765432',
    'HBUKGB4B',
    'GB',
    // Supplier optional (19)
    'Beta Supplies Limited',
    'GB123456789',
    'company',
    'Secondary supplier for procurement',
    'https://betasupplies.com',
    'false',
    'false',
    '1 Canada Square',
    '',
    'London',
    '',
    'E14 5AB',
    'GB987654321',
    'Non material Outsourcing',
    '3',
    'C',
    'Third Party',
    'No',
    'N/A',
    // Profile optional (6)
    'b8ba98a2-b361-4df1-871b-de0f9e0c79e3',
    'Wise Payments Limited',
    'active',
    '046c00a9-5f28-44f7-8572-a1cf1fcab90a',
    '77951720-f3d3-43c6-9972-3e42150b8c05',
    'martha.akullo@wise.com',
    // Bank optional (8)
    'Beta Supplies Ltd',
    'GBP',
    'GB82WEST12345698765432',
    '40-47-84',
    'true',
    '1 Canada Square',
    'London',
    'E14 5AB',
  ];

  const header = headers.join(',');
  const exampleRow = example.map(v => `"${v.replace(/"/g, '""')}"`).join(',');

  const blob = new Blob([`${header}\n${exampleRow}\n`], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'bc-vendor-simulator-template.csv';
  a.click();
  URL.revokeObjectURL(url);
}

// ─── Reconciliation CSV export ────────────────────────────────────────────────

function exportReconciliationCSV(rows: SimRow[]) {
  const cols = [
    'bc_vendor_no', 'legal_name', 'wise_entity', 'status',
    'omnea_supplier_id', 'omnea_profile_id', 'omnea_bank_id',
    'existing_omnea_id', 'error_message', 'warnings',
  ] as const;

  type ExportCol = typeof cols[number];
  const esc = (v: string) => `"${v.replace(/"/g, '""')}"`;

  const header = cols.join(',');
  const body = rows.map(r => {
    return cols.map((c: ExportCol) => {
      if (c === 'warnings') return esc(r.warnings.join('; '));
      const val = r[c] ?? '';
      return esc(String(val));
    }).join(',');
  }).join('\n');

  const blob = new Blob([`${header}\n${body}`], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `omnea-reconciliation-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ─── Row validation ───────────────────────────────────────────────────────────

function buildSimRow(raw: Record<string, string>): SimRow {
  const warnings: string[] = [];
  const g = (k: string) => (raw[k] ?? '').trim();

  const cc = g('country_iso2');
  if (cc && cc.length !== 2) {
    warnings.push(`country_iso2 "${cc}" must be exactly 2 characters (ISO-2)`);
  }

  // Copy all mapped columns from COLUMN_GROUPS
  const allMappedCols = COLUMN_GROUPS.flatMap(group => group.columns.map(col => col.name));
  const mappedFields: Record<string, string> = {};
  for (const col of allMappedCols) {
    mappedFields[col] = g(col);
  }

  return {
    _id: `${g('bc_vendor_no')}-${g('subsidiary_name')}-${Math.random().toString(36).slice(2, 8)}`,
    ...mappedFields,
    bc_vendor_no: g('bc_vendor_no'),
    legal_name: g('legal_name'),
    registration_no: g('brn'),
    vat_no: g('tax_number'),
    wise_entity: g('subsidiary_name'),
    country_code: cc,
    payment_terms: '',
    vendor_posting_group: '',
    iban: g('bank_iban'),
    account_number: g('bank_account_no'),
    address_street1: g('address_street1'),
    address_street2: g('address_street2'),
    city: g('city'),
    post_code: g('post_code'),
    swift_code: g('bank_swift_code'),
    sort_code: g('bank_sort_code'),
    bank_name: g('bank_name'),
    bank_country: g('bank_country_iso2'),
    currency_code: '',
    finance_contact_email: '',
    website: g('website'),
    payment_method: '',
    gln: '',
    eori_number: '',
    ic_partner_code: '',
    status: 'pending',
    steps_completed: 0,
    step_statuses: Array<StepStatus>(6).fill('idle'),
    warnings,
  };
}

// ─── Execution engine ─────────────────────────────────────────────────────────

type RowPatch = Omit<Partial<SimRow>, 'step_statuses'>;

async function executeSimRow(
  row: SimRow,
  onUpdate: (patch: Partial<SimRow>) => void,
): Promise<void> {
  const config = getOmneaEnvironmentConfig();
  const base = config.apiBaseUrl;
  const steps: StepStatus[] = Array<StepStatus>(6).fill('idle');

  const push = (extra: RowPatch = {}) => {
    onUpdate({ ...extra, step_statuses: [...steps] });
  };
  const setStep = (i: number, s: StepStatus) => { steps[i] = s; };

  const fail = (i: number, msg: string, errorData?: unknown, extra: RowPatch = {}) => {
    setStep(i, 'error');
    push({
      ...extra,
      status: 'error',
      error_message: msg,
      error_step: i,
      error_raw: errorData !== undefined
        ? JSON.stringify(errorData, null, 2)
        : undefined,
      steps_completed: i,
    });
  };

  const toList = (d: unknown): Record<string, unknown>[] => {
    if (Array.isArray(d)) return d as Record<string, unknown>[];
    if (d && typeof d === 'object') {
      const o = d as Record<string, unknown>;
      if (Array.isArray(o.data)) return o.data as Record<string, unknown>[];
      if (o.data && typeof o.data === 'object' && !Array.isArray(o.data)) {
        const nested = o.data as Record<string, unknown>;
        if (Array.isArray(nested.data)) return nested.data as Record<string, unknown>[];
      }
    }
    return [];
  };

  const toSingle = (d: unknown): Record<string, unknown> | null => {
    if (!d || typeof d !== 'object') return null;
    const o = d as Record<string, unknown>;
    if (o.data && typeof o.data === 'object' && !Array.isArray(o.data)) {
      return o.data as Record<string, unknown>;
    }
    if (typeof o.id === 'string') return o;
    return null;
  };

  push({ status: 'running' });

  // ── Step 0: Create supplier (or skip if pre-flight found an existing one) ──
  let omnea_supplier_id: string;

  if (row.supplierIntent === 'SKIP' && row.preflightSupplierId) {
    omnea_supplier_id = row.preflightSupplierId;
    setStep(0, 'skipped');
    push({ omnea_supplier_id, steps_completed: 1 });
  } else {
    setStep(0, 'running');
    push();

    const supplierPayload: Record<string, unknown> = { name: row.legal_name };
    if (row.legal_name_registered) supplierPayload.legalName = row.legal_name_registered;
    if (row.vat_no) supplierPayload.taxNumber = row.vat_no;
    if (row.entity_type && ['company', 'individual'].includes(row.entity_type)) {
      supplierPayload.entityType = row.entity_type;
    }
    if (row.website) supplierPayload.website = row.website;
    if (row.description) supplierPayload.description = row.description;
    if (row.is_preferred) supplierPayload.isPreferred = row.is_preferred.toLowerCase() === 'true';
    if (row.is_reseller) supplierPayload.isReseller = row.is_reseller.toLowerCase() === 'true';

    const hasAddr = row.address_street1 || row.address_street2 || row.city || row.post_code || row.country_code;
    if (hasAddr) {
      supplierPayload.address = {
        ...(row.address_street1 && { street1: row.address_street1 }),
        ...(row.address_street2 && { street2: row.address_street2 }),
        ...(row.city && { city: row.city }),
        ...(row.post_code && { zipCode: row.post_code }),
        ...(row.country_code && { country: row.country_code }),
        ...(row.state_province && { state: row.state_province }),
      };
    }

    const customFields: Record<string, string> = {};
    if (row.registration_no) customFields['corporate-registration-number'] = row.registration_no;
    if (row.materiality_level) customFields['materiality-level'] = row.materiality_level;
    if (row.infosec_criticality_tier) customFields['infosec-criticality-tier'] = row.infosec_criticality_tier;
    if (row.infosec_sensitivity_tier) customFields['infosec-sensitivity-tier'] = row.infosec_sensitivity_tier;
    if (row.entity_type_cf) customFields['entity-type'] = row.entity_type_cf;
    if (row.supports_cif) customFields['supports-cif-1'] = row.supports_cif;
    if (row.name_of_parent_entity) customFields['name-of-parent-entity'] = row.name_of_parent_entity;
    if (Object.keys(customFields).length > 0) supplierPayload.customFields = customFields;

    const createRes = await makeOmneaRequest<unknown>(`${base}/v1/suppliers/batch`, {
      method: 'POST',
      body: { suppliers: [supplierPayload] },
    });
    if (createRes.error) {
      return void fail(0, `Create supplier: ${createRes.error}`, createRes.errorData);
    }

    const createdList = toList(createRes.data);
    const createdSupplier = createdList[0];
    if (!createdSupplier || typeof createdSupplier.id !== 'string') {
      return void fail(0, 'Create supplier: unexpected response (missing id)', createRes.data);
    }
    omnea_supplier_id = createdSupplier.id;

    setStep(0, 'done');
    push({ omnea_supplier_id, steps_completed: 1 });
  }

  // ── Step 1: Create supplier profile (skip if pre-flight found existing) ──
  let omnea_profile_id = '';
  let subsidiary_id = '';

  if (row.profileIntent === 'SKIP' && row.preflightProfileSubsidiaryId) {
    subsidiary_id = row.preflightProfileSubsidiaryId;
    omnea_profile_id = row.preflightProfileSubsidiaryId;
    setStep(1, 'skipped');
    push({ omnea_profile_id, steps_completed: 2 });
  } else {
    setStep(1, 'running');
    push();

    const profileEntry: Record<string, unknown> = {
      subsidiary: row.profile_subsidiary_id
        ? { id: row.profile_subsidiary_id }
        : { name: row.profile_subsidiary_name || row.wise_entity },
      state: (row.profile_state && ['active', 'archived', 'inactive'].includes(row.profile_state))
        ? row.profile_state
        : 'active',
    };
    if (row.profile_payment_method_id) profileEntry.paymentMethod = { id: row.profile_payment_method_id };
    if (row.profile_payment_terms_id) profileEntry.paymentTerms = { id: row.profile_payment_terms_id };
    if (row.profile_relationship_owner_email) {
      profileEntry.customFields = { supplierProfileRelationshipOwner: row.profile_relationship_owner_email };
    }

    const profileRes = await makeOmneaRequest<unknown>(
      `${base}/v1/suppliers/${omnea_supplier_id}/profiles/batch`,
      { method: 'POST', body: { profiles: [profileEntry] } },
    );
    if (profileRes.error) {
      return void fail(1, `Create profile: ${profileRes.error}`, profileRes.errorData);
    }

    const profileList = toList(profileRes.data);
    let profileRecord: Record<string, unknown> | undefined = profileList[0];

    // Batch returns { "data": [] } when profile already exists — fall back to GET
    if (!profileRecord) {
      const lookupId = row.profile_subsidiary_id;
      if (lookupId) {
        const existingRes = await makeOmneaRequest<unknown>(
          `${base}/v1/suppliers/${omnea_supplier_id}/profiles/${lookupId}`,
        );
        if (!existingRes.error && existingRes.data) {
          profileRecord = toSingle(existingRes.data) ?? undefined;
        }
      }
    }

    if (!profileRecord || typeof profileRecord.id !== 'string') {
      const subsidiaryLabel = row.profile_subsidiary_id
        ? `ID ${row.profile_subsidiary_id}`
        : `name "${row.profile_subsidiary_name || row.wise_entity}"`;
      return void fail(1, `Create profile: subsidiary ${subsidiaryLabel} not found in Omnea. Check profile_subsidiary_id is correct.`, profileRes.data);
    }

    omnea_profile_id = profileRecord.id;
    const subObj = profileRecord.subsidiary;
    subsidiary_id =
      subObj && typeof subObj === 'object' &&
      typeof (subObj as Record<string, unknown>).id === 'string'
        ? (subObj as Record<string, unknown>).id as string
        : omnea_profile_id;

    setStep(1, 'done');
    push({ omnea_profile_id, steps_completed: 2 });
  }

  // ── Step 2: Create bank account directly at profile level (creates + links in one call) ──
  let omnea_bank_id = '';

  if (row.bankIntent === 'SKIP' && row.preflightBankId) {
    omnea_bank_id = row.preflightBankId;
    setStep(2, 'skipped');
    push({ omnea_bank_id, steps_completed: 3 });
  } else {
    setStep(2, 'running');
    push();

    const bankEntry: Record<string, unknown> = {
      remoteId: row.account_number,
      isPrimary: row.bank_is_primary?.toLowerCase() !== 'false',
      accountName: row.bank_account_name || row.legal_name,
      accountNumber: row.account_number,
      address: {
        country: row.bank_country || '',
        city: row.bank_address_city || '',
        street1: row.bank_address_street1 || '',
        zipCode: row.bank_address_zip_code || '',
      },
    };
    if (row.iban) bankEntry.iban = row.iban;
    if (row.swift_code) bankEntry.swiftCode = row.swift_code;
    if (row.bank_name) bankEntry.bankName = row.bank_name;
    if (row.bank_sort_code) bankEntry.sortCode = row.bank_sort_code;
    if (row.bank_currency_code) {
      const currencyCode = row.bank_currency_code.trim().toUpperCase();
      const currencyIdByCode = await getCurrencyIdByCode(base);
      const currencyId = currencyIdByCode.get(currencyCode);

      if (!currencyId) {
        return void fail(
          2,
          `Create bank account: currency code "${currencyCode}" was not found in Omnea. Provide a valid bank_currency_code or leave it blank.`,
          { bank_currency_code: row.bank_currency_code },
        );
      }

      bankEntry.currency = { id: currencyId };
    }

    const bankRes = await makeOmneaRequest<unknown>(
      `${base}/v1/suppliers/${omnea_supplier_id}/profiles/${subsidiary_id}/bank-accounts/batch`,
      { method: 'POST', body: { bankAccounts: [bankEntry] } },
    );

    const bankResData = bankRes.data as Record<string, unknown> | undefined;
    const bankList = toList(bankRes.data);
    const bankRecord = bankList[0];
    const bankFailures = Array.isArray(bankResData?.failures)
      ? bankResData!.failures as Record<string, unknown>[]
      : [];

    if (bankRes.error || (!bankRecord && bankFailures.length === 0)) {
      return void fail(2, `Create bank account: ${bankRes.error ?? 'unexpected response'}`, bankRes.errorData ?? bankRes.data);
    }

    if (!bankRecord && bankFailures.length > 0) {
      const firstFailure = bankFailures[0];
      const reason = String(firstFailure.error ?? 'unknown error');
      const staleAccountId = typeof firstFailure.accountId === 'string' ? firstFailure.accountId : undefined;
      const isDifferentEntity = reason.toLowerCase().includes('different entity');
      const isAlreadyLinked = !isDifferentEntity && (
        reason.toLowerCase().includes('already linked') ||
        reason.toLowerCase().includes('already attached')
      );

      if (isDifferentEntity) {
        // Stale bank from a deleted supplier — globally locked, cannot auto-recover
        const hint = staleAccountId
          ? ` Stale bank ID: ${staleAccountId}. Delete it in Omnea then re-run, or use a different account number in the CSV.`
          : ' Delete the conflicting bank account in Omnea then re-run.';
        return void fail(2, `Create bank account: ${reason}.${hint}`, bankRes.data, {
          stale_bank_id: staleAccountId,
        });
      } else if (isAlreadyLinked) {
        // Bank already linked to THIS profile — retrieve it
        const profileBankRes = await makeOmneaRequest<unknown>(
          `${base}/v1/suppliers/${omnea_supplier_id}/profiles/${subsidiary_id}/bank-accounts?limit=10`,
        );
        const profileBanks = toList(profileBankRes.data);
        if (profileBanks.length > 0 && typeof profileBanks[0].id === 'string') {
          omnea_bank_id = profileBanks[0].id;
          setStep(2, 'done');
          push({ omnea_bank_id, steps_completed: 3 });
        } else {
          return void fail(2, `Create bank account: ${reason} — could not retrieve existing bank`, bankRes.data);
        }
      } else {
        return void fail(2, `Create bank account: ${reason}`, bankRes.data);
      }
    } else {
      omnea_bank_id = bankRecord && typeof bankRecord.id === 'string' ? bankRecord.id : '';
      setStep(2, 'done');
      push({ omnea_bank_id, steps_completed: 3 });
    }
  }

  // ── Steps 3-5: PATCH remoteId on supplier, profile, bank ─────────────
  // Best-effort metadata writes — non-fatal if they fail.

  // Step 3: PATCH supplier
  setStep(3, 'running');
  push();
  const patchSupRes = await makeOmneaRequest<unknown>(
    `${base}/v1/suppliers/${omnea_supplier_id}`,
    { method: 'PATCH', body: { remoteId: row.bc_vendor_no } },
  );
  setStep(3, patchSupRes.error ? 'skipped' : 'done');
  push({ steps_completed: 4 });

  // Step 4: PATCH profile
  setStep(4, 'running');
  push();
  const remoteLink = `https://businesscentral.dynamics.com/?company=${encodeURIComponent(row.wise_entity)}&page=26&filter=${encodeURIComponent(`No. IS ${row.bc_vendor_no}`)}`;
  const patchProfBody: Record<string, unknown> = { remoteId: row.bc_vendor_no, remoteLink };
  if (row['profile_remote_id']) patchProfBody.remoteId = row['profile_remote_id'];
  const patchProfRes = await makeOmneaRequest<unknown>(
    `${base}/v1/suppliers/${omnea_supplier_id}/profiles/${subsidiary_id}`,
    { method: 'PATCH', body: patchProfBody },
  );
  setStep(4, patchProfRes.error ? 'skipped' : 'done');
  push({ steps_completed: 5 });

  // Step 5: PATCH bank account
  setStep(5, 'running');
  push();
  const patchBankBody: Record<string, unknown> = { remoteId: row.account_number };
  if (row['bank_remote_id']) patchBankBody.remoteId = row['bank_remote_id'];
  const patchBankRes = await makeOmneaRequest<unknown>(
    `${base}/v1/suppliers/${omnea_supplier_id}/bank-accounts/${omnea_bank_id}`,
    { method: 'PATCH', body: patchBankBody },
  );
  setStep(5, patchBankRes.error ? 'skipped' : 'done');
  push({
    status: 'created',
    steps_completed: 6,
    omnea_supplier_id,
    omnea_profile_id,
    omnea_bank_id,
  });
}

async function runSimulation(
  rows: SimRow[],
  concurrency: 1 | 3 | 5,
  onRowUpdate: (id: string, patch: Partial<SimRow>) => void,
  abortRef: { current: boolean },
): Promise<void> {
  const pending = rows.filter(r => r.status === 'pending');

  for (let i = 0; i < pending.length; i += concurrency) {
    if (abortRef.current) break;
    const batch = pending.slice(i, i + concurrency);
    await Promise.all(
      batch.map(row => executeSimRow(row, patch => onRowUpdate(row._id, patch))),
    );
  }

  if (abortRef.current) {
    onRowUpdate('__bulk_skip__', {}); // signal to skip remaining pending rows
  }
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function WizardHeader({ step }: { step: 1 | 2 | 3 | 4 }) {
  return (
    <div className="flex items-center gap-0 mb-8 flex-wrap gap-y-2">
      {WIZARD_STEPS.map((label, i) => {
        const n = (i + 1) as 1 | 2 | 3 | 4;
        const active = n === step;
        const done = n < step;
        return (
          <div key={n} className="flex items-center">
            <div className={cn(
              'flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-colors',
              active && 'bg-primary text-primary-foreground',
              done && 'bg-primary/15 text-primary',
              !active && !done && 'bg-muted text-muted-foreground',
            )}>
              <span className={cn(
                'h-5 w-5 rounded-full flex items-center justify-center text-xs font-bold shrink-0',
                active && 'bg-white/90 text-primary',
                done && 'bg-primary text-white',
                !active && !done && 'bg-muted-foreground/25 text-muted-foreground',
              )}>
                {done ? '✓' : n}
              </span>
              {label}
            </div>
            {i < WIZARD_STEPS.length - 1 && (
              <ArrowRight className="h-3.5 w-3.5 mx-1.5 text-muted-foreground/40 shrink-0" />
            )}
          </div>
        );
      })}
    </div>
  );
}

function StepDots({ statuses }: { statuses: StepStatus[] }) {
  return (
    <div className="flex items-center gap-1">
      {statuses.map((s, i) => (
        <div
          key={i}
          title={STEP_LABELS[i]}
          className={cn(
            'w-2 h-2 rounded-full transition-colors',
            s === 'idle' && 'bg-muted-foreground/20',
            s === 'running' && 'bg-blue-400 animate-pulse',
            s === 'done' && 'bg-green-500',
            s === 'error' && 'bg-red-500',
            s === 'skipped' && 'bg-muted-foreground/15',
          )}
        />
      ))}
    </div>
  );
}

function RowStatusCard({
  row,
  onPrepareRerun,
}: {
  row: SimRow;
  onPrepareRerun: (id: string, patch: Partial<SimRow>) => void;
}) {
  const [rawOpen, setRawOpen] = useState(false);
  const [deleteState, setDeleteState] = useState<'idle' | 'running' | 'done' | 'error'>('idle');
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const failedStepLabel = row.error_step !== undefined ? STEP_LABELS[row.error_step] : undefined;

  const canDeleteStaleBank = Boolean(
    row.status === 'error' &&
    row.error_step === 2 &&
    row.stale_bank_id &&
    row.omnea_supplier_id &&
    row.omnea_profile_id,
  );

  const handleDeleteStaleBank = async () => {
    if (!row.stale_bank_id || !row.omnea_supplier_id || !row.omnea_profile_id) return;

    setDeleteState('running');
    setDeleteError(null);

    const config = getOmneaEnvironmentConfig();
    const deleteRes = await makeOmneaRequest<unknown>(
      `${config.apiBaseUrl}/v1/suppliers/${row.omnea_supplier_id}/profiles/${row.omnea_profile_id}/bank-accounts/${row.stale_bank_id}`,
      { method: 'DELETE' },
    );

    if (deleteRes.error) {
      setDeleteState('error');
      setDeleteError(deleteRes.error);
      toast.error(`Failed to delete stale bank ${row.stale_bank_id}: ${deleteRes.error}`);
      return;
    }

    setDeleteState('done');
    toast.success(`Deleted stale bank ${row.stale_bank_id}. You can re-run this row now.`);
    onPrepareRerun(row._id, {
      status: 'pending',
      supplierIntent: 'SKIP',
      profileIntent: 'SKIP',
      bankIntent: 'CREATE',
      preflightSupplierId: row.omnea_supplier_id,
      preflightProfileSubsidiaryId: row.omnea_profile_id,
      preflightBankId: undefined,
      stale_bank_id: undefined,
      error_message: undefined,
      error_step: undefined,
      error_raw: undefined,
      step_statuses: Array<StepStatus>(6).fill('idle'),
      steps_completed: 0,
      omnea_bank_id: undefined,
    });
  };

  return (
    <div className={cn(
      'rounded-lg border text-sm transition-colors',
      row.status === 'running' && 'border-blue-300 bg-blue-50/40 dark:bg-blue-950/20',
      row.status === 'created' && 'border-green-300 bg-green-50/40 dark:bg-green-950/20',
      row.status === 'duplicate' && 'border-amber-300 bg-amber-50/40 dark:bg-amber-950/20',
      row.status === 'error' && 'border-red-300 bg-red-50/40 dark:bg-red-950/20',
      (row.status === 'pending' || row.status === 'skipped') && 'border-border bg-card',
    )}>
      {/* Main row */}
      <div className="flex items-start gap-3 p-3">
        {/* Status icon */}
        <div className="mt-0.5 shrink-0">
          {row.status === 'running'   && <Loader2 className="h-4 w-4 animate-spin text-blue-500" />}
          {row.status === 'created'   && <CheckCircle2 className="h-4 w-4 text-green-600" />}
          {row.status === 'duplicate' && <AlertTriangle className="h-4 w-4 text-amber-500" />}
          {row.status === 'error'     && <XCircle className="h-4 w-4 text-red-500" />}
          {row.status === 'pending'   && <div className="h-4 w-4 rounded-full border-2 border-muted-foreground/30" />}
          {row.status === 'skipped'   && <div className="h-4 w-4 rounded-full border-2 border-muted-foreground/20" />}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0 space-y-1.5">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium truncate max-w-[200px]">{row.legal_name}</span>
            <code className="text-[11px] bg-muted px-1.5 py-0.5 rounded font-mono">{row.bc_vendor_no}</code>
            <span className="text-muted-foreground text-xs truncate">{row.wise_entity}</span>
          </div>

          {row.status === 'duplicate' && row.existing_omnea_id && (
            <p className="text-amber-700 dark:text-amber-400 text-xs">
              Already in Omnea:{' '}
              <code className="font-mono bg-amber-100 dark:bg-amber-900/30 px-1 rounded">
                {row.existing_omnea_id}
              </code>
            </p>
          )}
          {row.status === 'created' && row.omnea_supplier_id && (
            <p className="text-green-700 dark:text-green-400 text-xs font-mono">
              {row.omnea_supplier_id}
            </p>
          )}

          {/* Step progress dots */}
          <div className="flex items-center gap-2">
            <StepDots statuses={row.step_statuses} />
            <span className="text-[10px] text-muted-foreground/60 hidden sm:block">
              {STEP_LABELS.join(' · ')}
            </span>
          </div>
        </div>
      </div>

      {/* Error detail panel — only shown on error */}
      {row.status === 'error' && (
        <div className="border-t border-red-200 dark:border-red-900 px-3 pb-3 pt-2.5 space-y-2">
          {/* Failed step + message */}
          <div className="flex items-start gap-2">
            {failedStepLabel && (
              <Badge variant="outline" className="border-red-400 text-red-600 dark:text-red-400 text-[10px] px-1.5 shrink-0 mt-0.5">
                {failedStepLabel}
              </Badge>
            )}
            <p className="text-xs text-red-700 dark:text-red-400 break-all">
              {row.error_message ?? 'Unknown error'}
            </p>
          </div>

          {/* Partial IDs created before failure */}
          {(row.omnea_supplier_id || row.omnea_profile_id || row.omnea_bank_id) && (
            <div className="rounded bg-red-100/60 dark:bg-red-900/20 px-2 py-1.5 space-y-0.5">
              <p className="text-[10px] font-medium text-red-700 dark:text-red-400 uppercase tracking-wide mb-1">
                Partial records created — may need cleanup
              </p>
              {row.omnea_supplier_id && (
                <p className="text-[11px] font-mono text-red-600 dark:text-red-400">
                  Supplier: {row.omnea_supplier_id}
                </p>
              )}
              {row.omnea_profile_id && (
                <p className="text-[11px] font-mono text-red-600 dark:text-red-400">
                  Profile: {row.omnea_profile_id}
                </p>
              )}
              {row.omnea_bank_id && (
                <p className="text-[11px] font-mono text-red-600 dark:text-red-400">
                  Bank account: {row.omnea_bank_id}
                </p>
              )}
              {row.stale_bank_id && (
                <p className="text-[11px] font-mono text-red-600 dark:text-red-400">
                  Stale bank: {row.stale_bank_id}
                </p>
              )}
            </div>
          )}

          {canDeleteStaleBank && (
            <div className="rounded border border-red-200 dark:border-red-900 bg-background/70 px-2 py-2 space-y-2">
              <div className="text-[11px] text-red-700 dark:text-red-400">
                The bank create failed because this bank account is still linked elsewhere in Omnea. You can try deleting the stale bank link directly from here.
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={handleDeleteStaleBank}
                  disabled={deleteState === 'running' || deleteState === 'done'}
                  className="gap-1.5 h-8"
                >
                  {deleteState === 'running' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <XCircle className="h-3.5 w-3.5" />}
                  {deleteState === 'done' ? 'Stale bank deleted' : 'Delete stale bank'}
                </Button>
                {deleteState === 'done' && (
                  <span className="text-[11px] text-green-700 dark:text-green-400">
                    Delete request succeeded. Re-run this row to recreate and relink the bank account.
                  </span>
                )}
                {deleteState === 'error' && deleteError && (
                  <span className="text-[11px] text-red-700 dark:text-red-400 break-all">
                    Delete failed: {deleteError}
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Raw API response body */}
          {row.error_raw && (
            <Collapsible open={rawOpen} onOpenChange={setRawOpen}>
              <CollapsibleTrigger asChild>
                <button className="flex items-center gap-1 text-[11px] text-red-500 dark:text-red-400 hover:underline">
                  <ChevronDown className={cn('h-3 w-3 transition-transform', rawOpen && 'rotate-180')} />
                  {rawOpen ? 'Hide' : 'Show'} raw API response
                </button>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <pre className="mt-1.5 rounded bg-red-950/10 dark:bg-red-950/40 border border-red-200 dark:border-red-800 p-2 text-[10px] text-red-800 dark:text-red-300 overflow-auto max-h-48 whitespace-pre-wrap break-all">
                  {row.error_raw}
                </pre>
              </CollapsibleContent>
            </Collapsible>
          )}
        </div>
      )}
    </div>
  );
}

function MetricCard({
  label, value, color,
}: { label: string; value: number; color: 'green' | 'amber' | 'red' | 'blue' }) {
  const colorMap = {
    green: 'text-green-600 dark:text-green-400',
    amber: 'text-amber-500 dark:text-amber-400',
    red: 'text-red-600 dark:text-red-400',
    blue: 'text-primary',
  };
  return (
    <Card>
      <CardContent className="pt-6 pb-5 text-center">
        <p className={cn('text-3xl font-bold tabular-nums', colorMap[color])}>{value}</p>
        <p className="text-sm text-muted-foreground mt-1">{label}</p>
      </CardContent>
    </Card>
  );
}

// ─── Step 1: Upload CSV ───────────────────────────────────────────────────────

function Step1Upload({
  onParsed,
}: {
  onParsed: (rows: SimRow[], rawCount: number) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [specOpen, setSpecOpen] = useState(false);

  const processFile = useCallback((file: File) => {
    if (!file.name.endsWith('.csv')) {
      setErrors(['File must be a .csv']);
      return;
    }
    const reader = new FileReader();
    reader.onload = e => {
      const text = (e.target?.result as string) ?? '';
      const rawRows = parseCSVRFC4180(text);
      if (rawRows.length === 0) {
        setErrors(['CSV is empty or has no data rows']);
        return;
      }
      const headers = Object.keys(rawRows[0]);
      const missing = REQUIRED_COLS.filter(c => !headers.includes(c));
      if (missing.length > 0) {
        setErrors(missing.map(c => `Missing required column: ${c}`));
        return;
      }
      setErrors([]);
      const simRows = rawRows.map(r => buildSimRow(r));
      onParsed(simRows, rawRows.length);
    };
    reader.readAsText(file);
  }, [onParsed]);

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h2 className="text-lg font-semibold mb-1">Upload vendor CSV</h2>
        <p className="text-sm text-muted-foreground">
          Upload a CSV containing BC vendors to migrate to Omnea. Required and optional columns are listed below.
        </p>
      </div>

      {/* Template download */}
      <div className="flex justify-end">
        <Button variant="outline" size="sm" onClick={downloadCSVTemplate} className="gap-1.5">
          <Download className="h-3.5 w-3.5" />
          Download template
        </Button>
      </div>

      {/* Drop zone */}
      <div
        role="button"
        tabIndex={0}
        onClick={() => inputRef.current?.click()}
        onKeyDown={e => e.key === 'Enter' && inputRef.current?.click()}
        onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
        onDragEnter={e => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={e => {
          e.preventDefault();
          setIsDragging(false);
          const file = e.dataTransfer.files[0];
          if (file) processFile(file);
        }}
        className={cn(
          'border-2 border-dashed rounded-xl p-12 text-center cursor-pointer transition-colors select-none',
          isDragging
            ? 'border-primary bg-primary/5'
            : 'border-border hover:border-primary/50 hover:bg-muted/40',
        )}
      >
        <Upload className="h-8 w-8 mx-auto mb-3 text-muted-foreground" />
        <p className="text-sm font-medium">Drop CSV here or click to browse</p>
        <p className="text-xs text-muted-foreground mt-1">Only .csv files are accepted</p>
        <input
          ref={inputRef}
          type="file"
          accept=".csv"
          className="hidden"
          onChange={e => { if (e.target.files?.[0]) processFile(e.target.files[0]); }}
        />
      </div>

      {/* Parse errors */}
      {errors.length > 0 && (
        <div className="rounded-lg border border-red-300 bg-red-50 dark:bg-red-950/20 p-4 space-y-1">
          <p className="text-sm font-medium text-red-700 dark:text-red-400 mb-2 flex items-center gap-1.5">
            <XCircle className="h-4 w-4" /> File rejected
          </p>
          {errors.map((e, i) => (
            <p key={i} className="text-xs text-red-600 dark:text-red-400 font-mono">{e}</p>
          ))}
        </div>
      )}

      {/* Column spec */}
      <div>
        <Collapsible open={specOpen} onOpenChange={setSpecOpen}>
          <CollapsibleTrigger asChild>
            <Button variant="ghost" size="sm" className="text-muted-foreground gap-1.5 px-0 hover:bg-transparent hover:text-foreground">
              <ChevronDown className={cn('h-4 w-4 transition-transform', specOpen && 'rotate-180')} />
              Column specification
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="mt-3 rounded-lg border overflow-hidden text-xs">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-6"></TableHead>
                    <TableHead>Column name</TableHead>
                    <TableHead>Maps to</TableHead>
                    <TableHead>Required?</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {COLUMN_GROUPS.map(group => (
                    <Fragment key={group.label}>
                      <TableRow className="bg-muted/60 hover:bg-muted/60">
                        <TableCell colSpan={4} className="py-1.5 px-3">
                          <span className="font-semibold text-foreground">{group.label}</span>
                          <span className="ml-2 font-mono text-muted-foreground/70">{group.endpoint}</span>
                        </TableCell>
                      </TableRow>
                      {group.columns.map(col => (
                        <TableRow key={col.name}>
                          <TableCell className="pl-3">
                            <span className={cn(
                              'h-2 w-2 rounded-full block',
                              col.required ? 'bg-red-500' : 'bg-muted-foreground/30',
                            )} />
                          </TableCell>
                          <TableCell className="font-mono">{col.name}</TableCell>
                          <TableCell className="font-mono text-muted-foreground whitespace-normal break-words max-w-[200px]">{col.mapsTo}</TableCell>
                          <TableCell className={col.required ? 'text-red-600 font-medium' : 'text-muted-foreground'}>
                            {col.required ? 'Required' : 'Optional'}
                          </TableCell>
                        </TableRow>
                      ))}
                    </Fragment>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CollapsibleContent>
        </Collapsible>
      </div>
    </div>
  );
}

// ─── Review card sub-components ──────────────────────────────────────────────

function IntentBadge({ intent = 'UNKNOWN' }: { intent?: EntityIntent }) {
  const cls: Record<EntityIntent, string> = {
    CREATE:  'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
    UPDATE:  'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
    SKIP:    'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400',
    UNKNOWN: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  };
  return (
    <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded uppercase tracking-wide ${cls[intent]}`}>
      {intent}
    </span>
  );
}

function ReviewRow({ label, value }: { label: string; value: string | undefined }) {
  if (!value) return null;
  return (
    <div className="flex items-start gap-2 text-xs">
      <span className="text-muted-foreground w-32 shrink-0">{label}</span>
      <span className="font-mono break-all">{value}</span>
    </div>
  );
}

function SupplierReviewCard({ row, index }: { row: SimRow; index: number }) {
  const address = [row.address_street1, row.city, row.country_iso2].filter(Boolean).join(', ');
  return (
    <Card>
      <CardContent className="pt-4 pb-4 space-y-4">
        {/* Header */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-muted-foreground font-mono shrink-0">#{index + 1}</span>
          <span className="font-semibold">{row.legal_name}</span>
          <code className="text-[11px] bg-muted px-1.5 py-0.5 rounded font-mono">{row.bc_vendor_no}</code>
          {row.warnings.length > 0 && (
            <Badge variant="outline" className="border-amber-400 text-amber-600 text-[10px] gap-1">
              <AlertTriangle className="h-3 w-3" />
              {row.warnings.length} warning{row.warnings.length !== 1 ? 's' : ''}
            </Badge>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {/* Supplier section */}
          <div className="space-y-1.5">
            <div className="flex items-center gap-1.5 mb-2">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Supplier</span>
              <IntentBadge intent={row.supplierIntent ?? 'UNKNOWN'} />
              {row.preflightSupplierId && (
                <code className="text-[9px] text-muted-foreground font-mono truncate max-w-[100px]" title={row.preflightSupplierId}>{row.preflightSupplierId.slice(0, 8)}…</code>
              )}
            </div>
            <ReviewRow label="Tax Number"    value={row.tax_number} />
            <ReviewRow label="Entity Type"   value={row.entity_type} />
            <ReviewRow label="BRN"           value={row.brn} />
            <ReviewRow label="Materiality"   value={row.materiality_level} />
            <ReviewRow label="InfoSec Crit." value={row.infosec_criticality_tier} />
            <ReviewRow label="InfoSec Sens." value={row.infosec_sensitivity_tier} />
            {address && <ReviewRow label="Address" value={address} />}
          </div>

          {/* Profile section */}
          <div className="space-y-1.5">
            <div className="flex items-center gap-1.5 mb-2">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Supplier Profile</span>
              <IntentBadge intent={row.profileIntent ?? 'UNKNOWN'} />
            </div>
            <ReviewRow label="Subsidiary"      value={row.profile_subsidiary_name || row.subsidiary_name || row.wise_entity} />
            <ReviewRow label="State"           value={row.profile_state || 'active'} />
            <ReviewRow label="Payment Method"  value={row.profile_payment_method_id} />
            <ReviewRow label="Payment Terms"   value={row.profile_payment_terms_id} />
            <ReviewRow label="Owner Email"     value={row.profile_relationship_owner_email} />
          </div>

          {/* Bank section */}
          <div className="space-y-1.5">
            <div className="flex items-center gap-1.5 mb-2">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Bank Account</span>
              <IntentBadge intent={row.bankIntent ?? 'UNKNOWN'} />
            </div>
            <ReviewRow label="Account Name"  value={row.bank_account_name || row.legal_name} />
            <ReviewRow label="Bank Name"     value={row.bank_name} />
            <ReviewRow label="Account No"    value={row.account_number} />
            <ReviewRow label="Swift Code"    value={row.swift_code} />
            <ReviewRow label="IBAN"          value={row.iban} />
            <ReviewRow label="Sort Code"     value={row.sort_code} />
            <ReviewRow label="Currency"      value={row.bank_currency_code} />
            <ReviewRow label="Country"       value={row.bank_country_iso2 || row.bank_country} />
          </div>
        </div>

        {/* Warnings */}
        {row.warnings.length > 0 && (
          <div className="rounded bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 px-3 py-2 space-y-1">
            {row.warnings.map((w, i) => (
              <div key={i} className="flex items-start gap-1 text-xs text-amber-700 dark:text-amber-400">
                <AlertTriangle className="h-3 w-3 mt-0.5 shrink-0" />
                <span>{w}</span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Step 2: Pre-flight ───────────────────────────────────────────────────────

function Step2Preflight({
  rows,
  onBack,
  onUpdateRows,
  onProceed,
}: {
  rows: SimRow[];
  onBack: () => void;
  onUpdateRows: (updated: SimRow[]) => void;
  onProceed: () => void;
}) {
  const [checking, setChecking] = useState(false);
  const [checkError, setCheckError] = useState<string | null>(null);
  const done = rows.some(r => r.preflightDone);

  const toList = (d: unknown): Record<string, unknown>[] => {
    if (Array.isArray(d)) return d as Record<string, unknown>[];
    if (d && typeof d === 'object') {
      const o = d as Record<string, unknown>;
      if (Array.isArray(o.data)) return o.data as Record<string, unknown>[];
    }
    return [];
  };

  const toSingle = (d: unknown): Record<string, unknown> | null => {
    if (!d || typeof d !== 'object') return null;
    const o = d as Record<string, unknown>;
    if (o.data && typeof o.data === 'object' && !Array.isArray(o.data)) return o.data as Record<string, unknown>;
    if (typeof o.id === 'string') return o;
    return null;
  };

  const runPreflight = async () => {
    setChecking(true);
    setCheckError(null);
    const config = getOmneaEnvironmentConfig();
    const base = config.apiBaseUrl;

    // 1. Fetch all existing suppliers (paginated, API max = 100)
    const existingSuppliers: Record<string, unknown>[] = [];
    let offset = 0;
    while (true) {
      const res = await makeOmneaRequest<unknown>(
        `${base}/v1/suppliers?limit=100&offset=${offset}`,
      );
      if (res.error || !res.data) {
        setCheckError(res.error ?? 'Failed to fetch suppliers from Omnea');
        setChecking(false);
        return;
      }
      const page = toList(res.data);
      existingSuppliers.push(...page);
      if (page.length < 100) break;
      offset += 100;
    }

    // 2. For each row: match supplier, then check profile if supplier exists
    const normalizeText = (value: unknown) =>
      typeof value === 'string'
        ? value.trim().toLowerCase().replace(/\s+/g, ' ')
        : '';

    const updated = await Promise.all(rows.map(async (row): Promise<SimRow> => {
      const nameLower = row.legal_name.trim().toLowerCase();
      const matchedSupplier = existingSuppliers.find(
        s => typeof s.name === 'string' && s.name.trim().toLowerCase() === nameLower,
      );
      const supplierId = matchedSupplier && typeof matchedSupplier.id === 'string'
        ? matchedSupplier.id
        : undefined;

      let profileIntent: EntityIntent = 'CREATE';
      let preflightProfileSubsidiaryId: string | undefined;
      let bankIntent: EntityIntent = 'CREATE';
      let preflightBankId: string | undefined;

      if (supplierId) {
        let resolvedProfileId: string | undefined;

        if (row.profile_subsidiary_id) {
          // Direct profile lookup by known subsidiary/profile ID.
          const profRes = await makeOmneaRequest<unknown>(
            `${base}/v1/suppliers/${supplierId}/profiles/${row.profile_subsidiary_id}`,
          );
          if (!profRes.error && profRes.data) {
            const profRecord = toSingle(profRes.data);
            if (profRecord) {
              resolvedProfileId = row.profile_subsidiary_id;
            }
          }
        }

        if (!resolvedProfileId) {
          // Fallback: list profiles and match by subsidiary name/wise entity.
          const profileListRes = await makeOmneaRequest<unknown>(
            `${base}/v1/suppliers/${supplierId}/profiles?limit=100`,
          );
          if (!profileListRes.error && profileListRes.data) {
            const profiles = toList(profileListRes.data);
            const targetNames = [
              normalizeText(row.profile_subsidiary_name),
              normalizeText(row.subsidiary_name),
              normalizeText(row.wise_entity),
            ].filter(Boolean);

            const matchedProfile = profiles.find((profile) => {
              const subsidiary = profile.subsidiary;
              if (!subsidiary || typeof subsidiary !== 'object') return false;
              const subsidiaryRecord = subsidiary as Record<string, unknown>;
              const subsidiaryName = normalizeText(subsidiaryRecord.name);
              if (!subsidiaryName) return false;
              return targetNames.includes(subsidiaryName);
            });

            if (matchedProfile) {
              const subsidiary = matchedProfile.subsidiary as Record<string, unknown> | undefined;
              if (subsidiary && typeof subsidiary.id === 'string') {
                resolvedProfileId = subsidiary.id;
              }
            }
          }
        }

        if (resolvedProfileId) {
          profileIntent = 'SKIP';
          preflightProfileSubsidiaryId = resolvedProfileId;

          // Check whether this specific bank already exists on the profile.
          const bankListRes = await makeOmneaRequest<unknown>(
            `${base}/v1/suppliers/${supplierId}/profiles/${resolvedProfileId}/bank-accounts?limit=100`,
          );
          if (!bankListRes.error && bankListRes.data) {
            const attachedBanks = toList(bankListRes.data);
            const normalizedAccountNumber = normalizeText(row.account_number);
            const normalizedIban = normalizeText(row.iban);
            const normalizedRemoteId = normalizeText(row.bank_remote_id || row.account_number);

            const matchedBank = attachedBanks.find((bank) => {
              const bankAccountNumber = normalizeText(bank.accountNumber);
              const bankIban = normalizeText(bank.iban);
              const bankRemoteId = normalizeText(bank.remoteId);

              if (normalizedRemoteId && bankRemoteId && bankRemoteId === normalizedRemoteId) return true;
              if (normalizedIban && bankIban && bankIban === normalizedIban) return true;
              if (normalizedAccountNumber && bankAccountNumber && bankAccountNumber === normalizedAccountNumber) return true;
              return false;
            });

            if (matchedBank && typeof matchedBank.id === 'string') {
              bankIntent = 'SKIP';
              preflightBankId = matchedBank.id;
            }
          }
        }
      }

      return {
        ...row,
        supplierIntent: (supplierId ? 'SKIP' : 'CREATE') as EntityIntent,
        profileIntent,
        bankIntent,
        preflightDone: true,
        preflightSupplierId: supplierId,
        preflightProfileSubsidiaryId,
        preflightBankId,
      };
    }));

    onUpdateRows(updated);
    setChecking(false);
  };

  const toCreate = rows.filter(r => r.supplierIntent === 'CREATE').length;
  const toSkip = rows.filter(r => r.supplierIntent === 'SKIP').length;
  const warnCount = rows.filter(r => r.warnings.length > 0).length;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-semibold">
            Pre-flight — {rows.length} vendor{rows.length !== 1 ? 's' : ''}
          </h2>
          <p className="text-sm text-muted-foreground">
            {done
              ? 'Pre-flight complete. Review intents below, then proceed to simulation.'
              : 'Check Omnea for existing suppliers before running the simulation.'}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {warnCount > 0 && (
            <Badge variant="outline" className="border-amber-400 text-amber-600 gap-1">
              <AlertTriangle className="h-3 w-3" />
              {warnCount} warning{warnCount !== 1 ? 's' : ''}
            </Badge>
          )}
          <Button variant="outline" size="sm" onClick={onBack}>← Back</Button>
          {!done ? (
            <Button onClick={runPreflight} disabled={checking} className="gap-1.5">
              {checking
                ? <><Loader2 className="h-4 w-4 animate-spin" /> Checking…</>
                : <><Play className="h-4 w-4" /> Run Pre-flight Check</>}
            </Button>
          ) : (
            <>
              <Button variant="outline" size="sm" onClick={runPreflight} disabled={checking} className="gap-1.5">
                {checking ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />}
                Re-check
              </Button>
              <Button onClick={onProceed} className="gap-1.5">
                Run Simulation <ArrowRight className="h-4 w-4" />
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Summary counts (shown after check) */}
      {done && (
        <div className="flex gap-3 flex-wrap">
          {toCreate > 0 && (
            <div className="rounded-lg border border-green-200 bg-green-50 dark:bg-green-950/20 dark:border-green-800 px-4 py-3 min-w-[100px] text-center">
              <p className="text-2xl font-bold text-green-600 dark:text-green-400">{toCreate}</p>
              <p className="text-xs text-muted-foreground mt-0.5">to create</p>
            </div>
          )}
          {toSkip > 0 && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-800 px-4 py-3 min-w-[100px] text-center">
              <p className="text-2xl font-bold text-amber-600 dark:text-amber-400">{toSkip}</p>
              <p className="text-xs text-muted-foreground mt-0.5">already in Omnea</p>
            </div>
          )}
          <div className="rounded-lg border px-4 py-3 min-w-[100px] text-center">
            <p className="text-2xl font-bold text-primary">{rows.length}</p>
            <p className="text-xs text-muted-foreground mt-0.5">total</p>
          </div>
        </div>
      )}

      {checkError && (
        <div className="rounded-lg border border-red-300 bg-red-50 dark:bg-red-950/20 p-4 flex items-start gap-2">
          <XCircle className="h-4 w-4 text-red-500 shrink-0 mt-0.5" />
          <p className="text-sm text-red-700 dark:text-red-400">{checkError}</p>
        </div>
      )}

      <ScrollArea className="h-[480px]">
        <div className="space-y-3 pr-2">
          {rows.map((row, i) => (
            <SupplierReviewCard key={row._id} row={row} index={i} />
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}

// ─── Step 3: Execution ────────────────────────────────────────────────────────

function Step3Execute({
  rows,
  isRunning,
  isComplete,
  concurrency,
  onConcurrencyChange,
  onStart,
  onAbort,
  onNext,
  onBack,
  onPrepareRerun,
}: {
  rows: SimRow[];
  isRunning: boolean;
  isComplete: boolean;
  concurrency: 1 | 3 | 5;
  onConcurrencyChange: (v: 1 | 3 | 5) => void;
  onStart: () => void;
  onAbort: () => void;
  onNext: () => void;
  onBack: () => void;
  onPrepareRerun: (id: string, patch: Partial<SimRow>) => void;
}) {
  const pendingCount = rows.filter(r => r.status === 'pending').length;
  const hasPendingRows = pendingCount > 0;
  const doneCount = rows.filter(r => !['pending', 'running'].includes(r.status)).length;
  const progressPct = rows.length > 0 ? Math.round((doneCount / rows.length) * 100) : 0;
  const createdCount = rows.filter(r => r.status === 'created').length;
  const errorCount = rows.filter(r => r.status === 'error').length;
  const dupCount = rows.filter(r => r.status === 'duplicate').length;

  return (
    <div className="space-y-5">
      {/* Header controls */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-semibold">Execution</h2>
          <p className="text-sm text-muted-foreground">
            {isComplete && !hasPendingRows
              ? 'Simulation complete.'
              : isRunning
              ? `Running — ${doneCount} / ${rows.length} done`
              : hasPendingRows
              ? `Ready to run ${pendingCount} vendor${pendingCount !== 1 ? 's' : ''}`
              : `Ready to run ${rows.length} vendor${rows.length !== 1 ? 's' : ''}`}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {!isRunning && hasPendingRows && (
            <>
              <Button variant="outline" size="sm" onClick={onBack}>← Back</Button>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <span>Concurrency</span>
                <Select
                  value={String(concurrency)}
                  onValueChange={v => onConcurrencyChange(Number(v) as 1 | 3 | 5)}
                >
                  <SelectTrigger className="w-16 h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">1</SelectItem>
                    <SelectItem value="3">3</SelectItem>
                    <SelectItem value="5">5</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button onClick={onStart} className="gap-1.5">
                <Play className="h-4 w-4" /> {isComplete ? 'Re-run simulation' : 'Start simulation'}
              </Button>
            </>
          )}
          {isRunning && (
            <Button variant="destructive" onClick={onAbort} className="gap-1.5">
              <StopCircle className="h-4 w-4" /> Abort
            </Button>
          )}
          {isComplete && !hasPendingRows && (
            <>
              <Button variant="outline" size="sm" onClick={onBack}>← Back</Button>
              <Button onClick={onNext} className="gap-1.5">
                View results <ArrowRight className="h-4 w-4" />
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Progress bar */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>{doneCount} / {rows.length} processed</span>
          <span className="flex gap-3">
            {createdCount > 0 && <span className="text-green-600">{createdCount} created</span>}
            {dupCount > 0 && <span className="text-amber-600">{dupCount} duplicate{dupCount !== 1 ? 's' : ''}</span>}
            {errorCount > 0 && <span className="text-red-600">{errorCount} error{errorCount !== 1 ? 's' : ''}</span>}
          </span>
        </div>
        <Progress value={progressPct} className="h-2" />
      </div>

      {/* Step label legend */}
      <div className="flex items-center gap-3 flex-wrap text-[10px] text-muted-foreground/60">
        <span className="font-medium text-muted-foreground text-xs">Steps:</span>
        {STEP_LABELS.map((l, i) => (
          <span key={i} className="flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/30 inline-block" />
            {l}
          </span>
        ))}
      </div>

      <Separator />

      {/* Row cards */}
      <ScrollArea className="h-[400px] pr-2">
        <div className="space-y-2">
          {rows.map(row => (
            <RowStatusCard key={row._id} row={row} onPrepareRerun={onPrepareRerun} />
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}

// ─── Step 4: Results ──────────────────────────────────────────────────────────

function Step4Results({
  rows,
  onReset,
  onBack,
}: {
  rows: SimRow[];
  onReset: () => void;
  onBack: () => void;
}) {
  const created = rows.filter(r => r.status === 'created');
  const duplicates = rows.filter(r => r.status === 'duplicate');
  const errors = rows.filter(r => r.status === 'error');

  const summaryTable = (subset: SimRow[], cols: { label: string; render: (r: SimRow) => React.ReactNode }[]) => (
    <ScrollArea className="h-64 rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            {cols.map(c => <TableHead key={c.label} className="text-xs">{c.label}</TableHead>)}
          </TableRow>
        </TableHeader>
        <TableBody>
          {subset.length === 0 ? (
            <TableRow>
              <TableCell colSpan={cols.length} className="text-center text-muted-foreground text-sm py-8">
                None
              </TableCell>
            </TableRow>
          ) : (
            subset.map(r => (
              <TableRow key={r._id}>
                {cols.map(c => (
                  <TableCell key={c.label} className="text-xs">{c.render(r)}</TableCell>
                ))}
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </ScrollArea>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-semibold">Simulation complete</h2>
          <p className="text-sm text-muted-foreground">{rows.length} vendors processed</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={onBack}>← Back</Button>
          <Button variant="outline" onClick={() => exportReconciliationCSV(rows)} className="gap-1.5">
            <Download className="h-4 w-4" /> Download reconciliation CSV
          </Button>
          <Button variant="ghost" onClick={onReset} className="gap-1.5">
            <RotateCcw className="h-4 w-4" /> New simulation
          </Button>
        </div>
      </div>

      {/* Metric cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <MetricCard label="Created" value={created.length} color="green" />
        <MetricCard label="Duplicates" value={duplicates.length} color="amber" />
        <MetricCard label="Errors" value={errors.length} color="red" />
        <MetricCard label="Total" value={rows.length} color="blue" />
      </div>

      {/* Tabs */}
      <Tabs defaultValue="errors">
        <TabsList>
          <TabsTrigger value="errors" className="gap-1.5">
            Errors
            {errors.length > 0 && (
              <Badge variant="destructive" className="h-4 px-1 text-[10px]">{errors.length}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="duplicates" className="gap-1.5">
            Duplicates
            {duplicates.length > 0 && (
              <Badge variant="secondary" className="h-4 px-1 text-[10px]">{duplicates.length}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="created" className="gap-1.5">
            Created
            {created.length > 0 && (
              <Badge variant="outline" className="h-4 px-1 text-[10px] border-green-400 text-green-600">{created.length}</Badge>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="errors" className="mt-4">
          {summaryTable(errors, [
            { label: 'BC Vendor No', render: r => <code className="font-mono">{r.bc_vendor_no}</code> },
            { label: 'Legal Name', render: r => r.legal_name },
            { label: 'Wise Entity', render: r => r.wise_entity },
            { label: 'Error', render: r => <span className="text-red-600">{r.error_message ?? '—'}</span> },
          ])}
        </TabsContent>

        <TabsContent value="duplicates" className="mt-4">
          {summaryTable(duplicates, [
            { label: 'BC Vendor No', render: r => <code className="font-mono">{r.bc_vendor_no}</code> },
            { label: 'Legal Name', render: r => r.legal_name },
            { label: 'Wise Entity', render: r => r.wise_entity },
            { label: 'Existing Omnea ID', render: r => <code className="font-mono text-amber-700 dark:text-amber-400">{r.existing_omnea_id ?? '—'}</code> },
          ])}
        </TabsContent>

        <TabsContent value="created" className="mt-4">
          {summaryTable(created, [
            { label: 'BC Vendor No', render: r => <code className="font-mono">{r.bc_vendor_no}</code> },
            { label: 'Legal Name', render: r => r.legal_name },
            { label: 'Wise Entity', render: r => r.wise_entity },
            { label: 'Omnea Supplier ID', render: r => <code className="font-mono text-green-700 dark:text-green-400 text-[11px]">{r.omnea_supplier_id ?? '—'}</code> },
          ])}
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function SimulatorPage() {
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [rows, setRows] = useState<SimRow[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [isComplete, setIsComplete] = useState(false);
  const [concurrency, setConcurrency] = useState<1 | 3 | 5>(3);
  const abortRef = useRef(false);

  const updateRow = useCallback((id: string, patch: Partial<SimRow>) => {
    if (id === '__bulk_skip__') {
      setRows(prev => prev.map(r => r.status === 'pending' ? { ...r, status: 'skipped' as const } : r));
    } else {
      setRows(prev => prev.map(r => r._id === id ? { ...r, ...patch } : r));
    }
  }, []);

  const handleParsed = useCallback((simRows: SimRow[]) => {
    setRows(simRows);
    setStep(2);
  }, []);

  const handleUpdateRows = useCallback((updated: SimRow[]) => {
    setRows(updated);
  }, []);

  const handlePrepareRerun = useCallback((id: string, patch: Partial<SimRow>) => {
    setRows(prev => prev.map(r => r._id === id ? { ...r, ...patch } : r));
    setIsComplete(false);
  }, []);

  const handleProceedToSimulation = useCallback(() => {
    setStep(3);
  }, []);

  const handleStartSimulation = useCallback(async () => {
    abortRef.current = false;
    setIsRunning(true);
    setIsComplete(false);
    await runSimulation(rows, concurrency, updateRow, abortRef);
    setIsRunning(false);
    setIsComplete(true);
  }, [rows, concurrency, updateRow]);

  const handleAbort = useCallback(() => {
    abortRef.current = true;
  }, []);

  const handleReset = useCallback(() => {
    setStep(1);
    setRows([]);
    setIsRunning(false);
    setIsComplete(false);
    abortRef.current = false;
  }, []);

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">BC Vendor Simulator</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Batch-migrate Business Central vendors to Omnea via CSV upload.
        </p>
      </div>

      <WizardHeader step={step} />

      {step === 1 && (
        <Step1Upload onParsed={(simRows, _rawCount) => handleParsed(simRows)} />
      )}

      {step === 2 && (
        <Step2Preflight
          rows={rows}
          onBack={() => setStep(1)}
          onUpdateRows={handleUpdateRows}
          onProceed={handleProceedToSimulation}
        />
      )}

      {step === 3 && (
        <Step3Execute
          rows={rows}
          isRunning={isRunning}
          isComplete={isComplete}
          concurrency={concurrency}
          onConcurrencyChange={setConcurrency}
          onStart={handleStartSimulation}
          onAbort={handleAbort}
          onNext={() => setStep(4)}
          onBack={() => setStep(2)}
          onPrepareRerun={handlePrepareRerun}
        />
      )}

      {step === 4 && (
        <Step4Results rows={rows} onReset={handleReset} onBack={() => setStep(3)} />
      )}
    </div>
  );
}
