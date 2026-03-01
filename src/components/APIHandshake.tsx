import { useState } from "react";
import { CollapsibleSection } from "./CollapsibleSection";
import { StatusPill } from "./StatusPill";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { ArrowRightLeft, Check, Loader2 } from "lucide-react";

interface APIHandshakeProps {
  remoteId: string;
  remoteLink: string;
  onSync: (remoteId: string, remoteLink: string) => void;
}

export const APIHandshake = ({ remoteId, remoteLink, onSync }: APIHandshakeProps) => {
  const [newRemoteId, setNewRemoteId] = useState(remoteId);
  const [newRemoteLink, setNewRemoteLink] = useState(remoteLink || "https://bc.company.com/vendor/");
  const [syncing, setSyncing] = useState(false);
  const [synced, setSynced] = useState(!!remoteId);

  const handleSync = () => {
    if (!newRemoteId) return;
    setSyncing(true);
    setTimeout(() => {
      onSync(newRemoteId, newRemoteLink + newRemoteId);
      setSyncing(false);
      setSynced(true);
    }, 1200);
  };

  return (
    <CollapsibleSection
      title="API Handshake Simulator"
      badge={
        synced ? (
          <StatusPill label="Linked" variant="success" />
        ) : (
          <StatusPill label="Unlinked" variant="warning" />
        )
      }
    >
      <div className="space-y-4">
        <p className="text-xs text-muted-foreground">
          Simulate a PATCH request to write <code className="font-mono bg-secondary px-1 rounded">remoteId</code> (BC Vendor No.) and{" "}
          <code className="font-mono bg-secondary px-1 rounded">remoteLink</code> back to the profile.
        </p>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-xs font-medium text-field-label mb-1.5 block">
              Remote ID (BC Vendor No.)
            </label>
            <Input
              value={newRemoteId}
              onChange={(e) => { setNewRemoteId(e.target.value); setSynced(false); }}
              placeholder="e.g. V-10847"
              className="font-mono text-sm"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-field-label mb-1.5 block">
              Remote Link
            </label>
            <Input
              value={newRemoteLink}
              onChange={(e) => setNewRemoteLink(e.target.value)}
              placeholder="https://..."
              className="font-mono text-sm"
            />
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Button onClick={handleSync} disabled={!newRemoteId || syncing} size="sm">
            {syncing ? (
              <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> Syncing...</>
            ) : synced ? (
              <><Check className="h-3.5 w-3.5 mr-1.5" /> Synced</>
            ) : (
              <><ArrowRightLeft className="h-3.5 w-3.5 mr-1.5" /> Simulate PATCH</>
            )}
          </Button>
          {synced && (
            <span className="text-xs text-sync-success font-medium animate-fade-in">
              ✓ Profile linked to BC Vendor {newRemoteId}
            </span>
          )}
        </div>

        {synced && (
          <div className="rounded-md bg-secondary p-3 font-mono text-xs animate-fade-in">
            <pre className="text-field-value whitespace-pre-wrap">{JSON.stringify(
              {
                method: "PATCH",
                path: "/api/v1/profiles/{profileId}",
                body: { remoteId: newRemoteId, remoteLink: newRemoteLink + (newRemoteLink.endsWith("/") ? "" : "/") + newRemoteId },
                status: 200,
              },
              null,
              2
            )}</pre>
          </div>
        )}
      </div>
    </CollapsibleSection>
  );
};
