import { type VendorProfile } from "./mock-data";

export interface SupplierProfile {
  id: string;
  vendorId: string;
  profileType: string;
  paymentTerms: string;
  currency: string;
  remoteId: string;
  remoteLink: string;
  status: "Active" | "Inactive" | "Pending";
  bcBlocked: "Blank" | "Payment" | "All";
  createdAt: string;
}

export interface BankDetail {
  id: string;
  vendorId: string;
  bankName: string;
  iban: string;
  swift: string;
  currency: string;
  primary: boolean;
  verified: boolean;
}

export const mockSuppliers: VendorProfile[] = [
  {
    id: "VND-2024-001847",
    legalName: "Nordic Supply Solutions OÜ",
    taxNumber: "EE102345678",
    corporateRegNumber: "14567890",
    entityType: "Limited Liability",
    address: "EstoniaVille, Tallinn, Tallinn, Harjumaa, Estonia, 10152",
    paymentTerms: "Net 30",
    remoteId: "V-10847",
    remoteLink: "https://bc.company.com/vendor/V-10847",
    status: "Active",
    type: "Third Party",
    category: "Standard",
    relationshipOwner: "Maria Johansson",
    ownerEmail: "maria.johansson@company.com",
    bcBlocked: "Blank",
    materialityCS: true,
    materialityKYC: true,
    materialitySCA: true,
    createdAt: "2024-06-15",
    currency: "EUR",
    bankAccount: "EE38 2200 2210 2014 5678",
  },
  {
    id: "VND-2024-002103",
    legalName: "Deutsche Logistik GmbH",
    taxNumber: "DE298765432",
    corporateRegNumber: "HRB 87654",
    entityType: "GmbH",
    address: "Friedrichstraße 45, Berlin, Berlin, Germany, 10117",
    paymentTerms: "Net 45",
    remoteId: "",
    remoteLink: "",
    status: "Pending",
    type: "Third Party",
    category: "Strategic",
    relationshipOwner: "Erik Lindström",
    ownerEmail: "erik.lindstrom@company.com",
    bcBlocked: "Payment",
    materialityCS: true,
    materialityKYC: false,
    materialitySCA: true,
    createdAt: "2024-08-22",
    currency: "EUR",
    bankAccount: "DE89 3704 0044 0532 0130 00",
  },
  {
    id: "VND-2024-003291",
    legalName: "Scandinavian Tech Partners AB",
    taxNumber: "SE556123456701",
    corporateRegNumber: "556123-4567",
    entityType: "Aktiebolag",
    address: "Kungsgatan 12, Stockholm, Stockholm, Sweden, 111 35",
    paymentTerms: "Net 30",
    remoteId: "V-33291",
    remoteLink: "https://bc.company.com/vendor/V-33291",
    status: "Active",
    type: "Internal",
    category: "Critical",
    relationshipOwner: "Anna Virtanen",
    ownerEmail: "anna.virtanen@company.com",
    bcBlocked: "Blank",
    materialityCS: true,
    materialityKYC: true,
    materialitySCA: true,
    createdAt: "2024-03-10",
    currency: "SEK",
    bankAccount: "SE35 5000 0000 0549 1000 0003",
  },
  {
    id: "VND-2024-004012",
    legalName: "Balkan Industrial Supplies d.o.o.",
    taxNumber: "HR12345678901",
    corporateRegNumber: "080123456",
    entityType: "d.o.o.",
    address: "Ilica 242, Zagreb, Zagreb, Croatia, 10000",
    paymentTerms: "Net 60",
    remoteId: "",
    remoteLink: "",
    status: "Archived",
    type: "Third Party",
    category: "Standard",
    relationshipOwner: "Tomislav Kovač",
    ownerEmail: "tomislav.kovac@company.com",
    bcBlocked: "All",
    materialityCS: false,
    materialityKYC: false,
    materialitySCA: false,
    createdAt: "2023-11-05",
    currency: "EUR",
    bankAccount: "HR12 1001 0051 8630 0016 0",
  },
];

export const mockProfiles: SupplierProfile[] = [
  { id: "PRF-001", vendorId: "VND-2024-001847", profileType: "Procurement", paymentTerms: "Net 30", currency: "EUR", remoteId: "V-10847", remoteLink: "https://bc.company.com/vendor/V-10847", status: "Active", bcBlocked: "Blank", createdAt: "2024-06-15" },
  { id: "PRF-002", vendorId: "VND-2024-002103", profileType: "Procurement", paymentTerms: "Net 45", currency: "EUR", remoteId: "", remoteLink: "", status: "Pending", bcBlocked: "Payment", createdAt: "2024-08-22" },
  { id: "PRF-003", vendorId: "VND-2024-003291", profileType: "Services", paymentTerms: "Net 30", currency: "SEK", remoteId: "V-33291", remoteLink: "https://bc.company.com/vendor/V-33291", status: "Active", bcBlocked: "Blank", createdAt: "2024-03-10" },
  { id: "PRF-004", vendorId: "VND-2024-004012", profileType: "Procurement", paymentTerms: "Net 60", currency: "EUR", remoteId: "", remoteLink: "", status: "Inactive", bcBlocked: "All", createdAt: "2023-11-05" },
];

export const mockBankDetails: BankDetail[] = [
  { id: "BNK-001", vendorId: "VND-2024-001847", bankName: "Swedbank", iban: "EE38 2200 2210 2014 5678", swift: "HABAEE2X", currency: "EUR", primary: true, verified: true },
  { id: "BNK-002", vendorId: "VND-2024-002103", bankName: "Deutsche Bank", iban: "DE89 3704 0044 0532 0130 00", swift: "DEUTDEDB", currency: "EUR", primary: true, verified: false },
  { id: "BNK-003", vendorId: "VND-2024-003291", bankName: "SEB", iban: "SE35 5000 0000 0549 1000 0003", swift: "ESSESESS", currency: "SEK", primary: true, verified: true },
  { id: "BNK-004", vendorId: "VND-2024-003291", bankName: "Nordea", iban: "SE72 3000 0000 0312 8100 0003", swift: "NDEASESS", currency: "EUR", primary: false, verified: true },
  { id: "BNK-005", vendorId: "VND-2024-004012", bankName: "Zagrebačka banka", iban: "HR12 1001 0051 8630 0016 0", swift: "ZABAHR2X", currency: "EUR", primary: true, verified: false },
];
