import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

interface CollapsibleSectionProps {
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
  badge?: React.ReactNode;
  className?: string;
}

export const CollapsibleSection = ({
  title,
  defaultOpen = true,
  children,
  badge,
  className,
}: CollapsibleSectionProps) => {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className={cn("rounded-lg border bg-card", className)}>
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between px-5 py-4 text-left hover:bg-surface-hover transition-colors rounded-t-lg"
      >
        <div className="flex items-center gap-3">
          {open ? (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          )}
          <h3 className="text-sm font-semibold text-foreground">{title}</h3>
          {badge}
        </div>
      </button>
      {open && (
        <div className="border-t px-5 py-4 animate-fade-in">{children}</div>
      )}
    </div>
  );
};
