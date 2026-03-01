import { CollapsibleSection } from "./CollapsibleSection";
import { FieldRow } from "./FieldRow";
import { StatusPill } from "./StatusPill";
import { Shield, Key, Globe } from "lucide-react";

export const BCIntegration = () => (
  <CollapsibleSection
    title="BC Integration - V2"
    badge={<StatusPill label="Connected" variant="success" />}
  >
    <div className="space-y-1">
      <div className="flex items-center gap-2 mb-4">
        <Shield className="h-4 w-4 text-primary" />
        <span className="text-xs font-medium text-primary">OAuth 2.0 Client Credentials</span>
      </div>
      <FieldRow label="Client ID" value="bc-prod-client-9f8a2e..." mono />
      <FieldRow label="Authentication URL" value="https://login.microsoftonline.com/tenant/oauth2/v2.0/token" mono />
      <FieldRow
        label="Scopes"
        value={
          <div className="flex gap-1.5">
            <StatusPill label="Read" variant="info" />
            <StatusPill label="Write" variant="info" />
          </div>
        }
      />
      <div className="mt-4 pt-4 border-t">
        <div className="flex items-center gap-2 mb-3">
          <Key className="h-4 w-4 text-muted-foreground" />
          <span className="text-xs font-semibold text-foreground">Identity Resolution Engine</span>
        </div>
        <div className="rounded-md bg-secondary p-3 space-y-2">
          <div className="flex items-center gap-2">
            <Globe className="h-3 w-3 text-primary" />
            <span className="text-xs text-field-label">Primary Anchor:</span>
            <code className="text-xs font-mono bg-card px-1.5 py-0.5 rounded text-primary">taxNumber</code>
          </div>
          <div className="flex items-center gap-2">
            <Globe className="h-3 w-3 text-primary" />
            <span className="text-xs text-field-label">Secondary Anchor:</span>
            <code className="text-xs font-mono bg-card px-1.5 py-0.5 rounded text-primary">corporate-registration-number</code>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            Resolves against BC Table 23 (Vendor) for duplicate detection
          </p>
        </div>
      </div>
    </div>
  </CollapsibleSection>
);
