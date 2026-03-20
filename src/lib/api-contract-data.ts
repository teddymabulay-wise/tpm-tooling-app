// Omnea API Contract derived from Postman Collections

export interface APIEndpoint {
  id: string;
  name: string;
  method: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  path: string;
  description: string;
  collection: string;
  auth: string;
  pathParams: { key: string; description: string }[];
  bodyParams?: { key: string; type: string; description: string; required?: boolean }[];
  testScript?: string;
}

export const omneaEndpoints: APIEndpoint[] = [
  // Authentication
  {
    id: "auth-token",
    name: "Request an access token",
    method: "POST",
    path: "https://auth.omnea.co/oauth2/token",
    description: "OAuth 2.0 Client Credentials flow. Returns access_token for subsequent API calls.",
    collection: "Authentication",
    auth: "none",
    pathParams: [],
    bodyParams: [
      { key: "grant_type", type: "string", description: "Required constant: client_credentials", required: true },
      { key: "client_id", type: "string", description: "Omnea-provided ID", required: true },
      { key: "client_secret", type: "string", description: "Omnea-provided secret", required: true },
      { key: "scope", type: "string", description: "public-api/read (recommended for full object retrieval)" },
    ],
    testScript: `pm.test("Status code is 200"); → pm.environment.set("accessToken", jsonData.access_token);`,
  },
  // Suppliers
  {
    id: "get-suppliers",
    name: "Get suppliers",
    method: "GET",
    path: "{{baseUrl}}/v1/suppliers",
    description: "List all suppliers. Logs a clean schema of the first supplier's fields including standard, address, and custom fields.",
    collection: "Suppliers",
    auth: "Bearer {{accessToken}}",
    pathParams: [],
    testScript: `Logs: Id, Name, State, RemoteId, TaxNumber, Address.*, CustomFields.* → Sets active_supplier_id`,
  },
  {
    id: "get-supplier-by-id",
    name: "Get Supplier by ID",
    method: "GET",
    path: "{{baseUrl}}/v1/suppliers/{{supplier_id}}",
    description: "Get full supplier details by Omnea ID. Maps Overview, Financial, Custom, and Sync Status sections.",
    collection: "Suppliers",
    auth: "Bearer {{accessToken}}",
    pathParams: [{ key: "supplier_id", description: "Omnea supplier UUID" }],
    testScript: `Logs: Overview (name, website, taxNumber, address), Financial (isPreferred, paymentMethod), Custom (entity-type, materiality-level, infosec tiers, corporate-registration-number, CS/KYC/SCA status), Sync (remoteId, remoteLink, state)`,
  },
  {
    id: "get-supplier-by-remote-id",
    name: "Get Supplier by remote ID",
    method: "GET",
    path: "{{baseUrl}}/v1/by-remote-id/suppliers/{{supplierRemoteId}}",
    description: "Look up supplier using BC Vendor No (remoteId). Critical for BC→Omnea identity resolution.",
    collection: "Suppliers",
    auth: "Bearer {{accessToken}}",
    pathParams: [{ key: "supplierRemoteId", description: "BC Vendor ID (e.g., V03624)" }],
  },
  {
    id: "create-suppliers-batch",
    name: "Create Suppliers (Batch)",
    method: "POST",
    path: "{{baseUrl}}/v1/suppliers/batch",
    description: "Create multiple suppliers in a single request. Supports name, legal name, entity type, tax number, remote ID, address, and custom fields per supplier.",
    collection: "Suppliers",
    auth: "Bearer {{accessToken}}",
    pathParams: [],
    bodyParams: [
      { key: "suppliers", type: "array", description: "Array of supplier objects to create", required: true },
      { key: "suppliers[].name", type: "string", description: "Supplier name (required)", required: true },
      { key: "suppliers[].legalName", type: "string", description: "Legal entity name" },
      { key: "suppliers[].entityType", type: "string", description: "company, individual, etc." },
      { key: "suppliers[].state", type: "string", description: "active, inactive" },
      { key: "suppliers[].taxNumber", type: "string", description: "Tax/VAT ID" },
      { key: "suppliers[].remoteId", type: "string", description: "BC Vendor No or external reference" },
      { key: "suppliers[].address", type: "object", description: "Address with street1, street2, city, state, country, zipCode" },
      { key: "suppliers[].customFields", type: "object", description: "Custom field objects with value property" },
    ],
  },
  {
    id: "update-supplier",
    name: "Update Supplier by ID",
    method: "PATCH",
    path: "{{baseUrl}}/v1/suppliers/{{supplier_id}}",
    description: "Update supplier fields (name, legalName, state, address, customFields).",
    collection: "Supplier Maintenance",
    auth: "Bearer {{accessToken}}",
    pathParams: [{ key: "supplier_id", description: "Omnea supplier UUID" }],
    bodyParams: [
      { key: "name", type: "string", description: "Supplier name" },
      { key: "legalName", type: "string", description: "Legal name" },
      { key: "state", type: "string", description: "active or inactive" },
      { key: "address", type: "object", description: "Address object" },
      { key: "customFields", type: "object", description: "Custom fields map" },
    ],
  },
  // Supplier Profiles
  {
    id: "get-profiles-by-supplier",
    name: "Get Supplier Profiles by Supplier ID",
    method: "GET",
    path: "{{baseUrl}}/v1/suppliers/{{active_supplier_id}}/profiles",
    description: "List all subsidiary profiles for a supplier. Maps profile state, subsidiary, payment method/terms, and custom fields.",
    collection: "Supplier Profile",
    auth: "Bearer {{accessToken}}",
    pathParams: [{ key: "active_supplier_id", description: "Omnea supplier UUID" }],
    testScript: `For each profile: id, state, subsidiary (id, name, remoteId), paymentMethod, paymentTerms, customFields (supplierProfileRelationshipOwner with email)`,
  },
  {
    id: "get-profiles-by-remote-id",
    name: "Get Supplier Profiles by remote ID",
    method: "GET",
    path: "{{baseUrl}}/v1/by-remote-id/suppliers/{{supplierRemoteId}}/profiles",
    description: "Look up profiles by BC Vendor No. Returns all subsidiary relationships for the BC vendor.",
    collection: "Supplier Profile",
    auth: "Bearer {{accessToken}}",
    pathParams: [{ key: "supplierRemoteId", description: "BC Vendor ID" }],
    testScript: `Logs: Profile ID, Wise Subsidiary name, Status, Payment Method/Terms, Relationship Owner Email`,
  },
  {
    id: "get-profile-by-subsidiary",
    name: "Get Supplier Profile by subsidiary ID",
    method: "GET",
    path: "{{baseUrl}}/v1/suppliers/{{supplier_id}}/profiles/{{subsidiary_id}}",
    description: "Get specific profile for a supplier-subsidiary combination. Shows attached UI fields and system metadata.",
    collection: "Supplier Profile",
    auth: "Bearer {{accessToken}}",
    pathParams: [
      { key: "supplier_id", description: "Omnea supplier UUID" },
      { key: "subsidiary_id", description: "Omnea subsidiary UUID" },
    ],
    testScript: `Attached: subsidiary.name, state, remoteId, remoteLink, paymentMethod.name, paymentTerms.name, Relationship Owner. System: id, subsidiary.id, createdAt, updatedAt`,
  },
  {
    id: "get-profile-by-subsidiary-remote",
    name: "Get profile by subsidiary remote ID",
    method: "GET",
    path: "{{baseUrl}}/v1/by-remote-id/suppliers/{{supplierRemoteId}}/profiles/{{subsidiaryRemoteId}}",
    description: "Look up specific subsidiary profile using both BC Vendor No and BC Subsidiary Remote ID.",
    collection: "Supplier Profile",
    auth: "Bearer {{accessToken}}",
    pathParams: [
      { key: "supplierRemoteId", description: "BC Vendor ID" },
      { key: "subsidiaryRemoteId", description: "BC Subsidiary Remote ID" },
    ],
  },
  {
    id: "update-profile",
    name: "Update supplier profile by subsidiary ID",
    method: "PATCH",
    path: "{{baseUrl}}/v1/suppliers/{{supplier_id}}/profiles/{{subsidiary_id}}",
    description: "PATCH to write remoteId (BC Vendor No) and remoteLink back to Omnea. This is the 'handshake' that closes the loop.",
    collection: "Supplier Profile",
    auth: "Bearer {{accessToken}}",
    pathParams: [
      { key: "supplier_id", description: "Omnea supplier UUID" },
      { key: "subsidiary_id", description: "Omnea subsidiary UUID" },
    ],
    bodyParams: [
      { key: "remoteId", type: "string", description: "BC Vendor No (e.g., V03624)", required: true },
      { key: "remoteLink", type: "string", description: "BC vendor card URL" },
      { key: "state", type: "string", description: "Profile state (e.g., active)" },
    ],
    testScript: `Verifies: remoteId sent === remoteId returned. Logs SYNC UPDATE confirmation.`,
  },
  // Bank Accounts
  {
    id: "list-bank-accounts",
    name: "List bank accounts for supplier profile",
    method: "GET",
    path: "{{baseUrl}}/v1/suppliers/{{supplier_id}}/profiles/{{subsidiary_id}}/bank-accounts",
    description: "List all bank accounts attached to a supplier profile. Maps UI fields and system metadata.",
    collection: "Bank Account",
    auth: "Bearer {{accessToken}}",
    pathParams: [
      { key: "supplier_id", description: "Omnea supplier UUID" },
      { key: "subsidiary_id", description: "Omnea subsidiary/profile UUID" },
    ],
    testScript: `Attached: accountName, bankName, accountNumber, sortCode, iban, swiftCode, currency.code, isActive, address.*. System: id, remoteId, currency.id, createdAt, updatedAt`,
  },
  {
    id: "update-bank-account",
    name: "Update bank account with BC ID",
    method: "PATCH",
    path: "{{baseUrl}}/v1/suppliers/{{supplier_id}}/profiles/{{profile_id}}/bank-accounts/{{bank_account_id}}",
    description: "PATCH to write BC Bank Code (remoteId) to the bank account. Closes the BC sync loop for banking.",
    collection: "Bank Account",
    auth: "Bearer {{accessToken}}",
    pathParams: [
      { key: "supplier_id", description: "Omnea supplier UUID" },
      { key: "profile_id", description: "Omnea profile UUID" },
      { key: "bank_account_id", description: "Omnea bank account UUID" },
    ],
    bodyParams: [
      { key: "remoteId", type: "string", description: "BC Bank Code (e.g., BC-BANK-001)", required: true },
    ],
    testScript: `Verifies: remoteId sent === remoteId returned. Logs LOOP CLOSED: BC SYNC CONFIRMED.`,
  },
];

// Field mappings for both integration directions
export interface FieldMapping {
  omneaField: string;
  omneaApiPath: string;
  bcField: string;
  bcTableRef: string;
  direction: "omnea-to-bc" | "bc-to-omnea" | "bidirectional";
  entity: "Supplier" | "Profile" | "Bank Account";
  required?: boolean;
  notes?: string;
}

export const fieldMappings: FieldMapping[] = [
  // Supplier-level fields
  { omneaField: "Name", omneaApiPath: "name", bcField: "Name", bcTableRef: "Table 23, Field 2", direction: "bidirectional", entity: "Supplier", required: true },
  { omneaField: "Legal Name", omneaApiPath: "legalName", bcField: "Name", bcTableRef: "Table 23, Field 2", direction: "bc-to-omnea", entity: "Supplier", required: true },
  { omneaField: "Tax Number", omneaApiPath: "taxNumber", bcField: "VAT Registration No.", bcTableRef: "Table 23, Field 86", direction: "bidirectional", entity: "Supplier", required: true, notes: "Primary identity anchor" },
  { omneaField: "Remote ID", omneaApiPath: "remoteId", bcField: "Vendor No.", bcTableRef: "Table 23, Field 1", direction: "omnea-to-bc", entity: "Supplier", required: true, notes: "BC Vendor No written back to Omnea" },
  { omneaField: "Remote Link", omneaApiPath: "remoteLink", bcField: "Vendor Card URL", bcTableRef: "N/A (computed)", direction: "omnea-to-bc", entity: "Supplier" },
  { omneaField: "State", omneaApiPath: "state", bcField: "Blocked", bcTableRef: "Table 23, Field 39", direction: "bidirectional", entity: "Supplier", notes: "active→Blank, pending→Payment, archived→All" },
  { omneaField: "Website", omneaApiPath: "website", bcField: "Home Page", bcTableRef: "Table 23, Field 54", direction: "bidirectional", entity: "Supplier" },
  { omneaField: "Description", omneaApiPath: "description", bcField: "—", bcTableRef: "N/A", direction: "bc-to-omnea", entity: "Supplier" },
  { omneaField: "Is Preferred", omneaApiPath: "isPreferred", bcField: "—", bcTableRef: "N/A", direction: "bc-to-omnea", entity: "Supplier" },
  // Address fields
  { omneaField: "Address Street", omneaApiPath: "address.street1", bcField: "Address", bcTableRef: "Table 23, Field 5", direction: "bidirectional", entity: "Supplier" },
  { omneaField: "Address Street 2", omneaApiPath: "address.street2", bcField: "Address 2", bcTableRef: "Table 23, Field 6", direction: "bidirectional", entity: "Supplier" },
  { omneaField: "City", omneaApiPath: "address.city", bcField: "City", bcTableRef: "Table 23, Field 7", direction: "bidirectional", entity: "Supplier" },
  { omneaField: "State/County", omneaApiPath: "address.state", bcField: "County", bcTableRef: "Table 23, Field 92", direction: "bidirectional", entity: "Supplier" },
  { omneaField: "Zip Code", omneaApiPath: "address.zipCode", bcField: "Post Code", bcTableRef: "Table 23, Field 91", direction: "bidirectional", entity: "Supplier" },
  { omneaField: "Country", omneaApiPath: "address.country", bcField: "Country/Region Code", bcTableRef: "Table 23, Field 35", direction: "bidirectional", entity: "Supplier" },
  // Custom fields
  { omneaField: "Corporate Reg Number", omneaApiPath: "customFields.corporate-registration-number.value", bcField: "Registration No.", bcTableRef: "Table 23, Field 25", direction: "bidirectional", entity: "Supplier", notes: "Secondary identity anchor" },
  { omneaField: "Entity Type", omneaApiPath: "customFields.entity-type.value.name", bcField: "Gen. Bus. Posting Group", bcTableRef: "Table 23, Field 88", direction: "bidirectional", entity: "Supplier" },
  { omneaField: "Materiality Level", omneaApiPath: "customFields.materiality-level.value.name", bcField: "—", bcTableRef: "N/A", direction: "bc-to-omnea", entity: "Supplier", notes: "Governance field" },
  { omneaField: "InfoSec Criticality", omneaApiPath: "customFields.infosec-criticality-tier.value.name", bcField: "—", bcTableRef: "N/A", direction: "bc-to-omnea", entity: "Supplier", notes: "Governance field" },
  { omneaField: "InfoSec Sensitivity", omneaApiPath: "customFields.infosec-sensitivity-tier.value.name", bcField: "—", bcTableRef: "N/A", direction: "bc-to-omnea", entity: "Supplier", notes: "Governance field" },
  { omneaField: "CS Materiality Status", omneaApiPath: "customFields.cs-service-materiality-status.value", bcField: "—", bcTableRef: "N/A", direction: "bc-to-omnea", entity: "Supplier", notes: "Risk blocking logic" },
  { omneaField: "KYC Materiality Status", omneaApiPath: "customFields.kyc-materiality-status.value", bcField: "—", bcTableRef: "N/A", direction: "bc-to-omnea", entity: "Supplier", notes: "Risk blocking logic" },
  { omneaField: "SCA Materiality Status", omneaApiPath: "customFields.sca-materiality-status.value", bcField: "—", bcTableRef: "N/A", direction: "bc-to-omnea", entity: "Supplier", notes: "Risk blocking logic" },
  // Profile-level fields
  { omneaField: "Profile ID", omneaApiPath: "data[n].id", bcField: "—", bcTableRef: "N/A", direction: "bc-to-omnea", entity: "Profile" },
  { omneaField: "Profile State", omneaApiPath: "data[n].state", bcField: "Blocked", bcTableRef: "Table 23, Field 39", direction: "bidirectional", entity: "Profile" },
  { omneaField: "Subsidiary Name", omneaApiPath: "data[n].subsidiary.name", bcField: "Legal Entity", bcTableRef: "N/A (Company)", direction: "bidirectional", entity: "Profile" },
  { omneaField: "Subsidiary Remote ID", omneaApiPath: "data[n].subsidiary.remoteId", bcField: "Company Code", bcTableRef: "N/A", direction: "omnea-to-bc", entity: "Profile" },
  { omneaField: "Payment Method", omneaApiPath: "data[n].paymentMethod.name", bcField: "Payment Method Code", bcTableRef: "Table 23, Field 287", direction: "bidirectional", entity: "Profile" },
  { omneaField: "Payment Terms", omneaApiPath: "data[n].paymentTerms.name", bcField: "Payment Terms Code", bcTableRef: "Table 23, Field 27", direction: "bidirectional", entity: "Profile", required: true },
  { omneaField: "Relationship Owner", omneaApiPath: "customFields.supplierProfileRelationshipOwner.value.email", bcField: "Purchaser Code", bcTableRef: "Table 23, Field 29", direction: "bidirectional", entity: "Profile", notes: "SSO email → Medius routing" },
  { omneaField: "Profile Remote ID", omneaApiPath: "remoteId", bcField: "Vendor No.", bcTableRef: "Table 23, Field 1", direction: "omnea-to-bc", entity: "Profile", required: true },
  { omneaField: "Profile Remote Link", omneaApiPath: "remoteLink", bcField: "Vendor Card URL", bcTableRef: "N/A", direction: "omnea-to-bc", entity: "Profile" },
  // Bank Account fields
  { omneaField: "Account Name", omneaApiPath: "accountName", bcField: "Name", bcTableRef: "Table 287, Field 2", direction: "bidirectional", entity: "Bank Account" },
  { omneaField: "Bank Name", omneaApiPath: "bankName", bcField: "Bank Name", bcTableRef: "Table 287, Field 3", direction: "bidirectional", entity: "Bank Account" },
  { omneaField: "Account Number", omneaApiPath: "accountNumber", bcField: "Bank Account No.", bcTableRef: "Table 287, Field 4", direction: "bidirectional", entity: "Bank Account" },
  { omneaField: "Sort Code", omneaApiPath: "sortCode", bcField: "Bank Branch No.", bcTableRef: "Table 287, Field 12", direction: "bidirectional", entity: "Bank Account" },
  { omneaField: "IBAN", omneaApiPath: "iban", bcField: "IBAN", bcTableRef: "Table 287, Field 23", direction: "bidirectional", entity: "Bank Account", required: true },
  { omneaField: "SWIFT/BIC Code", omneaApiPath: "swiftCode", bcField: "SWIFT Code", bcTableRef: "Table 287, Field 24", direction: "bidirectional", entity: "Bank Account" },
  { omneaField: "Currency Code", omneaApiPath: "currency.code", bcField: "Currency Code", bcTableRef: "Table 287, Field 9", direction: "bidirectional", entity: "Bank Account" },
  { omneaField: "Is Active", omneaApiPath: "isActive", bcField: "—", bcTableRef: "N/A", direction: "bc-to-omnea", entity: "Bank Account" },
  { omneaField: "Bank Remote ID", omneaApiPath: "remoteId", bcField: "Bank Code", bcTableRef: "Table 287, Field 1", direction: "omnea-to-bc", entity: "Bank Account", required: true, notes: "BC Bank Code written back" },
  { omneaField: "Bank Address", omneaApiPath: "address.street1", bcField: "Address", bcTableRef: "Table 287, Field 5", direction: "bidirectional", entity: "Bank Account" },
  { omneaField: "Bank City", omneaApiPath: "address.city", bcField: "City", bcTableRef: "Table 287, Field 7", direction: "bidirectional", entity: "Bank Account" },
  { omneaField: "Bank Country", omneaApiPath: "address.country", bcField: "Country/Region Code", bcTableRef: "Table 287, Field 35", direction: "bidirectional", entity: "Bank Account" },
];

// Simulation steps matching Postman collection runner
export interface SimulationStep {
  id: string;
  order: number;
  name: string;
  method: "GET" | "POST" | "PATCH";
  endpointId: string;
  description: string;
  dependsOn?: string;
  outputVars?: string[];
}

export const simulationSteps: SimulationStep[] = [
  { id: "step-1", order: 1, name: "Authenticate", method: "POST", endpointId: "auth-token", description: "Get OAuth access token", outputVars: ["accessToken"] },
  { id: "step-2", order: 2, name: "Get Suppliers", method: "GET", endpointId: "get-suppliers", description: "List suppliers, capture first supplier ID", dependsOn: "step-1", outputVars: ["active_supplier_id"] },
  { id: "step-3", order: 3, name: "Get Supplier Details", method: "GET", endpointId: "get-supplier-by-id", description: "Fetch full supplier with custom fields", dependsOn: "step-2", outputVars: ["supplier_name_context"] },
  { id: "step-4", order: 4, name: "Get Profiles", method: "GET", endpointId: "get-profiles-by-supplier", description: "List subsidiary profiles for the supplier", dependsOn: "step-3", outputVars: ["active_profile_id"] },
  { id: "step-5", order: 5, name: "Get Bank Accounts", method: "GET", endpointId: "list-bank-accounts", description: "List bank accounts for the selected profile", dependsOn: "step-4", outputVars: ["bank_account_id"] },
  { id: "step-6", order: 6, name: "PATCH Profile (Handshake)", method: "PATCH", endpointId: "update-profile", description: "Write remoteId + remoteLink back to Omnea", dependsOn: "step-4" },
  { id: "step-7", order: 7, name: "PATCH Bank Account", method: "PATCH", endpointId: "update-bank-account", description: "Write BC Bank Code to Omnea bank account", dependsOn: "step-5" },
];
