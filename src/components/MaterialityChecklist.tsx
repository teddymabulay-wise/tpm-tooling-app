import { CollapsibleSection } from "./CollapsibleSection";
import { StatusPill } from "./StatusPill";
import { ShieldCheck, ShieldAlert, ShieldX } from "lucide-react";

interface MaterialityChecklistProps {
  cs: boolean;
  kyc: boolean;
  sca: boolean;
}

export const MaterialityChecklist = ({ cs, kyc, sca }: MaterialityChecklistProps) => {
  const items = [
    { label: "Corporate Screening (CS)", value: cs, icon: cs ? ShieldCheck : ShieldX },
    { label: "Know Your Customer (KYC)", value: kyc, icon: kyc ? ShieldCheck : ShieldAlert },
    { label: "Sanctions & Compliance (SCA)", value: sca, icon: sca ? ShieldCheck : ShieldX },
  ];

  const allPassed = cs && kyc && sca;

  return (
    <CollapsibleSection
      title="Materiality Checklist"
      badge={
        allPassed ? (
          <StatusPill label="All Clear" variant="success" />
        ) : (
          <StatusPill label="Action Required" variant="warning" />
        )
      }
    >
      <div className="space-y-3">
        {items.map((item) => (
          <div
            key={item.label}
            className="flex items-center justify-between py-2 border-b border-border/50 last:border-0"
          >
            <div className="flex items-center gap-2.5">
              <item.icon
                className={`h-4 w-4 ${item.value ? "text-sync-success" : "text-sync-error"}`}
              />
              <span className="text-sm text-field-value">{item.label}</span>
            </div>
            <StatusPill
              label={item.value ? "Passed" : "Pending"}
              variant={item.value ? "success" : "danger"}
            />
          </div>
        ))}
        {!allPassed && (
          <p className="text-xs text-muted-foreground pt-1">
            Risk-based blocking: Vendor cannot move to "Active" in BC until all checks pass.
          </p>
        )}
      </div>
    </CollapsibleSection>
  );
};
