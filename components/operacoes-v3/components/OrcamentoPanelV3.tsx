"use client";

import { useEffect, useMemo, useState } from "react";
import {
  CheckCircle2,
  Gift,
  History,
  Loader2,
  Lock,
  Package,
  Pencil,
  PlayCircle,
  Plus,
  Send,
  Sparkles,
  Trash2,
  Wrench,
  XCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { OrdemServico } from "@/types/os";
import {
  computeTotaisV3,
  KIND_META_V3,
  lerVersoesV3,
  linhaKind,
  ORCAMENTO_STATUS_META_V3,
  orcamentoRealV3,
  statusEfetivoOrcamentoV3,
  type OrcamentoLinhaKindV3,
  type PecaV3,
  type ServicoV3,
} from "@/lib/operacoes-v3/orcamento-model";
import { statusV3FromOS } from "@/lib/operacoes-v3/status-machine";
import { useOrcamentoV3 } from "../hooks/use-orcamento-v3";
import { formatBRL, formatDataHora } from "../lib/format";
import { ButtonV3 } from "./UiV3";

const inputCls =
  "w-full rounded-md border border-border bg-background px-2 py-1 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30";

const KIND_TONE: Record<OrcamentoLinhaKindV3, string> = {
  cobrado: "border-border bg-muted text-muted-foreground",
  brinde: "border-success/30 bg-success/10 text-success",
  interno: "border-info/30 bg-info/10 text-info",
};

function uid(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `id_${Date.now()}_${Math.random()}`;
}
function num(v: string): number {
  const n = Number(v.replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

function KindBadge({ kind }: { kind: OrcamentoLinhaKindV3 }) {
  if (kind === "cobrado") return null;
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] font-medium", KIND_TONE[kind])}>
      {kind === "brinde" ? <Gift className="h-2.5 w-2.5" aria-hidden /> : <Lock className="h-2.5 w-2.5" aria-hidden />}
      {KIND_META_V3[kind].label}
    </span>
  );
}

function KindSelect({ value, onChange }: { value: OrcamentoLinhaKindV3; onChange: (k: OrcamentoLinhaKindV3) => void }) {
  return (
    <select className={inputCls} value={value} onChange={(e) => onChange(e.target.value as OrcamentoLinhaKindV3)}>
      <option value="cobrado">Cobrado</option>
      <option value="brinde">Brinde</option>
      <option value="interno">Interno</option>
    </select>
  );
}

export function OrcamentoPanelV3({
  os,
  storeId,
  onChanged,
  onIniciarServico,
  notificar,
}: {
  os: OrdemServico;
  storeId: string | null;
  onChanged: () => void;
  onIniciarServico: () => void;
  notificar: (msg: string) => void;
}) {
  const orc = orcamentoRealV3(os);
  const sintetizado = !!os.orcamento && (os.orcamento as { sintetizado?: boolean }).sintetizado === true;
  const actions = useOrcamentoV3(storeId, os.id, () => onChanged());
  const versoes = useMemo(() => lerVersoesV3(os), [os]);

  const statusEf = orc ? statusEfetivoOrcamentoV3(orc) : null;
  const editavel = !!orc && (orc.status === "rascunho" || orc.status === "enviado");
  const aprovado = orc?.status === "aprovado";
  const osStatusV3 = statusV3FromOS(os);

  // --- estado de edição (inicializa do orçamento; reseta quando ele muda) ---
  const [servicos, setServicos] = useState<ServicoV3[]>(orc?.servicos ?? []);
  const [pecas, setPecas] = useState<PecaV3[]>(orc?.pecas ?? []);
  const [desconto, setDesconto] = useState<number>(orc?.desconto ?? 0);
  const [dirty, setDirty] = useState(false);
  const [verVersoes, setVerVersoes] = useState(false);
  const [recusando, setRecusando] = useState(false);
  const [motivo, setMotivo] = useState("");

  const editKey = orc ? `${orc.id}:${orc.status}:${orc.atualizadoEm ?? ""}` : "none";
  useEffect(() => {
    setServicos(orc?.servicos ?? []);
    setPecas(orc?.pecas ?? []);
    setDesconto(orc?.desconto ?? 0);
    setDirty(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editKey]);

  const totais = computeTotaisV3({ servicos, pecas, desconto });
  const busy = actions.pending !== null;

  const mutS = (id: string, patch: Partial<ServicoV3>) => {
    setServicos((rows) => rows.map((r) => (r.id === id ? { ...r, ...patch } : r)));
    setDirty(true);
  };
  const mutP = (id: string, patch: Partial<PecaV3>) => {
    setPecas((rows) => rows.map((r) => (r.id === id ? { ...r, ...patch } : r)));
    setDirty(true);
  };
  const addServico = () => {
    setServicos((r) => [...r, { id: uid(), descricao: "", valor: 0, desconto: 0, custoV3: 0, kindV3: "cobrado" }]);
    setDirty(true);
  };
  const addPeca = () => {
    setPecas((r) => [...r, { id: uid(), nome: "", quantidade: 1, valorUnitario: 0, custoUnitario: 0, desconto: 0, kindV3: "cobrado" }]);
    setDirty(true);
  };

  const salvar = async () => {
    const ok = await actions.salvar({ servicos, pecas, desconto, observacao: orc?.observacao });
    if (ok) notificar("Orçamento salvo.");
    else if (actions.error) notificar(actions.error);
  };
  const enviar = async () => {
    const ok = await actions.enviar();
    notificar(ok ? "Orçamento enviado." : actions.error ?? "Falha ao enviar.");
  };
  const aprovar = async () => {
    const ok = await actions.aprovar();
    notificar(ok ? "Orçamento aprovado." : actions.error ?? "Falha ao aprovar.");
  };
  const confirmarRecusa = async () => {
    const ok = await actions.recusar(motivo);
    if (ok) {
      setRecusando(false);
      setMotivo("");
      notificar("Orçamento recusado.");
    } else notificar(actions.error ?? "Falha ao recusar.");
  };

  // ---------------------------------------------------------------- header
  const header = (
    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
      <div className="flex min-w-0 items-center gap-2">
        <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Wrench className="h-4 w-4" aria-hidden />
        </span>
        <h3 className="truncate text-sm font-semibold text-foreground">Orçamento</h3>
        {statusEf ? (
          <span
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium",
              statusEf === "aprovado"
                ? "border-success/30 bg-success/10 text-success"
                : statusEf === "recusado"
                  ? "border-destructive/30 bg-destructive/10 text-destructive"
                  : statusEf === "enviado"
                    ? "border-info/30 bg-info/10 text-info"
                    : statusEf === "expirado"
                      ? "border-warning/30 bg-warning/10 text-warning"
                      : "border-border bg-muted text-muted-foreground",
            )}
          >
            <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden />
            {ORCAMENTO_STATUS_META_V3[statusEf].label}
          </span>
        ) : null}
      </div>
      {versoes.length > 0 ? (
        <ButtonV3 variant="ghost" onClick={() => setVerVersoes((v) => !v)}>
          <History className="h-4 w-4" />
          {versoes.length} versão(ões)
        </ButtonV3>
      ) : null}
    </div>
  );

  // -------------------------------------------------------- empty / preview
  if (!orc) {
    return (
      <section className="overflow-hidden rounded-xl border border-primary/20 bg-card shadow-sm ring-1 ring-primary/5">
        {header}
        <div className="space-y-3 px-4 py-4">
          {sintetizado ? (
            <p className="rounded-lg border border-dashed border-warning/40 bg-warning/10 px-3 py-1.5 text-xs text-warning">
              Há uma prévia derivada dos itens da OS — ainda não materializada. Gere o orçamento para editar, enviar e aprovar.
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">
              Esta OS ainda não tem orçamento. Gere um rascunho editável a partir dos itens já lançados.
            </p>
          )}
          <ButtonV3 variant="primary" disabled={busy} onClick={() => actions.gerar()}>
            {actions.pending === "gerar" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            Gerar orçamento da OS
          </ButtonV3>
          {actions.error ? <p className="text-xs text-destructive">{actions.error}</p> : null}
        </div>
      </section>
    );
  }

  // --------------------------------------------------------------- linhas
  const linhaServico = (s: ServicoV3) => {
    const kind = linhaKind(s);
    if (!editavel) {
      return (
        <div key={s.id} className="flex items-center justify-between gap-2 border-b border-border/60 py-1.5 last:border-0">
          <div className="flex min-w-0 items-center gap-2">
            <span className="truncate text-sm text-foreground">{s.descricao || "Serviço"}</span>
            <KindBadge kind={kind} />
          </div>
          <span className="shrink-0 text-sm font-medium tabular-nums text-foreground">
            {kind === "cobrado" ? formatBRL(Math.max(0, (s.valor || 0) - (s.desconto ?? 0))) : "—"}
          </span>
        </div>
      );
    }
    return (
      <div key={s.id} className="grid grid-cols-12 items-center gap-1.5 py-1">
        <input className={cn(inputCls, "col-span-12 sm:col-span-5")} value={s.descricao} placeholder="Descrição do serviço" onChange={(e) => mutS(s.id, { descricao: e.target.value })} />
        <div className="col-span-4 sm:col-span-2"><KindSelect value={kind} onChange={(k) => mutS(s.id, { kindV3: k })} /></div>
        <input className={cn(inputCls, "col-span-4 sm:col-span-2 text-right tabular-nums disabled:opacity-50")} type="number" min={0} step="0.01" disabled={kind !== "cobrado"} value={kind === "cobrado" ? s.valor : 0} placeholder="Valor" onChange={(e) => mutS(s.id, { valor: num(e.target.value) })} />
        <input className={cn(inputCls, "col-span-3 sm:col-span-2 text-right tabular-nums")} type="number" min={0} step="0.01" value={s.custoV3 ?? 0} placeholder="Custo" onChange={(e) => mutS(s.id, { custoV3: num(e.target.value) })} />
        <button type="button" className="col-span-1 inline-flex justify-center text-muted-foreground hover:text-destructive" onClick={() => { setServicos((r) => r.filter((x) => x.id !== s.id)); setDirty(true); }} aria-label="Remover serviço">
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
    );
  };

  const linhaPeca = (p: PecaV3) => {
    const kind = linhaKind(p);
    if (!editavel) {
      return (
        <div key={p.id} className="flex items-center justify-between gap-2 border-b border-border/60 py-1.5 last:border-0">
          <div className="flex min-w-0 items-center gap-2">
            <span className="truncate text-sm text-foreground">{p.nome || "Peça"}</span>
            <span className="shrink-0 text-xs text-muted-foreground">{p.quantidade}×</span>
            <KindBadge kind={kind} />
          </div>
          <span className="shrink-0 text-sm font-medium tabular-nums text-foreground">
            {kind === "cobrado" ? formatBRL(Math.max(0, p.quantidade * p.valorUnitario - (p.desconto ?? 0))) : "—"}
          </span>
        </div>
      );
    }
    return (
      <div key={p.id} className="grid grid-cols-12 items-center gap-1.5 py-1">
        <input className={cn(inputCls, "col-span-12 sm:col-span-4")} value={p.nome} placeholder="Peça" onChange={(e) => mutP(p.id, { nome: e.target.value })} />
        <input className={cn(inputCls, "col-span-3 sm:col-span-1 text-right tabular-nums")} type="number" min={0} step="1" value={p.quantidade} placeholder="Qtd" onChange={(e) => mutP(p.id, { quantidade: Math.max(0, Math.floor(num(e.target.value))) })} />
        <div className="col-span-4 sm:col-span-2"><KindSelect value={kind} onChange={(k) => mutP(p.id, { kindV3: k })} /></div>
        <input className={cn(inputCls, "col-span-4 sm:col-span-2 text-right tabular-nums disabled:opacity-50")} type="number" min={0} step="0.01" disabled={kind !== "cobrado"} value={kind === "cobrado" ? p.valorUnitario : 0} placeholder="Unit." onChange={(e) => mutP(p.id, { valorUnitario: num(e.target.value) })} />
        <input className={cn(inputCls, "col-span-3 sm:col-span-2 text-right tabular-nums")} type="number" min={0} step="0.01" value={p.custoUnitario ?? 0} placeholder="Custo" onChange={(e) => mutP(p.id, { custoUnitario: num(e.target.value) })} />
        <button type="button" className="col-span-1 inline-flex justify-center text-muted-foreground hover:text-destructive" onClick={() => { setPecas((r) => r.filter((x) => x.id !== p.id)); setDirty(true); }} aria-label="Remover peça">
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
    );
  };

  return (
    <section className="overflow-hidden rounded-xl border border-primary/20 bg-card shadow-sm ring-1 ring-primary/5">
      {header}

      {aprovado ? (
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-success/20 bg-success/5 px-4 py-3">
          <span className="inline-flex items-center gap-2 text-sm font-semibold text-success">
            <CheckCircle2 className="h-5 w-5" aria-hidden />
            ORÇAMENTO APROVADO
          </span>
          {osStatusV3 === "aprovado" ? (
            <ButtonV3 variant="primary" onClick={onIniciarServico}>
              <PlayCircle className="h-4 w-4" />
              Iniciar serviço
            </ButtonV3>
          ) : (
            <span className="text-xs text-muted-foreground">Serviço já iniciado.</span>
          )}
        </div>
      ) : null}

      <div className="space-y-4 px-4 py-4">
        {/* Serviços */}
        <div>
          <div className="mb-1 flex items-center justify-between">
            <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              <Wrench className="h-3.5 w-3.5" aria-hidden /> Serviços
            </p>
            {editavel ? (
              <ButtonV3 variant="subtle" className="px-2 py-1 text-xs" onClick={addServico}>
                <Plus className="h-3.5 w-3.5" /> Serviço
              </ButtonV3>
            ) : null}
          </div>
          {servicos.length > 0 ? servicos.map(linhaServico) : <p className="text-xs text-muted-foreground">Nenhum serviço.</p>}
        </div>

        {/* Peças */}
        <div>
          <div className="mb-1 flex items-center justify-between">
            <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              <Package className="h-3.5 w-3.5" aria-hidden /> Peças
            </p>
            {editavel ? (
              <ButtonV3 variant="subtle" className="px-2 py-1 text-xs" onClick={addPeca}>
                <Plus className="h-3.5 w-3.5" /> Peça
              </ButtonV3>
            ) : null}
          </div>
          {pecas.length > 0 ? pecas.map(linhaPeca) : <p className="text-xs text-muted-foreground">Nenhuma peça.</p>}
        </div>

        {/* Totais + desconto */}
        <div className="rounded-lg border border-border bg-muted/20 p-3">
          <div className="flex items-center justify-between py-0.5 text-sm">
            <span className="text-muted-foreground">Subtotal (cobrado)</span>
            <span className="tabular-nums text-foreground">{formatBRL(totais.subtotal)}</span>
          </div>
          <div className="flex items-center justify-between py-0.5 text-sm">
            <span className="text-muted-foreground">Desconto</span>
            {editavel ? (
              <input
                className={cn(inputCls, "w-28 text-right tabular-nums")}
                type="number"
                min={0}
                step="0.01"
                value={desconto}
                onChange={(e) => { setDesconto(num(e.target.value)); setDirty(true); }}
              />
            ) : (
              <span className="tabular-nums text-foreground">{formatBRL(totais.desconto)}</span>
            )}
          </div>
          <div className="mt-1 flex items-center justify-between border-t border-border pt-2">
            <span className="text-sm font-medium text-foreground">Total ao cliente</span>
            <span className="text-lg font-semibold tabular-nums text-foreground">{formatBRL(totais.total)}</span>
          </div>
          <div className="mt-2 grid grid-cols-3 gap-2 border-t border-dashed border-border pt-2 text-xs">
            <div>
              <p className="text-muted-foreground">Custo interno</p>
              <p className="tabular-nums font-medium text-foreground">{formatBRL(totais.custo)}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Valor ao cliente</p>
              <p className="tabular-nums font-medium text-foreground">{formatBRL(totais.total)}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Lucro estimado</p>
              <p className={cn("tabular-nums font-semibold", totais.lucro >= 0 ? "text-success" : "text-destructive")}>{formatBRL(totais.lucro)}</p>
            </div>
          </div>
          <p className="mt-2 text-[11px] text-muted-foreground">Lucro é somente leitura — sem integração financeira nesta fase.</p>
        </div>

        {/* Ações de edição */}
        {editavel ? (
          <div className="flex flex-wrap items-center gap-2">
            <ButtonV3 variant="primary" disabled={busy || !dirty} onClick={salvar}>
              {actions.pending === "salvar" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Pencil className="h-4 w-4" />}
              Salvar orçamento
            </ButtonV3>
            {dirty ? (
              <ButtonV3 variant="ghost" disabled={busy} onClick={() => { setServicos(orc.servicos ?? []); setPecas(orc.pecas ?? []); setDesconto(orc.desconto ?? 0); setDirty(false); }}>
                Descartar alterações
              </ButtonV3>
            ) : null}
            <span className="mx-1 h-5 w-px bg-border" aria-hidden />
            <ButtonV3 variant="outline" disabled={busy || dirty} onClick={enviar}>
              {actions.pending === "enviar" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              {orc.status === "enviado" ? "Reenviar" : "Enviar"}
            </ButtonV3>
            <ButtonV3 variant="outline" disabled={busy || dirty} onClick={aprovar}>
              {actions.pending === "aprovar" ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
              Aprovar
            </ButtonV3>
            <ButtonV3 variant="danger" disabled={busy || dirty} onClick={() => setRecusando((v) => !v)}>
              <XCircle className="h-4 w-4" />
              Recusar
            </ButtonV3>
            {dirty ? <span className="text-xs text-warning">Salve as alterações antes de enviar/aprovar.</span> : null}
          </div>
        ) : null}

        {recusando ? (
          <div className="flex flex-wrap items-end gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3">
            <label className="min-w-0 flex-1 text-xs text-muted-foreground">
              Motivo (opcional)
              <input className={cn(inputCls, "mt-1")} value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Ex.: cliente achou caro" />
            </label>
            <ButtonV3 variant="danger" disabled={busy} onClick={confirmarRecusa}>
              {actions.pending === "recusar" ? <Loader2 className="h-4 w-4 animate-spin" /> : <XCircle className="h-4 w-4" />}
              Confirmar recusa
            </ButtonV3>
            <ButtonV3 variant="ghost" disabled={busy} onClick={() => setRecusando(false)}>Cancelar</ButtonV3>
          </div>
        ) : null}

        {actions.error ? <p className="text-xs text-destructive">{actions.error}</p> : null}

        {/* Histórico de versões */}
        {verVersoes && versoes.length > 0 ? (
          <div className="rounded-lg border border-border bg-muted/20 p-3">
            <p className="mb-2 text-xs font-medium text-muted-foreground">Versões anteriores</p>
            <ol className="space-y-2">
              {[...versoes].reverse().map((v) => (
                <li key={v.versao} className="rounded-md border border-border bg-card p-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-medium text-foreground">
                      v{v.versao} · {ORCAMENTO_STATUS_META_V3[v.status]?.label ?? v.status}
                    </span>
                    <span className="text-xs tabular-nums text-muted-foreground">{formatBRL(v.total)}</span>
                  </div>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">
                    {v.registradoPor} · {formatDataHora(v.registradoEm)} · {(v.snapshot.servicos?.length ?? 0)} serv. / {(v.snapshot.pecas?.length ?? 0)} peças
                  </p>
                </li>
              ))}
            </ol>
          </div>
        ) : null}
      </div>
    </section>
  );
}
