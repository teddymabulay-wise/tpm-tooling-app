import { StatusPill } from "./StatusPill";
import { Button } from "./ui/button";
import { CollapsibleSection } from "./CollapsibleSection";
import { cn } from "@/lib/utils";

type BCState = "Blank" | "Payment" | "All";

interface BCStateManagerProps {
  currentState: BCState;
  onStateChange: (state: BCState) => void;
}

const states: { value: BCState; label: string; description: string; stateNum: number }[] = [
  { value: "Payment", label: "Workflow Start", description: "BC Blocked = Payment", stateNum: 1 },
  { value: "Blank", label: "Approval Finish", description: "BC Blocked = Blank (Active)", stateNum: 0 },
  { value: "All", label: "Archived", description: "BC Blocked = All", stateNum: 2 },
];

export const BCStateManager = ({ currentState, onStateChange }: BCStateManagerProps) => {
  const currentIndex = states.findIndex((s) => s.value === currentState);

  return (
    <CollapsibleSection
      title="BC Workflow State"
      badge={
        <StatusPill
          label={`State ${states[currentIndex]?.stateNum ?? "?"}`}
          variant={
            currentState === "Blank" ? "success" : currentState === "Payment" ? "warning" : "danger"
          }
        />
      }
    >
      <div className="space-y-4">
        <div className="flex items-center gap-1">
          {states.map((state, i) => (
            <div key={state.value} className="flex items-center">
              <button
                onClick={() => onStateChange(state.value)}
                className={cn(
                  "flex flex-col items-center px-4 py-3 rounded-lg border transition-all min-w-[120px]",
                  currentState === state.value
                    ? "border-primary bg-pill-info shadow-sm"
                    : "border-border hover:border-primary/30 hover:bg-surface-hover"
                )}
              >
                <span
                  className={cn(
                    "text-lg font-bold mb-1",
                    currentState === state.value ? "text-primary" : "text-muted-foreground"
                  )}
                >
                  {state.stateNum}
                </span>
                <span className="text-xs font-medium text-field-value">{state.label}</span>
                <span className="text-[10px] text-muted-foreground mt-0.5">{state.description}</span>
              </button>
              {i < states.length - 1 && (
                <div className="w-6 h-px bg-border mx-1" />
              )}
            </div>
          ))}
        </div>
        <div className="flex gap-2">
          {states.map((state) => (
            <Button
              key={state.value}
              variant={currentState === state.value ? "default" : "outline"}
              size="sm"
              onClick={() => onStateChange(state.value)}
              className="text-xs"
            >
              Set {state.label}
            </Button>
          ))}
        </div>
      </div>
    </CollapsibleSection>
  );
};
