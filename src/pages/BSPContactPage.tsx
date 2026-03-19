import { Card } from "@/components/ui/card";
import { Users, Mail, Phone, Building2 } from "lucide-react";

const contacts = [
  { name: "John Smith", role: "BSP Lead", email: "john.smith@company.com", phone: "+44 20 7946 0958", department: "Procurement" },
  { name: "Sarah Johnson", role: "Integration Manager", email: "sarah.johnson@company.com", phone: "+44 20 7946 0123", department: "Technology" },
  { name: "Michael Chen", role: "Governance Analyst", email: "michael.chen@company.com", phone: "+44 20 7946 0456", department: "Risk & Compliance" },
  { name: "Emma Williams", role: "TPM Coordinator", email: "emma.williams@company.com", phone: "+44 20 7946 0789", department: "Operations" },
];

const BSPContactPage = () => {
  return (
    <div className="p-6 space-y-4 animate-fade-in max-w-4xl">
      <div>
        <h2 className="text-lg font-semibold text-foreground">BSP Internal Contacts</h2>
        <p className="text-sm text-muted-foreground">
          Key contacts for the Business Supplier Platform team.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {contacts.map((c) => (
          <Card key={c.email} className="p-4">
            <div className="flex items-start gap-3">
              <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                <Users className="h-5 w-5 text-primary" />
              </div>
              <div className="space-y-1.5 min-w-0">
                <div>
                  <p className="text-sm font-semibold text-foreground">{c.name}</p>
                  <p className="text-xs text-muted-foreground">{c.role}</p>
                </div>
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Building2 className="h-3 w-3" />
                  <span>{c.department}</span>
                </div>
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Mail className="h-3 w-3" />
                  <span className="truncate">{c.email}</span>
                </div>
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Phone className="h-3 w-3" />
                  <span>{c.phone}</span>
                </div>
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
};

export default BSPContactPage;
