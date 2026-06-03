"use client";

// ============================================================================
// Operações V3 — Serviços executados (item 7) · SOMENTE LEITURA.
// Reflete os itens do orçamento (serviço/peça/brinde/interno). Mostra qtd e
// VALOR AO CLIENTE. NUNCA mostra custo interno. Derivado do que já existe.
// ============================================================================

import { Gift, Lock, Package, Wrench } from "lucide-react";
import { cn } from "@/lib/utils";
import type { OrdemServico } from "@/types/os";
import {
  linhaKind,
  orcamentoRealV3,
  pecaValorCliente,
  servicoValorCliente,
  type OrcamentoLinhaKindV3,
  type PecaV3,
  type ServicoV3,
} from "@/lib/operacoes-v3/orcamento-model";
import { formatBRL } from "../lib/format";

const KIND_BADGE: Record<Exclude<OrcamentoLinhaKindV3, "cobrado">, { label: string; cls: string; icon: typeof Gift }> = {
  brinde: { label: "Brinde", cls: "border-success/30 bg-success/10 text-success", icon: Gift },
  interno: { label: "Interno", cls: "border-info/30 bg-info/10 text-info", icon: Lock },
};

function Badge({ kind }: { kind: OrcamentoLinhaKindV3 }) {
  if (kind === "cobrado") return null;
  const m = KIND_BADGE[kind];
  const Icon = m.icon;
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] font-medium", m.cls)}>
      <Icon className="h-2.5 w-2.5" aria-hidden /> {m.label}
    </span>
  );
}

function Linha({ nome, detalhe, kind, valor }: { nome: string; detalhe?: string; kind: OrcamentoLinhaKindV3; valor: number }) {
  return (
    <div className="flex items-center justify-between gap-2 border-b border-border/60 py-1.5 last:border-0">
      <div className="flex min-w-0 items-center gap-2">
        <span className="truncate text-sm text-foreground">{nome}</span>
        {detalhe ? <span className="shrink-0 text-xs text-muted-foreground">{detalhe}</span> : null}
        <Badge kind={kind} />
      </div>
      <span className="shrink-0 text-sm font-medium tabular-nums text-foreground">
        {kind === "cobrado" ? formatBRL(valor) : "—"}
      </span>
    </div>
  );
}

export function ServicosExecutadosV3({ os }: { os: OrdemServico }) {
  const orc = orcamentoRealV3(os);
  const servicos: ServicoV3[] = orc?.servicos ?? [];
  const pecas: PecaV3[] = orc?.pecas ?? (os.pecas as PecaV3[] | undefined) ?? [];
  const vazio = servicos.length === 0 && pecas.length === 0;

  const totalCliente =
    servicos.reduce((acc, s) => acc + servicoValorCliente(s), 0) + pecas.reduce((acc, p) => acc + pecaValorCliente(p), 0);

  return (
    <section id="servicos" className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
      <div className="flex items-center gap-2 border-b border-border px-4 py-3">
        <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Wrench className="h-4 w-4" aria-hidden />
        </span>
        <h3 className="truncate text-sm font-semibold text-foreground">Serviços & peças executados</h3>
      </div>

      <div className="space-y-4 px-4 py-4">
        {vazio ? (
          <p className="text-sm text-muted-foreground">Nenhum serviço ou peça lançado. Os itens aparecem aqui a partir do orçamento.</p>
        ) : (
          <>
            {servicos.length > 0 ? (
              <div>
                <p className="mb-1 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                  <Wrench className="h-3.5 w-3.5" aria-hidden /> Serviços
                </p>
                {servicos.map((s) => (
                  <Linha key={s.id} nome={s.descricao || "Serviço"} kind={linhaKind(s)} valor={servicoValorCliente(s)} />
                ))}
              </div>
            ) : null}
            {pecas.length > 0 ? (
              <div>
                <p className="mb-1 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                  <Package className="h-3.5 w-3.5" aria-hidden /> Peças
                </p>
                {pecas.map((p) => (
                  <Linha key={p.id} nome={p.nome || "Peça"} detalhe={`${p.quantidade}×`} kind={linhaKind(p)} valor={pecaValorCliente(p)} />
                ))}
              </div>
            ) : null}
            <div className="flex items-center justify-between border-t border-border pt-2">
              <span className="text-sm font-medium text-foreground">Total ao cliente</span>
              <span className="text-base font-semibold tabular-nums text-foreground">{formatBRL(totalCliente)}</span>
            </div>
          </>
        )}
        <p className="text-[11px] text-muted-foreground">Custo interno é oculto nesta visão (aparece só no painel de orçamento).</p>
      </div>
    </section>
  );
}
