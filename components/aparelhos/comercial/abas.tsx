"use client"

import { useState } from "react"
import { toast } from "sonner"
import { ExternalLink, Loader2, ShieldCheck } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { APARELHO_STATUS_LABEL, type AparelhoStatus } from "@/lib/aparelhos/lifecycle"
import {
  CONFERENCIAS_SEGURANCA, CONFERENCIA_VALORES, CONSULTA_IMEI_OFICIAL, FINALIDADES, FINALIDADE_LABEL, FUNCIONAMENTO, FUNCIONAMENTO_LABEL,
  UNIDADE_CATEGORIAS, UNIDADE_CATEGORIA_LABEL, sanitizeConferencias, type EtapaPreparacao,
} from "@/lib/comercial/custos/contracts"
import { formatCentavos } from "@/lib/comercial/custos/money"
import { brl, CondicaoPill, dataBr, dataHoraBr, EmptyState, FieldLabel, ImeiStrip, inputCls, origemLabel, Pill, StatusPill } from "../parts"
import type { AparelhoPermissions } from "../api"
import { apiComercial, type ConferenciaValor, type Prontuario } from "./api"
import {
  ACAO_ETAPA_LABEL, CONFERENCIA_VALOR_LABEL, EVENTO_COMERCIAL_LABEL, PROXIMAS_ETAPAS, etapaLabel, resumoEventoComercial,
} from "./labels"

type TabProps = { storeId: string; data: Prontuario; perms: AparelhoPermissions; onChanged: () => void }

const textareaCls = cn(inputCls, "h-auto py-2")

/* ───── Identificação ───── */
export function IdentificacaoTab({ storeId, data, perms, onChanged }: TabProps) {
  const a = data.aparelho
  const p = data.perfil
  const [form, setForm] = useState({ categoria: p.categoria, funcionamento: p.funcionamento, finalidade: p.finalidade, classeEstetica: p.classeEstetica ?? "", defeitos: p.defeitos ?? "" })
  const [pending, setPending] = useState(false)
  const alterados = (Object.keys(form) as Array<keyof typeof form>).filter((k) => form[k] !== ((p as Record<string, unknown>)[k] ?? ""))
  const podeEditar = perms.editar

  async function salvar() {
    if (pending || alterados.length === 0) return
    setPending(true)
    try {
      const body: Record<string, unknown> = { version: p.version }
      for (const k of alterados) body[k] = form[k]
      await apiComercial(storeId, `/aparelhos/${a.id}/prontuario`, { method: "PATCH", body })
      toast.success("Prontuário atualizado.")
      onChanged()
    } catch (e) { toast.error((e as Error).message) } finally { setPending(false) }
  }

  return (
    <div className="min-w-0 space-y-4">
      <section className="min-w-0 space-y-2 rounded-xl border border-border p-4">
        <div className="flex min-w-0 flex-wrap items-center gap-2"><StatusPill status={a.status} /><CondicaoPill condicao={a.condicao} /><span className="text-xs text-muted-foreground">{origemLabel(a.origem)}</span></div>
        <dl className="grid min-w-0 grid-cols-1 gap-x-4 gap-y-1 text-sm sm:grid-cols-2">
          <div className="min-w-0"><dt className="inline text-muted-foreground">Código: </dt><dd className="inline font-mono">{a.codigoInterno}</dd></div>
          <div className="min-w-0"><dt className="inline text-muted-foreground">Modelo: </dt><dd className="inline">{[a.marca, a.modelo, a.variante].filter(Boolean).join(" ")}</dd></div>
          <div className="min-w-0"><dt className="inline text-muted-foreground">Configuração: </dt><dd className="inline">{[a.armazenamento, a.memoriaRam && `${a.memoriaRam} RAM`, a.cor].filter(Boolean).join(" · ") || "—"}</dd></div>
          <div className="min-w-0"><dt className="inline text-muted-foreground">Entrada no estoque: </dt><dd className="inline">{dataBr(a.entradaEstoqueEm)}</dd></div>
          <div className="min-w-0"><dt className="inline text-muted-foreground">Propriedade: </dt><dd className="inline">{a.propriedade === "loja" ? "Da loja" : "Aquisição pendente"}</dd></div>
          <div className="min-w-0"><dt className="inline text-muted-foreground">Etapa: </dt><dd className="inline">{etapaLabel(p.etapaPreparacao)}</dd></div>
        </dl>
        <ImeiStrip imei={a.imei1} label="IMEI 1" masked={a.identificadoresMascarados} />
        <ImeiStrip imei={a.imei2} label="IMEI 2" masked={a.identificadoresMascarados} />
        {a.serial && <div className="flex min-w-0 gap-2 text-sm"><span className="shrink-0 text-xs text-muted-foreground">Série</span><span className="min-w-0 truncate font-mono">{a.serial}</span></div>}
      </section>

      <section className="min-w-0 space-y-3">
        <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="min-w-0 space-y-1.5">
            <FieldLabel htmlFor="pi-categoria">Categoria</FieldLabel>
            <select id="pi-categoria" className={inputCls} disabled={!podeEditar} value={form.categoria} onChange={(e) => setForm({ ...form, categoria: e.target.value })}>
              {UNIDADE_CATEGORIAS.map((c) => <option key={c} value={c}>{UNIDADE_CATEGORIA_LABEL[c]}</option>)}
            </select>
          </div>
          <div className="min-w-0 space-y-1.5">
            <FieldLabel htmlFor="pi-funcionamento">Funcionamento</FieldLabel>
            <select id="pi-funcionamento" className={inputCls} disabled={!podeEditar} value={form.funcionamento} onChange={(e) => setForm({ ...form, funcionamento: e.target.value })}>
              {FUNCIONAMENTO.map((f) => <option key={f} value={f}>{FUNCIONAMENTO_LABEL[f]}</option>)}
            </select>
          </div>
          <div className="min-w-0 space-y-1.5">
            <FieldLabel htmlFor="pi-finalidade">Finalidade</FieldLabel>
            <select id="pi-finalidade" className={inputCls} disabled={!podeEditar} value={form.finalidade} onChange={(e) => setForm({ ...form, finalidade: e.target.value })}>
              {FINALIDADES.map((f) => <option key={f} value={f}>{FINALIDADE_LABEL[f]}</option>)}
            </select>
          </div>
        </div>
        <div className="min-w-0 space-y-1.5 sm:max-w-xs">
          <FieldLabel htmlFor="pi-classe">Classe estética</FieldLabel>
          <input id="pi-classe" className={inputCls} disabled={!podeEditar} maxLength={20} value={form.classeEstetica} onChange={(e) => setForm({ ...form, classeEstetica: e.target.value })} placeholder="Ex.: A, B, C" />
        </div>
        <div className="min-w-0 space-y-1.5">
          <FieldLabel htmlFor="pi-defeitos">Defeitos / avarias</FieldLabel>
          <textarea id="pi-defeitos" rows={3} className={textareaCls} disabled={!podeEditar} maxLength={2000} value={form.defeitos} onChange={(e) => setForm({ ...form, defeitos: e.target.value })} />
        </div>
        {podeEditar ? (
          <div className="flex justify-end">
            <Button disabled={pending || alterados.length === 0} onClick={() => void salvar()}>{pending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Salvar identificação</Button>
          </div>
        ) : <p className="text-xs text-muted-foreground">Somente leitura para o seu perfil.</p>}
      </section>
    </div>
  )
}

/* ───── Preparação ───── */
export function PreparacaoTab({ storeId, data, perms, onChanged }: TabProps) {
  const a = data.aparelho
  const atual = (data.perfil.etapaPreparacao || "nenhuma") as EtapaPreparacao
  const proximas = PROXIMAS_ETAPAS[atual] ?? []
  const [observacao, setObservacao] = useState("")
  const [pending, setPending] = useState<string | null>(null)
  const impedimento = !perms.editar ? "Sem permissão para preparar unidades."
    : ["vendido", "baixado", "reservado"].includes(a.status) ? "Unidade vendida, baixada ou reservada não entra em preparação."
    : a.propriedade !== "loja" ? "Confirme a aquisição antes de preparar a unidade." : null

  async function mover(etapa: Exclude<EtapaPreparacao, "nenhuma">) {
    if (pending) return
    setPending(etapa)
    try {
      await apiComercial(storeId, `/aparelhos/${a.id}/preparacao`, { method: "POST", body: { etapa, ...(observacao.trim() ? { observacao: observacao.trim() } : {}) } })
      toast.success(etapa === "concluida" ? "Preparação concluída: a unidade voltou para avaliação." : `Etapa: ${etapaLabel(etapa)}.`)
      setObservacao("")
      onChanged()
    } catch (e) { toast.error((e as Error).message) } finally { setPending(null) }
  }

  return (
    <div className="min-w-0 space-y-4">
      <section className="min-w-0 space-y-1 rounded-xl border border-border p-4 text-sm">
        <p className="text-xs text-muted-foreground">Etapa atual</p>
        <p data-testid="etapa-atual" className="text-base font-semibold text-foreground">{etapaLabel(atual)}</p>
        <p className="text-xs text-muted-foreground">Situação no estoque: {APARELHO_STATUS_LABEL[a.status as AparelhoStatus] ?? a.status}</p>
      </section>
      <p className="rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">
        Durante a preparação a unidade fica fora do estoque vendável. &quot;Concluir preparação&quot; devolve a unidade para avaliação:
        a liberação para venda e o preço continuam com o gerente, na ficha do aparelho.
        {a.status === "disponivel" && !perms.alterarStatus ? " Retirar da venda uma unidade disponível é feito por gerente ou proprietário." : ""}
      </p>
      {impedimento ? <p className="text-xs text-muted-foreground">{impedimento}</p> : (
        <div className="min-w-0 space-y-3">
          <div className="min-w-0 space-y-1.5">
            <FieldLabel htmlFor="pp-obs">Observação</FieldLabel>
            <textarea id="pp-obs" rows={2} className={textareaCls} maxLength={500} value={observacao} onChange={(e) => setObservacao(e.target.value)} placeholder="Ex.: troca de tela e bateria" />
          </div>
          <div className="flex min-w-0 flex-wrap gap-2">
            {proximas.map((e) => (
              <Button key={e} variant={e === "concluida" ? "default" : "outline"} disabled={!!pending} onClick={() => void mover(e)}>
                {pending === e && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{ACAO_ETAPA_LABEL[e]}
              </Button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

/* ───── Segurança ───── */
export function SegurancaTab({ storeId, data, perms, onChanged }: TabProps) {
  const a = data.aparelho
  const inicial = sanitizeConferencias(data.perfil.conferencias)
  const [conf, setConf] = useState<Record<string, ConferenciaValor>>(() => {
    const out: Record<string, ConferenciaValor> = {}
    for (const { key } of CONFERENCIAS_SEGURANCA) out[key] = inicial[key] ?? "NAO_TESTADO"
    return out
  })
  const [pending, setPending] = useState(false)
  const mudou = CONFERENCIAS_SEGURANCA.some(({ key }) => conf[key] !== (inicial[key] ?? "NAO_TESTADO"))

  async function salvar() {
    if (pending) return
    setPending(true)
    try {
      await apiComercial(storeId, `/aparelhos/${a.id}/prontuario`, { method: "PATCH", body: { version: data.perfil.version, conferencias: conf } })
      toast.success("Conferências registradas.")
      onChanged()
    } catch (e) { toast.error((e as Error).message) } finally { setPending(false) }
  }

  return (
    <div className="min-w-0 space-y-4">
      <ul className="min-w-0 space-y-2">
        {CONFERENCIAS_SEGURANCA.map(({ key, label }) => (
          <li key={key} className="flex min-w-0 flex-col gap-1.5 rounded-lg border border-border px-3 py-2 sm:flex-row sm:items-center sm:justify-between">
            <label htmlFor={`ps-${key}`} className="min-w-0 text-sm text-foreground">{label}</label>
            <select id={`ps-${key}`} className={cn(inputCls, "sm:w-44")} disabled={!perms.editar} value={conf[key]} onChange={(e) => setConf({ ...conf, [key]: e.target.value as ConferenciaValor })}>
              {CONFERENCIA_VALORES.map((v) => <option key={v} value={v}>{CONFERENCIA_VALOR_LABEL[v]}</option>)}
            </select>
          </li>
        ))}
      </ul>
      {perms.editar && (
        <div className="flex justify-end"><Button disabled={pending || !mudou} onClick={() => void salvar()}>{pending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Salvar conferências</Button></div>
      )}

      <section className="min-w-0 space-y-2 rounded-xl border border-border p-4 text-sm">
        <h4 className="flex items-center gap-2 font-semibold text-foreground"><ShieldCheck aria-hidden className="h-4 w-4" />Restrição de IMEI</h4>
        <p className="text-xs text-muted-foreground">
          Situação registrada na ficha: {a.restricaoStatus === "conferido_sem_restricao" ? "conferida, nenhuma restrição conhecida" : a.restricaoStatus === "restricao_conhecida" ? "restrição registrada (revenda bloqueada)" : "ainda não conferida"}.
        </p>
        <p className="text-xs text-muted-foreground">
          A consulta é manual: o sistema não verifica o IMEI automaticamente. Consulte o portal oficial e registre o resultado em
          &quot;Registrar conferência de IMEI&quot; na ficha do aparelho.
        </p>
        <a href={CONSULTA_IMEI_OFICIAL.url} target="_blank" rel="noopener noreferrer"
          className="inline-flex min-w-0 items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm font-medium text-foreground hover:bg-accent">
          <ExternalLink aria-hidden className="h-4 w-4 shrink-0" /><span className="min-w-0 truncate">{CONSULTA_IMEI_OFICIAL.label}</span>
        </a>
      </section>
    </div>
  )
}

/* ───── Precificação ───── */
export function PrecificacaoTab({ data, taxa, margem, onTaxa, onMargem, onRecalcular, recalculando }: {
  data: Prontuario; taxa: string; margem: string; onTaxa: (v: string) => void; onMargem: (v: string) => void; onRecalcular: () => void; recalculando: boolean
}) {
  const ind = data.indicadores
  if (!ind) return <p className="rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">Indicadores de preço ocultos para o seu perfil (sem acesso a custo).</p>
  const linha = (label: string, valor: number | null, extra?: string) => (
    <div className="flex min-w-0 items-center justify-between gap-3 py-1.5">
      <span className="min-w-0 text-muted-foreground">{label}</span>
      <span className="shrink-0 text-right tabular-nums text-foreground">{valor == null ? <Pill tone="warning">Não calculado</Pill> : <>{formatCentavos(valor)}{extra ? <span className="ml-1 text-xs text-muted-foreground">{extra}</span> : null}</>}</span>
    </div>
  )
  return (
    <div className="min-w-0 space-y-4">
      <form className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-end" onSubmit={(e) => { e.preventDefault(); onRecalcular() }}>
        <div className="min-w-0 space-y-1.5">
          <FieldLabel htmlFor="pr-taxa">Taxas conhecidas sobre o preço (%)</FieldLabel>
          <input id="pr-taxa" inputMode="decimal" className={inputCls} value={taxa} onChange={(e) => onTaxa(e.target.value)} placeholder="Ex.: 3,5 (cartão)" />
        </div>
        <div className="min-w-0 space-y-1.5">
          <FieldLabel htmlFor="pr-margem">Margem alvo sobre o custo (%)</FieldLabel>
          <input id="pr-margem" inputMode="decimal" className={inputCls} value={margem} onChange={(e) => onMargem(e.target.value)} placeholder="Ex.: 30" />
        </div>
        <Button type="submit" variant="outline" disabled={recalculando}>{recalculando && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Recalcular</Button>
      </form>
      <section aria-label="Indicadores de preço" className="min-w-0 divide-y divide-border rounded-xl border border-border px-4 py-2 text-sm">
        {linha("Preço de venda atual", ind.precoVendaCentavos)}
        {linha("Custo total", ind.custoTotalCentavos)}
        {linha("Margem bruta", ind.margemBrutaCentavos, ind.margemBrutaPercent != null ? `(${ind.margemBrutaPercent.toLocaleString("pt-BR")}%)` : undefined)}
        {linha("Margem de contribuição estimada", ind.margemContribuicaoCentavos)}
        {linha("Preço mínimo gerencial", ind.precoMinimoCentavos)}
        {linha("Preço sugerido", ind.precoSugeridoCentavos)}
      </section>
      {ind.avisos.length > 0 && (
        <ul className="min-w-0 space-y-1 text-xs text-muted-foreground">{ind.avisos.map((av) => <li key={av} className="min-w-0">• {av}</li>)}</ul>
      )}
      <p className="text-xs text-muted-foreground">Indicadores gerenciais: não alteram o preço. O preço de venda é definido pelo gerente na ficha do aparelho.</p>
    </div>
  )
}

/* ───── Histórico ───── */
export function HistoricoTab({ data }: { data: Prontuario }) {
  return (
    <div className="min-w-0 space-y-4">
      {data.eventos.length === 0 ? <EmptyState icon={<ShieldCheck className="h-4 w-4" />} title="Sem eventos registrados" /> : (
        <ol className="relative min-w-0 space-y-3 border-l border-border pl-4">
          {data.eventos.map((e) => {
            const resumo = resumoEventoComercial(e.tipo, e.dados)
            return (
              <li key={e.id} className="relative min-w-0">
                <span aria-hidden className={cn("absolute -left-[1.3rem] top-1.5 h-2.5 w-2.5 rounded-full border-2 border-background", e.tipo === "custo_estornado" || e.tipo === "bloqueio" ? "bg-destructive" : e.tipo.startsWith("custo") || e.tipo.startsWith("preparacao") ? "bg-primary" : "bg-muted-foreground")} />
                <p className="text-sm font-medium text-foreground">
                  {EVENTO_COMERCIAL_LABEL[e.tipo] ?? e.tipo}
                  {e.paraStatus && e.deStatus !== e.paraStatus ? <span className="font-normal text-muted-foreground"> → {APARELHO_STATUS_LABEL[e.paraStatus as AparelhoStatus] ?? e.paraStatus}</span> : null}
                </p>
                <p className="min-w-0 break-words text-xs text-muted-foreground">{dataHoraBr(e.createdAt)} · {e.operador || "sistema"}{resumo ? ` · ${resumo}` : ""}</p>
              </li>
            )
          })}
        </ol>
      )}
      {data.vendas.length > 0 && (
        <section className="min-w-0 space-y-2">
          <h4 className="text-sm font-semibold text-foreground">Vendas</h4>
          {data.vendas.map((v) => (
            <div key={v.id} className="min-w-0 rounded-xl border border-border p-3 text-sm">
              <p className="min-w-0 truncate font-medium">{v.numeroGarantia || v.pedidoId} <span className="font-normal text-muted-foreground">· {v.pedidoId} · {v.status}</span></p>
              <p className="text-xs text-muted-foreground">{dataBr(v.dataVenda)} · {brl(v.precoVenda)}</p>
            </div>
          ))}
        </section>
      )}
    </div>
  )
}
