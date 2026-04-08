// ─── Types ───────────────────────────────────────────────────────────────────

export type VendorType = 'corporate' | 'private_individual';
export type DeduplicationScenario = 'new_vendor' | 'blocked_vendor' | 'active_duplicate' | 'name_mismatch';
export type PaymentMethod = 'ACH' | 'BILL' | 'WIRE';
export type SimStepActor = 'Omnea' | 'ML' | 'ML→BC' | 'ML→Omnea';
export type SimStepStatus = 'pending' | 'running' | 'success' | 'error' | 'warning';

export interface WiseEntity {
  id: string;
  name: string;
  country: string; // ISO2
  countryName: string;
  region: 'UK' | 'EU' | 'US' | 'APAC' | 'OTHER';
  /** Label shown on the bank code field in Screen 2 */
  bankFieldLabel: string;
  bankFieldPlaceholder: string;
  /** Whether to show the IBAN fields for this entity */
  showIBAN: boolean;
  /** Whether to show ACH/BILL/WIRE payment method selector */
  showPaymentMethod: boolean;
}

export interface SupplierInput {
  legalName: string;
  brn: string;
  vendorType: VendorType;
  wiseEntityId: string;
  countryIso2: string;
  scenario: DeduplicationScenario;
}

export interface BankInput {
  paymentTerms: string;
  paymentMethod: PaymentMethod | '';
  bankName: string;
  bankAccountNo: string;
  bankAccountNoConfirm: string;
  iban: string;
  ibanConfirm: string;
  swiftCode: string;
  bankCode: string; // sort code / routing number / bank code / branch no
  bankCountryIso2: string;
}

export interface CsvSupplierRow {
  legal_name: string;
  brn: string;
  vendor_type: string;
  wise_entity: string;
  country_iso2: string;
  _scenario?: DeduplicationScenario;
}

export interface CsvBankRow {
  legal_name?: string;
  bc_vendor_no?: string;
  bank_name: string;
  bank_account_no: string;
  iban: string;
  swift_code: string;
  sort_code: string;
  bank_country_iso2: string;
}

export interface SimStep {
  id: number;
  actor: SimStepActor;
  description: string;
  detail?: string;
  status: SimStepStatus;
  timestamp?: string;
}

export interface ProcessingCard {
  supplierName: string;
  steps: SimStep[];
  expanded: boolean;
  finalStatus: 'pending' | 'running' | 'success' | 'error';
}

export interface BCVendorRecord {
  vendorNo: string;
  name: string;
  entity: string;
  blocked: 0 | 1 | 2;
  bankCode: string;
  status: 'created' | 'reactivated' | 'duplicate' | 'name_mismatch' | 'error';
}

export interface AuditLogEntry {
  timestamp: string;
  eventType: string;
  supplier: string;
  bcVendorNo: string;
  action: string;
  httpStatus: string;
  notes: string;
}

// ─── EU Countries Set ─────────────────────────────────────────────────────────

export const EU_COUNTRIES = new Set([
  'AT','BE','BG','HR','CY','CZ','DK','EE','FI','FR',
  'DE','GR','HU','IE','IT','LV','LT','LU','MT','NL',
  'PL','PT','RO','SK','SI','ES','SE',
]);

// ─── Wise Entities (F0 seed — 20 key entities) ───────────────────────────────

export const WISE_ENTITIES: WiseEntity[] = [
  // UK
  {
    id: 'WPL-UK',
    name: 'Wise Payments Limited (UK)',
    country: 'GB',
    countryName: 'United Kingdom',
    region: 'UK',
    bankFieldLabel: 'Sort Code (6 digits)',
    bankFieldPlaceholder: '12-34-56',
    showIBAN: false,
    showPaymentMethod: false,
  },
  // US
  {
    id: 'WUS',
    name: 'Wise US Inc.',
    country: 'US',
    countryName: 'United States',
    region: 'US',
    bankFieldLabel: 'Routing Number (9 digits)',
    bankFieldPlaceholder: '021000021',
    showIBAN: false,
    showPaymentMethod: true,
  },
  // APAC
  {
    id: 'WAP-SG',
    name: 'Wise Asia-Pacific Pte. Ltd. (SG)',
    country: 'SG',
    countryName: 'Singapore',
    region: 'APAC',
    bankFieldLabel: 'Bank Code (4 digits)',
    bankFieldPlaceholder: '7171',
    showIBAN: false,
    showPaymentMethod: false,
  },
  {
    id: 'WPJ',
    name: 'Wise Payments Japan K.K.',
    country: 'JP',
    countryName: 'Japan',
    region: 'APAC',
    bankFieldLabel: 'Branch No. (7 digits)',
    bankFieldPlaceholder: '0123456',
    showIBAN: false,
    showPaymentMethod: false,
  },
  {
    id: 'WAU',
    name: 'Wise Australia Pty Ltd',
    country: 'AU',
    countryName: 'Australia',
    region: 'APAC',
    bankFieldLabel: 'BSB Number (6 digits)',
    bankFieldPlaceholder: '062-000',
    showIBAN: false,
    showPaymentMethod: false,
  },
  {
    id: 'WNZ',
    name: 'Wise New Zealand Ltd',
    country: 'NZ',
    countryName: 'New Zealand',
    region: 'APAC',
    bankFieldLabel: 'Bank Account Number',
    bankFieldPlaceholder: '12-3456-0000000-00',
    showIBAN: false,
    showPaymentMethod: false,
  },
  // EU
  {
    id: 'WEE-BE',
    name: 'Wise Europe SA (Belgium)',
    country: 'BE',
    countryName: 'Belgium',
    region: 'EU',
    bankFieldLabel: 'BIC/SWIFT Code',
    bankFieldPlaceholder: 'GEBABEBB',
    showIBAN: true,
    showPaymentMethod: false,
  },
  {
    id: 'WDE',
    name: 'Wise Payments Germany GmbH',
    country: 'DE',
    countryName: 'Germany',
    region: 'EU',
    bankFieldLabel: 'BIC/SWIFT Code',
    bankFieldPlaceholder: 'DEUTDEDB',
    showIBAN: true,
    showPaymentMethod: false,
  },
  {
    id: 'WFR',
    name: 'Wise France SAS',
    country: 'FR',
    countryName: 'France',
    region: 'EU',
    bankFieldLabel: 'BIC/SWIFT Code',
    bankFieldPlaceholder: 'BNPAFRPP',
    showIBAN: true,
    showPaymentMethod: false,
  },
  {
    id: 'WNL',
    name: 'Wise Netherlands B.V.',
    country: 'NL',
    countryName: 'Netherlands',
    region: 'EU',
    bankFieldLabel: 'BIC/SWIFT Code',
    bankFieldPlaceholder: 'ABNANL2A',
    showIBAN: true,
    showPaymentMethod: false,
  },
  {
    id: 'WES',
    name: 'Wise Spain S.L.',
    country: 'ES',
    countryName: 'Spain',
    region: 'EU',
    bankFieldLabel: 'BIC/SWIFT Code',
    bankFieldPlaceholder: 'BSCHESM',
    showIBAN: true,
    showPaymentMethod: false,
  },
  {
    id: 'WIT',
    name: 'Wise Italy S.r.l.',
    country: 'IT',
    countryName: 'Italy',
    region: 'EU',
    bankFieldLabel: 'BIC/SWIFT Code',
    bankFieldPlaceholder: 'UNCRITMM',
    showIBAN: true,
    showPaymentMethod: false,
  },
  {
    id: 'WPL-PL',
    name: 'Wise Poland Sp. z o.o.',
    country: 'PL',
    countryName: 'Poland',
    region: 'EU',
    bankFieldLabel: 'BIC/SWIFT Code',
    bankFieldPlaceholder: 'PKOPPLPW',
    showIBAN: true,
    showPaymentMethod: false,
  },
  {
    id: 'WEE-EE',
    name: 'Wise Payments Estonia OÜ',
    country: 'EE',
    countryName: 'Estonia',
    region: 'EU',
    bankFieldLabel: 'BIC/SWIFT Code',
    bankFieldPlaceholder: 'HABAEE2X',
    showIBAN: true,
    showPaymentMethod: false,
  },
  {
    id: 'WSE',
    name: 'Wise Payments Sweden AB',
    country: 'SE',
    countryName: 'Sweden',
    region: 'EU',
    bankFieldLabel: 'BIC/SWIFT Code',
    bankFieldPlaceholder: 'NDEASESS',
    showIBAN: true,
    showPaymentMethod: false,
  },
  // OTHER
  {
    id: 'WCA',
    name: 'Wise Canada Inc.',
    country: 'CA',
    countryName: 'Canada',
    region: 'OTHER',
    bankFieldLabel: 'Transit Number (8 digits)',
    bankFieldPlaceholder: '00102-010',
    showIBAN: false,
    showPaymentMethod: false,
  },
  {
    id: 'WBR',
    name: 'Wise Brasil Ltda.',
    country: 'BR',
    countryName: 'Brazil',
    region: 'OTHER',
    bankFieldLabel: 'Bank Code (3 digits)',
    bankFieldPlaceholder: '237',
    showIBAN: false,
    showPaymentMethod: false,
  },
  {
    id: 'WIN',
    name: 'Wise Payments India Pvt. Ltd.',
    country: 'IN',
    countryName: 'India',
    region: 'OTHER',
    bankFieldLabel: 'IFSC Code (11 chars)',
    bankFieldPlaceholder: 'HDFC0001234',
    showIBAN: false,
    showPaymentMethod: false,
  },
  {
    id: 'WAE',
    name: 'Wise Middle East FZ-LLC (UAE)',
    country: 'AE',
    countryName: 'United Arab Emirates',
    region: 'OTHER',
    bankFieldLabel: 'IBAN',
    bankFieldPlaceholder: 'AE07 0331 2345 6789 0123 456',
    showIBAN: true,
    showPaymentMethod: false,
  },
  {
    id: 'WGLO',
    name: 'Wise Global (International)',
    country: 'XX',
    countryName: 'International',
    region: 'OTHER',
    bankFieldLabel: 'Bank Code / Reference',
    bankFieldPlaceholder: '',
    showIBAN: true,
    showPaymentMethod: false,
  },
];

// ─── Payment Terms ────────────────────────────────────────────────────────────

export const PAYMENT_TERMS = [
  { value: 'NET7', label: 'Net 7' },
  { value: 'NET14', label: 'Net 14' },
  { value: 'NET30', label: 'Net 30' },
  { value: 'NET45', label: 'Net 45' },
  { value: 'NET60', label: 'Net 60' },
  { value: 'NET90', label: 'Net 90' },
  { value: 'IMM', label: 'Immediate' },
  { value: 'EOM', label: 'End of Month' },
  { value: 'EIA', label: 'EIA (End of Invoice Month)' },
  { value: 'PREPAY', label: 'Pre-payment' },
];

// ─── Countries (ISO2) ─────────────────────────────────────────────────────────

export const COUNTRIES = [
  { iso2: 'AE', name: 'United Arab Emirates' },
  { iso2: 'AU', name: 'Australia' },
  { iso2: 'AT', name: 'Austria' },
  { iso2: 'BE', name: 'Belgium' },
  { iso2: 'BR', name: 'Brazil' },
  { iso2: 'BG', name: 'Bulgaria' },
  { iso2: 'CA', name: 'Canada' },
  { iso2: 'CN', name: 'China' },
  { iso2: 'HR', name: 'Croatia' },
  { iso2: 'CY', name: 'Cyprus' },
  { iso2: 'CZ', name: 'Czech Republic' },
  { iso2: 'DK', name: 'Denmark' },
  { iso2: 'EE', name: 'Estonia' },
  { iso2: 'FI', name: 'Finland' },
  { iso2: 'FR', name: 'France' },
  { iso2: 'DE', name: 'Germany' },
  { iso2: 'GR', name: 'Greece' },
  { iso2: 'HK', name: 'Hong Kong' },
  { iso2: 'HU', name: 'Hungary' },
  { iso2: 'IN', name: 'India' },
  { iso2: 'IE', name: 'Ireland' },
  { iso2: 'IL', name: 'Israel' },
  { iso2: 'IT', name: 'Italy' },
  { iso2: 'JP', name: 'Japan' },
  { iso2: 'KR', name: 'South Korea' },
  { iso2: 'LV', name: 'Latvia' },
  { iso2: 'LT', name: 'Lithuania' },
  { iso2: 'LU', name: 'Luxembourg' },
  { iso2: 'MT', name: 'Malta' },
  { iso2: 'MX', name: 'Mexico' },
  { iso2: 'NL', name: 'Netherlands' },
  { iso2: 'NZ', name: 'New Zealand' },
  { iso2: 'NO', name: 'Norway' },
  { iso2: 'PL', name: 'Poland' },
  { iso2: 'PT', name: 'Portugal' },
  { iso2: 'RO', name: 'Romania' },
  { iso2: 'RU', name: 'Russia' },
  { iso2: 'SA', name: 'Saudi Arabia' },
  { iso2: 'SG', name: 'Singapore' },
  { iso2: 'SK', name: 'Slovakia' },
  { iso2: 'SI', name: 'Slovenia' },
  { iso2: 'ZA', name: 'South Africa' },
  { iso2: 'ES', name: 'Spain' },
  { iso2: 'SE', name: 'Sweden' },
  { iso2: 'CH', name: 'Switzerland' },
  { iso2: 'TW', name: 'Taiwan' },
  { iso2: 'TR', name: 'Turkey' },
  { iso2: 'GB', name: 'United Kingdom' },
  { iso2: 'US', name: 'United States' },
  { iso2: 'UA', name: 'Ukraine' },
];

// ─── Deduplication Scenarios ──────────────────────────────────────────────────

export const DEDUP_SCENARIOS: { value: DeduplicationScenario; label: string; description: string }[] = [
  {
    value: 'new_vendor',
    label: 'New Vendor',
    description: 'No match found in BC → create new vendor record',
  },
  {
    value: 'blocked_vendor',
    label: 'Blocked / Reactivate',
    description: 'Match found, Blocked = 2 → unblock and update bank details',
  },
  {
    value: 'active_duplicate',
    label: 'Active Duplicate',
    description: 'Match found, Blocked = 0 → send SET_INACTIVE directive',
  },
  {
    value: 'name_mismatch',
    label: 'Name Mismatch',
    description: 'Match on BRN but name differs → flag for manual intervention',
  },
];

// ─── Simulation Engine ────────────────────────────────────────────────────────

function shortId(): string {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

function generateVendorNo(entityId: string, legalName: string): string {
  const prefix = entityId.replace(/-/g, '').slice(0, 3).toUpperCase();
  const slug = legalName.replace(/[^a-zA-Z0-9]/g, '').slice(0, 4).toUpperCase();
  return `${prefix}-${slug}-${shortId()}`;
}

function generateBankCode(countryIso2: string, legalName: string): string {
  const country = countryIso2.toUpperCase();
  const slug = legalName.replace(/[^a-zA-Z0-9]/g, '').slice(0, 4).toUpperCase();
  return `${country}-${slug}-${shortId()}`;
}

function generateSupplierId(): string {
  return `sup_${shortId().toLowerCase()}`;
}

export function computeGenBusPostingGroup(vendorCountry: string, entityCountry: string): string {
  if (vendorCountry === entityCountry) return 'NATIONAL';
  if (EU_COUNTRIES.has(vendorCountry) && EU_COUNTRIES.has(entityCountry)) return 'EU';
  return 'INTERNATIONAL';
}

export function getEntityById(id: string): WiseEntity | undefined {
  return WISE_ENTITIES.find((e) => e.id === id);
}

export function generateSimulationSteps(
  supplier: SupplierInput,
  bank: BankInput,
): SimStep[] {
  const entity = getEntityById(supplier.wiseEntityId);
  const entityName = entity?.name ?? supplier.wiseEntityId;
  const entityCountry = entity?.country ?? 'XX';
  const supplierId = generateSupplierId();
  const vendorNo = generateVendorNo(supplier.wiseEntityId, supplier.legalName);
  const bankCode = generateBankCode(supplier.countryIso2, supplier.legalName);
  const genBusGroup = computeGenBusPostingGroup(supplier.countryIso2, entityCountry);
  const existingVendorNo = `V-${Math.floor(Math.random() * 90000 + 10000)}`;
  const pt = bank.paymentTerms || 'NET30';

  const step1: SimStep = {
    id: 1, actor: 'Omnea',
    description: 'VENDOR_CREATED event emitted',
    detail: `supplier_id: ${supplierId}`,
    status: 'pending',
  };
  const step2: SimStep = {
    id: 2, actor: 'ML',
    description: `GET /v1/suppliers/${supplierId} — record fetched`,
    detail: `Legal Name: "${supplier.legalName}"  BRN: ${supplier.brn || '—'}  Entity: ${entityName}`,
    status: 'pending',
  };

  switch (supplier.scenario) {
    case 'new_vendor':
      return [
        step1, step2,
        {
          id: 3, actor: 'ML→BC',
          description: 'Deduplication lookup — Legal Name + BRN + Entity',
          detail: '404 Not Found → NEW VENDOR',
          status: 'pending',
        },
        {
          id: 4, actor: 'ML',
          description: `Gen Bus Posting Group: ${genBusGroup}`,
          detail: `Vendor country: ${supplier.countryIso2}  Entity country: ${entityCountry}`,
          status: 'pending',
        },
        {
          id: 5, actor: 'ML→BC',
          description: `POST /vendors — VendorNo: ${vendorNo}`,
          detail: `201 Created  |  Payment Terms: ${pt}`,
          status: 'pending',
        },
        {
          id: 6, actor: 'ML→BC',
          description: `POST /vendorBankAccounts — Code: ${bankCode}`,
          detail: `201 Created  |  Bank: ${bank.bankName || '—'}`,
          status: 'pending',
        },
        {
          id: 7, actor: 'ML→Omnea',
          description: `PATCH profile — remoteId: ${vendorNo}`,
          detail: '200 OK',
          status: 'pending',
        },
        {
          id: 8, actor: 'ML',
          description: 'Audit log written ✅',
          status: 'pending',
        },
      ];

    case 'blocked_vendor':
      return [
        step1, step2,
        {
          id: 3, actor: 'ML→BC',
          description: 'Deduplication lookup — Legal Name + BRN + Entity',
          detail: `Match found — VendorNo: ${existingVendorNo}  Blocked: 2 → REACTIVATE`,
          status: 'pending',
        },
        {
          id: 4, actor: 'ML→BC',
          description: `PATCH /vendors/${existingVendorNo} — Blocked: 2 → 0`,
          detail: '200 OK — Vendor unblocked',
          status: 'pending',
        },
        {
          id: 5, actor: 'ML→BC',
          description: `PATCH /vendorBankAccounts — Code: ${bankCode}`,
          detail: '200 OK — Bank details updated',
          status: 'pending',
        },
        {
          id: 6, actor: 'ML→Omnea',
          description: `PATCH profile — remoteId: ${existingVendorNo}`,
          detail: '200 OK',
          status: 'pending',
        },
        {
          id: 7, actor: 'ML',
          description: 'Audit log written ✅',
          status: 'pending',
        },
      ];

    case 'active_duplicate':
      return [
        step1, step2,
        {
          id: 3, actor: 'ML→BC',
          description: 'Deduplication lookup — Legal Name + BRN + Entity',
          detail: `Match found — VendorNo: ${existingVendorNo}  Blocked: 0 → DUPLICATE`,
          status: 'pending',
        },
        {
          id: 4, actor: 'ML→Omnea',
          description: 'POST StatusDirective — SET_INACTIVE',
          detail: '201 Created — Duplicate vendor suppressed in Omnea',
          status: 'pending',
        },
        {
          id: 5, actor: 'ML',
          description: 'Audit log written ⚠️ DUPLICATE flagged',
          status: 'pending',
        },
      ];

    case 'name_mismatch':
      return [
        step1, step2,
        {
          id: 3, actor: 'ML→BC',
          description: 'Deduplication lookup — Legal Name + BRN + Entity',
          detail: `Match on BRN: ${supplier.brn || '—'}  but name differs → NAME MISMATCH`,
          status: 'pending',
        },
        {
          id: 4, actor: 'ML',
          description: 'Manual intervention flag raised ⛔',
          detail: `Omnea ticket created for review — supplier: "${supplier.legalName}"`,
          status: 'pending',
        },
        {
          id: 5, actor: 'ML',
          description: 'Audit log written ⚠️ NAME MISMATCH',
          status: 'pending',
        },
      ];
  }
}

export function buildBCRecord(
  supplier: SupplierInput,
  bank: BankInput,
  steps: SimStep[],
): BCVendorRecord {
  const entity = getEntityById(supplier.wiseEntityId);
  const entityName = entity?.name ?? supplier.wiseEntityId;
  const vendorNoStep = steps.find((s) => s.description.startsWith('POST /vendors'));
  const reactivateStep = steps.find((s) => s.description.includes('Blocked: 2 → 0'));
  const bankStep = steps.find((s) => s.description.includes('/vendorBankAccounts'));

  let vendorNo = '—';
  if (vendorNoStep) {
    const m = vendorNoStep.description.match(/VendorNo: (\S+)/);
    if (m) vendorNo = m[1];
  } else if (reactivateStep) {
    const m = reactivateStep.description.match(/PATCH \/vendors\/(\S+)/);
    if (m) vendorNo = m[1];
  }

  let bankCode = '—';
  if (bankStep) {
    const m = bankStep.description.match(/Code: (\S+)/);
    if (m) bankCode = m[1];
  }

  const statusMap: Record<DeduplicationScenario, BCVendorRecord['status']> = {
    new_vendor: 'created',
    blocked_vendor: 'reactivated',
    active_duplicate: 'duplicate',
    name_mismatch: 'name_mismatch',
  };

  const blockedMap: Record<DeduplicationScenario, 0 | 1 | 2> = {
    new_vendor: 0,
    blocked_vendor: 0,
    active_duplicate: 0,
    name_mismatch: 1,
  };

  return {
    vendorNo,
    name: supplier.legalName,
    entity: entityName,
    blocked: blockedMap[supplier.scenario],
    bankCode,
    status: statusMap[supplier.scenario],
  };
}

export function buildAuditEntries(
  supplier: SupplierInput,
  steps: SimStep[],
): AuditLogEntry[] {
  return steps.map((step) => {
    const vendorNoMatch = step.description.match(/VendorNo: (\S+)/);
    const bcVendorNo = vendorNoMatch ? vendorNoMatch[1] : '—';
    let httpStatus = '—';
    if (step.detail) {
      const m = step.detail.match(/\b(200|201|404|500)\b/);
      if (m) httpStatus = m[1];
    }
    return {
      timestamp: new Date().toISOString(),
      eventType: step.actor,
      supplier: supplier.legalName,
      bcVendorNo,
      action: step.description,
      httpStatus,
      notes: step.detail ?? '',
    };
  });
}
