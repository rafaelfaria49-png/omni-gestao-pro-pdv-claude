import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, FileText, Send, Trash2, XCircle } from "lucide-react";
import type { Orcamento, OrdemServico, PecaUsada, Servico } from "@/types/os";
import { brl, dt } from "@/lib/os/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useOS } from "@/store/osStore";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { recalcularTotalOrcamento, type SalvarOrcamentoEvento } from "@/api/os";
import { uid } from "@/api/_helpers";

const STATUS_LABEL: Record<string, { label: string; cls: string }> = {
  rascunho: { label: "Rascunho", cls: "bg-muted text-muted-foreground border-border" },
  enviado: { label: "Enviado ao cliente", cls: "bg-sky-500/10 text-sky-500 border-sky-500/20" },
  aprovado: { label: "Aprovado", cls: "bg-emerald-500/10 text-emerald-500 border-emerald-500/20" },
  recusado: { label: "Recusado", cls: "bg-rose-500/10 text-rose-500 border-rose-500/20" },
  expirado: { label: "Expirado", cls: "bg-amber-500/10 text-amber-500 border-amber-500/20" },
};

const DEFAULT_AUTOR = "Você";

function parseMoney(v: string): number {
  const n = Number(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

function parseQty(v: string): number {
  const n = Number(String(v).replace(",", "."));
  return Number.isFinite(n) && n >= 0 ? Math.trunc(n) : 0;
}

function cloneOrcamento(o: Orcamento): Orcamento {
  return {
    ...o,
    pecas: o.pecas.map((p) => ({ ...p })),
    servicos: o.servicos.map((s) => ({ ...s })),
  };
}

export function OrcamentoPanel({ os }: { os: OrdemServico }) {
  const {
    servicosCatalogo,
    produtosCatalogo,
    criarOrcamentoRascunho,
    salvarOrcamento,
    enviarOrcamentoAoCliente,
    approveOrcamento,
    rejectOrcamento,
  } = useOS();

  const [draft, setDraft] = useState<Orcamento | null>(() => (os.orcamento ? cloneOrcamento(os.orcamento) : null));
  const [pickServico, setPickServico] = useState("");
  const [pickProduto, setPickProduto] = useState("");

  useEffect(() => {
    setDraft(os.orcamento ? cloneOrcamento(os.orcamento) : null);
  }, [os.id, os.atualizadoEm, os.orcamento]);

  const servicosAtivos = useMemo(() => servicosCatalogo.filter((s) => s.ativo), [servicosCatalogo]);
  const produtosAtivos = useMemo(() => produtosCatalogo.filter((p) => p.status === "Ativo"), [produtosCatalogo]);

  const persist = (next: Orcamento, evento: SalvarOrcamentoEvento) => {
    salvarOrcamento(os.id, next, evento, DEFAULT_AUTOR);
  };

  const updateDraft = (updater: (d: Orcamento) => Orcamento) => {
    setDraft((prev) => {
      if (!prev) return prev;
      return recalcularTotalOrcamento(updater(prev));
    });
  };

  if (!os.orcamento && !draft) {
    return (
      <div className="rounded-xl border border-dashed border-border p-6 text-center">
        <FileText className="mx-auto mb-2 h-6 w-6 text-muted-foreground" />
        <div className="text-sm font-medium">Nenhum orçamento criado</div>
        <p className="mt-1 text-xs text-muted-foreground">Adicione peças e serviços para gerar um orçamento.</p>
        <Button className="mt-4" size="sm" onClick={() => criarOrcamentoRascunho(os.id, DEFAULT_AUTOR)}>
          Criar orçamento
        </Button>
      </div>
    );
  }

  const o = draft ?? os.orcamento;
  if (!o) return null;

  const cfg = STATUS_LABEL[o.status];
  const editavel = o.status === "rascunho";

  const addServicoCatalogo = () => {
    if (!pickServico || !draft) return;
    const s = servicosAtivos.find((x) => x.id === pickServico);
    if (!s) return;
    const line: Servico = {
      id: uid("srv"),
      descricao: s.nome,
      valor: s.valorVenda,
      desconto: 0,
      observacao: "",
      prazoGarantiaDias: s.prazoGarantiaDias,
      termoGarantia: s.termoGarantia,
    };
    const next = recalcularTotalOrcamento({
      ...draft,
      servicos: [...draft.servicos, line],
    });
    setDraft(next);
    setPickServico("");
    persist(next, { kind: "orcamento_item_adicionado", label: s.nome });
    toast.success("Serviço adicionado");
  };

  const addProdutoCatalogo = () => {
    if (!pickProduto || !draft) return;
    const p = produtosAtivos.find((x) => x.id === pickProduto);
    if (!p) return;
    const line: PecaUsada = {
      id: uid("pec"),
      nome: p.nome,
      sku: p.sku,
      quantidade: 1,
      valorUnitario: p.preco,
      desconto: 0,
      observacao: "",
      prazoGarantiaDias: p.garantia > 0 ? p.garantia : undefined,
    };
    const next = recalcularTotalOrcamento({
      ...draft,
      pecas: [...draft.pecas, line],
    });
    setDraft(next);
    setPickProduto("");
    persist(next, { kind: "orcamento_item_adicionado", label: p.nome });
    toast.success("Produto adicionado");
  };

  const removeServico = (id: string) => {
    if (!draft) return;
    const row = draft.servicos.find((s) => s.id === id);
    const next = recalcularTotalOrcamento({
      ...draft,
      servicos: draft.servicos.filter((s) => s.id !== id),
    });
    setDraft(next);
    persist(next, { kind: "orcamento_item_removido", label: row?.descricao ?? "Serviço" });
  };

  const removePeca = (id: string) => {
    if (!draft) return;
    const row = draft.pecas.find((p) => p.id === id);
    const next = recalcularTotalOrcamento({
      ...draft,
      pecas: draft.pecas.filter((p) => p.id !== id),
    });
    setDraft(next);
    persist(next, { kind: "orcamento_item_removido", label: row?.nome ?? "Item" });
  };

  const salvarAlteracoes = () => {
    if (!draft) return;
    const next = recalcularTotalOrcamento(draft);
    setDraft(next);
    persist(next, { kind: "orcamento_atualizado" });
    toast.success("Orçamento salvo");
  };

  return (
    <div className="rounded-xl border border-border bg-card">
      <div className="flex items-center justify-between border-b border-border p-4">
        <div>
          <div className="text-xs uppercase tracking-wide text-muted-foreground">Orçamento</div>
          <div className="text-lg font-semibold">{brl(o.total)}</div>
        </div>
        <span className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium", cfg.cls)}>
          {cfg.label}
        </span>
      </div>

      <div className="space-y-3 p-4">
        {editavel && (
          <div className="space-y-3 rounded-lg border border-border bg-muted/30 p-3">
            <div className="grid gap-2 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label className="text-[11px]">Serviço (catálogo)</Label>
                <div className="flex gap-2">
                  <Select value={pickServico} onValueChange={setPickServico}>
                    <SelectTrigger className="h-9 flex-1 text-left text-xs">
                      <SelectValue placeholder="Selecionar…" />
                    </SelectTrigger>
                    <SelectContent>
                      {servicosAtivos.map((s) => (
                        <SelectItem key={s.id} value={s.id} className="text-xs">
                          {s.nome} — {brl(s.valorVenda)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button type="button" size="sm" variant="secondary" className="shrink-0" onClick={addServicoCatalogo}>
                    Add
                  </Button>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-[11px]">Produto (cadastro)</Label>
                <div className="flex gap-2">
                  <Select value={pickProduto} onValueChange={setPickProduto}>
                    <SelectTrigger className="h-9 flex-1 text-left text-xs">
                      <SelectValue placeholder="Selecionar…" />
                    </SelectTrigger>
                    <SelectContent>
                      {produtosAtivos.map((p) => (
                        <SelectItem key={p.id} value={p.id} className="text-xs">
                          {p.nome} — {brl(p.preco)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button type="button" size="sm" variant="secondary" className="shrink-0" onClick={addProdutoCatalogo}>
                    Add
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}

        {o.pecas.length > 0 && (
          <div>
            <div className="mb-1 text-[11px] uppercase tracking-wide text-muted-foreground">Peças / produtos</div>
            <div className="space-y-2">
              {o.pecas.map((p) => (
                <div key={p.id} className="rounded-lg border border-border p-2 text-sm">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="font-medium text-foreground/90">
                        {p.quantidade}× {p.nome}
                      </div>
                      <div className="text-[11px] text-muted-foreground">{p.sku ? `SKU ${p.sku}` : null}</div>
                    </div>
                    <div className="flex items-center gap-1">
                      <span className="whitespace-nowrap font-medium">{brl(Math.max(0, p.quantidade * p.valorUnitario - (p.desconto ?? 0)))}</span>
                      {editavel && (
                        <Button type="button" variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => removePeca(p.id)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                  </div>
                  {editavel && (
                    <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
                      <div>
                        <Label className="text-[10px] text-muted-foreground">Qtd</Label>
                        <Input
                          className="h-8 text-xs"
                          value={String(p.quantidade)}
                          onChange={(e) =>
                            updateDraft((d) => ({
                              ...d,
                              pecas: d.pecas.map((x) => (x.id === p.id ? { ...x, quantidade: parseQty(e.target.value) || 0 } : x)),
                            }))
                          }
                        />
                      </div>
                      <div>
                        <Label className="text-[10px] text-muted-foreground">Valor unit.</Label>
                        <Input
                          className="h-8 text-xs"
                          value={String(p.valorUnitario)}
                          onChange={(e) =>
                            updateDraft((d) => ({
                              ...d,
                              pecas: d.pecas.map((x) => (x.id === p.id ? { ...x, valorUnitario: parseMoney(e.target.value) } : x)),
                            }))
                          }
                        />
                      </div>
                      <div>
                        <Label className="text-[10px] text-muted-foreground">Desc. R$</Label>
                        <Input
                          className="h-8 text-xs"
                          value={String(p.desconto ?? 0)}
                          onChange={(e) =>
                            updateDraft((d) => ({
                              ...d,
                              pecas: d.pecas.map((x) => (x.id === p.id ? { ...x, desconto: parseMoney(e.target.value) } : x)),
                            }))
                          }
                        />
                      </div>
                      <div className="sm:col-span-1">
                        <Label className="text-[10px] text-muted-foreground">Obs.</Label>
                        <Input
                          className="h-8 text-xs"
                          value={p.observacao ?? ""}
                          onChange={(e) =>
                            updateDraft((d) => ({
                              ...d,
                              pecas: d.pecas.map((x) => (x.id === p.id ? { ...x, observacao: e.target.value } : x)),
                            }))
                          }
                        />
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {o.servicos.length > 0 && (
          <div>
            <div className="mb-1 text-[11px] uppercase tracking-wide text-muted-foreground">Serviços</div>
            <div className="space-y-2">
              {o.servicos.map((s) => (
                <div key={s.id} className="rounded-lg border border-border p-2 text-sm">
                  <div className="flex items-start justify-between gap-2">
                    <span className="min-w-0 flex-1 text-foreground/90">{s.descricao}</span>
                    <div className="flex items-center gap-1">
                      <span className="whitespace-nowrap font-medium">{brl(Math.max(0, s.valor - (s.desconto ?? 0)))}</span>
                      {editavel && (
                        <Button type="button" variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => removeServico(s.id)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                  </div>
                  {editavel && (
                    <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
                      <div>
                        <Label className="text-[10px] text-muted-foreground">Valor</Label>
                        <Input
                          className="h-8 text-xs"
                          value={String(s.valor)}
                          onChange={(e) =>
                            updateDraft((d) => ({
                              ...d,
                              servicos: d.servicos.map((x) => (x.id === s.id ? { ...x, valor: parseMoney(e.target.value) } : x)),
                            }))
                          }
                        />
                      </div>
                      <div>
                        <Label className="text-[10px] text-muted-foreground">Desc. R$</Label>
                        <Input
                          className="h-8 text-xs"
                          value={String(s.desconto ?? 0)}
                          onChange={(e) =>
                            updateDraft((d) => ({
                              ...d,
                              servicos: d.servicos.map((x) => (x.id === s.id ? { ...x, desconto: parseMoney(e.target.value) } : x)),
                            }))
                          }
                        />
                      </div>
                      <div className="sm:col-span-2">
                        <Label className="text-[10px] text-muted-foreground">Obs.</Label>
                        <Input
                          className="h-8 text-xs"
                          value={s.observacao ?? ""}
                          onChange={(e) =>
                            updateDraft((d) => ({
                              ...d,
                              servicos: d.servicos.map((x) => (x.id === s.id ? { ...x, observacao: e.target.value } : x)),
                            }))
                          }
                        />
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {editavel && (
          <div className="space-y-2">
            <div>
              <Label className="text-[11px]">Desconto global (R$)</Label>
              <Input
                className="mt-1 h-9 max-w-[200px] text-xs"
                value={String(o.desconto)}
                onChange={(e) =>
                  updateDraft((d) => ({
                    ...d,
                    desconto: parseMoney(e.target.value),
                  }))
                }
              />
            </div>
            <div>
              <Label className="text-[11px]">Observação do orçamento</Label>
              <Textarea
                className="mt-1 min-h-[72px] text-xs"
                value={o.observacao ?? o.observacoes ?? ""}
                onChange={(e) =>
                  updateDraft((d) => ({
                    ...d,
                    observacao: e.target.value,
                  }))
                }
              />
            </div>
            <Button type="button" size="sm" variant="outline" onClick={salvarAlteracoes}>
              Salvar alterações
            </Button>
          </div>
        )}

        {o.desconto > 0 && (
          <div className="flex items-center justify-between text-sm text-emerald-500">
            <span>Desconto global</span>
            <span>− {brl(o.desconto)}</span>
          </div>
        )}

        {!editavel && (o.observacao ?? o.observacoes)?.trim() ? (
          <div className="rounded-md border border-border bg-muted/20 p-2 text-xs text-foreground/90">
            <span className="font-medium text-muted-foreground">Observação: </span>
            {o.observacao ?? o.observacoes}
          </div>
        ) : null}

        <div className="border-t border-border pt-2 text-[11px] text-muted-foreground">
          Enviado em {dt(o.enviadoEm)} · Válido até {dt(o.validoAte)}
          {o.atualizadoEm ? ` · Atualizado ${dt(o.atualizadoEm)}` : null}
        </div>
      </div>

      {o.status === "enviado" && (
        <div className="flex flex-col gap-2 border-t border-border p-4 sm:flex-row">
          <Button
            className="flex-1 gap-2"
            onClick={() => {
              approveOrcamento(os.id);
              toast.success("Orçamento aprovado");
            }}
          >
            <CheckCircle2 className="h-4 w-4" />
            Marcar como aprovado
          </Button>
          <Button
            variant="outline"
            className="flex-1 gap-2"
            onClick={() => {
              rejectOrcamento(os.id, "Cliente recusou.");
              toast("Orçamento recusado");
            }}
          >
            <XCircle className="h-4 w-4" />
            Recusar
          </Button>
        </div>
      )}

      {o.status === "rascunho" && (
        <div className="flex flex-col gap-2 border-t border-border p-4">
          <Button
            className="w-full gap-2"
            variant="outline"
            onClick={() => {
              enviarOrcamentoAoCliente(os.id, DEFAULT_AUTOR);
              toast.success("Orçamento marcado como enviado");
            }}
          >
            <Send className="h-4 w-4" />
            Marcar como enviado ao cliente
          </Button>
          <Button className="w-full gap-2" variant="ghost" size="sm" onClick={() => toast("Enviar via WhatsApp (integração futura)")}>
            <Send className="h-4 w-4" />
            Enviar ao cliente (WhatsApp)
          </Button>
        </div>
      )}
    </div>
  );
}
