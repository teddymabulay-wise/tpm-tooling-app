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

export interface ProfileInput {
  subsidiaryId?: string;
  subsidiaryName?: string;
  state: 'active' | 'archived' | 'inactive';
  paymentMethodId?: string;
  paymentTermsId?: string;
  relationshipOwnerEmail?: string;
}

export interface SupplierInput {
  // Required
  legalName: string;
  bcVendorNo: string;
  subsidiaryName: string;
  countryIso2: string;
  // Optional top-level
  legalNameRegistered?: string;
  taxNumber?: string;
  entityType?: 'company' | 'individual';
  description?: string;
  website?: string;
  isPreferred?: boolean;
  isReseller?: boolean;
  // Address
  addressStreet1?: string;
  addressStreet2?: string;
  city?: string;
  stateProvince?: string;
  postCode?: string;
  // Custom fields
  brn?: string;
  materialityLevel?: string;
  infosecCriticalityTier?: string;
  infosecSensitivityTier?: string;
  entityTypeCf?: string;
  supportsCif?: string;
  nameOfParentEntity?: string;
  // Resolved at runtime (not from CSV)
  subsidiaryId?: string;
}

export interface SubsidiaryRef {
  id: string;
  name: string;
}

export interface BankInput {
  accountName: string;
  bankName: string;
  accountNumber: string;
  currencyCode?: string;
  iban: string;
  swiftCode?: string;
  sortCode?: string;
  isPrimary: boolean;
  addressStreet1?: string;
  addressCity?: string;
  addressZipCode?: string;
  addressCountry: string;
}

export type EntityIntent = 'CREATE' | 'UPDATE' | 'SKIP' | 'UNKNOWN';

export interface RowIntent {
  supplier: EntityIntent;
  profile: EntityIntent;
  bank: EntityIntent;
  existingSupplierId?: string;
  existingProfileId?: string;
  existingBankAccountId?: string;
  supplierReason?: string;
  profileReason?: string;
  bankReason?: string;
}

export interface OmneaRecord {
  supplierId: string;
  supplierName: string;
  subsidiaryName: string;
  profileId: string;
  bankAccountId: string;
  outcome: 'created' | 'duplicate' | 'partial' | 'failed' | 'updated' | 'skipped';
  intent?: RowIntent;
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
  'bc_vendor_no',
  'subsidiary_name',
  'country_iso2',
  'bank_name',
  'bank_account_no',
  'bank_swift_code',
  'bank_country_iso2',
] as const;

export const CSV_OPTIONAL_COLUMNS = [
  // Supplier top-level fields
  'legal_name_registered',
  'tax_number',
  'entity_type',
  'description',
  'website',
  'is_preferred',
  'is_reseller',
  // Address fields
  'address_street1',
  'address_street2',
  'city',
  'state_province',
  'post_code',
  // Custom fields
  'brn',
  'materiality_level',
  'infosec_criticality_tier',
  'infosec_sensitivity_tier',
  'entity_type_cf',
  'supports_cif',
  'name_of_parent_entity',
  // Profile fields
  'profile_subsidiary_id',
  'profile_subsidiary_name',
  'profile_state',
  'profile_payment_method_id',
  'profile_payment_terms_id',
  'profile_relationship_owner_email',
  // Bank account fields
  'bank_account_name',
  'bank_currency_code',
  'bank_iban',
  'bank_sort_code',
  'bank_is_primary',
  'bank_address_street1',
  'bank_address_city',
  'bank_address_zip_code',
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
