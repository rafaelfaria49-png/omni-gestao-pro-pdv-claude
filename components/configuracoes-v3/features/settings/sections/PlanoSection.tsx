"use client";

import Link from "next/link";
import { CreditCard, ArrowRight, Check, Info } from "lucide-react";
import { SectionHeader } from "../components/SectionHeader";
import { SettingsCard } from "../components/SettingsCard";
import { Button } from "@/components/configuracoes-v3/components/ui/button";
import { Badge } from "@/components/configuracoes-v3/components/ui/badge";
import { ConfigEmpresaProvider } from "@/lib/config-empresa";
import { LojaAtivaProvider, useLojaAtiva } from "@/lib/loja-ativa";

const BILLING_PATH = "/dashboard/billing";

function planLabel(plan: string | undefined): string {
  if (!plan) return "";
  const p = plan.toLowerCase();
  if (p === "bronze") return "Bronze";
  if (p === "prata") return "Prata";
  if (p === "ouro") return "Ouro";
  if (p === "diamante") return "Diamante";
  return plan;
}

function PlanoSectionContent() {
  const { lojaAtivaRaw, storesLoaded } = useLojaAtiva();
  const planoUnidade = planLabel(lojaAtivaRaw?.subscriptionPlan);

  return (
    <div className="space-y-6">
      <SectionHeader
        icon={<CreditCard className="h-5 w-5" />}
        title="Plano e Assinatura"
        description="Gerencie sua assinatura, créditos de IA e cobrança. O fluxo completo (planos, checkout e portal de cobrança Stripe) fica na página dedicada."
        actions={
          <Button asChild>
            <Link href={BILLING_PATH}>
              Gerenciar assinatura
              <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>
        }
      />

      <SettingsCard
        title="Sua assinatura"
        description="Página oficial de cobrança: planos, trial de 14 dias, troca de plano e portal Stripe."
      >
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary ring-1 ring-primary/20">
              <CreditCard className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <p className="text-base font-semibold leading-snug text-foreground">
                {storesLoaded && planoUnidade
                  ? `Plano ${planoUnidade}`
                  : "Plano e cobrança"}
              </p>
              <p className="mt-0.5 text-sm text-muted-foreground">
                {storesLoaded && planoUnidade
                  ? "Plano registrado para a unidade ativa. Detalhes de status, vencimento e créditos abrem na página de assinatura."
                  : "Abra a página dedicada para ver o plano atual, créditos de IA, vencimento e o portal de cobrança."}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {storesLoaded && planoUnidade ? (
              <Badge variant="secondary">{planoUnidade}</Badge>
            ) : null}
            <Button variant="outline" size="sm" asChild>
              <Link href={BILLING_PATH}>Abrir página de assinatura</Link>
            </Button>
          </div>
        </div>
      </SettingsCard>

      <SettingsCard
        title="O que você encontra na página de assinatura"
        description="Pagamento real via Stripe. Esta seção é apenas um atalho — a edição acontece lá."
      >
        <ul className="space-y-2 text-sm text-muted-foreground">
          <li className="flex items-start gap-2">
            <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
            Plano atual (Bronze, Prata, Ouro, Diamante) com status e renovação.
          </li>
          <li className="flex items-start gap-2">
            <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
            Saldo de créditos de IA usados no ciclo e total contratado.
          </li>
          <li className="flex items-start gap-2">
            <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
            Trocar de plano (mensal ou anual) com 14 dias grátis.
          </li>
          <li className="flex items-start gap-2">
            <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
            Portal Stripe para faturas, métodos de pagamento e cancelamento.
          </li>
        </ul>

        <div className="mt-5 flex flex-col gap-3 rounded-lg border border-border bg-muted/30 p-4 text-sm sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-2 text-muted-foreground">
            <Info className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              Esta seção não altera dados de cobrança nem lança valores. Toda mudança real acontece no portal de
              assinatura.
            </span>
          </div>
          <Button asChild>
            <Link href={BILLING_PATH}>
              Ir para Plano e Assinatura
              <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>
        </div>
      </SettingsCard>
    </div>
  );
}

export function PlanoSection() {
  return (
    <ConfigEmpresaProvider>
      <LojaAtivaProvider>
        <PlanoSectionContent />
      </LojaAtivaProvider>
    </ConfigEmpresaProvider>
  );
}
