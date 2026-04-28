import { ShoppingCart, ShieldCheck, Trash2, Pencil, LogIn, Package, Wallet } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

type ActionType = "delete" | "edit" | "create" | "login" | "permission" | "stock" | "finance";

export interface ActivityEntry {
  id: string;
  actorInitials: string;
  message: string;
  time: string;
  type: ActionType;
}

const typeStyles: Record<ActionType, { icon: any; tone: string; bg: string; ring: string }> = {
  delete: { icon: Trash2, tone: "text-destructive", bg: "bg-destructive/10", ring: "ring-destructive/20" },
  edit: { icon: Pencil, tone: "text-info", bg: "bg-info/10", ring: "ring-info/20" },
  create: { icon: ShoppingCart, tone: "text-success", bg: "bg-success/10", ring: "ring-success/20" },
  login: { icon: LogIn, tone: "text-muted-foreground", bg: "bg-muted", ring: "ring-border" },
  permission: { icon: ShieldCheck, tone: "text-purple", bg: "bg-purple/10", ring: "ring-purple/20" },
  stock: { icon: Package, tone: "text-warning", bg: "bg-warning/10", ring: "ring-warning/20" },
  finance: { icon: Wallet, tone: "text-success", bg: "bg-success/10", ring: "ring-success/20" },
};

export function ActivityLog({ entries }: { entries: ActivityEntry[] }) {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">Histórico Recente</h3>
      </div>
      <ol className="relative space-y-4">
        {entries.map((entry, idx) => {
          const style = typeStyles[entry.type];
          const Icon = style.icon;
          return (
            <li key={entry.id} className="relative flex gap-3 pb-4">
              {idx !== entries.length - 1 && <span className="absolute left-[19px] top-10 h-[calc(100%-1.5rem)] w-px bg-border" />}
              <div className="relative shrink-0">
                <Avatar className="h-10 w-10 ring-2 ring-background">
                  <AvatarFallback className="bg-panel text-[10px] font-bold">{entry.actorInitials}</AvatarFallback>
                </Avatar>
                <span className={cn("absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full ring-2 ring-card shadow-sm", style.bg)}>
                  <Icon className={cn("h-3 w-3", style.tone)} />
                </span>
              </div>
              <div className="min-w-0 flex-1 rounded-xl border border-border bg-panel/50 px-3 py-2">
                <p className="text-sm leading-snug text-foreground">{entry.message}</p>
                <p className="mt-0.5 text-[11px] text-muted-foreground">{entry.time}</p>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
