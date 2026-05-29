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
        className="group flex items-center justify-between gap-3 rounded-lg border border-primary/30 bg-primary/5 px-3.5 py-2 transition-colors hover:bg-primary/10"
      >
        <div className="flex min-w-0 items-center gap-2">
          <Building2 className="h-4 w-4 text-primary shrink-0" />
          <p className="truncate text-[12.5px] text-muted-foreground">
            <span className="font-semibold text-foreground">Configurar empresa:</span> Preencha nome fantasia e CNPJ para liberar recursos do sistema.
          </p>
        </div>
        <span className="flex items-center gap-0.5 text-[11.5px] font-semibold text-primary shrink-0">
          Configurar agora
          <ArrowRight className="h-3 w-3 transition-transform group-hover:translate-x-0.5" />
        </span>
      </Link>
    );
  }

  return null;
}
