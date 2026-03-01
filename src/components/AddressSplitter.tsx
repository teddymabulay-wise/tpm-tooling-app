import { useState } from "react";
import { CollapsibleSection } from "./CollapsibleSection";
import { FieldRow } from "./FieldRow";
import { Input } from "./ui/input";
import { Button } from "./ui/button";
import { parseAddress, type ParsedAddress } from "@/lib/address-utils";
import { SplitSquareHorizontal } from "lucide-react";

interface AddressSplitterProps {
  rawAddress: string;
}

export const AddressSplitter = ({ rawAddress }: AddressSplitterProps) => {
  const [input, setInput] = useState(rawAddress);
  const [parsed, setParsed] = useState<ParsedAddress | null>(null);

  const handleParse = () => {
    setParsed(parseAddress(input));
  };

  return (
    <CollapsibleSection title="Address Splitter (BC Fields 5, 7, 91, 92)" defaultOpen={false}>
      <div className="space-y-4">
        <p className="text-xs text-muted-foreground">
          Parses a single-line Omnea address into separate BC fields.
        </p>
        <div className="flex gap-2">
          <Input
            value={input}
            onChange={(e) => { setInput(e.target.value); setParsed(null); }}
            className="text-sm font-mono"
            placeholder="Paste raw address..."
          />
          <Button onClick={handleParse} size="sm" variant="outline">
            <SplitSquareHorizontal className="h-3.5 w-3.5 mr-1.5" />
            Parse
          </Button>
        </div>
        {parsed && (
          <div className="animate-fade-in space-y-0">
            <FieldRow label="Address (Field 5)" value={parsed.address || undefined} placeholder="—" />
            <FieldRow label="City (Field 7)" value={parsed.city || undefined} placeholder="—" />
            <FieldRow label="County (Field 91)" value={parsed.county || undefined} placeholder="—" />
            <FieldRow label="Post Code (Field 92)" value={parsed.postCode || undefined} placeholder="—" />
            <FieldRow label="Country" value={parsed.country || undefined} placeholder="—" />
          </div>
        )}
      </div>
    </CollapsibleSection>
  );
};
