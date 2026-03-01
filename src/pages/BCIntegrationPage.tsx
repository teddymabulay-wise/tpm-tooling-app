import { BCIntegration } from "@/components/BCIntegration";
import { BCStateManager } from "@/components/BCStateManager";
import { MaterialityChecklist } from "@/components/MaterialityChecklist";
import { CSVUploader } from "@/components/CSVUploader";
import { FieldMapTable } from "@/components/FieldMapTable";
import { AddressSplitter } from "@/components/AddressSplitter";
import { StatusPill } from "@/components/StatusPill";
import { useState } from "react";

const BCIntegrationPage = () => {
  const [bcBlocked, setBcBlocked] = useState<"Blank" | "Payment" | "All">("Payment");

  return (
    <div className="p-6 space-y-4 animate-fade-in max-w-5xl">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-foreground">BC Integration</h2>
          <p className="text-sm text-muted-foreground">Business Central integration management</p>
        </div>
        <StatusPill label="Project Active" variant="success" />
      </div>

      <BCIntegration />
      <BCStateManager currentState={bcBlocked} onStateChange={setBcBlocked} />
      <FieldMapTable />
      <AddressSplitter rawAddress="EstoniaVille, Tallinn, Tallinn, Harjumaa, Estonia, 10152" />
      <MaterialityChecklist cs={true} kyc={false} sca={true} />
      <CSVUploader />
    </div>
  );
};

export default BCIntegrationPage;
