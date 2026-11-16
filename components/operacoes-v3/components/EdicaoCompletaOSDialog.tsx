"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { SupervisorGateDialog } from "@/components/dashboard/caixa/supervisor-gate-dialog";
import { carregarEditorOSV3, revisarEditorOSV3, salvarEditorOSV3, type revisarEdicaoCompletaOSV3 } from "@/lib/operacoes-v3/edicao-completa-actions";
import { totalEdicaoCompletaV3, type EdicaoCompletaV3, type RevisaoEdicaoV3 } from "@/lib/operacoes-v3/edicao-completa-model";
import { GARANTIA_CATALOGO_V3 } from "@/lib/operacoes-v3/garantia-textos";
import { useClienteSearchV4 } from "@/components/operacoes-v4-preview/use-clientes-v4";

type Previa = Awaited<ReturnType<typeof revisarEdicaoCompletaOSV3>>;
const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const mensagem = (e: unknown) => e instanceof Error ? e.message : "Não foi possível concluir. Reabra e confira os dados antes de tentar novamente.";
const rotulosPrevia: Record<string, string> = { nome: "Nome", documento: "CPF / CNPJ", telefone: "Telefone", email: "Email", tipo: "Tipo", marca: "Marca", modelo: "Modelo", numeroSerie: "Número de série", imei: "IMEI", cor: "Cor", operadora: "Operadora", recebidoPor: "Recebido por", localFisico: "Local físico", descricao: "Descrição", valor: "Preço de venda", custoV3: "Custo interno", desconto: "Desconto", quantidade: "Quantidade", valorUnitario: "Venda unitária", custoUnitario: "Custo unitário", vencimento: "Vencimento", formaPreferida: "Forma preferida", prazoDias: "Prazo em dias", termoCustom: "Termo complementar", inicioOriginal: "Início original", vencimentoOriginal: "Fim original", kindV3: "Cobrança", selecionadaV3: "Opção escolhida" };
function textoPrevia(v: unknown): string {
  if (v == null || v === "") return "Não informado";
  if (Array.isArray(v)) return v.length ? v.map((l, i) => `${i + 1}. ${textoPrevia(l)}`).join("\n\n") : "Nenhum item";
  if (typeof v === "object") return Object.entries(v).flatMap(([k, value]) => k === "modeloId" ? [`Modelo: ${GARANTIA_CATALOGO_V3.find((g) => g.id === value)?.titulo ?? "Não definido"}`] : rotulosPrevia[k] ? [`${rotulosPrevia[k]}: ${textoPrevia(value)}`] : []).join("\n");
  return typeof v === "boolean" ? v ? "Sim" : "Não" : String(v);
}

function Campo({ label, value, onChange, type = "text" }: { label: string; value: string | number; onChange: (v: string) => void; type?: string }) {
  const id = `edicao-${label.replace(/\W/g, "-")}`;
  return <div className="min-w-0 space-y-1"><Label htmlFor={id}>{label}</Label><Input id={id} type={type} step={type === "number" ? "0.01" : undefined} min={type === "number" ? 0 : undefined} value={value} onChange={(e) => onChange(e.target.value)} /></div>;
}

/** O mesmo editor nas operações V3 e V4; dados sempre carregados do servidor. */
export function EdicaoCompletaOSDialog({ open, storeId, osId, onClose, onSaved }: { open: boolean; storeId: string; osId: string; onClose: () => void; onSaved: () => void }) {
  const [dados, setDados] = useState<EdicaoCompletaV3 | null>(null);
  const [versao, setVersao] = useState("");
  const [codigo, setCodigo] = useState("");
  const [motivo, setMotivo] = useState("");
  const [previa, setPrevia] = useState<Previa | null>(null);
  const [revisao, setRevisao] = useState<RevisaoEdicaoV3 | null>(null);
  const [gate, setGate] = useState(false);
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const clientes = useClienteSearchV4(open ? storeId : null);
  const emVoo = useRef(false);
  const alvo = useRef(`${storeId}:${osId}:${open}`);
  alvo.current = `${storeId}:${osId}:${open}`;

  useEffect(() => {
    if (!open) return;
    let ativo = true;
    setDados(null); setPrevia(null); setRevisao(null); setGate(false); setErro(null); setMotivo("");
    void carregarEditorOSV3(storeId, osId).then((r) => { if (!r.ok) throw new Error(r.error); if (ativo) { setDados(r.data.dados); setVersao(r.data.versao); setCodigo(r.data.codigo); } }).catch((e) => { if (ativo) setErro(mensagem(e)); });
    return () => { ativo = false; };
  }, [open, storeId, osId]);

  const atualizar = (d: EdicaoCompletaV3) => { setDados(d); setPrevia(null); setRevisao(null); setErro(null); };
  const revisar = async () => {
    if (!dados || emVoo.current) return;
    const chave = alvo.current;
    emVoo.current = true; setBusy(true); setErro(null);
    try {
      const r = { versao, operacaoId: crypto.randomUUID(), motivo };
      const p = await revisarEditorOSV3(storeId, osId, dados, r);
      if (!p.ok) throw new Error(p.error);
      if (chave === alvo.current) { setPrevia(p.data); setRevisao(r); }
    } catch (e) { if (chave === alvo.current) setErro(mensagem(e)); }
    finally { emVoo.current = false; if (chave === alvo.current) setBusy(false); }
  };
  const salvar = async () => {
    if (!dados || !revisao || !previa || emVoo.current) return;
    const chave = alvo.current;
    emVoo.current = true; setBusy(true); setErro(null);
    try {
      const r = await salvarEditorOSV3(storeId, osId, dados, revisao);
      if (!r.ok) throw new Error(r.error);
      if (chave === alvo.current) { setGate(false); onSaved(); onClose(); }
    } catch (e) { if (chave === alvo.current) { setGate(false); setErro(mensagem(e)); } }
    finally { emVoo.current = false; if (chave === alvo.current) setBusy(false); }
  };

  return <>
    <Dialog open={open} onOpenChange={(v) => { if (!v && !busy) onClose(); }}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-4xl" onInteractOutside={(e) => { if (busy) e.preventDefault(); }} onEscapeKeyDown={(e) => { if (busy) e.preventDefault(); }}>
        <DialogHeader><DialogTitle>Editar OS {codigo}</DialogTitle><DialogDescription>Corrija os dados e revise as alterações. O supervisor autoriza o salvamento com seu PIN.</DialogDescription></DialogHeader>
        {erro && <p role="alert" className="rounded-md border border-destructive/30 p-3 text-sm text-destructive">{erro}</p>}
        {!dados ? <p role="status">{erro ? "Feche e reabra para carregar novamente." : "Carregando os dados persistidos…"}</p> : <>
          <fieldset disabled={busy || !!previa} className="space-y-5 disabled:opacity-80">
            <section className="space-y-3"><h3 className="font-semibold">Cliente / CPF</h3><Label htmlFor="edicao-busca-cliente">Vincular outro cliente existente</Label><Input id="edicao-busca-cliente" placeholder="Buscar por nome, CPF ou telefone" value={clientes.query} onChange={(e) => clientes.setQuery(e.target.value)} autoComplete="off" />{clientes.query.trim() && <div className="max-h-40 space-y-1 overflow-y-auto rounded-md border p-2">{clientes.loading && <p role="status" className="text-sm">Buscando clientes…</p>}{clientes.error && <p role="alert" className="text-sm text-destructive">{clientes.error}</p>}{clientes.clientes.map((c) => <Button key={c.id} type="button" variant="ghost" className="w-full justify-start whitespace-normal text-left" onClick={() => { atualizar({ ...dados, cliente: { id: c.id, nome: c.nome, documento: c.documento, telefone: c.telefone, email: c.email } }); clientes.setQuery(""); }}>{c.nome} · {c.documento || "Sem documento"}</Button>)}</div>}<p className="text-xs text-muted-foreground">A correção atualiza também o cadastro vinculado. Documentos emitidos preservam seus dados originais.</p><div className="grid gap-3 sm:grid-cols-2">
              <Campo label="Nome do cliente" value={dados.cliente.nome} onChange={(nome) => atualizar({ ...dados, cliente: { ...dados.cliente, nome } })} />
              <Campo label="CPF / CNPJ" value={dados.cliente.documento} onChange={(documento) => atualizar({ ...dados, cliente: { ...dados.cliente, documento } })} />
              <Campo label="Telefone" value={dados.cliente.telefone} onChange={(telefone) => atualizar({ ...dados, cliente: { ...dados.cliente, telefone } })} />
              <Campo label="Email" type="email" value={dados.cliente.email} onChange={(email) => atualizar({ ...dados, cliente: { ...dados.cliente, email } })} />
            </div></section>
            <section className="space-y-3"><h3 className="font-semibold">Equipamento</h3><div className="grid gap-3 sm:grid-cols-2">{([['tipo', 'Tipo de equipamento'], ['marca', 'Marca'], ['modelo', 'Modelo'], ['numeroSerie', 'Número de série'], ['imei', 'IMEI'], ['cor', 'Cor'], ['operadora', 'Operadora']] as const).map(([k, label]) => <Campo key={k} label={label} value={dados.equipamento[k]} onChange={(v) => atualizar({ ...dados, equipamento: { ...dados.equipamento, [k]: v } })} />)}</div></section>
            <section className="space-y-3"><h3 className="font-semibold">Recepção e problema</h3><div className="grid gap-3 sm:grid-cols-2">
              <Campo label="Recebido por" value={dados.recepcao.recebidoPor} onChange={(recebidoPor) => atualizar({ ...dados, recepcao: { ...dados.recepcao, recebidoPor } })} />
              <Campo label="Local físico" value={dados.recepcao.localFisico} onChange={(localFisico) => atualizar({ ...dados, recepcao: { ...dados.recepcao, localFisico } })} />
            </div><Label htmlFor="edicao-problema">Problema relatado</Label><Textarea id="edicao-problema" value={dados.problema} onChange={(e) => atualizar({ ...dados, problema: e.target.value })} /><Label htmlFor="edicao-observacao">Observações do cliente</Label><Textarea id="edicao-observacao" value={dados.observacaoCliente} onChange={(e) => atualizar({ ...dados, observacaoCliente: e.target.value })} /></section>
            <section className="space-y-3"><h3 className="font-semibold">Serviços, custo interno e preço de venda</h3>{dados.servicos.map((s, i) => <div key={s.id} className="space-y-2 border-b pb-3"><div className="grid gap-3 sm:grid-cols-3">
              <Campo label={`Serviço ${i + 1}`} value={s.descricao} onChange={(descricao) => atualizar({ ...dados, servicos: dados.servicos.map((l, j) => j === i ? { ...l, descricao } : l) })} />
              <Campo label={`Custo interno do serviço ${i + 1}`} type="number" value={s.custoV3 ?? 0} onChange={(v) => atualizar({ ...dados, servicos: dados.servicos.map((l, j) => j === i ? { ...l, custoV3: Number(v) } : l) })} />
              <Campo label={`Preço de venda do serviço ${i + 1}`} type="number" value={s.valor} onChange={(v) => atualizar({ ...dados, servicos: dados.servicos.map((l, j) => j === i ? { ...l, valor: Number(v) } : l) })} />
            </div><Button type="button" variant="ghost" onClick={() => atualizar({ ...dados, servicos: dados.servicos.filter((_, j) => j !== i) })}>Remover serviço {i + 1}</Button></div>)}<Button type="button" variant="outline" onClick={() => atualizar({ ...dados, servicos: [...dados.servicos, { id: crypto.randomUUID(), descricao: "", valor: 0, custoV3: 0 }] })}>Adicionar serviço</Button></section>
            <section className="space-y-3"><h3 className="font-semibold">Peças</h3><p className="text-xs text-muted-foreground">Itens já consumidos mantêm o vínculo e a quantidade física. Custo e preço podem ser corrigidos.</p>{dados.pecas.map((p, i) => <div key={p.id} className="space-y-2 border-b pb-3"><div className="grid gap-3 sm:grid-cols-2">
              <Campo label={`Peça ${i + 1}`} value={p.nome} onChange={(nome) => atualizar({ ...dados, pecas: dados.pecas.map((l, j) => j === i ? { ...l, nome } : l) })} />
              <Campo label={`Quantidade da peça ${i + 1}`} type="number" value={p.quantidade} onChange={(v) => atualizar({ ...dados, pecas: dados.pecas.map((l, j) => j === i ? { ...l, quantidade: Number(v) } : l) })} />
              <Campo label={`Custo unitário da peça ${i + 1}`} type="number" value={p.custoUnitario ?? 0} onChange={(v) => atualizar({ ...dados, pecas: dados.pecas.map((l, j) => j === i ? { ...l, custoUnitario: Number(v) } : l) })} />
              <Campo label={`Venda unitária da peça ${i + 1}`} type="number" value={p.valorUnitario} onChange={(v) => atualizar({ ...dados, pecas: dados.pecas.map((l, j) => j === i ? { ...l, valorUnitario: Number(v) } : l) })} />
            </div><Button type="button" variant="ghost" onClick={() => atualizar({ ...dados, pecas: dados.pecas.filter((_, j) => j !== i) })}>Remover peça {i + 1}</Button></div>)}<Button type="button" variant="outline" onClick={() => atualizar({ ...dados, pecas: [...dados.pecas, { id: crypto.randomUUID(), nome: "", quantidade: 1, valorUnitario: 0, custoUnitario: 0, produtoOrigem: "manual" }] })}>Adicionar peça manual</Button><Campo label="Desconto geral" type="number" value={dados.desconto} onChange={(v) => atualizar({ ...dados, desconto: Number(v) })} /><p className="text-lg font-semibold">Preço de venda total: {brl(totalEdicaoCompletaV3(dados))}</p></section>
            <section className="space-y-3"><h3 className="font-semibold">Pagamento</h3><p className="text-xs text-muted-foreground">A edição corrige condições pendentes. Recebimentos, quitações e estornos exigem ajuste no Financeiro.</p><div className="grid gap-3 sm:grid-cols-2">
              <Campo label="Vencimento da cobrança" type="date" value={dados.pagamento.vencimento} onChange={(vencimento) => atualizar({ ...dados, pagamento: { ...dados.pagamento, vencimento } })} />
              <Campo label="Forma de pagamento preferida" value={dados.pagamento.formaPreferida} onChange={(formaPreferida) => atualizar({ ...dados, pagamento: { ...dados.pagamento, formaPreferida } })} />
            </div></section>
            <section className="space-y-3"><h3 className="font-semibold">Garantia</h3>{dados.garantias.map((g, i) => <div key={g.linhaId} className="space-y-2 border-b pb-3"><p className="text-sm font-medium">{g.descricao}</p><Label htmlFor={`garantia-modelo-${i}`}>Modelo de garantia {i + 1}</Label><select id={`garantia-modelo-${i}`} className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={g.modeloId} onChange={(e) => { const m = GARANTIA_CATALOGO_V3.find((m) => m.id === e.target.value)!; atualizar({ ...dados, garantias: dados.garantias.map((l, j) => j === i ? { ...l, modeloId: m.id, prazoDias: m.prazoDiasPadrao, origem: "edicao" } : l) }); }}>{g.modeloId === "nao_definida" && <option value="nao_definida">Não definida</option>}{GARANTIA_CATALOGO_V3.map((m) => <option key={m.id} value={m.id}>{m.titulo}</option>)}</select><Campo label={`Prazo em dias da garantia ${i + 1}`} type="number" value={g.prazoDias} onChange={(v) => atualizar({ ...dados, garantias: dados.garantias.map((l, j) => j === i ? { ...l, prazoDias: Number(v), origem: "edicao" } : l) })} /><Label htmlFor={`garantia-termo-${i}`}>Termo complementar {i + 1}</Label><Textarea id={`garantia-termo-${i}`} value={g.termoCustom ?? ""} onChange={(e) => atualizar({ ...dados, garantias: dados.garantias.map((l, j) => j === i ? { ...l, termoCustom: e.target.value, origem: "edicao" } : l) })} /></div>)}{dados.servicos.filter((s) => !dados.garantias.some((g) => g.linhaId === s.id)).map((s) => <Button key={s.id} type="button" variant="outline" onClick={() => atualizar({ ...dados, garantias: [...dados.garantias, { linhaId: s.id, descricao: s.descricao || "Serviço", modeloId: "personalizado", prazoDias: 90, origem: "edicao" }] })}>Definir garantia: {s.descricao || "Serviço"}</Button>)}</section>
            <section className="space-y-2"><h3 className="font-semibold">Revisão</h3><Label htmlFor="edicao-motivo">Motivo obrigatório (mínimo de 10 caracteres)</Label><Textarea id="edicao-motivo" value={motivo} maxLength={500} onChange={(e) => { setMotivo(e.target.value); setPrevia(null); }} /></section>
          </fieldset>
          {previa && <section aria-label="Prévia das alterações" className="space-y-3 rounded-md border p-3"><h3 className="font-semibold">Confira antes de autorizar</h3><p>Total: {brl(previa.totalAnterior)} → {brl(previa.totalNovo)}</p>{previa.aditivo && <p className="text-sm">OS entregue: alterações relevantes geram aditivo e preservam os documentos anteriores.</p>}{previa.alteracoes.map((a) => <details key={a.campo}><summary className="cursor-pointer font-medium">{a.campo}</summary><div className="grid gap-2 text-xs sm:grid-cols-2"><pre className="whitespace-pre-wrap break-words rounded bg-muted p-2">Antes: {textoPrevia(a.antes)}</pre><pre className="whitespace-pre-wrap break-words rounded bg-muted p-2">Depois: {textoPrevia(a.depois)}</pre></div></details>)}<p className="text-sm">Motivo: {motivo}</p></section>}
          <div className="flex flex-wrap justify-end gap-2"><Button variant="outline" disabled={busy} onClick={onClose}>Cancelar</Button>{previa ? <><Button variant="outline" disabled={busy} onClick={() => { setPrevia(null); setRevisao(null); }}>Voltar à edição</Button><Button disabled={busy} onClick={() => setGate(true)}>Autorizar e salvar</Button></> : <Button disabled={busy || motivo.trim().length < 10} onClick={() => void revisar()}>{busy ? "Conferindo…" : "Revisar alterações"}</Button>}</div>
        </>}
      </DialogContent>
    </Dialog>
    <SupervisorGateDialog open={gate} onOpenChange={(v) => { if (!busy) setGate(v); }} title="Autorizar edição da OS" description={`OS ${codigo}. O PIN confirma somente esta revisão nesta loja.`} storeId={storeId} scope={previa?.scope} canSubmit={!busy} closeOnAuthorized={false} confirmLabel={busy ? "Salvando…" : "Confirmar edição"} onAuthorized={() => void salvar()}><p className="text-sm">{motivo}</p>{previa && <p className="text-sm">{brl(previa.totalAnterior)} → {brl(previa.totalNovo)} · {previa.alteracoes.map((a) => a.campo).join(", ")}</p>}</SupervisorGateDialog>
  </>;
}
