import { Clock } from "lucide-react";
import { Badge } from "@/components/configuracoes-v3/components/ui/badge";
import { cn } from "@/components/configuracoes-v3/lib/utils";

export function SettingsSoonBadge({ className }: { className?: string }) {
  return (
    <Badge
      variant="secondary"
      className={cn("gap-1 font-normal text-muted-foreground", className)}
    >
      <Clock className="h-3 w-3 shrink-0" aria-hidden />
      Em breve
    </Badge>
  );
}
