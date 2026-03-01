import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const pillVariants = cva(
  "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors",
  {
    variants: {
      variant: {
        default: "bg-pill text-pill-foreground",
        success: "bg-pill-success text-pill-success-foreground",
        warning: "bg-pill-warning text-pill-warning-foreground",
        danger: "bg-pill-danger text-pill-danger-foreground",
        info: "bg-pill-info text-pill-info-foreground",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

interface StatusPillProps extends VariantProps<typeof pillVariants> {
  label: string;
  className?: string;
}

export const StatusPill = ({ label, variant, className }: StatusPillProps) => (
  <span className={cn(pillVariants({ variant }), className)}>{label}</span>
);
