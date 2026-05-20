import { cn } from "@/lib/utils";
import { Sparkles } from "lucide-react";

export function AIBadge({ className, label = "IA" }: { className?: string; label?: string }) {
  return (
    <span className={cn("ai-badge", className)}>
      <Sparkles className="h-3 w-3" />
      {label}
    </span>
  );
}
