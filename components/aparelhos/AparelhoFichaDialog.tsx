"use client"

import { useCallback, useEffect, useState } from "react"
import { toast } from "sonner"
import { FileText, Loader2, Pencil, Printer, ShieldCheck, Wrench } from "lucide-react"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { APARELHO_STATUS_LABEL, transicoesManuais, type AparelhoStatus } from "@/lib/aparelhos/lifecycle"
import { acessoriosTexto, resumoChecklist, sanitizeAcessorios, sanitizeChecklist } from "@/lib/aparelhos/checklist"
import { dbToDateKey, formatDateKeyBr } from "@/lib/aparelhos/warranty"
import { abrirDocumento, apiAparelhos, type AparelhoPermissions, type Detalhe, type PoliticaAparelhos } from "./api"
import { ChecklistEditor, CondicaoPill, FieldLabel, ImeiStrip, StatusPill, brl, dataBr, dataHoraBr, inputCls, origemLabel } from "./parts"

const EVENTO_LABEL: Record<string, string> = {
  cadastro: "Cadastro", liberacao: "Liberado para venda", status: "Situação alterada", bloqueio: "Bloqueado",
  conferencia_restricao: "Conferência de restrição", edicao: "Dados editados", alteracao_preco: "Preço alterado",
  fotos: "Fotos adicionadas", reserva: "Reservado", reserva_cancelada: "Reserva cancelada", venda: "Vendido",
  aquisicao_confirmada: "Aquisição confirmada", aquisicao_recusada: "Aquisição recusada", reaquisicao: "Recomprado",
  venda_cancelada: "Venda cancelada",
}

function resumoEvento(tipo: string, dados: unknown): string {
  const d = (dados ?? {}) as Record<string, unknown>
  if (tipo === "venda") return `Venda ${d.pedidoId ?? ""} · garantia ${d.numeroGarantia ?? ""} até ${formatDateKeyBr(String(d.coberturaFim ?? ""))}`
  if (tipo === "conferencia_restricao") return `${d.resultado === "sem_restricao" ? "Sem restrição conhecida" : "Restrição registrada"} · ${d.fonte ?? ""}`
  if (tipo === "alteracao_preco") { const p = d.preco as { de?: number; para?: number } | undefined; return p ? `${brl(p.de)} → ${brl(p.para)}` : "" }
  if (typeof d.motivo === "string") return d.motivo
  if (typeof d.protocolo === "string") return `Protocolo ${d.protocolo}`
  if (typeof d.origem === "string") return origemLabel(d.origem)
  return ""
}

export function AparelhoFichaDialog({ open, onOpenChange, aparelhoId, storeId, perms, politica, onChanged, onEdit }: {
  open: boolean; onOpenChange: (v: boolean) => void; aparelhoId: string | null; storeId: string; perms: AparelhoPermissions; politica: PoliticaAparelhos
  onChanged: () => void; onEdit: (d: Detalhe) => void
}) {
  const [det, setDet] = useState<Detalhe | null>(null)
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [conf, setConf] = useState<{ resultado: "sem_restricao" | "restricao_conhecida"; fonte: string; observacao: string } | null>(null)
  const [mudanca, setMudanca] = useState<{ para: string; motivo: string } | null>(null)

  const load = useCallback(async () => {
    if (!aparelhoId) return
    setLoading(true)
    try { setDet(await apiAparelhos<Detalhe>(storeId, `/${aparelhoId}`)) } catch (e) { toast.error((e as Error).message) } finally { setLoading(false) }
  }, [aparelhoId, storeId])

  useEffect(() => { if (open) { setDet(null); setConf(null); setMudanca(null); void load() } }, [open, load])

  async function acao(body: Record<string, unknown>, sucesso: string) {
    if (!det) return
    setBusy(true)
    try {
      await apiAparelhos(storeId, `/${det.aparelho.id}/acao`, { method: "POST", body })
      toast.success(sucesso)
      setConf(null); setMudanca(null)
      await load(); onChanged()
    } catch (e) { toast.error((e as Error).message) } finally { setBusy(false) }
  }

  const a = det?.aparelho
  const checklist = a ? sanitizeChecklist(a.checklist) : {}
  const resumo = resumoChecklist(checklist)
  const vendavel = a?.status === "disponivel" || a?.status === "reservado"
  const podeLiberar = a && perms.alterarStatus && ["aguardando_conferencia", "em_avaliacao", "em_revisao", "devolvido"].includes(a.status) && a.propriedade === "loja"
  const transicoes = a ? transicoesManuais(a.status).filter((s) => s !== "disponivel") : []

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[92vh] w-[calc(100vw-2rem)] max-w-4xl flex-col gap-0! p-0! sm:max-w-4xl">
        <DialogHeader className="border-b border-border px-5 py-4 text-left">
          <DialogTitle className="flex min-w-0 flex-wrap items-center gap-2">
            {a ? <>{[a.marca, a.modelo, a.variante].filter(Boolean).join(" ")}<span className="font-mono text-sm font-normal text-muted-foreground">{a.codigoInterno}</span></> : "Aparelho"}
          </DialogTitle>
          <DialogDescription>{a ? [a.armazenamento, a.memoriaRam && `${a.memoriaRam} RAM`, a.cor].filter(Boolean).join(" · ") || "—" : "Carregando ficha…"}</DialogDescription>
        </DialogHeader>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
          {loading && !det && <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Carregando…</div>}
          {a && det && (
            <div className="grid min-w-0 grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,18rem)]">
              <div className="min-w-0 space-y-6">
                <section className="min-w-0 space-y-2 rounded-xl border border-border p-4">
                  <div className="flex min-w-0 flex-wrap items-center gap-2"><StatusPill status={a.status} /><CondicaoPill condicao={a.condicao} /><span className="text-xs text-muted-foreground">{origemLabel(a.origem)}</span></div>
                  <ImeiStrip imei={a.imei1} label="IMEI 1" masked={a.identificadoresMascarados} />
                  <ImeiStrip imei={a.imei2} label="IMEI 2" masked={a.identificadoresMascarados} />
                  {a.serial && <div className="flex gap-2 text-sm"><span className="text-xs text-muted-foreground">Série</span><span className="font-mono">{a.serial}</span></div>}
                  <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 pt-1 text-xs">
                    <ShieldCheck aria-hidden className={cn("h-4 w-4", a.restricaoStatus === "conferido_sem_restricao" ? "text-[color:var(--success)]" : a.restricaoStatus === "restricao_conhecida" ? "text-destructive" : "text-muted-foreground")} />
                    <span className="text-foreground">{a.restricaoStatus === "conferido_sem_restricao" ? "Restrição conferida — nenhuma conhecida" : a.restricaoStatus === "restricao_conhecida" ? "Restrição registrada — revenda bloqueada" : "Restrição de IMEI ainda não conferida"}</span>
                    {a.restricaoFonte && <span className="text-muted-foreground">· {a.restricaoFonte} · {dataHoraBr(a.restricaoConferidaEm)}</span>}
                  </div>
                </section>

                <section className="min-w-0 space-y-2">
                  <div className="flex min-w-0 flex-wrap items-baseline justify-between gap-2">
                    <h3 className="text-sm font-semibold text-foreground">Conferência</h3>
                    <p className="text-xs text-muted-foreground">{resumo.aprovados} aprovados · {resumo.falhas} com falha · {resumo.naoTestados} não testados</p>
                  </div>
                  <ChecklistEditor value={checklist} readOnly />
                  <dl className="grid grid-cols-1 gap-x-4 gap-y-1 text-sm sm:grid-cols-2">
                    <div className="min-w-0"><dt className="inline text-muted-foreground">Bateria: </dt><dd className="inline">{a.bateriaSaude !== null ? `${a.bateriaSaude}% (${a.bateriaFonte})` : "não informada"}</dd></div>
                    <div className="min-w-0"><dt className="inline text-muted-foreground">Acessórios: </dt><dd className="inline">{acessoriosTexto(sanitizeAcessorios(a.acessorios))}</dd></div>
                    {a.estadoFisico && <div className="min-w-0 sm:col-span-2"><dt className="inline text-muted-foreground">Estado: </dt><dd className="inline">{a.estadoFisico}</dd></div>}
                    {a.observacoes && <div className="min-w-0 sm:col-span-2"><dt className="inline text-muted-foreground">Observações: </dt><dd className="inline">{a.observacoes}</dd></div>}
                  </dl>
                </section>

                {det.fotos.length > 0 && (
                  <section className="min-w-0 space-y-2">
                    <h3 className="text-sm font-semibold text-foreground">Fotos</h3>
                    <div className="flex flex-wrap gap-2">{det.fotos.map((f, i) => (
                      // eslint-disable-next-line @next/next/no-img-element
                      <a key={f.id} href={f.dataUrl} target="_blank" rel="noreferrer" className="block h-24 w-24 overflow-hidden rounded-lg border border-border"><img src={f.dataUrl} alt={f.legenda || `Foto ${i + 1}`} className="h-full w-full object-cover" /></a>
                    ))}</div>
                  </section>
                )}

                <section className="min-w-0 space-y-2">
                  <h3 className="text-sm font-semibold text-foreground">Linha do tempo</h3>
                  <ol className="relative min-w-0 space-y-3 border-l border-border pl-4">
                    {det.eventos.map((e) => (
                      <li key={e.id} className="relative min-w-0">
                        <span aria-hidden className={cn("absolute -left-[1.3rem] top-1.5 h-2.5 w-2.5 rounded-full border-2 border-background", e.tipo === "venda" ? "bg-primary" : e.tipo === "bloqueio" || e.tipo === "aquisicao_recusada" ? "bg-destructive" : "bg-muted-foreground")} />
                        <p className="text-sm font-medium text-foreground">{EVENTO_LABEL[e.tipo] ?? e.tipo}{e.paraStatus && e.deStatus !== e.paraStatus ? <span className="font-normal text-muted-foreground"> → {APARELHO_STATUS_LABEL[e.paraStatus as AparelhoStatus] ?? e.paraStatus}</span> : null}</p>
                        <p className="min-w-0 truncate text-xs text-muted-foreground">{dataHoraBr(e.createdAt)} · {e.operador || "sistema"}{resumoEvento(e.tipo, e.dados) ? ` · ${resumoEvento(e.tipo, e.dados)}` : ""}</p>
                      </li>
                    ))}
                  </ol>
                </section>
              </div>

              <aside className="min-w-0 space-y-4">
                <section className="min-w-0 space-y-1 rounded-xl border border-border p-4 text-sm">
                  <div className="flex justify-between gap-2"><span className="text-muted-foreground">Preço de venda</span><b className="text-foreground">{brl(a.precoVenda)}</b></div>
                  {perms.verCusto && <div className="flex justify-between gap-2"><span className="text-muted-foreground">Custo total</span><span>{brl(a.custoTotal)}</span></div>}
                  {perms.verCusto && a.custoTotal !== null && a.precoVenda > 0 && <div className="flex justify-between gap-2"><span className="text-muted-foreground">Margem prevista</span><span>{brl(a.precoVenda - a.custoTotal)}</span></div>}
                  <div className="flex justify-between gap-2"><span className="text-muted-foreground">Garantia sugerida</span><span>+{a.garantiaContratualDias} dias</span></div>
                  <div className="flex justify-between gap-2"><span className="text-muted-foreground">Entrada no estoque</span><span>{dataBr(a.entradaEstoqueEm)}</span></div>
                </section>

                <section className="min-w-0 space-y-2">
                  {perms.editar && !["vendido", "baixado"].includes(a.status) && <Button variant="outline" className="w-full justify-start" onClick={() => onEdit(det)}><Pencil className="mr-2 h-4 w-4" />Editar dados</Button>}
                  {(perms.cadastrar || perms.alterarStatus) && !["vendido", "baixado"].includes(a.status) && !conf && (
                    <Button variant="outline" className="w-full justify-start" onClick={() => setConf({ resultado: "sem_restricao", fonte: "", observacao: "" })}><ShieldCheck className="mr-2 h-4 w-4" />Registrar conferência de IMEI</Button>
                  )}
                  {conf && (
                    <div className="min-w-0 space-y-2 rounded-xl border border-border p-3">
                      <fieldset className="space-y-1.5"><legend className="text-xs font-medium">Resultado</legend>
                        {(["sem_restricao", "restricao_conhecida"] as const).map((r) => (
                          <label key={r} className="flex items-center gap-2 text-sm"><input type="radio" name="conf-res" className="accent-primary" checked={conf.resultado === r} onChange={() => setConf({ ...conf, resultado: r })} />{r === "sem_restricao" ? "Nenhuma restrição encontrada" : "Restrição encontrada (bloqueia)"}</label>
                        ))}
                      </fieldset>
                      <FieldLabel htmlFor="conf-fonte" required>Fonte consultada</FieldLabel>
                      <input id="conf-fonte" className={inputCls} value={conf.fonte} onChange={(e) => setConf({ ...conf, fonte: e.target.value })} placeholder="Portal oficial, operadora…" />
                      <div className="flex gap-2"><Button size="sm" variant="ghost" onClick={() => setConf(null)}>Cancelar</Button><Button size="sm" disabled={busy || !conf.fonte.trim()} onClick={() => void acao({ acao: "conferencia", ...conf }, "Conferência registrada.")}>Registrar</Button></div>
                    </div>
                  )}
                  {podeLiberar && <Button className="w-full justify-start" disabled={busy} onClick={() => void acao({ acao: "liberar" }, "Aparelho disponível para venda.")}>{busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ShieldCheck className="mr-2 h-4 w-4" />}Liberar para venda</Button>}
                  {!perms.alterarStatus && ["aguardando_conferencia", "em_avaliacao"].includes(a.status) && <p className="rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">A liberação para venda é feita por um gerente ou pelo proprietário.</p>}
                  {a.propriedade !== "loja" && <p className="rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">Aquisição aguardando aprovação: não entra no estoque comercial até ser confirmada.</p>}
                  {perms.alterarStatus && transicoes.length > 0 && !mudanca && (
                    <Button variant="outline" className="w-full justify-start" onClick={() => setMudanca({ para: transicoes[0]!, motivo: "" })}><Wrench className="mr-2 h-4 w-4" />Mudar situação</Button>
                  )}
                  {mudanca && (
                    <div className="min-w-0 space-y-2 rounded-xl border border-border p-3">
                      <FieldLabel htmlFor="mud-para">Nova situação</FieldLabel>
                      <select id="mud-para" className={inputCls} value={mudanca.para} onChange={(e) => setMudanca({ ...mudanca, para: e.target.value })}>
                        {transicoes.map((s) => <option key={s} value={s}>{APARELHO_STATUS_LABEL[s]}</option>)}
                      </select>
                      <FieldLabel htmlFor="mud-motivo" required>Motivo</FieldLabel>
                      <input id="mud-motivo" className={inputCls} value={mudanca.motivo} onChange={(e) => setMudanca({ ...mudanca, motivo: e.target.value })} />
                      <div className="flex gap-2"><Button size="sm" variant="ghost" onClick={() => setMudanca(null)}>Cancelar</Button><Button size="sm" disabled={busy || !mudanca.motivo.trim()} onClick={() => void acao({ acao: "status", ...mudanca }, "Situação atualizada.")}>Confirmar</Button></div>
                    </div>
                  )}
                  {vendavel && <p className="text-xs text-muted-foreground">Venda pelo PDV ou pela Venda Completa — a unidade é escolhida pelo IMEI.</p>}
                </section>

                {det.vendas.length > 0 && (
                  <section className="min-w-0 space-y-2">
                    <h3 className="text-sm font-semibold text-foreground">Vendas e garantias</h3>
                    {det.vendas.map((v) => (
                      <div key={v.id} className="min-w-0 space-y-1 rounded-xl border border-border p-3 text-sm">
                        <p className="font-medium">{v.numeroGarantia} <span className="font-normal text-muted-foreground">· {v.pedidoId}</span></p>
                        <p className="text-xs text-muted-foreground">{v.cliente} · entrega {formatDateKeyBr(dbToDateKey(v.dataEntrega))} · cobertura até {formatDateKeyBr(dbToDateKey(v.coberturaFim))}</p>
                        {perms.reimprimir && <div className="flex flex-wrap gap-1.5 pt-1">
                          <Button size="sm" variant="outline" onClick={() => abrirDocumento(storeId, { tipo: "termo_garantia", formato: "a4", aparelhoVendaId: v.id }).catch((e) => toast.error(e.message))}><Printer className="mr-1.5 h-3.5 w-3.5" />Termo A4</Button>
                          <Button size="sm" variant="outline" onClick={() => abrirDocumento(storeId, { tipo: "comprovante_venda", formato: "80mm", aparelhoVendaId: v.id }).catch((e) => toast.error(e.message))}><Printer className="mr-1.5 h-3.5 w-3.5" />80 mm</Button>
                        </div>}
                      </div>
                    ))}
                  </section>
                )}

                {det.aquisicao && (
                  <section className="min-w-0 space-y-1 rounded-xl border border-border p-3 text-sm">
                    <h3 className="text-sm font-semibold text-foreground">Aquisição {det.aquisicao.protocolo}</h3>
                    <p className="text-xs text-muted-foreground">{det.aquisicao.vendedorNome || det.aquisicao.fornecedor} {det.aquisicao.vendedorDocMascarado && `· ${det.aquisicao.vendedorDocMascarado}`} · {det.aquisicao.status}</p>
                    {(perms.comprarDeCliente || perms.aprovarAquisicao) && <Button size="sm" variant="outline" onClick={() => abrirDocumento(storeId, { tipo: "protocolo_aquisicao", formato: "a4", aquisicaoId: det.aquisicao!.id }).catch((e) => toast.error(e.message))}><FileText className="mr-1.5 h-3.5 w-3.5" />Protocolo</Button>}
                  </section>
                )}

                {det.ordensServico.length > 0 && (
                  <section className="min-w-0 space-y-1 rounded-xl border border-border p-3 text-sm">
                    <h3 className="text-sm font-semibold text-foreground">Ordens de serviço com este IMEI</h3>
                    <ul className="text-xs text-muted-foreground">{det.ordensServico.map((o) => <li key={o.id}>{o.numero ?? o.id} · {dataBr(o.createdAt)}</li>)}</ul>
                    <p className="text-xs text-muted-foreground">Referência apenas: aparelho de cliente em assistência não entra no estoque.</p>
                  </section>
                )}
                <p className="text-xs text-muted-foreground">Política de garantia {politica.versao ? `versão ${politica.versao}` : "padrão"}.</p>
              </aside>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
