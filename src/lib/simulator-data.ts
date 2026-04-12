// ─── Core types ───────────────────────────────────────────────────────────────

export type SimStepActor = 'GET' | 'POST' | 'PATCH' | 'PUT';
export type SimStepStatus = 'pending' | 'running' | 'success' | 'warning' | 'error' | 'skipped';
export type SimStepPhase = 'preflight' | 'supplier' | 'profile' | 'bank';

export interface SimStep {
  id: number;
  actor: SimStepActor;
  phase: SimStepPhase;
  /** Display path, e.g. POST /v1/suppliers */
  path: string;
  detail?: string;
  httpStatus?: number;
  errorMessage?: string;
  status: SimStepStatus;
  timestamp?: string;
}

export interface ProcessingCard {
  supplierName: string;
  steps: SimStep[];
  expanded: boolean;
  finalStatus: 'pending' | 'running' | 'success' | 'warning' | 'error';
}

export interface SupplierInput {
  legalName: string;
  brn: string;
  countryIso2: string;
  /** Name of the subsidiary (Wise entity) to create the profile under */
  subsidiaryName: string;
  /** Resolved Omnea subsidiary UUID — set during the Review step */
  subsidiaryId?: string;
}

export interface SubsidiaryRef {
  id: string;
  name: string;
}

export interface BankInput {
  bankName: string;
  bankAccountNo: string;
  iban: string;
  swiftCode: string;
  bankCode: string; // sort code / routing / branch
  bankCountryIso2: string;
}

export interface OmneaRecord {
  supplierId: string;
  supplierName: string;
  subsidiaryName: string;
  profileId: string;
  bankAccountId: string;
  outcome: 'created' | 'duplicate' | 'partial' | 'failed';
}

export interface AuditLogEntry {
  timestamp: string;
  method: SimStepActor;
  path: string;
  supplier: string;
  httpStatus: number | null;
  status: SimStepStatus;
  detail: string;
  errorMessage?: string;
}

// ─── CSV spec ─────────────────────────────────────────────────────────────────

export const CSV_REQUIRED_COLUMNS = [
  'legal_name',
  'subsidiary_name',
  'country_iso2',
  'bank_name',
  'bank_account_no',
  'swift_code',
  'bank_country_iso2',
] as const;

export const CSV_OPTIONAL_COLUMNS = [
  'brn',
  'iban',
  'sort_code',
] as const;

// ─── Countries (ISO2) — for reference ────────────────────────────────────────

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
