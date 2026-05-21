"use client";

import Link from "next/link";
import { Building2, ArrowRight, CheckCircle2 } from "lucide-react";
import { useLojaAtiva } from "@/lib/loja-ativa";
import { configuracoesSectionHref } from "@/components/configuracoes-v3/features/settings/section-routing";

/**
 * Acesso operacional no Painel Inicial:
 * - se cadastro básico (nome + CNPJ) está incompleto → variante "ação recomendada"
 * - se completo → variante "gerenciar empresa" (mais discreta)
 * Só renderiza após `storesLoaded` para evitar piscar entre estados.
 */
export function EmpresaSetupCard() {
  const { storesLoaded, cadastroBasicoIncompleto, lojaAtivaRaw } = useLojaAtiva();

  if (!storesLoaded || !lojaAtivaRaw) return null;

  const href = configuracoesSectionHref("geral");
  const nome = (lojaAtivaRaw.nomeFantasia || "").trim();

  if (cadastroBasicoIncompleto) {
    return (
      <Link
        href={href}
        className="group flex items-center justify-between gap-4 rounded-lg border border-primary/40 bg-primary/5 px-4 py-3 transition-colors hover:bg-primary/10"
      >
        <div className="flex min-w-0 items-center gap-3">
          <div className="grid h-9 w-9 shrink-0 place-items-center rounded-md bg-primary/15 ring-1 ring-primary/30">
            <Building2 className="h-4 w-4 text-primary" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-foreground">Configurar empresa</p>
            <p className="truncate text-xs text-muted-foreground">
              Preencha nome fantasia e CNPJ para liberar recibos, OS e relatórios.
            </p>
          </div>
        </div>
        <span className="hidden items-center gap-1 text-xs font-medium text-primary sm:inline-flex">
          Configurar agora
          <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
        </span>
      </Link>
    );
  }

  return (
    <Link
      href={href}
      className="group flex items-center justify-between gap-4 rounded-lg border border-border bg-card px-4 py-3 transition-colors hover:border-foreground/20 hover:bg-panel"
    >
      <div className="flex min-w-0 items-center gap-3">
        <div className="grid h-9 w-9 shrink-0 place-items-center rounded-md bg-muted/60 ring-1 ring-border/40 group-hover:bg-primary/15 group-hover:text-primary">
          <CheckCircle2 className="h-4 w-4" />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-foreground">Dados da empresa</p>
          <p className="truncate text-xs text-muted-foreground">
            {nome || "Unidade ativa"} — gerenciar cadastro, endereço e contatos.
          </p>
        </div>
      </div>
      <span className="hidden items-center gap-1 text-xs font-medium text-muted-foreground sm:inline-flex group-hover:text-foreground">
        Gerenciar
        <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
      </span>
    </Link>
  );
}
