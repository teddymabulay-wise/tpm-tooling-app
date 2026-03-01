export interface VendorProfile {
  id: string;
  legalName: string;
  taxNumber: string;
  corporateRegNumber: string;
  entityType: string;
  address: string;
  paymentTerms: string;
  remoteId: string;
  remoteLink: string;
  status: "Active" | "Archived" | "Pending";
  type: "Third Party" | "Internal" | "Subsidiary";
  category: "Standard" | "Strategic" | "Critical";
  relationshipOwner: string;
  ownerEmail: string;
  bcBlocked: "Blank" | "Payment" | "All";
  materialityCS: boolean;
  materialityKYC: boolean;
  materialitySCA: boolean;
  createdAt: string;
  currency: string;
  bankAccount: string;
}

export const mockVendor: VendorProfile = {
  id: "VND-2024-001847",
  legalName: "Nordic Supply Solutions OÜ",
  taxNumber: "EE102345678",
  corporateRegNumber: "14567890",
  entityType: "Limited Liability",
  address: "EstoniaVille, Tallinn, Tallinn, Harjumaa, Estonia, 10152",
  paymentTerms: "Net 30",
  remoteId: "",
  remoteLink: "",
  status: "Active",
  type: "Third Party",
  category: "Standard",
  relationshipOwner: "Maria Johansson",
  ownerEmail: "maria.johansson@company.com",
  bcBlocked: "Payment",
  materialityCS: true,
  materialityKYC: false,
  materialitySCA: true,
  createdAt: "2024-06-15",
  currency: "EUR",
  bankAccount: "EE38 2200 2210 2014 5678",
};

export const fieldMap = [
  { section: "Overview", label: "Tax number", apiKey: "data.taxNumber", bcField: "Field 86 (VAT Reg No.)" },
  { section: "Overview", label: "Address", apiKey: "data.address", bcField: "Fields 5, 7, 91, 92" },
  { section: "Custom", label: "Corporate reg number", apiKey: "customFields.corporate-registration-number", bcField: "Field 25 (Reg No.)" },
  { section: "Custom", label: "Entity type", apiKey: "customFields.entity-type", bcField: "Field 88 (Gen. Bus. Posting)" },
  { section: "Profiles", label: "Payment terms", apiKey: "profile.paymentTerms.name", bcField: "Field 27 (Payment Terms)" },
  { section: "Profiles", label: "Remote ID", apiKey: "profile.remoteId", bcField: "Field 1 (Vendor No.)" },
];
