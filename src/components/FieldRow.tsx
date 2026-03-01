import { cn } from "@/lib/utils";

interface FieldRowProps {
  label: string;
  value?: string | React.ReactNode;
  placeholder?: string;
  className?: string;
  mono?: boolean;
}

export const FieldRow = ({
  label,
  value,
  placeholder = "Enter",
  className,
  mono,
}: FieldRowProps) => (
  <div className={cn("flex items-start justify-between py-2.5 border-b border-border/50 last:border-0", className)}>
    <span className="text-sm text-field-label min-w-[180px] shrink-0">{label}</span>
    <span
      className={cn(
        "text-sm text-right",
        value ? "text-field-value font-medium" : "text-muted-foreground italic",
        mono && "font-mono text-xs"
      )}
    >
      {value || placeholder}
    </span>
  </div>
);
