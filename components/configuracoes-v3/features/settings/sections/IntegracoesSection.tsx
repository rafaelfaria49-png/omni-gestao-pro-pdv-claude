"use client";

import Link from "next/link";
import { SectionHeader } from "../components/SectionHeader";
import { Plug, MessageCircle, Brain, Network, ShoppingBag, CreditCard, Mail, type LucideIcon } from "lucide-react";
import { Button } from "@/components/configuracoes-v3/components/ui/button";
import { Badge } from "@/components/configuracoes-v3/components/ui/badge";
import { useLojaAtiva } from "@/lib/loja-ativa";
import { useStoreSettings } from "@/lib/store-settings-provider";
import { cn } from "@/components/configuracoes-v3/lib/utils";
import { useConfiguracoesNav } from "@/components/configuracoes-v3/contexts/ConfiguracoesNavContext";
import type { SectionId } from "../sections";

type UiStatus = "ok" | "neutral" | "warn" | "hub";

type CardAction = {
  label: string;
  /** Navegação interna V3 (`?sec=`). */
  section?: SectionId;
  /** Rotas externas ao shell V3 (HUB, créditos, etc.). */
  href?: string;
  disabled?: boolean;
  variant?: "default" | "outline";
};

type IntegrationCard = {
  id: string;
  nome: string;
  descricao: string;
  icon: LucideIcon;
  uiStatus: UiStatus;
  statusLabel: string;
  actions: CardAction[];
};

function truncate(s: string, max: number): string {
  const t = s.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}

function IntegracoesSectionContent() {
  const { navigateToSection } = useConfiguracoesNav();
  const { lojaAtivaId } = useLojaAtiva();
  const { hydrated, settings, blob } = useStoreSettings();

  const noLoja = !lojaAtivaId?.trim();
  const wa = (settings?.contactWhatsapp ?? "").trim();
  const em = (settings?.contactEmail ?? "").trim();
  const aiModel = (blob.aiMestreModel ?? "").trim();

  const cards: IntegrationCard[] = [
    {
      id: "whatsapp",
      nome: "WhatsApp",
      descricao:
        "Número da loja para orçamentos e mensagens. Atendimento real: HUB operacional (/dashboard/whatsapp). Ferramentas admin legadas em /dashboard/whatsapp-automation (sem envio Meta).",
      icon: MessageCircle,
      uiStatus: wa ? "ok" : noLoja || !hydrated ? "neutral" : "warn",
      statusLabel:
        noLoja || !hydrated
          ? "Selecione uma unidade"
          : wa
            ? "Número cadastrado"
            : "Não configurado",
      actions: [
        { label: "Configurar em Geral", section: "geral", variant: "default" },
        { label: "HUB operacional", href: "/dashboard/whatsapp", variant: "default" },
        { label: "Ferramentas admin (legado)", href: "/dashboard/whatsapp-automation", variant: "outline" },
      ],
    },
    {
      id: "email",
      nome: "E-mail comercial",
      descricao: "Contato da unidade usado em recibos e cadastro (StoreSettings).",
      icon: Mail,
      uiStatus: em ? "ok" : noLoja || !hydrated ? "neutral" : "warn",
      statusLabel:
        noLoja || !hydrated
          ? "Selecione uma unidade"
          : em
            ? "E-mail cadastrado"
            : "Não configurado",
      actions: [{ label: "Configurar em Geral", section: "geral", variant: "default" }],
    },
    {
      id: "ia",
      nome: "IA (modelos)",
      descricao:
        "IA Mestre usa créditos reais (API). Modelo da unidade: printerConfig.aiMestreModel (salvo na tela do IA Mestre).",
      icon: Brain,
      uiStatus: aiModel ? "ok" : "neutral",
      statusLabel: aiModel ? truncate(`Modelo: ${aiModel}`, 42) : "Padrão / não definido na unidade",
      actions: [
        { label: "Abrir IA Mestre", href: "/dashboard/ia-mestre", variant: "default" },
        { label: "Comprar créditos", href: "/dashboard/creditos", variant: "outline" },
      ],
    },
    {
      id: "marketing-ia",
      nome: "Marketing IA",
      descricao:
        "Hub de protótipo: posts e contas ficam no localStorage do navegador. Não há persistência multi-loja nem API de publicação.",
      icon: Brain,
      uiStatus: "hub",
      statusLabel: "Protótipo · sem backend de campanhas",
      actions: [{ label: "Abrir hub (protótipo)", href: "/dashboard/marketing-ia", variant: "outline" }],
    },
    {
      id: "openrouter",
      nome: "APIs de IA (roteamento)",
      descricao:
        "Chaves e roteamento ficam no servidor (env). O app não expõe token ao navegador; use IA Mestre para uso pelos operadores.",
      icon: Network,
      uiStatus: "neutral",
      statusLabel: "Ver detalhes no servidor / IA Mestre",
      actions: [{ label: "Abrir IA Mestre", href: "/dashboard/ia-mestre", variant: "outline" }],
    },
    {
      id: "marketplace",
      nome: "Marketplace",
      descricao: "Hub de telas no dashboard; sincronização com canais ainda não há API dedicada neste projeto.",
      icon: ShoppingBag,
      uiStatus: "hub",
      statusLabel: "Interface · sem sync backend",
      actions: [{ label: "Abrir hub", href: "/dashboard/marketplace", variant: "default" }],
    },
    {
      id: "pagamentos",
      nome: "Pagamentos e taxas",
      descricao: "Taxas de maquininha e cardFees por unidade na aba Financeiro desta V3. Créditos de IA em página dedicada.",
      icon: CreditCard,
      uiStatus: "neutral",
      statusLabel: "Configure na aba Financeiro (V3)",
      actions: [
        { label: "Abrir Financeiro", section: "financeiro", variant: "default" },
        { label: "Créditos IA", href: "/dashboard/creditos", variant: "outline" },
      ],
    },
  ];

  return (
    <div className="space-y-6">
      <SectionHeader
        icon={<Plug className="h-5 w-5" />}
        title="Integrações"
        description="Status com dados da unidade ativa (settings) e atalhos para telas reais do sistema."
      />

      {noLoja ? (
        <p className="text-sm text-muted-foreground">
          Nenhuma unidade ativa. Em <span className="font-medium text-foreground">Lojas</span>, selecione uma unidade para
          refletir contatos e modelo de IA da loja.
        </p>
      ) : null}

      <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
        {cards.map((i) => {
          const Icon = i.icon;
          return (
            <div
              key={i.id}
              className="flex flex-col gap-6 rounded-xl border border-border bg-card p-6 shadow-soft transition-all hover:shadow-card"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-accent text-accent-foreground">
                  <Icon className="h-5 w-5" />
                </div>
                <StatusBadge uiStatus={i.uiStatus} />
              </div>
              <div>
                <h3 className="text-lg font-semibold leading-snug text-foreground">{i.nome}</h3>
                <p className="mt-1 text-sm font-normal leading-relaxed text-muted-foreground">{i.descricao}</p>
                <p className="mt-2 text-xs font-medium text-foreground">{i.statusLabel}</p>
              </div>
              <div className="mt-auto flex flex-col gap-2">
                {i.actions.map((a, idx) => {
                  if (a.disabled) {
                    return (
                      <Button key={idx} variant={a.variant ?? "outline"} className="w-full" type="button" disabled>
                        {a.label}
                      </Button>
                    );
                  }
                  if (a.section) {
                    return (
                      <Button
                        key={idx}
                        variant={a.variant ?? "default"}
                        className="w-full"
                        type="button"
                        onClick={() => navigateToSection(a.section!)}
                      >
                        {a.label}
                      </Button>
                    );
                  }
                  if (a.href) {
                    return (
                      <Button key={idx} variant={a.variant ?? "default"} className="w-full" asChild>
                        <Link href={a.href}>{a.label}</Link>
                      </Button>
                    );
                  }
                  return (
                    <Button key={idx} variant={a.variant ?? "outline"} className="w-full" type="button" disabled>
                      {a.label}
                    </Button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function StatusBadge({ uiStatus }: { uiStatus: UiStatus }) {
  if (uiStatus === "ok") {
    return (
      <Badge className="bg-success text-success-foreground hover:bg-success gap-1.5">
        <span className="h-1.5 w-1.5 rounded-full bg-success-foreground" />
        OK
      </Badge>
    );
  }
  if (uiStatus === "warn") {
    return (
      <Badge variant="secondary" className="gap-1.5 border border-warning/40 bg-warning/10 text-foreground">
        <span className="h-1.5 w-1.5 rounded-full bg-warning" />
        Configurar
      </Badge>
    );
  }
  if (uiStatus === "hub") {
    return (
      <Badge variant="secondary" className={cn("gap-1.5")}>
        <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground" />
        Hub
      </Badge>
    );
  }
  return (
    <Badge variant="secondary" className="gap-1.5">
      <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground" />
      Info
    </Badge>
  );
}

export function IntegracoesSection() {
  return <IntegracoesSectionContent />;
}
