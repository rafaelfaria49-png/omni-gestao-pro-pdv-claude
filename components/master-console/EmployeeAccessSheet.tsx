import { useEffect, useMemo, useState } from "react";
import {
  LayoutDashboard,
  ShoppingCart,
  Wallet,
  FileText,
  Package,
  Users,
  Truck,
  BarChart3,
  Settings,
  Bot,
  Megaphone,
  KeyRound,
  Eye,
  EyeOff,
  RefreshCw,
  ShieldCheck,
  Crown,
  Briefcase,
  UserCog,
  Calculator,
} from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import type { Employee } from "./TeamPanel";

type RoleTemplate = "Dono" | "Gerente" | "Vendedor" | "Caixa";

interface PermissionDef {
  id: string;
  label: string;
  desc: string;
  icon: typeof LayoutDashboard;
  tone: string;
  bg: string;
}

interface PermissionCategory {
  id: string;
  title: string;
  items: PermissionDef[];
}

const categories: PermissionCategory[] = [
  {
    id: "ops",
    title: "Operacional",
    items: [
      { id: "dashboard", label: "Dashboard", desc: "Visão geral da operação", icon: LayoutDashboard, tone: "text-info", bg: "bg-info/10" },
      { id: "pdv", label: "PDV (Ponto de Venda)", desc: "Realizar vendas no balcão", icon: ShoppingCart, tone: "text-warning", bg: "bg-warning/10" },
      { id: "caixa", label: "Controle de Caixa", desc: "Abrir, fechar e sangrar caixa", icon: Calculator, tone: "text-success", bg: "bg-success/10" },
      { id: "os", label: "Orçamentos / OS", desc: "Criar ordens de serviço", icon: FileText, tone: "text-info", bg: "bg-info/10" },
    ],
  },
  {
    id: "back",
    title: "Backoffice",
    items: [
      { id: "estoque", label: "Estoque / Produtos", desc: "Cadastro e inventário", icon: Package, tone: "text-info", bg: "bg-info/10" },
      { id: "clientes", label: "Clientes", desc: "Base de clientes (CRM)", icon: Users, tone: "text-purple", bg: "bg-purple/10" },
      { id: "fornecedores", label: "Fornecedores", desc: "Compras e contratos", icon: Truck, tone: "text-muted-foreground", bg: "bg-muted" },
    ],
  },
  {
    id: "mgmt",
    title: "Gestão",
    items: [
      { id: "relatorios", label: "Relatórios Financeiros", desc: "DRE, fluxo de caixa, margens", icon: BarChart3, tone: "text-success", bg: "bg-success/10" },
      { id: "config", label: "Configurações da Loja", desc: "Dados, usuários e integrações", icon: Settings, tone: "text-foreground", bg: "bg-muted" },
    ],
  },
  {
    id: "ai",
    title: "Inteligência",
    items: [
      { id: "ia", label: "IA Mestre", desc: "Insights e automações", icon: Bot, tone: "text-purple", bg: "bg-purple/10" },
      { id: "mkt", label: "Marketing Studio", desc: "Campanhas e mídia social", icon: Megaphone, tone: "text-pink", bg: "bg-pink/10" },
    ],
  },
];

const allPermIds = categories.flatMap((c) => c.items.map((i) => i.id));

const templates: Record<RoleTemplate, { perms: string[]; icon: typeof Crown; tone: string }> = {
  Dono: {
    perms: allPermIds,
    icon: Crown,
    tone: "text-purple",
  },
  Gerente: {
    perms: ["dashboard", "pdv", "caixa", "os", "estoque", "clientes", "fornecedores", "relatorios", "ia", "mkt"],
    icon: Briefcase,
    tone: "text-info",
  },
  Vendedor: {
    perms: ["dashboard", "pdv", "os", "clientes"],
    icon: UserCog,
    tone: "text-warning",
  },
  Caixa: {
    perms: ["pdv", "caixa"],
    icon: UserCog,
    tone: "text-success",
  },
};

function buildPermsFromTemplate(template: RoleTemplate): Record<string, boolean> {
  const enabled = new Set(templates[template].perms);
  return Object.fromEntries(allPermIds.map((id) => [id, enabled.has(id)]));
}

interface EmployeeAccessSheetProps {
  employee: Employee | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function EmployeeAccessSheet({ employee, open, onOpenChange }: EmployeeAccessSheetProps) {
  const initialTemplate: RoleTemplate = useMemo(() => {
    if (!employee) return "Vendedor";
    if (employee.role === "Dono") return "Dono";
    if (employee.role === "Gerente") return "Gerente";
    return "Vendedor";
  }, [employee]);

  const [template, setTemplate] = useState<RoleTemplate>(initialTemplate);
  const [perms, setPerms] = useState<Record<string, boolean>>(() =>
    buildPermsFromTemplate(initialTemplate)
  );
  const [pin, setPin] = useState("4827");
  const [showPin, setShowPin] = useState(false);

  // Reset state whenever a new employee is opened
  useEffect(() => {
    if (employee) {
      setTemplate(initialTemplate);
      setPerms(buildPermsFromTemplate(initialTemplate));
      setPin("4827");
      setShowPin(false);
    }
  }, [employee, initialTemplate]);

  function applyTemplate(next: RoleTemplate) {
    setTemplate(next);
    setPerms(buildPermsFromTemplate(next));
  }

  function regeneratePin() {
    const next = String(Math.floor(1000 + Math.random() * 9000));
    setPin(next);
    setShowPin(true);
  }

  if (!employee) return null;

  const TemplateIcon = templates[template].icon;
  const enabledCount = Object.values(perms).filter(Boolean).length;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full overflow-y-auto border-l border-border bg-card p-0 sm:max-w-md"
      >
        {/* HEADER */}
        <SheetHeader className="space-y-0 border-b border-border bg-gradient-to-br from-panel to-card px-6 py-5">
          <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
            <ShieldCheck className="h-3.5 w-3.5" />
            <span>Perfil de Acessos</span>
          </div>
          <div className="mt-3 flex items-center gap-3">
            <Avatar className="h-12 w-12 ring-2 ring-background">
              <AvatarFallback className="bg-gradient-to-br from-info/30 to-purple/30 text-sm font-bold text-foreground">
                {employee.initials}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <SheetTitle className="truncate text-base font-bold">{employee.name}</SheetTitle>
              <SheetDescription className="text-xs">
                {enabledCount} de {allPermIds.length} módulos liberados
              </SheetDescription>
            </div>
            <Badge
              variant="outline"
              className={cn(
                "gap-1 rounded-lg border-border bg-panel px-2 py-1 text-[10px] font-semibold",
                templates[template].tone
              )}
            >
              <TemplateIcon className="h-3 w-3" />
              {template}
            </Badge>
          </div>
        </SheetHeader>

        <div className="space-y-6 px-6 py-6">
          {/* TEMPLATE */}
          <section className="space-y-2">
            <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Cargo (Template de acessos)
            </label>
            <Select value={template} onValueChange={(v) => applyTemplate(v as RoleTemplate)}>
              <SelectTrigger className="h-11 rounded-xl border-border bg-panel font-semibold transition-smooth hover:border-info">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="rounded-xl border-border bg-popover">
                {(Object.keys(templates) as RoleTemplate[]).map((t) => {
                  const Icon = templates[t].icon;
                  return (
                    <SelectItem key={t} value={t} className="rounded-lg">
                      <span className="flex items-center gap-2">
                        <Icon className={cn("h-4 w-4", templates[t].tone)} />
                        {t}
                      </span>
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
            <p className="text-[11px] text-muted-foreground">
              Selecionar um cargo aplica um conjunto base de permissões. Você pode ajustar individualmente abaixo.
            </p>
          </section>

          {/* PIN */}
          <section className="space-y-2">
            <label className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              <KeyRound className="h-3 w-3" />
              PIN de Acesso Rápido (PDV)
            </label>
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Input
                  value={showPin ? pin : "••••"}
                  readOnly
                  className="h-11 rounded-xl border-border bg-panel pr-10 font-mono text-base font-bold tracking-[0.5em]"
                />
                <button
                  onClick={() => setShowPin((s) => !s)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 rounded-md p-1 text-muted-foreground transition-smooth hover:bg-muted hover:text-foreground"
                  aria-label={showPin ? "Ocultar PIN" : "Mostrar PIN"}
                >
                  {showPin ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={regeneratePin}
                className="h-11 rounded-xl border-border font-semibold transition-smooth hover:border-info hover:text-info"
              >
                <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
                Redefinir
              </Button>
            </div>
            <p className="text-[11px] text-muted-foreground">
              4 dígitos usados para login rápido no PDV em modo turno.
            </p>
          </section>

          <Separator />

          {/* PERMISSIONS */}
          <section className="space-y-5">
            <div>
              <h4 className="text-sm font-bold tracking-tight">Permissões Detalhadas</h4>
              <p className="text-[11px] text-muted-foreground">
                Ative ou desative módulos individualmente.
              </p>
            </div>

            {categories.map((cat) => (
              <div key={cat.id} className="space-y-2">
                <h5 className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                  {cat.title}
                </h5>
                <ul className="space-y-2">
                  {cat.items.map((p) => {
                    const enabled = !!perms[p.id];
                    const Icon = p.icon;
                    return (
                      <li
                        key={p.id}
                        className={cn(
                          "flex items-center gap-3 rounded-xl border border-border bg-panel/50 p-3 transition-smooth",
                          !enabled && "opacity-50"
                        )}
                      >
                        <div className={cn("icon-tile h-9 w-9 shrink-0", p.bg)}>
                          <Icon className={cn("h-4.5 w-4.5", p.tone)} />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold text-foreground">{p.label}</p>
                          <p className="truncate text-xs text-muted-foreground">{p.desc}</p>
                        </div>
                        <Switch
                          checked={enabled}
                          onCheckedChange={(v) => setPerms((s) => ({ ...s, [p.id]: v }))}
                        />
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </section>

          <Separator />

          <div className="flex items-center justify-end gap-2 pb-2">
            <Button
              variant="ghost"
              onClick={() => onOpenChange(false)}
              className="rounded-xl font-semibold"
            >
              Cancelar
            </Button>
            <Button className="rounded-xl font-semibold shadow-elegant transition-smooth hover:shadow-glow">
              Salvar alterações
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
