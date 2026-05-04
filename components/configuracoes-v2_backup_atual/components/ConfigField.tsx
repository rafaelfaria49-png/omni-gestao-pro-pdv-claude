"use client";

import { cn } from "@/lib/utils";
import { Label } from "@/components/ui/label";

type Props = {
  label: string;
  hint?: string;
  children: React.ReactNode;
  className?: string;
};

export function ConfigField({ label, hint, children, className }: Props) {
  return (
    <div className={cn("space-y-2", className)}>
      <div>
        <Label className="text-sm font-medium text-foreground">{label}</Label>
        {hint ? <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p> : null}
      </div>
      {children}
    </div>
  );
}
