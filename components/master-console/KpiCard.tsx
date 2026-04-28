import { LucideIcon, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";

interface KpiCardProps {
  label: string;
  value: string;
  trend?: string;
  icon: LucideIcon;
  tone: "info" | "purple" | "success";
  highlight?: boolean;
  compact?: boolean;
}

const toneMap = {
  info: { bg: "bg-info/10", text: "text-info", ring: "ring-info/20" },
  purple: { bg: "bg-purple/10", text: "text-purple", ring: "ring-purple/20" },
  success: { bg: "bg-success/10", text: "text-success", ring: "ring-success/20" },
};

export function KpiCard({ label, value, trend, icon: Icon, tone, highlight, compact }: KpiCardProps) {
  const t = toneMap[tone];
  return (
    <div className={cn("group relative overflow-hidden rounded-2xl border border-border bg-card shadow-card transition-smooth hover:-translate-y-0.5 hover:shadow-glow", compact ? "p-4" : "p-5")}>
      <div className="flex items-start justify-between">
        <div className={cn("text-foreground", compact ? "space-y-1" : "space-y-1.5")}>
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{label}</p>
          <p className={cn(compact ? "text-2xl" : "text-3xl", "font-bold tracking-tight", highlight ? "text-success" : "text-foreground")}>{value}</p>
          {trend && <div className="flex items-center gap-1 text-xs font-medium text-success"><TrendingUp className="h-3 w-3" /><span>{trend}</span></div>}
        </div>
        <div className={cn("icon-tile ring-1", compact ? "h-10 w-10" : "h-12 w-12", t.bg, t.ring)}>
          <Icon className={cn(compact ? "h-5 w-5" : "h-6 w-6", t.text)} />
        </div>
      </div>
    </div>
  );
}
