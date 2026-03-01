import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { UserPlus, CreditCard, Layers, Check, Plus, Trash2 } from "lucide-react";
import { CollapsibleSection } from "@/components/CollapsibleSection";
import { toast } from "sonner";

interface BankEntry {
  bankName: string;
  iban: string;
  swift: string;
  currency: string;
}

interface ProfileEntry {
  profileType: string;
  paymentTerms: string;
  currency: string;
}

const AuditAddSupplier = () => {
  const [supplierData, setSupplierData] = useState({
    legalName: "",
    taxNumber: "",
    corporateRegNumber: "",
    entityType: "",
    address: "",
    relationshipOwner: "",
    ownerEmail: "",
  });

  const [profiles, setProfiles] = useState<ProfileEntry[]>([
    { profileType: "Procurement", paymentTerms: "Net 30", currency: "EUR" },
  ]);

  const [banks, setBanks] = useState<BankEntry[]>([
    { bankName: "", iban: "", swift: "", currency: "EUR" },
  ]);

  const updateField = (field: string, value: string) =>
    setSupplierData((d) => ({ ...d, [field]: value }));

  const handleSubmit = () => {
    if (!supplierData.legalName || !supplierData.taxNumber) {
      toast.error("Legal Name and Tax Number are required");
      return;
    }
    toast.success(`Supplier "${supplierData.legalName}" added successfully`);
  };

  return (
    <div className="p-6 space-y-6 animate-fade-in max-w-4xl">
      <div>
        <h2 className="text-lg font-semibold text-foreground">Add Supplier</h2>
        <p className="text-sm text-muted-foreground">
          Create a new supplier with profile and banking details
        </p>
      </div>

      <Tabs defaultValue="supplier">
        <TabsList className="bg-card border">
          <TabsTrigger value="supplier" className="text-xs">
            <UserPlus className="h-3.5 w-3.5 mr-1.5" />
            Supplier
          </TabsTrigger>
          <TabsTrigger value="profiles" className="text-xs">
            <Layers className="h-3.5 w-3.5 mr-1.5" />
            Profiles ({profiles.length})
          </TabsTrigger>
          <TabsTrigger value="banking" className="text-xs">
            <CreditCard className="h-3.5 w-3.5 mr-1.5" />
            Banking ({banks.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="supplier" className="space-y-4 mt-4">
          <Card className="p-5">
            <h3 className="text-sm font-semibold text-foreground mb-4">Supplier Details</h3>
            <div className="grid grid-cols-2 gap-4">
              {[
                { key: "legalName", label: "Legal Name *", placeholder: "Enter legal name" },
                { key: "taxNumber", label: "Tax Number (VAT) *", placeholder: "e.g. EE102345678" },
                { key: "corporateRegNumber", label: "Corporate Reg Number", placeholder: "e.g. 14567890" },
                { key: "entityType", label: "Entity Type", placeholder: "e.g. Limited Liability" },
                { key: "address", label: "Address", placeholder: "Full address" },
                { key: "relationshipOwner", label: "Relationship Owner", placeholder: "Owner name" },
                { key: "ownerEmail", label: "SSO Email", placeholder: "owner@company.com" },
              ].map(({ key, label, placeholder }) => (
                <div key={key} className={key === "address" ? "col-span-2" : ""}>
                  <Label className="text-xs text-field-label">{label}</Label>
                  <Input
                    value={(supplierData as Record<string, string>)[key]}
                    onChange={(e) => updateField(key, e.target.value)}
                    placeholder={placeholder}
                    className="mt-1"
                  />
                </div>
              ))}
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="profiles" className="space-y-4 mt-4">
          {profiles.map((profile, i) => (
            <Card key={i} className="p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold text-foreground">Profile {i + 1}</h3>
                {profiles.length > 1 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setProfiles((p) => p.filter((_, idx) => idx !== i))}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <Label className="text-xs text-field-label">Profile Type</Label>
                  <Select
                    value={profile.profileType}
                    onValueChange={(v) =>
                      setProfiles((p) => p.map((pr, idx) => (idx === i ? { ...pr, profileType: v } : pr)))
                    }
                  >
                    <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Procurement">Procurement</SelectItem>
                      <SelectItem value="Services">Services</SelectItem>
                      <SelectItem value="Consulting">Consulting</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs text-field-label">Payment Terms</Label>
                  <Select
                    value={profile.paymentTerms}
                    onValueChange={(v) =>
                      setProfiles((p) => p.map((pr, idx) => (idx === i ? { ...pr, paymentTerms: v } : pr)))
                    }
                  >
                    <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Net 15">Net 15</SelectItem>
                      <SelectItem value="Net 30">Net 30</SelectItem>
                      <SelectItem value="Net 45">Net 45</SelectItem>
                      <SelectItem value="Net 60">Net 60</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs text-field-label">Currency</Label>
                  <Select
                    value={profile.currency}
                    onValueChange={(v) =>
                      setProfiles((p) => p.map((pr, idx) => (idx === i ? { ...pr, currency: v } : pr)))
                    }
                  >
                    <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="EUR">EUR</SelectItem>
                      <SelectItem value="USD">USD</SelectItem>
                      <SelectItem value="GBP">GBP</SelectItem>
                      <SelectItem value="SEK">SEK</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </Card>
          ))}
          <Button
            variant="outline"
            size="sm"
            onClick={() => setProfiles((p) => [...p, { profileType: "Procurement", paymentTerms: "Net 30", currency: "EUR" }])}
          >
            <Plus className="h-3.5 w-3.5 mr-1.5" />
            Add Profile
          </Button>
        </TabsContent>

        <TabsContent value="banking" className="space-y-4 mt-4">
          {banks.map((bank, i) => (
            <Card key={i} className="p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold text-foreground">Bank Account {i + 1}</h3>
                {banks.length > 1 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setBanks((b) => b.filter((_, idx) => idx !== i))}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-xs text-field-label">Bank Name</Label>
                  <Input
                    value={bank.bankName}
                    onChange={(e) => setBanks((b) => b.map((bk, idx) => (idx === i ? { ...bk, bankName: e.target.value } : bk)))}
                    placeholder="e.g. Swedbank"
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label className="text-xs text-field-label">IBAN</Label>
                  <Input
                    value={bank.iban}
                    onChange={(e) => setBanks((b) => b.map((bk, idx) => (idx === i ? { ...bk, iban: e.target.value } : bk)))}
                    placeholder="e.g. EE38 2200 2210 2014 5678"
                    className="mt-1 font-mono"
                  />
                </div>
                <div>
                  <Label className="text-xs text-field-label">SWIFT / BIC</Label>
                  <Input
                    value={bank.swift}
                    onChange={(e) => setBanks((b) => b.map((bk, idx) => (idx === i ? { ...bk, swift: e.target.value } : bk)))}
                    placeholder="e.g. HABAEE2X"
                    className="mt-1 font-mono"
                  />
                </div>
                <div>
                  <Label className="text-xs text-field-label">Currency</Label>
                  <Select
                    value={bank.currency}
                    onValueChange={(v) => setBanks((b) => b.map((bk, idx) => (idx === i ? { ...bk, currency: v } : bk)))}
                  >
                    <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="EUR">EUR</SelectItem>
                      <SelectItem value="USD">USD</SelectItem>
                      <SelectItem value="GBP">GBP</SelectItem>
                      <SelectItem value="SEK">SEK</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </Card>
          ))}
          <Button
            variant="outline"
            size="sm"
            onClick={() => setBanks((b) => [...b, { bankName: "", iban: "", swift: "", currency: "EUR" }])}
          >
            <Plus className="h-3.5 w-3.5 mr-1.5" />
            Add Bank Account
          </Button>
        </TabsContent>
      </Tabs>

      <div className="flex justify-end pt-2">
        <Button onClick={handleSubmit}>
          <Check className="h-4 w-4 mr-1.5" />
          Create Supplier
        </Button>
      </div>
    </div>
  );
};

export default AuditAddSupplier;
