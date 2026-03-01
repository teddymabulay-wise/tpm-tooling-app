import { CollapsibleSection } from "./CollapsibleSection";
import { fieldMap } from "@/lib/mock-data";

export const FieldMapTable = () => {
  const sections = [...new Set(fieldMap.map((f) => f.section))];

  return (
    <CollapsibleSection title="Technical Field Map (Table 23 Reference)" defaultOpen={false}>
      <div className="rounded-md border overflow-hidden">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-secondary">
              <th className="px-3 py-2 text-left font-medium text-field-label">UI Section</th>
              <th className="px-3 py-2 text-left font-medium text-field-label">Field Label</th>
              <th className="px-3 py-2 text-left font-medium text-field-label font-mono">API Key</th>
              <th className="px-3 py-2 text-left font-medium text-field-label">BC Table 23 Mapping</th>
            </tr>
          </thead>
          <tbody>
            {fieldMap.map((row, i) => (
              <tr key={i} className="border-t hover:bg-surface-hover transition-colors">
                <td className="px-3 py-2 text-field-value">{row.section}</td>
                <td className="px-3 py-2 text-field-value font-medium">{row.label}</td>
                <td className="px-3 py-2 font-mono text-primary">{row.apiKey}</td>
                <td className="px-3 py-2 text-field-value">{row.bcField}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </CollapsibleSection>
  );
};
