"use client";

import { useEffect, useState, useTransition } from "react";
import { Modal } from "./ui-kit";
import {
  registrarEntradaEstoque,
  registrarAjusteEstoque,
  listMovimentacoesEstoque,
  type MovimentacaoEstoqueDTO,
} from "@/app/actions/estoque";

function tipoCor(tipo: string): string {
  if (tipo === "entrada") return "text-emerald-600 dark:text-emerald-400";
  if (tipo === "ajuste") return "text-amber-600 dark:text-amber-400";
  return "text-rose-600 dark:text-rose-400";
}

type ProdutoLite = { id: string; nome: string; sku?: string; estoque: number; custo?: number };

/** Parse pt-BR ("5,20" → 5.2). Vazio → 0. */
function parseNum(s: string): number {
  const t = (s ?? "").trim().replace(/\./g, "").replace(",", ".");
  const n = Number(t);
  return Number.isFinite(n) ? n : 0;
}

function fmtMoney(n: number): string {
  return `R$ ${n.toFixed(2).replace(".", ",")}`;
}

function fmtData(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" });
}

type Aba = "entrada" | "ajuste" | "historico";

export function MovimentacaoEstoqueModal({
  open,
  onClose,
  storeId,
  produto,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  storeId: string;
  produto: ProdutoLite | null;
  onSaved?: () => void;
}) {
  const [aba, setAba] = useState<Aba>("entrada");
  const [qtd, setQtd] = useState("");
  const [custo, setCusto] = useState("");
  const [fornecedor, setFornecedor] = useState("");
  const [documento, setDocumento] = useState("");
  const [obs, setObs] = useState("");
  const [novoSaldo, setNovoSaldo] = useState("");
  const [motivo, setMotivo] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);
  const [hist, setHist] = useState<MovimentacaoEstoqueDTO[]>([]);
  const [loadingHist, setLoadingHist] = useState(false);
  const [saving, startSaving] = useTransition();

  // Reset quando abre ou troca de produto.
  useEffect(() => {
    if (!open) return;
    setAba("entrada");
    setQtd("");
    setCusto(produto?.custo ? String(produto.custo).replace(".", ",") : "");
    setFornecedor("");
    setDocumento("");
    setObs("");
    setNovoSaldo(produto ? String(produto.estoque) : "");
    setMotivo("");
    setErro(null);
    setOkMsg(null);
  }, [open, produto?.id]);

  const carregarHist = () => {
    if (!produto) return;
    setLoadingHist(true);
    listMovimentacoesEstoque(storeId, { produtoId: produto.id, limit: 50 })
      .then(setHist)
      .catch(() => setHist([]))
      .finally(() => setLoadingHist(false));
  };
  useEffect(() => {
    if (open && aba === "historico") carregarHist();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, aba, produto?.id]);

  if (!open || !produto) return null;

  const submitEntrada = () => {
    setErro(null);
    setOkMsg(null);
    const q = Math.trunc(parseNum(qtd));
    if (q <= 0) {
      setErro("Quantidade deve ser maior que zero.");
      return;
    }
    startSaving(async () => {
      const res = await registrarEntradaEstoque(storeId, {
        produtoId: produto.id,
        quantidade: q,
        custoUnitario: parseNum(custo),
        fornecedor,
        documento,
        observacao: obs,
      });
      if (res.ok) {
        setOkMsg(`Entrada registrada. Saldo: ${res.estoqueDepois} · custo médio ${fmtMoney(res.custoMedioDepois)}.`);
        setQtd("");
        setObs("");
        onSaved?.();
      } else {
        setErro(res.reason);
      }
    });
  };

  const submitAjuste = () => {
    setErro(null);
    setOkMsg(null);
    if (!motivo.trim()) {
      setErro("Informe o motivo do ajuste.");
      return;
    }
    const s = Math.trunc(parseNum(novoSaldo));
    if (s < 0) {
      setErro("Novo saldo não pode ser negativo.");
      return;
    }
    startSaving(async () => {
      const res = await registrarAjusteEstoque(storeId, {
        produtoId: produto.id,
        novoSaldo: s,
        motivo,
        observacao: obs,
      });
      if (res.ok) {
        setOkMsg(`Ajuste registrado. Novo saldo: ${res.estoqueDepois}.`);
        setObs("");
        onSaved?.();
      } else {
        setErro(res.reason);
      }
    });
  };

  const inputCls =
    "w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring";
  const tabCls = (active: boolean) =>
    `rounded-md px-3 py-1.5 text-sm font-medium ${active ? "bg-primary text-primary-foreground" : "bg-secondary text-foreground hover:bg-accent"}`;

  return (
    <Modal open={open} onClose={onClose} title="Movimentação de estoque" subtitle={produto.nome} size="lg">
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-2 rounded-lg border border-border bg-secondary/30 px-3 py-2 text-sm">
          <span className="text-muted-foreground">
            SKU <span className="text-foreground">{produto.sku && produto.sku !== "—" ? produto.sku : "—"}</span>
          </span>
          <span className="text-muted-foreground">
            Saldo atual <span className="font-semibold text-foreground">{produto.estoque}</span>
          </span>
          <span className="text-muted-foreground">
            Custo <span className="text-foreground">{produto.custo ? fmtMoney(produto.custo) : "—"}</span>
          </span>
        </div>

        <div className="flex gap-2">
          <button type="button" className={tabCls(aba === "entrada")} onClick={() => setAba("entrada")}>
            Entrada
          </button>
          <button type="button" className={tabCls(aba === "ajuste")} onClick={() => setAba("ajuste")}>
            Ajuste
          </button>
          <button type="button" className={tabCls(aba === "historico")} onClick={() => setAba("historico")}>
            Histórico
          </button>
        </div>

        {erro && (
          <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">{erro}</div>
        )}
        {okMsg && (
          <div className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-700 dark:text-emerald-300">
            {okMsg}
          </div>
        )}

        {aba === "entrada" && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-[11px] uppercase text-muted-foreground">Quantidade *</label>
                <input className={inputCls} inputMode="numeric" value={qtd} onChange={(e) => setQtd(e.target.value)} placeholder="0" />
              </div>
              <div>
                <label className="mb-1 block text-[11px] uppercase text-muted-foreground">Custo unitário (R$)</label>
                <input className={inputCls} inputMode="decimal" value={custo} onChange={(e) => setCusto(e.target.value)} placeholder="0,00" />
              </div>
              <div>
                <label className="mb-1 block text-[11px] uppercase text-muted-foreground">Fornecedor</label>
                <input className={inputCls} value={fornecedor} onChange={(e) => setFornecedor(e.target.value)} />
              </div>
              <div>
                <label className="mb-1 block text-[11px] uppercase text-muted-foreground">Documento / NF</label>
                <input className={inputCls} value={documento} onChange={(e) => setDocumento(e.target.value)} />
              </div>
            </div>
            <div>
              <label className="mb-1 block text-[11px] uppercase text-muted-foreground">Observação</label>
              <input className={inputCls} value={obs} onChange={(e) => setObs(e.target.value)} />
            </div>
            {parseNum(qtd) > 0 && (
              <p className="text-xs text-muted-foreground">
                Novo saldo: <span className="text-foreground">{produto.estoque + Math.trunc(parseNum(qtd))}</span>
                {parseNum(custo) > 0 && <> · valor da entrada {fmtMoney(Math.trunc(parseNum(qtd)) * parseNum(custo))}</>}
              </p>
            )}
            <div className="flex justify-end gap-2 pt-1">
              <button type="button" className="rounded-md border border-border bg-background px-3 py-1.5 text-sm hover:bg-accent" onClick={onClose} disabled={saving}>
                Fechar
              </button>
              <button type="button" className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60" onClick={submitEntrada} disabled={saving}>
                {saving ? "Registrando…" : "Registrar entrada"}
              </button>
            </div>
          </div>
        )}

        {aba === "ajuste" && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-[11px] uppercase text-muted-foreground">Novo saldo *</label>
                <input className={inputCls} inputMode="numeric" value={novoSaldo} onChange={(e) => setNovoSaldo(e.target.value)} />
              </div>
              <div>
                <label className="mb-1 block text-[11px] uppercase text-muted-foreground">Motivo *</label>
                <input className={inputCls} value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Contagem, perda, quebra…" />
              </div>
            </div>
            <div>
              <label className="mb-1 block text-[11px] uppercase text-muted-foreground">Observação</label>
              <input className={inputCls} value={obs} onChange={(e) => setObs(e.target.value)} />
            </div>
            {parseNum(novoSaldo) !== produto.estoque && (
              <p className="text-xs text-muted-foreground">
                Delta: <span className="text-foreground">{Math.trunc(parseNum(novoSaldo)) - produto.estoque > 0 ? "+" : ""}{Math.trunc(parseNum(novoSaldo)) - produto.estoque}</span> (custo médio inalterado)
              </p>
            )}
            <div className="flex justify-end gap-2 pt-1">
              <button type="button" className="rounded-md border border-border bg-background px-3 py-1.5 text-sm hover:bg-accent" onClick={onClose} disabled={saving}>
                Fechar
              </button>
              <button type="button" className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60" onClick={submitAjuste} disabled={saving}>
                {saving ? "Registrando…" : "Registrar ajuste"}
              </button>
            </div>
          </div>
        )}

        {aba === "historico" && (
          <div className="space-y-2">
            {loadingHist ? (
              <p className="py-6 text-center text-sm text-muted-foreground">Carregando…</p>
            ) : hist.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">Sem movimentações registradas para este produto.</p>
            ) : (
              <div className="max-h-80 overflow-y-auto rounded-lg border border-border">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-secondary/60 text-muted-foreground">
                    <tr>
                      <th className="px-2 py-2 text-left">Data</th>
                      <th className="px-2 py-2 text-left">Tipo</th>
                      <th className="px-2 py-2 text-right">Qtd</th>
                      <th className="px-2 py-2 text-right">Saldo</th>
                      <th className="px-2 py-2 text-right">Custo médio</th>
                      <th className="px-2 py-2 text-left">Detalhe</th>
                      <th className="px-2 py-2 text-left">Usuário</th>
                    </tr>
                  </thead>
                  <tbody>
                    {hist.map((m) => (
                      <tr key={m.id} className="border-t border-border">
                        <td className="px-2 py-2 text-muted-foreground">{fmtData(m.createdAt)}</td>
                        <td className="px-2 py-2">
                          <span className={m.tipo === "entrada" ? "text-emerald-600 dark:text-emerald-400" : m.tipo === "ajuste" ? "text-amber-600 dark:text-amber-400" : "text-rose-600 dark:text-rose-400"}>
                            {m.tipo}
                          </span>
                        </td>
                        <td className="px-2 py-2 text-right tabular-nums text-foreground">
                          {m.quantidade > 0 ? "+" : ""}
                          {m.quantidade}
                        </td>
                        <td className="px-2 py-2 text-right tabular-nums text-muted-foreground">
                          {m.estoqueAntes}→<span className="font-medium text-foreground">{m.estoqueDepois}</span>
                        </td>
                        <td className="px-2 py-2 text-right tabular-nums text-muted-foreground">{fmtMoney(m.custoMedioDepois)}</td>
                        <td className="px-2 py-2 text-muted-foreground">
                          {[m.fornecedor, m.documento, m.motivo, m.observacao].filter(Boolean).join(" · ") || "—"}
                        </td>
                        <td className="px-2 py-2 text-muted-foreground">{m.usuario || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <div className="flex justify-end">
              <button type="button" className="rounded-md border border-border bg-background px-3 py-1.5 text-sm hover:bg-accent" onClick={onClose}>
                Fechar
              </button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}

/** Histórico geral de estoque da loja (todos os produtos). Read-only. */
export function HistoricoEstoqueGeralModal({
  open,
  onClose,
  storeId,
}: {
  open: boolean;
  onClose: () => void;
  storeId: string;
}) {
  const [rows, setRows] = useState<MovimentacaoEstoqueDTO[]>([]);
  const [loading, setLoading] = useState(false);
  const [q, setQ] = useState("");

  useEffect(() => {
    if (!open) return;
    setQ("");
    setLoading(true);
    listMovimentacoesEstoque(storeId, { limit: 300 })
      .then(setRows)
      .catch(() => setRows([]))
      .finally(() => setLoading(false));
  }, [open, storeId]);

  if (!open) return null;

  const filtradas = q.trim()
    ? rows.filter((m) => {
        const blob = [m.produtoNome, m.produtoSku, m.tipo, m.fornecedor, m.documento, m.motivo, m.usuario]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        return blob.includes(q.trim().toLowerCase());
      })
    : rows;

  return (
    <Modal open={open} onClose={onClose} title="Histórico de estoque" subtitle="Todas as movimentações da loja" size="xl">
      <div className="space-y-3">
        <input
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring"
          placeholder="Filtrar por produto, SKU, tipo, fornecedor, usuário…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        {loading ? (
          <p className="py-6 text-center text-sm text-muted-foreground">Carregando…</p>
        ) : filtradas.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            {rows.length === 0 ? "Nenhuma movimentação registrada nesta loja ainda." : "Nada corresponde ao filtro."}
          </p>
        ) : (
          <div className="max-h-[60vh] overflow-y-auto rounded-lg border border-border">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-secondary/60 text-muted-foreground">
                <tr>
                  <th className="px-2 py-2 text-left">Data</th>
                  <th className="px-2 py-2 text-left">Produto</th>
                  <th className="px-2 py-2 text-left">Tipo</th>
                  <th className="px-2 py-2 text-right">Qtd</th>
                  <th className="px-2 py-2 text-right">Saldo</th>
                  <th className="px-2 py-2 text-right">Custo médio</th>
                  <th className="px-2 py-2 text-left">Usuário</th>
                </tr>
              </thead>
              <tbody>
                {filtradas.map((m) => (
                  <tr key={m.id} className="border-t border-border">
                    <td className="px-2 py-2 text-muted-foreground">{fmtData(m.createdAt)}</td>
                    <td className="px-2 py-2 text-foreground">
                      {m.produtoNome}
                      {m.produtoSku ? <span className="text-muted-foreground"> · {m.produtoSku}</span> : null}
                    </td>
                    <td className={`px-2 py-2 ${tipoCor(m.tipo)}`}>{m.tipo}</td>
                    <td className="px-2 py-2 text-right tabular-nums text-foreground">
                      {m.quantidade > 0 ? "+" : ""}
                      {m.quantidade}
                    </td>
                    <td className="px-2 py-2 text-right tabular-nums text-muted-foreground">
                      {m.estoqueAntes}→<span className="font-medium text-foreground">{m.estoqueDepois}</span>
                    </td>
                    <td className="px-2 py-2 text-right tabular-nums text-muted-foreground">{fmtMoney(m.custoMedioDepois)}</td>
                    <td className="px-2 py-2 text-muted-foreground">{m.usuario || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="text-[11px] text-muted-foreground">{filtradas.length} de {rows.length} movimentação(ões) · limite 300 mais recentes.</p>
      </div>
    </Modal>
  );
}
