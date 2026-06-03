"use client";

import { useMemo, useState } from "react";
import { CreditCard } from "lucide-react";
import { cn } from "@/lib/utils";
import { SectionShellV3 } from "../components/SectionShellV3";
import { ConstructionBadgeV3 } from "../components/ConstructionBadgeV3";
import { NoStoreBlockV3 } from "../components/ScreenStateV3";
import { ButtonV3 } from "../components/UiV3";
import { useOperacoesV3 } from "../context/OperacoesV3Context";
import { SCREEN_COPY } from "../data/screen-copy";
import { formatBRL } from "../lib/format";
import { orcamentoTotal } from "../lib/os-derive";

const FORMAS = ["PIX", "Dinheiro", "Débito", "Crédito", "Carteira / crédito cliente"];

const inputCls =
  "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground tabular-nums focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40";

function toNum(v: string): number {
  const n = Number(v.replace(/[^\d,.-]/g, "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

export function PdvServicoV3() {
  const { ordens, storeId, acaoEmConstrucao } = useOperacoesV3();
  const cobravel = useMemo(
    () => ordens.filter((o) => o.status !== "cancelada" && orcamentoTotal(o) > 0),
    [ordens],
  );
  const [osId, setOsId] = useState<string>("");
  const [desconto, setDesconto] = useState("");
  const [acrescimo, setAcrescimo] = useState("");
  const [entrada, setEntrada] = useState("");
  const [forma, setForma] = useState<string>("PIX");

  const os = cobravel.find((o) => o.id === osId) ?? null;
  const total = os ? orcamentoTotal(os) : 0;
  const saldo = Math.max(0, total - toNum(desconto) + toNum(acrescimo) - toNum(entrada));

  if (!storeId) {
    return (
      <SectionShellV3 titulo={SCREEN_COPY["pdv-servico"].titulo} subtitulo={SCREEN_COPY["pdv-servico"].subtitulo}>
        <NoStoreBlockV3 />
      </SectionShellV3>
    );
  }

  return (
    <SectionShellV3
      titulo={SCREEN_COPY["pdv-servico"].titulo}
      subtitulo={SCREEN_COPY["pdv-servico"].subtitulo}
      badge={<ConstructionBadgeV3 />}
    >
      <div className="space-y-4">
        <p className="rounded-lg border border-dashed border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
          Simulador de fechamento de balcão: o total da OS é <strong>real</strong>, mas os cálculos abaixo são
          uma <strong>simulação visual</strong> — nenhum recebimento é registrado no Financeiro nesta fase.
        </p>

        <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
          <div className="space-y-4">
            <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-muted-foreground">Ordem de serviço</span>
                <select className={inputCls} value={osId} onChange={(e) => setOsId(e.target.value)}>
                  <option value="">Selecione uma OS com valor…</option>
                  {cobravel.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.codigo} · {o.cliente?.nome ?? "Cliente"} · {formatBRL(orcamentoTotal(o))}
                    </option>
                  ))}
                </select>
              </label>
              {cobravel.length === 0 ? (
                <p className="mt-2 text-xs text-muted-foreground">Nenhuma OS com valor de orçamento nesta unidade.</p>
              ) : null}
            </div>

            <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
              <h3 className="mb-3 text-sm font-semibold text-foreground">Ajustes (simulação)</h3>
              <div className="grid gap-3 sm:grid-cols-3">
                <label className="block">
                  <span className="mb-1 block text-xs font-medium text-muted-foreground">Desconto (R$)</span>
                  <input className={inputCls} value={desconto} onChange={(e) => setDesconto(e.target.value)} placeholder="0,00" />
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs font-medium text-muted-foreground">Acréscimo (R$)</span>
                  <input className={inputCls} value={acrescimo} onChange={(e) => setAcrescimo(e.target.value)} placeholder="0,00" />
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs font-medium text-muted-foreground">Entrada / sinal (R$)</span>
                  <input className={inputCls} value={entrada} onChange={(e) => setEntrada(e.target.value)} placeholder="0,00" />
                </label>
              </div>

              <h3 className="mb-2 mt-4 text-sm font-semibold text-foreground">Forma de pagamento</h3>
              <div className="flex flex-wrap gap-2">
                {FORMAS.map((f) => (
                  <button
                    key={f}
                    type="button"
                    onClick={() => setForma(f)}
                    className={cn(
                      "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                      forma === f
                        ? "border-primary/30 bg-primary/10 text-primary"
                        : "border-border bg-background text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {f}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <aside className="space-y-3">
            <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
              <h3 className="text-sm font-semibold text-foreground">Resumo</h3>
              <dl className="mt-3 space-y-2 text-sm">
                <div className="flex items-center justify-between">
                  <dt className="text-muted-foreground">Total da OS</dt>
                  <dd className="font-medium tabular-nums text-foreground">{formatBRL(total)}</dd>
                </div>
                <div className="flex items-center justify-between">
                  <dt className="text-muted-foreground">Desconto</dt>
                  <dd className="tabular-nums text-foreground">- {formatBRL(toNum(desconto))}</dd>
                </div>
                <div className="flex items-center justify-between">
                  <dt className="text-muted-foreground">Acréscimo</dt>
                  <dd className="tabular-nums text-foreground">+ {formatBRL(toNum(acrescimo))}</dd>
                </div>
                <div className="flex items-center justify-between">
                  <dt className="text-muted-foreground">Entrada / sinal</dt>
                  <dd className="tabular-nums text-foreground">- {formatBRL(toNum(entrada))}</dd>
                </div>
                <div className="flex items-center justify-between border-t border-border pt-2">
                  <dt className="font-semibold text-foreground">Saldo a receber</dt>
                  <dd className="text-lg font-semibold tabular-nums text-primary">{formatBRL(saldo)}</dd>
                </div>
              </dl>
              <ButtonV3
                variant="primary"
                className="mt-4 w-full"
                disabled={!os}
                onClick={() => acaoEmConstrucao("Registrar recebimento")}
              >
                <CreditCard className="h-4 w-4" />
                Registrar recebimento
              </ButtonV3>
              <p className="mt-2 text-center text-[11px] text-muted-foreground">
                Não grava no Financeiro nesta fase.
              </p>
            </div>
          </aside>
        </div>
      </div>
    </SectionShellV3>
  );
}
