═══════════════════════════════════════════════════════════════════
CLAUDE CODE PROMPT — STEP 2: ADD PROFILE + BANK COLUMNS TO CSV
Files: src/lib/simulator-data.ts · src/pages/SimulatorPage.tsx
═══════════════════════════════════════════════════════════════════

Context: The BC Vendor Simulator CSV currently covers supplier-level
fields only. This step adds supplier profile columns and bank account
columns, updates the data types, and adds intent flags so each row
knows whether to CREATE, UPDATE, or SKIP each of the three entities.
This is data-model and CSV-spec only — do NOT change executor logic yet.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PART 1 — src/lib/simulator-data.ts
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

─── 1a. Add profile columns to CSV_OPTIONAL_COLUMNS ─────────────

Append these 6 items to the END of the existing CSV_OPTIONAL_COLUMNS
array, after the current last item ('sort_code'):

  'profile_subsidiary_id',         // Omnea subsidiary UUID — used in POST body: subsidiary.id
  'profile_subsidiary_name',       // Human-readable name — used for display + fallback lookup
  'profile_state',                 // enum: active | archived | inactive  (default: active)
  'profile_payment_method_id',     // Omnea payment method UUID → POST body: paymentMethod.id
  'profile_payment_terms_id',      // Omnea payment terms UUID → POST body: paymentTerms.id
  'profile_relationship_owner_email', // Wise user email → customFields.supplierProfileRelationshipOwner

─── 1b. Add bank account columns to CSV_OPTIONAL_COLUMNS ─────────

Append these 9 items after the profile columns above:

  'bank_account_name',    // → POST body: accountName  (maps to response field: accountName)
  'bank_name',            // → POST body: bankName      (already in BankInput as bankName — keep)
  'bank_account_no',      // → POST body: accountNumber (already in BankInput as bankAccountNo)
  'bank_currency_code',   // → POST body: currency.code  e.g. "EUR", "GBP", "USD"
  'bank_iban',            // → POST body: iban           (rename existing 'iban' column to 'bank_iban')
  'bank_swift_code',      // → POST body: swiftCode      (rename existing 'swift_code' to 'bank_swift_code')
  'bank_sort_code',       // → POST body: sortCode       (rename existing 'sort_code' to 'bank_sort_code')
  'bank_is_primary',      // → POST body: isPrimary  boolean string "true"|"false" (default: "true")
  'bank_address_street1', // → POST body: address.street1
  'bank_address_city',    // → POST body: address.city
  'bank_address_zip_code',// → POST body: address.zipCode
  'bank_country_iso2',    // → POST body: address.country  (already required — move here as optional duplicate for bank)

NOTE: The old column names 'iban', 'swift_code', 'sort_code' in
CSV_OPTIONAL_COLUMNS must be REMOVED and replaced with the bank_
prefixed versions above. 'bank_country_iso2' remains in
CSV_REQUIRED_COLUMNS unchanged — this new optional version is for
the bank address specifically (may differ from supplier country).

─── 1c. Update SupplierInput interface ───────────────────────────

Add a new nested ProfileInput interface and a new BankInput field.
Keep all existing SupplierInput fields unchanged.

Add this new interface ABOVE SupplierInput:

export interface ProfileInput {
  subsidiaryId?: string;          // Omnea subsidiary UUID (from profile_subsidiary_id column)
  subsidiaryName?: string;        // Human-readable name (from profile_subsidiary_name column)
  state: 'active' | 'archived' | 'inactive';  // default: 'active'
  paymentMethodId?: string;       // Omnea payment method UUID
  paymentTermsId?: string;        // Omnea payment terms UUID
  relationshipOwnerEmail?: string; // Wise user email for customFields.supplierProfileRelationshipOwner
}

Update BankInput interface — add these missing fields:
  accountName: string;      // was missing — maps to response.accountName
  currencyCode?: string;    // maps to currency.code in POST body
  isPrimary: boolean;       // default: true
  addressStreet1?: string;  // address.street1
  addressCity?: string;     // address.city
  addressZipCode?: string;  // address.zipCode

Rename existing BankInput fields for consistency:
  bankAccountNo → accountNumber   (matches API field name exactly)
  bankCode      → sortCode        (matches API field name exactly)
  swiftCode     → swiftCode       (no change)
  bankCountryIso2 → addressCountry (matches API address.country)

─── 1d. Add RowIntent type ───────────────────────────────────────

Add this new type and interface for pre-flight intent flags.
This will be used in the Review screen (Step 2) to show what the
simulator will do for each entity before execution.

export type EntityIntent = 'CREATE' | 'UPDATE' | 'SKIP' | 'UNKNOWN';

export interface RowIntent {
  supplier: EntityIntent;
  profile: EntityIntent;
  bank: EntityIntent;
  // IDs found during pre-flight checks (populated during Review step)
  existingSupplierId?: string;
  existingProfileId?: string;
  existingBankAccountId?: string;
  // Human-readable reason for intent decision
  supplierReason?: string;
  profileReason?: string;
  bankReason?: string;
}

─── 1e. Update OmneaRecord interface ─────────────────────────────

Add these fields to OmneaRecord to track intent outcomes:

  intent?: RowIntent;
  profileId: string;     // already present — keep
  bankAccountId: string; // already present — keep
  outcome: 'created' | 'duplicate' | 'partial' | 'failed' | 'updated' | 'skipped'; // add 'updated' and 'skipped'

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PART 2 — src/pages/SimulatorPage.tsx
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

─── 2a. Update handleNext() in ScreenUploadCSV ───────────────────

Add a ProfileInput array built from rawRows alongside the existing
suppliers and banks arrays:

const profiles: ProfileInput[] = rawRows.map((r) => ({
  subsidiaryId:              r.profile_subsidiary_id   || undefined,
  subsidiaryName:            r.profile_subsidiary_name || undefined,
  state:                     (['active','archived','inactive'].includes(r.profile_state)
                               ? r.profile_state as ProfileInput['state']
                               : 'active'),
  paymentMethodId:           r.profile_payment_method_id   || undefined,
  paymentTermsId:            r.profile_payment_terms_id    || undefined,
  relationshipOwnerEmail:    r.profile_relationship_owner_email || undefined,
}));

Update the banks array mapping to use the new field names:

const banks: BankInput[] = rawRows.map((r) => ({
  accountName:    r.bank_account_name || r.legal_name,  // fallback to legal_name if blank
  bankName:       r.bank_name,
  accountNumber:  r.bank_account_no,
  currencyCode:   r.bank_currency_code  || undefined,
  iban:           r.bank_iban           || '',
  swiftCode:      r.bank_swift_code     || undefined,
  sortCode:       r.bank_sort_code      || undefined,
  isPrimary:      r.bank_is_primary?.toLowerCase() !== 'false',  // default true
  addressStreet1: r.bank_address_street1  || undefined,
  addressCity:    r.bank_address_city     || undefined,
  addressZipCode: r.bank_address_zip_code || undefined,
  addressCountry: r.bank_country_iso2,
}));

Pass profiles to onNext():
  onNext(suppliers, profiles, banks, subsidiaryRefs)

Update the onNext prop type signature accordingly.

─── 2b. Update downloadTemplate() ───────────────────────────────

Replace the hardcoded example row with one aligned to the new full
column list. The headers array is:
  [...CSV_REQUIRED_COLUMNS, ...CSV_OPTIONAL_COLUMNS]

Required cols (8): same as before
  'Acme Corporation Ltd', 'V0001', 'Wise Payments Limited', 'EE',
  'Barclays Bank PLC', '12345678', 'BARCGB22', 'EE'

Optional cols (now 30 items, in this exact order matching the array):
  'Acme Corporation Limited',          // legal_name_registered
  'EE102329249',                       // tax_number
  'company',                           // entity_type
  'Main supplier for procurement',     // description
  'https://acme.com',                  // website
  'false',                             // is_preferred
  'false',                             // is_reseller
  'Kopli tn 68a',                      // address_street1
  '',                                  // address_street2
  'Tallinn',                           // city
  '',                                  // state_province
  '10412',                             // post_code
  'GB123456789',                       // brn
  'Non material Outsourcing',          // materiality_level
  '4',                                 // infosec_criticality_tier
  'D',                                 // infosec_sensitivity_tier
  'Third Party',                       // entity_type_cf
  'Yes',                               // supports_cif
  'N/A',                               // name_of_parent_entity
  'b8ba98a2-b361-4df1-871b-de0f9e0c79e3', // profile_subsidiary_id
  'Wise Payments Limited',             // profile_subsidiary_name
  'active',                            // profile_state
  '046c00a9-5f28-44f7-8572-a1cf1fcab90a', // profile_payment_method_id
  '77951720-f3d3-43c6-9972-3e42150b8c05', // profile_payment_terms_id
  'martha.akullo@wise.com',            // profile_relationship_owner_email
  'Acme Corporation Ltd',              // bank_account_name
  'EUR',                               // bank_currency_code
  'GB29NWBK60161331926819',            // bank_iban
  'BARCGB22',                          // bank_swift_code
  '12-34-56',                          // bank_sort_code
  'true',                              // bank_is_primary
  'Kopli tn 68a',                      // bank_address_street1
  'Tallinn',                           // bank_address_city
  '10412',                             // bank_address_zip_code

Keep download filename as 'bc-vendor-simulator-template.csv'.

─── 2c. Update SupplierReviewCard to show profile + bank intent ──

In ScreenReviewData, the SupplierReviewCard currently shows supplier
and bank fields. Add a third section "Supplier Profile" between the
supplier and bank sections showing:

  Subsidiary:      profile.subsidiaryName  (or "Not set" if blank)
  Payment Method:  profile.paymentMethodId (UUID, monospace, truncated)
  Payment Terms:   profile.paymentTermsId  (UUID, monospace, truncated)
  State:           profile.state           (badge)
  Owner email:     profile.relationshipOwnerEmail

Also add a bank_account_name row to the Bank Account section:
  Account Name:    bank.accountName

Add intent badges next to each section header (SUPPLIER | PROFILE | BANK):
  Show a grey "UNKNOWN" badge for all three for now.
  These will be populated in Step 3 (pre-flight prompt).

The badges should use these colours:
  CREATE  → green badge (bg-green-100 text-green-700)
  UPDATE  → blue badge  (bg-blue-100 text-blue-700)
  SKIP    → grey badge  (bg-gray-100 text-gray-500)
  UNKNOWN → amber badge (bg-amber-100 text-amber-700)

─── 2d. Update ScreenUploadCSV onNext prop types ─────────────────

The ScreenUploadCSV onNext callback currently passes:
  (suppliers: SupplierInput[], banks: BankInput[], subsidiaryRefs: SubsidiaryRef[])

Change to:
  (suppliers: SupplierInput[], profiles: ProfileInput[], banks: BankInput[], subsidiaryRefs: SubsidiaryRef[])

Update the parent component (SimulatorPage) that receives these to
store profiles in a useState<ProfileInput[]>([]) alongside suppliers
and banks. Pass profiles down to ScreenReviewData and ScreenSimulation.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
COLUMN REFERENCE — full CSV spec after this change
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

REQUIRED (8 columns — unchanged):
  legal_name              → suppliers[].name
  bc_vendor_no            → remoteId PATCH handshake
  subsidiary_name         → profile subsidiary lookup (fallback if no ID)
  country_iso2            → address.country
  bank_name               → bankName
  bank_account_no         → accountNumber
  bank_swift_code         → swiftCode  ← renamed from swift_code
  bank_country_iso2       → address.country (bank)

SUPPLIER optional (14 columns — unchanged from last prompt):
  legal_name_registered, tax_number, entity_type, description,
  website, is_preferred, is_reseller,
  address_street1, address_street2, city, state_province, post_code,
  brn, materiality_level, infosec_criticality_tier,
  infosec_sensitivity_tier, entity_type_cf, supports_cif,
  name_of_parent_entity

PROFILE optional (6 new columns):
  profile_subsidiary_id          → subsidiary.id in POST body
  profile_subsidiary_name        → display + fallback lookup
  profile_state                  → state (active|archived|inactive)
  profile_payment_method_id      → paymentMethod.id
  profile_payment_terms_id       → paymentTerms.id
  profile_relationship_owner_email → customFields.supplierProfileRelationshipOwner

BANK optional (9 new/renamed columns):
  bank_account_name              → accountName  ← NEW
  bank_currency_code             → currency.code  ← NEW
  bank_iban                      → iban  ← renamed from iban
  bank_sort_code                 → sortCode  ← renamed from sort_code
  bank_is_primary                → isPrimary  ← NEW (default true)
  bank_address_street1           → address.street1  ← NEW
  bank_address_city              → address.city  ← NEW
  bank_address_zip_code          → address.zipCode  ← NEW

REMOVED columns (old names no longer in spec):
  iban        → replaced by bank_iban
  swift_code  → replaced by bank_swift_code (was already in required)
  sort_code   → replaced by bank_sort_code

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CONSTRAINTS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
- Do NOT change simulator-executor.ts — that comes in the next step
- Do NOT add any API calls in this step — intent flags stay UNKNOWN
- Do NOT break the existing subsidiary lookup by name (keep that logic)
- TypeScript must compile with no new errors — check BankInput usages
  in simulator-executor.ts and update field names there too if TS errors
  appear (bankAccountNo → accountNumber, bankCode → sortCode, etc.)
- No `any` types