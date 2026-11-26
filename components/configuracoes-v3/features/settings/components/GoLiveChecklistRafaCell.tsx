"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { ArrowDown, ArrowRight, ClipboardList, ExternalLink } from "lucide-react";
import { Button } from "@/components/configuracoes-v3/components/ui/button";
import { useConfiguracoesNav } from "@/components/configuracoes-v3/contexts/ConfiguracoesNavContext";
import { useLojaAtiva } from "@/lib/loja-ativa";
import { useStoreSettings } from "@/lib/store-settings-provider";
import type { SectionId } from "../sections";
import { SettingsStatusBadge, type SettingsStatusTone } from "./SettingsStatusBadge";
import { SettingsCollapsible } from "./SettingsCollapsible";
import { cn } from "../../../lib/utils";

export type OperationalItemStatus = "done" | "review" | "pending" | "not_verified" | "forbidden";

export type OperationalChecklistItem = {
  id: string;
  label: string;
  hint: string;
  status: OperationalItemStatus;
  targetSection?: SectionId;
  localTarget?: "name" | "contactWhatsapp";
  linkLabel: string;
};

export type GoLiveEmpresaSnapshot = {
  nomeFantasia: string;
  cnpj: string;
  telefone: string;
  email: string;
  whatsapp: string;
};

type ChecklistFilter = "all" | "attention" | "done";

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
  if (
    Array.isArray(maqs) &&
    maqs.some((m) => m && typeof m === "object" && (m as { ativo?: boolean }).ativo === true)
  ) {
    return true;
  }
  return false;
}

const STATUS_META: Record<
  OperationalItemStatus,
  { label: string; tone: SettingsStatusTone; dotColor: string }
> = {
  done: { label: "Concluído", tone: "done", dotColor: "var(--cfg-success-dot)" },
  review: { label: "Revisar", tone: "review", dotColor: "var(--cfg-warning-dot)" },
  pending: { label: "Pendente", tone: "pending", dotColor: "var(--cfg-subtle)" },
  not_verified: { label: "Não verificado", tone: "not_verified", dotColor: "var(--cfg-info-fg)" },
  forbidden: { label: "Sem permissão", tone: "readonly", dotColor: "var(--cfg-info-fg)" },
};

/**
 * Avalia o estado de prontidão operacional exclusivamente com dados confirmados do servidor.
 * Nunca considera edições não salvas como etapa concluída.
 */
export function useOperationalReadiness(
  confirmedEmpresa: GoLiveEmpresaSnapshot,
  enabled = true,
  basicsLoaded = true,
) {
  const { lojaAtivaId } = useLojaAtiva();
  const { hydrated, loaded, settings } = useStoreSettings();
  const { data: session } = useSession();
  const sessionUserId = session?.user?.id ?? null;

  const [usersCheck, setUsersCheck] = useState<
    "idle" | "loading" | "ok" | "review" | "forbidden" | "unverified"
  >("idle");

  useEffect(() => {
    const storeId = lojaAtivaId?.trim() ?? "";
    if (!enabled || !storeId) {
      setUsersCheck("idle");
      return;
    }
    if (!sessionUserId) {
      setUsersCheck("unverified");
      return;
    }
    let cancelled = false;
    setUsersCheck("loading");
    void (async () => {
      try {
        const res = await fetch("/api/admin/users", { credentials: "include", cache: "no-store" });
        if (!res.ok) {
          if (!cancelled) setUsersCheck(res.status === 403 ? "forbidden" : "unverified");
          return;
        }
        const j = (await res.json().catch(() => ({}))) as {
          users?: { role?: string; active?: boolean }[];
        };
        const users = Array.isArray(j.users) ? j.users : [];
        const operational = users.filter(
          (u) =>
            u.active !== false &&
            ["CAIXA", "VENDEDOR", "GERENTE", "OPERADOR", "TECNICO"].includes(
              String(u.role || "").toUpperCase(),
            ),
        );
        if (!cancelled) setUsersCheck(operational.length >= 1 ? "ok" : "review");
      } catch {
        if (!cancelled) setUsersCheck("unverified");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [enabled, sessionUserId, lojaAtivaId]);

  const items = useMemo((): OperationalChecklistItem[] => {
    const storeId = lojaAtivaId?.trim() ?? "";
    const nome = confirmedEmpresa.nomeFantasia.trim();
    const hasEmpresa =
      !!storeId &&
      basicsLoaded &&
      nome.length >= 2 &&
      (confirmedEmpresa.telefone.trim().length >= 8 ||
        confirmedEmpresa.cnpj.replace(/\D/g, "").length >= 11 ||
        confirmedEmpresa.email.includes("@"));

    const wa =
      (basicsLoaded ? confirmedEmpresa.whatsapp.trim() : "") ||
      (storeId && loaded ? String(settings?.contactWhatsapp ?? "").trim() : "");
    const hasWhatsapp = Boolean(storeId && wa.replace(/\D/g, "").length >= 10);
    const hasLoja = !!storeId;

    const resolveSettingsCheck = (check: boolean): OperationalItemStatus => {
      if (!storeId) return "pending";
      if (!hydrated || !loaded) return "not_verified";
      return check ? "done" : "review";
    };

    const empresaStatus: OperationalItemStatus = !storeId
      ? "pending"
      : !basicsLoaded
        ? "not_verified"
        : hasEmpresa
          ? "done"
          : "review";

    const whatsappStatus: OperationalItemStatus = !storeId
      ? "pending"
      : !basicsLoaded && !loaded
        ? "not_verified"
        : hasWhatsapp
          ? "done"
          : "review";

    let usersStatus: OperationalItemStatus = "review";
    if (!storeId) usersStatus = "pending";
    else if (usersCheck === "loading" || usersCheck === "idle" || usersCheck === "unverified") {
      usersStatus = "not_verified";
    } else if (usersCheck === "ok") {
      usersStatus = "done";
    } else if (usersCheck === "forbidden") {
      usersStatus = "forbidden";
    } else {
      usersStatus = "review";
    }

    return [
      {
        id: "empresa",
        label: "Dados da empresa preenchidos",
        hint: "Nome da unidade e pelo menos telefone, CNPJ ou e-mail confirmados no servidor.",
        status: empresaStatus,
        localTarget: "name",
        linkLabel: "Editar dados",
      },
      {
        id: "whatsapp",
        label: "WhatsApp configurado",
        hint: "Número da loja salvo em contatos (Geral). O webhook Meta no servidor é conferido em Integrações.",
        status: whatsappStatus,
        localTarget: "contactWhatsapp",
        linkLabel: "Editar contato",
      },
      {
        id: "loja",
        label: "Unidade ativa selecionada",
        hint: "Todas as configurações abaixo valem exclusivamente para a unidade ativa.",
        status: hasLoja ? "done" : "pending",
        targetSection: "lojas",
        linkLabel: "Ir para Lojas",
      },
      {
        id: "pdv",
        label: "PDV configurado",
        hint: "Fluxo principal (Clássico, Assistência ou Rápido / Grade) salvo na unidade.",
        status: resolveSettingsCheck(hasMeaningfulPdvConfig(settings?.printerConfig)),
        targetSection: "pdv",
        linkLabel: "Ir para PDV",
      },
      {
        id: "vendas",
        label: "Vendas e orçamentos configurados",
        hint: "Garantia, validade e formas de pagamento definidas para a unidade.",
        status: resolveSettingsCheck(hasVendasParamsInPrinter(settings?.printerConfig)),
        targetSection: "vendas",
        linkLabel: "Ir para Vendas",
      },
      {
        id: "impressao",
        label: "Impressão PDV (opcional)",
        hint: "Host da impressora térmica, auto-print ou rodapé — revise se utilizar cupom térmico.",
        status: resolveSettingsCheck(hasImpressaoConfig(settings?.printerConfig)),
        targetSection: "pdv",
        linkLabel: "Revisar PDV",
      },
      {
        id: "usuarios",
        label: "Usuários operacionais criados",
        hint:
          usersCheck === "forbidden"
            ? "Sem permissão para listar usuários — confirme manualmente na equipe."
            : usersCheck === "unverified"
              ? "Não foi possível consultar a lista de usuários agora. Confira na aba Usuários."
              : "Pelo menos um usuário ativo na equipe (caixa, vendedor, gerente, operador ou técnico).",
        status: usersStatus,
        targetSection: "usuarios",
        linkLabel: "Ir para Usuários",
      },
      {
        id: "financeiro",
        label: "Financeiro básico configurado",
        hint: "Meta de faturamento ou maquininha ativa cadastrada para a unidade.",
        status: resolveSettingsCheck(hasFinanceiroBasico(settings?.cardFees)),
        targetSection: "financeiro",
        linkLabel: "Ir para Financeiro",
      },
    ];
  }, [
    basicsLoaded,
    confirmedEmpresa,
    hydrated,
    loaded,
    lojaAtivaId,
    settings?.cardFees,
    settings?.contactWhatsapp,
    settings?.printerConfig,
    usersCheck,
  ]);

  const doneCount = items.filter((i) => i.status === "done").length;
  const attentionCount = items.length - doneCount;
  const percent = items.length > 0 ? Math.round((doneCount / items.length) * 100) : 0;
  const hasCoreSetup = Boolean(
    lojaAtivaId?.trim() && items.find((i) => i.id === "empresa")?.status === "done",
  );

  return {
    items,
    doneCount,
    attentionCount,
    totalCount: items.length,
    percent,
    hasCoreSetup,
  };
}

export interface GoLiveChecklistProps {
  empresa: GoLiveEmpresaSnapshot;
  /** Quando fornecido pelo Unit Identity Ribbon, reutiliza os itens já computados sem duplicar fetches. */
  precomputedItems?: OperationalChecklistItem[];
  /** Embutido dentro do Unit Identity Ribbon (sem card externo duplicado). */
  embedded?: boolean;
  /** Foco contextual em Dados da empresa sem sair da aba Geral. */
  onFocusEmpresa?: (field: "name" | "contactWhatsapp") => void;
}

export function GoLiveChecklistRafaCell({
  empresa,
  precomputedItems,
  embedded = false,
  onFocusEmpresa,
}: GoLiveChecklistProps) {
  const { navigateToSection, requestExternalNavigation } = useConfiguracoesNav();
  const [filter, setFilter] = useState<ChecklistFilter>("all");
  const fallback = useOperationalReadiness(empresa, !precomputedItems);
  const items = precomputedItems ?? fallback.items;

  const doneCount = items.filter((i) => i.status === "done").length;
  const attentionCount = items.length - doneCount;

  const filteredItems = useMemo(() => {
    if (filter === "attention") return items.filter((i) => i.status !== "done");
    if (filter === "done") return items.filter((i) => i.status === "done");
    return items;
  }, [filter, items]);

  const body = (
    <div id="checklist-prontidao">
      {/* Cabeçalho interno */}
      <div
        className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-2.5 sm:px-5"
        style={{
          borderColor: "var(--cfg-border)",
          backgroundColor: "var(--cfg-surface)",
        }}
      >
        <div className="flex items-center gap-2">
          <ClipboardList className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
          <h3 className="text-xs font-semibold" style={{ color: "var(--cfg-fg)" }}>
            Checklist de prontidão operacional
          </h3>
        </div>
        <p className="text-xs" style={{ color: "var(--cfg-muted)" }}>
          Reflete apenas dados confirmados no servidor
        </p>
      </div>

      {/* Barra de filtros acessíveis (toggle button group) */}
      <div
        className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-2 sm:px-5"
        style={{
          borderColor: "var(--cfg-border)",
          backgroundColor: "var(--cfg-inset)",
        }}
      >
        <div role="group" aria-label="Filtrar itens do checklist" className="inline-flex flex-wrap items-center gap-1">
          {(
            [
              { id: "all" as const, label: `Todos (${items.length})` },
              { id: "attention" as const, label: `Para revisar (${attentionCount})` },
              { id: "done" as const, label: `Concluídos (${doneCount})` },
            ] as const
          ).map((tab) => {
            const selected = filter === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                aria-pressed={selected}
                onClick={() => setFilter(tab.id)}
                className={cn(
                  "rounded-md border px-2.5 py-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                )}
                style={{
                  backgroundColor: selected ? "var(--cfg-surface)" : "transparent",
                  borderColor: selected ? "var(--cfg-border)" : "transparent",
                  color: selected ? "var(--cfg-fg)" : "var(--cfg-muted)",
                }}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
        <span className="text-xs" style={{ color: "var(--cfg-subtle)" }}>
          Itens em <strong style={{ color: "var(--cfg-fg-body)" }}>Revisar</strong> pedem confirmação humana
        </span>
      </div>

      {/* Lista de verificação */}
      {filteredItems.length === 0 ? (
        <div className="px-4 py-6 text-center text-xs sm:px-5" style={{ color: "var(--cfg-muted)" }}>
          {filter === "attention"
            ? "Todos os itens verificados estão concluídos para esta unidade."
            : "Nenhum item concluído ainda para esta unidade."}
        </div>
      ) : (
        <ul className="divide-y" style={{ borderColor: "var(--cfg-border)" }}>
          {filteredItems.map((item) => {
            const meta = STATUS_META[item.status];
            return (
              <li
                key={item.id}
                className="flex flex-col gap-2 px-4 py-2.5 transition-colors hover:bg-[var(--cfg-inset)] sm:flex-row sm:items-center sm:justify-between sm:px-5"
                style={{ borderColor: "var(--cfg-border)" }}
              >
                <div className="flex min-w-0 flex-1 items-start gap-2.5">
                  <span
                    aria-hidden="true"
                    className="mt-1.5 h-2 w-2 shrink-0 rounded-full"
                    style={{ backgroundColor: meta.dotColor }}
                  />
                  <div className="min-w-0">
                    <p className="text-[13px] font-medium leading-snug" style={{ color: "var(--cfg-fg)" }}>
                      {item.label}
                    </p>
                    <p className="mt-0.5 text-xs leading-snug" style={{ color: "var(--cfg-muted)" }}>
                      {item.hint}
                    </p>
                  </div>
                </div>

                <div className="flex shrink-0 flex-wrap items-center gap-2 pl-4 sm:pl-0">
                  <SettingsStatusBadge tone={meta.tone}>{meta.label}</SettingsStatusBadge>
                  {item.localTarget && onFocusEmpresa ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => onFocusEmpresa(item.localTarget!)}
                    >
                      {item.linkLabel}
                      <ArrowDown className="h-3.5 w-3.5" aria-hidden="true" />
                    </Button>
                  ) : item.targetSection ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => navigateToSection(item.targetSection!)}
                    >
                      {item.linkLabel}
                      <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                    </Button>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {/* Rodapé operacional compacto + observações técnicas retráteis */}
      <div
        className="space-y-2.5 border-t px-4 py-3 sm:px-5"
        style={{
          borderColor: "var(--cfg-border)",
          backgroundColor: "var(--cfg-inset)",
        }}
      >
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold" style={{ color: "var(--cfg-fg-body)" }}>
            Testar operação:
          </span>
          {(
            [
              { href: "/dashboard/vendas", label: "Abrir PDV" },
              { href: "/dashboard/operacoes-v2", label: "Operações HUB" },
              { href: "/dashboard", label: "Dashboard" },
              { href: "/dashboard/whatsapp", label: "WhatsApp HUB" },
            ] as const
          ).map((mod) => (
            <Button key={mod.href} variant="outline" size="sm" asChild>
              <Link
                href={mod.href}
                onClick={(event) => {
                  if (
                    event.defaultPrevented ||
                    event.button !== 0 ||
                    event.metaKey ||
                    event.ctrlKey ||
                    event.shiftKey ||
                    event.altKey
                  ) {
                    return;
                  }
                  if (requestExternalNavigation(mod.href, mod.label)) {
                    event.preventDefault();
                  }
                }}
              >
                {mod.label}
                <ExternalLink className="h-3 w-3 opacity-70" aria-hidden="true" />
              </Link>
            </Button>
          ))}
        </div>

        <SettingsCollapsible
          title="Observações técnicas (3)"
          summary="Recomendações de recarga do PDV, validação de WhatsApp e leitura do Dashboard"
          expandedSummary="Este checklist não substitui testes reais nos módulos operacionais e não envia dados além das APIs do painel."
        >
          <ul className="space-y-1.5 text-xs leading-relaxed" style={{ color: "var(--cfg-muted)" }}>
            <li>
              <strong style={{ color: "var(--cfg-fg)" }}>PDV:</strong> após mudar layout ou modo em Configurações,
              recarregue a tela de vendas para aplicar a preferência.
            </li>
            <li>
              <strong style={{ color: "var(--cfg-fg)" }}>WhatsApp HUB:</strong> abre o painel de conversas; não confirma
              webhook Meta nem envio real — isso depende das variáveis no servidor.
            </li>
            <li>
              <strong style={{ color: "var(--cfg-fg)" }}>Dashboard:</strong> valide os indicadores reais após concluir o
              cadastro operacional da unidade.
            </li>
          </ul>
        </SettingsCollapsible>
      </div>
    </div>
  );

  if (embedded) {
    return (
      <div className="border-t" style={{ borderColor: "var(--cfg-border)" }}>
        {body}
      </div>
    );
  }

  return <section className="cfg-card overflow-hidden">{body}</section>;
}
