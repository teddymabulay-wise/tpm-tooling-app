═══════════════════════════════════════════════════════════════════
CLAUDE CODE PROMPT — BC VENDOR SIMULATOR CSV + API ALIGNMENT
Files to touch: src/lib/simulator-data.ts  ·  src/pages/SimulatorPage.tsx
═══════════════════════════════════════════════════════════════════

Context: the BC Vendor Simulator currently uses a CSV column spec that is
misaligned with the Omnea POST /v1/suppliers/batch API body.
The uploaded template had BC-side fields (vendor_posting_group, remote_link,
profile_id, bank_remote_id) that are NOT API inputs — they are either
BC-only, API-returned values, or computed during the handshake steps.
This prompt fixes both the column spec and the API payload builder.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PART 1 — Update src/lib/simulator-data.ts
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Replace CSV_REQUIRED_COLUMNS with exactly these (in this order):

export const CSV_REQUIRED_COLUMNS = [
  'legal_name',          // → POST body: suppliers[].name  (REQUIRED by API)
  'bc_vendor_no',        // → PATCH handshake: suppliers[].remoteId (Step 4a)
  'subsidiary_name',     // → profile creation: subsidiary lookup
  'country_iso2',        // → POST body: address.country (ISO-2)
  'bank_name',           // → bank account POST: bankName
  'bank_account_no',     // → bank account POST: accountNumber
  'swift_code',          // → bank account POST: swiftCode
  'bank_country_iso2',   // → bank account POST: address.country
] as const;

Replace CSV_OPTIONAL_COLUMNS with exactly these (in this order):

export const CSV_OPTIONAL_COLUMNS = [
  // Supplier top-level fields
  'legal_name_registered',  // → POST body: suppliers[].legalName
  'tax_number',             // → POST body: suppliers[].taxNumber (VAT/T23.F86)
  'entity_type',            // → POST body: suppliers[].entityType  enum: company | individual
  'description',            // → POST body: suppliers[].description
  'website',                // → POST body: suppliers[].website
  'is_preferred',           // → POST body: suppliers[].isPreferred  boolean
  'is_reseller',            // → POST body: suppliers[].isReseller   boolean
  // Address fields (go into suppliers[].address object)
  'address_street1',        // → address.street1
  'address_street2',        // → address.street2
  'city',                   // → address.city
  'state_province',         // → address.state  (US suppliers only)
  'post_code',              // → address.zipCode
  // Custom fields (go into suppliers[].customFields)
  'brn',                    // → customFields['corporate-registration-number']
  'materiality_level',      // → customFields['materiality-level']  e.g. "Non material Outsourcing"
  'infosec_criticality_tier', // → customFields['infosec-criticality-tier']  e.g. "4"
  'infosec_sensitivity_tier', // → customFields['infosec-sensitivity-tier']  e.g. "D"
  'entity_type_cf',         // → customFields['entity-type']  e.g. "Third Party"
  'supports_cif',           // → customFields['supports-cif-1']  e.g. "Yes" | "No"
  'name_of_parent_entity',  // → customFields['name-of-parent-entity']
  // Bank account additional fields
  'iban',                   // → bank account POST: iban
  'sort_code',              // → bank account POST: sortCode
] as const;

Update the SupplierInput interface to match:

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

Update the BankInput interface — no changes needed, keep as-is.

Remove from SupplierInput any fields that were BC-side artifacts:
  vendorPostingGroup, remoteLink, profileId, subsidiaryRemoteId,
  profileRemoteId, bankAccountCode, bankRemoteId
  (these are either BC-only or API-returned values — not CSV inputs)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PART 2 — Update src/pages/SimulatorPage.tsx
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

─── 2a. Update handleNext() in ScreenUploadCSV ───────────────────

In the function that maps rawRows → SupplierInput[], update the mapping
to read all new columns. Replace the existing mapping with:

const suppliers: SupplierInput[] = rawRows.map((r) => {
  const ref = subsidiaryRefs.find(
    (s) => s.name.trim().toLowerCase() === (r.subsidiary_name ?? '').trim().toLowerCase()
  );
  return {
    legalName:            r.legal_name,
    bcVendorNo:           r.bc_vendor_no,
    subsidiaryName:       r.subsidiary_name,
    countryIso2:          r.country_iso2?.toUpperCase(),
    subsidiaryId:         ref?.id,
    // Optional top-level
    legalNameRegistered:  r.legal_name_registered || undefined,
    taxNumber:            r.tax_number || undefined,
    entityType:           (r.entity_type === 'individual' ? 'individual' : 'company') as 'company' | 'individual',
    description:          r.description || undefined,
    website:              r.website || undefined,
    isPreferred:          r.is_preferred?.toLowerCase() === 'true',
    isReseller:           r.is_reseller?.toLowerCase() === 'true',
    // Address
    addressStreet1:       r.address_street1 || undefined,
    addressStreet2:       r.address_street2 || undefined,
    city:                 r.city || undefined,
    stateProvince:        r.state_province || undefined,
    postCode:             r.post_code || undefined,
    // Custom fields
    brn:                  r.brn || undefined,
    materialityLevel:     r.materiality_level || undefined,
    infosecCriticalityTier: r.infosec_criticality_tier || undefined,
    infosecSensitivityTier: r.infosec_sensitivity_tier || undefined,
    entityTypeCf:         r.entity_type_cf || undefined,
    supportsCif:          r.supports_cif || undefined,
    nameOfParentEntity:   r.name_of_parent_entity || undefined,
  };
});

─── 2b. Update downloadTemplate() in ScreenUploadCSV ─────────────

Replace the hardcoded example row in downloadTemplate() with one that
aligns with the new column spec. The values below are realistic examples
that match the QA API response format:

const headers = [...CSV_REQUIRED_COLUMNS, ...CSV_OPTIONAL_COLUMNS];
const example = [
  // Required columns (must match CSV_REQUIRED_COLUMNS order exactly)
  'Acme Corporation Ltd',    // legal_name
  'V0001',                   // bc_vendor_no
  'Wise Assets Europe AS',   // subsidiary_name
  'EE',                      // country_iso2
  'Barclays Bank PLC',       // bank_name
  '12345678',                // bank_account_no
  'BARCGB22',                // swift_code
  'GB',                      // bank_country_iso2
  // Optional columns (must match CSV_OPTIONAL_COLUMNS order exactly)
  'Acme Corporation Limited', // legal_name_registered
  'EE102329249',              // tax_number
  'company',                  // entity_type
  'Main supplier for procurement services', // description
  'https://acme.com',         // website
  'false',                    // is_preferred
  'false',                    // is_reseller
  'Kopli tn 68a',             // address_street1
  '',                         // address_street2
  'Tallinn',                  // city
  '',                         // state_province
  '10412',                    // post_code
  'GB123456789',              // brn
  'Non material Outsourcing', // materiality_level
  '4',                        // infosec_criticality_tier
  'D',                        // infosec_sensitivity_tier
  'Third Party',              // entity_type_cf
  'Yes',                      // supports_cif
  'N/A',                      // name_of_parent_entity
  'GB29NWBK60161331926819',   // iban
  '12-34-56',                 // sort_code
];

Keep the rest of downloadTemplate() unchanged (blob creation, link click).
Update the download filename to: 'bc-vendor-simulator-template.csv'

─── 2c. Update SupplierReviewCard display ────────────────────────

In the SupplierReviewCard component (Screen 2), add display rows for
the new fields so the reviewer can see what will be sent. Add these
below the existing legalName / subsidiaryName rows:

- BC Vendor No   → supplier.bcVendorNo  (shown in monospace, important for handshake)
- Tax Number     → supplier.taxNumber
- Entity Type    → supplier.entityType
- Address        → concatenate addressStreet1 + city + countryIso2 if any present
- BRN            → supplier.brn
- Materiality    → supplier.materialityLevel
- InfoSec Crit.  → supplier.infosecCriticalityTier
- InfoSec Sens.  → supplier.infosecSensitivityTier

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PART 3 — Update src/lib/simulator-executor.ts
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

In the Step 1 (POST /v1/suppliers/batch) payload builder, replace the
existing body construction with a complete version that uses all new fields.

The POST body must be:

{
  suppliers: [
    {
      name: supplier.legalName,                          // REQUIRED
      ...(supplier.legalNameRegistered && { legalName: supplier.legalNameRegistered }),
      ...(supplier.taxNumber && { taxNumber: supplier.taxNumber }),
      ...(supplier.entityType && { entityType: supplier.entityType }),
      ...(supplier.description && { description: supplier.description }),
      ...(supplier.website && { website: supplier.website }),
      isPreferred: supplier.isPreferred ?? false,
      isReseller:  supplier.isReseller  ?? false,

      // Address — only include if at least one address field is populated
      ...((supplier.addressStreet1 || supplier.city || supplier.countryIso2) && {
        address: {
          ...(supplier.addressStreet1 && { street1: supplier.addressStreet1 }),
          ...(supplier.addressStreet2 && { street2: supplier.addressStreet2 }),
          ...(supplier.city           && { city:    supplier.city }),
          ...(supplier.stateProvince  && { state:   supplier.stateProvince }),
          ...(supplier.postCode       && { zipCode: supplier.postCode }),
          country: supplier.countryIso2,                // always send if address block present
        },
      }),

      // Custom fields — only send keys that have values
      customFields: {
        ...(supplier.brn && {
          'corporate-registration-number': supplier.brn,
        }),
        ...(supplier.materialityLevel && {
          'materiality-level': supplier.materialityLevel,
        }),
        ...(supplier.infosecCriticalityTier && {
          'infosec-criticality-tier': supplier.infosecCriticalityTier,
        }),
        ...(supplier.infosecSensitivityTier && {
          'infosec-sensitivity-tier': supplier.infosecSensitivityTier,
        }),
        ...(supplier.entityTypeCf && {
          'entity-type': supplier.entityTypeCf,
        }),
        ...(supplier.supportsCif && {
          'supports-cif-1': supplier.supportsCif,
        }),
        ...(supplier.nameOfParentEntity && {
          'name-of-parent-entity': supplier.nameOfParentEntity,
        }),
      },
    },
  ],
}

IMPORTANT — do NOT include remoteId or remoteLink in the POST body.
These are written back via the PATCH handshake steps (4a / 4b).
The bc_vendor_no column is used in Step 4a:
  PATCH /v1/suppliers/<supplierId>
  Body: { remoteId: supplier.bcVendorNo }

Make sure Step 4a in executeRow() references supplier.bcVendorNo
(renamed from the old supplier.brn or whatever was there before).

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
QUICK REFERENCE — old vs new column mapping
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

OLD CSV COLUMN         STATUS    REASON
─────────────────────────────────────────────────────────────────
bc_vendor_no           KEEP      → remoteId PATCH handshake (Step 4a)
remote_link            REMOVE    computed in executor, not a CSV input
vendor_posting_group   REMOVE    BC-side field, not an Omnea API field
description            KEEP      → suppliers[].description
materiality_level      KEEP      → customFields['materiality-level']
infosec_criticality    RENAME    → infosec_criticality_tier
profile_id             REMOVE    API-returned, not a CSV input
subsidiary_remote_id   RENAME    → subsidiary_name (resolved to ID via lookup)
profile_remote_id      REMOVE    API-returned, not a CSV input
bank_account_code      REMOVE    BC-side field, not an Omnea API field
bank_remote_id         REMOVE    written back via PATCH, not a CSV input

NEW CSV COLUMN         STATUS    MAPS TO
─────────────────────────────────────────────────────────────────
legal_name             REQUIRED  suppliers[].name
bc_vendor_no           REQUIRED  remoteId (PATCH step 4a)
subsidiary_name        REQUIRED  profile subsidiary lookup
country_iso2           REQUIRED  address.country
bank_name              REQUIRED  bank account POST: bankName
bank_account_no        REQUIRED  bank account POST: accountNumber
swift_code             REQUIRED  bank account POST: swiftCode
bank_country_iso2      REQUIRED  bank account POST: address.country
legal_name_registered  OPTIONAL  suppliers[].legalName
tax_number             OPTIONAL  suppliers[].taxNumber
entity_type            OPTIONAL  suppliers[].entityType (company|individual)
description            OPTIONAL  suppliers[].description
website                OPTIONAL  suppliers[].website
is_preferred           OPTIONAL  suppliers[].isPreferred
is_reseller            OPTIONAL  suppliers[].isReseller
address_street1        OPTIONAL  address.street1
address_street2        OPTIONAL  address.street2
city                   OPTIONAL  address.city
state_province         OPTIONAL  address.state (US only)
post_code              OPTIONAL  address.zipCode
brn                    OPTIONAL  customFields['corporate-registration-number']
materiality_level      OPTIONAL  customFields['materiality-level']
infosec_criticality_tier OPTIONAL customFields['infosec-criticality-tier']
infosec_sensitivity_tier OPTIONAL customFields['infosec-sensitivity-tier']
entity_type_cf         OPTIONAL  customFields['entity-type']
supports_cif           OPTIONAL  customFields['supports-cif-1']
name_of_parent_entity  OPTIONAL  customFields['name-of-parent-entity']
iban                   OPTIONAL  bank account POST: iban
sort_code              OPTIONAL  bank account POST: sortCode