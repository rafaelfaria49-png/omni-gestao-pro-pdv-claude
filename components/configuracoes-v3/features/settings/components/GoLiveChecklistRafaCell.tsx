"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import {
  CheckCircle2,
  CircleDashed,
  ClipboardList,
  HelpCircle,
  ArrowRight,
  ExternalLink,
  PlayCircle,
} from "lucide-react";
import { Button } from "@/components/configuracoes-v3/components/ui/button";
import { Badge } from "@/components/configuracoes-v3/components/ui/badge";
import { useConfiguracoesNav } from "@/components/configuracoes-v3/contexts/ConfiguracoesNavContext";
import { useLojaAtiva } from "@/lib/loja-ativa";
import { useStoreSettings } from "@/lib/store-settings-provider";
import type { SectionId } from "../sections";
type ItemStatus = "done" | "review" | "pending";

type ChecklistItem = {
  id: string;
  label: string;
  hint: string;
  status: ItemStatus;
  targetSection?: SectionId;
  linkLabel?: string;
};

function safePrinterRecord(raw: unknown): Record<string, unknown> {
  return raw && typeof raw === "object" ? { ...(raw as Record<string, unknown>) } : {};
}

function hasMeaningfulPdvConfig(printerConfig: unknown): boolean {
  const o = safePrinterRecord(printerConfig);
  const card = o.v3PdvSectionCard;
  if (card === "classico" || card === "assistencia" || card === "supermercado") return true;
  if (card === "ia" || card === "rapido") return true;
  const pdvParams = o.pdvParams;
  if (pdvParams && typeof pdvParams === "object") {
    const p = pdvParams as Record<string, unknown>;
    if (p.pdvClassicLayout === "services" || p.pdvClassicLayout === "lovable") return true;
  }
  return false;
}

function hasVendasParamsInPrinter(printerConfig: unknown): boolean {
  const pdvParams = safePrinterRecord(printerConfig).pdvParams;
  if (!pdvParams || typeof pdvParams !== "object") return false;
  const p = pdvParams as Record<string, unknown>;
  const g = Number(p.garantiaPadraoDias);
  const v = Number(p.validadeOrcamentoDias);
  return Number.isFinite(g) && g >= 1 && Number.isFinite(v) && v >= 1;
}

function hasImpressaoConfig(printerConfig: unknown): boolean {
  const imp = safePrinterRecord(printerConfig).impressao;
  if (!imp || typeof imp !== "object") return false;
  const o = imp as Record<string, unknown>;
  return (
    String(o.impressoraHost ?? "").trim().length > 0 ||
    o.imprimirAutomatico === true ||
    o.abrirGaveta === true ||
    String(o.rodapeCupom ?? "").trim().length > 0
  );
}

function hasFinanceiroBasico(cardFees: unknown): boolean {
  if (!cardFees || typeof cardFees !== "object") return false;
  const c = cardFees as Record<string, unknown>;
  const meta = Number(c.metaFaturamento);
  if (Number.isFinite(meta) && meta > 0) return true;
  const maqs = c.maquininhas;
  if (Array.isArray(maqs) && maqs.some((m) => m && typeof m === "object" && (m as { ativo?: boolean }).ativo === true)) {
    return true;
  }
  return false;
}

function statusIcon(status: ItemStatus) {
  if (status === "done") return <CheckCircle2 className="h-5 w-5 shrink-0 text-success" aria-hidden />;
  if (status === "review") return <HelpCircle className="h-5 w-5 shrink-0 text-warning" aria-hidden />;
  return <CircleDashed className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden />;
}

function statusBadge(status: ItemStatus) {
  if (status === "done") {
    return (
      <Badge className="bg-success/15 text-success hover:bg-success/15 border-0 font-normal">
        Concluído
      </Badge>
    );
  }
  if (status === "review") {
    return (
      <Badge variant="secondary" className="border-warning/30 bg-warning/10 font-normal text-foreground">
        Revisar
      </Badge>
    );
  }
  return (
    <Badge variant="secondary" className="font-normal">
      Pendente
    </Badge>
  );
}

export type GoLiveEmpresaSnapshot = {
  nomeFantasia: string;
  cnpj: string;
  telefone: string;
  email: string;
  whatsapp: string;
};

export function GoLiveChecklistRafaCell({ empresa }: { empresa: GoLiveEmpresaSnapshot }) {
  const { navigateToSection } = useConfiguracoesNav();
  const { lojaAtivaId } = useLojaAtiva();
  const { hydrated, settings } = useStoreSettings();
  const { data: session } = useSession();

  const [usersCheck, setUsersCheck] = useState<"idle" | "loading" | "ok" | "review" | "forbidden">("idle");

  useEffect(() => {
    if (!session?.user) {
      setUsersCheck("review");
      return;
    }
    let cancelled = false;
    setUsersCheck("loading");
    void (async () => {
      try {
        const res = await fetch("/api/admin/users", { credentials: "include", cache: "no-store" });
        if (!res.ok) {
          if (!cancelled) setUsersCheck(res.status === 403 ? "forbidden" : "review");
          return;
        }
        const j = (await res.json().catch(() => ({}))) as {
          users?: { role?: string; active?: boolean }[];
        };
        const users = Array.isArray(j.users) ? j.users : [];
        const operational = users.filter(
          (u) =>
            u.active !== false &&
            ["CAIXA", "VENDEDOR", "GERENTE", "OPERADOR", "TECNICO"].includes(String(u.role || "").toUpperCase()),
        );
        if (!cancelled) setUsersCheck(operational.length >= 1 ? "ok" : "review");
      } catch {
        if (!cancelled) setUsersCheck("review");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [session?.user]);

  const items = useMemo((): ChecklistItem[] => {
    const storeId = lojaAtivaId?.trim() ?? "";
    const nome = empresa.nomeFantasia.trim();
    const hasEmpresa =
      !!storeId &&
      nome.length >= 2 &&
      (empresa.telefone.trim().length >= 8 ||
        empresa.cnpj.replace(/\D/g, "").length >= 11 ||
        empresa.email.includes("@"));

    const wa =
      empresa.whatsapp.trim() ||
      (storeId ? String(settings?.contactWhatsapp ?? "").trim() : "");
    const hasWhatsapp = Boolean(storeId && wa.replace(/\D/g, "").length >= 10);

    const hasLoja = !!storeId;

    let pdvStatus: ItemStatus = "pending";
    if (!storeId) pdvStatus = "pending";
    else if (!hydrated) pdvStatus = "review";
    else if (hasMeaningfulPdvConfig(settings?.printerConfig)) pdvStatus = "done";
    else pdvStatus = "review";

    let vendasStatus: ItemStatus = "pending";
    if (!storeId) vendasStatus = "pending";
    else if (!hydrated) vendasStatus = "review";
    else if (hasVendasParamsInPrinter(settings?.printerConfig)) vendasStatus = "done";
    else vendasStatus = "review";

    let impressaoStatus: ItemStatus = "review";
    if (!storeId) impressaoStatus = "pending";
    else if (!hydrated) impressaoStatus = "review";
    else if (hasImpressaoConfig(settings?.printerConfig)) impressaoStatus = "done";

    let finStatus: ItemStatus = "pending";
    if (!storeId) finStatus = "pending";
    else if (!hydrated) finStatus = "review";
    else if (hasFinanceiroBasico(settings?.cardFees)) finStatus = "done";
    else finStatus = "review";

    let usersStatus: ItemStatus = "review";
    if (!storeId) usersStatus = "pending";
    else if (usersCheck === "loading" || usersCheck === "idle") usersStatus = "review";
    else if (usersCheck === "ok") usersStatus = "done";
    else if (usersCheck === "forbidden") usersStatus = "review";
    else usersStatus = "review";

    return [
      {
        id: "empresa",
        label: "Dados da empresa preenchidos",
        hint: "Nome da unidade e pelo menos telefone, CNPJ ou e-mail.",
        status: hasEmpresa ? "done" : storeId ? "review" : "pending",
        targetSection: "geral",
        linkLabel: "Ir para Geral",
      },
      {
        id: "whatsapp",
        label: "WhatsApp configurado",
        hint:
          "Número da loja em contatos (Geral). Webhook Meta no servidor não é validado aqui — confira em Integrações se necessário.",
        status: hasWhatsapp ? "done" : storeId ? "review" : "pending",
        targetSection: "geral",
        linkLabel: "Ir para Geral",
      },
      {
        id: "loja",
        label: "Unidade ativa selecionada",
        hint: "Todas as configurações abaixo valem para a unidade ativa.",
        status: hasLoja ? "done" : "pending",
        targetSection: "lojas",
        linkLabel: "Ir para Lojas",
      },
      {
        id: "pdv",
        label: "PDV configurado",
        hint: "Fluxo principal (Clássico, Assistência ou Rápido / Grade) salvo na unidade.",
        status: pdvStatus,
        targetSection: "pdv",
        linkLabel: "Ir para PDV",
      },
      {
        id: "vendas",
        label: "Vendas e orçamentos configurados",
        hint: "Garantia, validade, formas de pagamento e flags de PDV em printerConfig.pdvParams.",
        status: vendasStatus,
        targetSection: "vendas",
        linkLabel: "Ir para Vendas",
      },
      {
        id: "impressao",
        label: "Impressão PDV (opcional)",
        hint: "Host da impressora, auto-print ou rodapé em printerConfig.impressao — revise se usar cupom térmico.",
        status: impressaoStatus,
        targetSection: "pdv",
        linkLabel: "Ir para PDV",
      },
      {
        id: "usuarios",
        label: "Usuários operacionais criados",
        hint:
          usersCheck === "forbidden"
            ? "Sem permissão para listar utilizadores — confirme manualmente na equipa."
            : "Pelo menos um utilizador ativo (caixa, vendedor, gerente, etc.).",
        status: usersStatus,
        targetSection: "usuarios",
        linkLabel: "Ir para Usuários",
      },
      {
        id: "financeiro",
        label: "Financeiro básico configurado",
        hint: "Meta de faturamento ou maquininha ativa em cardFees da unidade.",
        status: finStatus,
        targetSection: "financeiro",
        linkLabel: "Ir para Financeiro",
      },
    ];
  }, [empresa, hydrated, lojaAtivaId, settings?.cardFees, settings?.contactWhatsapp, settings?.printerConfig, usersCheck]);

  const doneCount = items.filter((i) => i.status === "done").length;
  const reviewCount = items.filter((i) => i.status === "review").length;

  return (
    <div className="overflow-hidden rounded-xl border border-primary/20 bg-gradient-to-br from-primary/8 via-card to-card shadow-soft">
      <div className="border-b border-border/80 px-6 py-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-primary">
              <ClipboardList className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-foreground">Checklist Go Live RafaCell</h2>
              <p className="mt-1 max-w-xl text-sm leading-relaxed text-muted-foreground">
                Prepare a unidade antes de abrir o PDV e a operação diária. Itens automáticos usam dados já carregados;
                os marcados como <span className="font-medium text-foreground">Revisar</span> exigem confirmação humana.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge variant="outline" className="tabular-nums font-normal">
              {doneCount}/{items.length} concluídos
            </Badge>
            {reviewCount > 0 ? (
              <Badge variant="secondary" className="font-normal">
                {reviewCount} para revisar
              </Badge>
            ) : null}
          </div>
        </div>
      </div>

      <ul className="divide-y divide-border/80 px-2 py-1 sm:px-4">
        {items.map((item) => (
          <li
            key={item.id}
            className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between"
          >
            <div className="flex min-w-0 items-start gap-3">
              {statusIcon(item.status)}
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground">{item.label}</p>
                <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{item.hint}</p>
              </div>
            </div>
            <div className="flex shrink-0 flex-wrap items-center gap-2 sm:pl-2">
              {statusBadge(item.status)}
              {item.targetSection && item.linkLabel ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8"
                  onClick={() => navigateToSection(item.targetSection!)}
                >
                  {item.linkLabel}
                  <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
                </Button>
              ) : null}
            </div>
          </li>
        ))}
      </ul>

      <div className="border-t border-border/80 px-6 py-5 space-y-5">
        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent text-accent-foreground">
            <PlayCircle className="h-5 w-5" aria-hidden />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-foreground">Testar operação</h3>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              Teste depois de salvar as configurações nesta tela. Os atalhos abaixo abrem outros módulos do painel sem
              alterar o que você configurou aqui.
            </p>
          </div>
        </div>

        <div>
          <p className="mb-2 text-xs font-medium text-foreground">Abrir módulos</p>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" className="h-8" asChild>
              <Link href="/dashboard/vendas">
                Abrir PDV
                <ExternalLink className="ml-1.5 h-3.5 w-3.5 opacity-70" />
              </Link>
            </Button>
            <Button variant="outline" size="sm" className="h-8" asChild>
              <Link href="/dashboard/operacoes-v2">
                Operações HUB
                <ExternalLink className="ml-1.5 h-3.5 w-3.5 opacity-70" />
              </Link>
            </Button>
            <Button variant="outline" size="sm" className="h-8" asChild>
              <Link href="/dashboard">
                Dashboard
                <ExternalLink className="ml-1.5 h-3.5 w-3.5 opacity-70" />
              </Link>
            </Button>
            <Button variant="outline" size="sm" className="h-8" asChild>
              <Link href="/dashboard/whatsapp">
                WhatsApp HUB
                <ExternalLink className="ml-1.5 h-3.5 w-3.5 opacity-70" />
              </Link>
            </Button>
          </div>
        </div>

        <div>
          <p className="mb-2 text-xs font-medium text-foreground">Continuar configuração</p>
          <div className="flex flex-wrap gap-2">
            {(
              [
                { id: "geral" as const, label: "Geral" },
                { id: "pdv" as const, label: "PDV" },
                { id: "vendas" as const, label: "Vendas" },
                { id: "financeiro" as const, label: "Financeiro" },
                { id: "usuarios" as const, label: "Usuários" },
              ] as const
            ).map(({ id, label }) => (
              <Button
                key={id}
                type="button"
                variant="ghost"
                size="sm"
                className="h-8 border border-border/80"
                onClick={() => navigateToSection(id)}
              >
                {label}
                <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
              </Button>
            ))}
          </div>
        </div>

        <ul className="space-y-1.5 rounded-lg border border-border/60 bg-card-muted/50 px-3 py-2.5 text-xs leading-relaxed text-muted-foreground">
          <li>
            <span className="font-medium text-foreground">PDV:</span> após mudar layout ou modo em Configurações,
            recarregue a tela de vendas para aplicar a preferência.
          </li>
          <li>
            <span className="font-medium text-foreground">WhatsApp HUB:</span> abre o painel de conversas; não confirma
            webhook Meta nem envio real — isso depende das variáveis no servidor.
          </li>
          <li>
            <span className="font-medium text-foreground">Dashboard:</span> KPIs e gráficos podem misturar dados reais e
            pré-visualizações; valide o que importa para a operação.
          </li>
        </ul>
      </div>

      <p className="border-t border-border/80 px-6 py-3 text-xs text-muted-foreground">
        Este checklist não substitui testes no PDV, WhatsApp ou financeiro real. Não envia dados ao servidor além das
        APIs já usadas pelo painel.
      </p>
    </div>
  );
}
