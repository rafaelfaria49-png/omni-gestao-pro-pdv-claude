"use client"

import { useState } from "react"
import { toast } from "sonner"
import { Loader2, Receipt, Undo2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { CUSTO_STATUS, type CustoStatus } from "@/lib/comercial/custos/contracts"
import type { ComponenteCusto, ComposicaoCusto } from "@/lib/comercial/custos/composicao"
import { formatCentavos } from "@/lib/comercial/custos/money"
import { dataHoraBr, EmptyState, FieldLabel, inputCls, Pill } from "../parts"
import type { AparelhoPermissions } from "../api"
import { apiComercial, type LancamentoCusto, type Prontuario } from "./api"
import { AdicionarCustoForm } from "./AdicionarCustoForm"
import { categoriaCustoLabel, origemCustoLabel, statusCustoLabel } from "./labels"

/** Valor honesto: desconhecido nunca vira R$ 0,00; estimado leva selo. */
export function ValorCusto({ valorCentavos, custoStatus }: { valorCentavos: number | null; custoStatus: string }) {
  if (custoStatus === "desconhecido" || valorCentavos == null) return <Pill tone="warning">Desconhecido</Pill>
  return (
    <span className="inline-flex min-w-0 flex-wrap items-center justify-end gap-1.5">
      <span className="tabular-nums text-foreground">{formatCentavos(valorCentavos)}</span>
      {custoStatus === "estimado" && <Pill tone="info">Estimado</Pill>}
    </span>
  )
}

function rotuloComponente(c: ComponenteCusto): string {
  if (c.tipo !== "lancamento") return c.tipo === "aquisicao" ? "Aquisição" : "Cadastro legado"
  return [c.origem ? origemCustoLabel(c.origem) : "", c.categoria ? categoriaCustoLabel(c.categoria) : ""].filter(Boolean).join(" · ")
}

export function ComposicaoCard({ composicao }: { composicao: ComposicaoCusto }) {
  return (
    <section aria-label="Composição do custo" className="min-w-0 space-y-2 rounded-xl border border-border p-4">
      <h4 className="text-sm font-semibold text-foreground">Composição do custo</h4>
      <ul className="min-w-0 divide-y divide-border">
        {composicao.componentes.map((c, i) => (
          <li key={c.lancamentoId ?? `${c.tipo}-${i}`} className="flex min-w-0 items-start justify-between gap-3 py-2 text-sm">
            <div className="min-w-0">
              <p className="min-w-0 truncate text-foreground">{c.descricao}</p>
              <p className="min-w-0 truncate text-xs text-muted-foreground">{rotuloComponente(c)}</p>
            </div>
            <div className="shrink-0 text-right"><ValorCusto valorCentavos={c.valorCentavos} custoStatus={c.custoStatus} /></div>
          </li>
        ))}
      </ul>
      <div data-testid="custo-total" className="flex min-w-0 flex-wrap items-center justify-between gap-2 border-t border-border pt-2 text-sm">
        <span className="font-semibold text-foreground">Custo total</span>
        {composicao.completo ? (
          <span className="inline-flex items-center gap-1.5">
            <b className="tabular-nums text-foreground">{formatCentavos(composicao.totalCentavos)}</b>
            {composicao.estimado && <Pill tone="info">Estimado</Pill>}
          </span>
        ) : (
          <Pill tone="warning">Incompleto</Pill>
        )}
      </div>
      {!composicao.completo && (
        <p className="text-xs text-muted-foreground">
          {composicao.desconhecidos} componente(s) com custo desconhecido: o total e a margem não são calculados até o valor ser conhecido ou estimado.
        </p>
      )}
      {composicao.estimado && composicao.completo && <p className="text-xs text-muted-foreground">Há {composicao.estimados} componente(s) estimado(s): o total é aproximado.</p>}
    </section>
  )
}

function podeEstornar(l: LancamentoCusto, perms: Pick<AparelhoPermissions, "editar" | "definirCusto">, unidadeVendida: boolean) {
  if (l.status !== "ativo" || unidadeVendida) return false
  return l.origem === "estoque" ? perms.editar || perms.definirCusto : perms.definirCusto
}

function CustoAquisicaoEditor({ storeId, data, onDone }: { storeId: string; data: Prontuario; onDone: () => void }) {
  const [status, setStatus] = useState<CustoStatus>((CUSTO_STATUS as readonly string[]).includes(data.perfil.custoAquisicaoStatus) ? data.perfil.custoAquisicaoStatus as CustoStatus : "conhecido")
  const [justificativa, setJustificativa] = useState(data.perfil.custoAquisicaoJustificativa ?? "")
  const [pending, setPending] = useState(false)
  const mudou = status !== data.perfil.custoAquisicaoStatus || justificativa.trim() !== (data.perfil.custoAquisicaoJustificativa ?? "")
  async function salvar() {
    setPending(true)
    try {
      await apiComercial(storeId, `/aparelhos/${data.aparelho.id}/prontuario`, {
        method: "PATCH", body: { version: data.perfil.version, custoAquisicaoStatus: status, custoAquisicaoJustificativa: justificativa.trim() },
      })
      toast.success("Situação do custo de aquisição salva.")
      onDone()
    } catch (e) { toast.error((e as Error).message) } finally { setPending(false) }
  }
  return (
    <div className="min-w-0 space-y-2 rounded-xl border border-border p-4">
      <h4 className="text-sm font-semibold text-foreground">Custo de aquisição</h4>
      <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-[minmax(0,12rem)_minmax(0,1fr)]">
        <div className="min-w-0 space-y-1.5">
          <FieldLabel htmlFor="pc-aq-status">Situação</FieldLabel>
          <select id="pc-aq-status" className={inputCls} value={status} onChange={(e) => setStatus(e.target.value as CustoStatus)}>
            {CUSTO_STATUS.map((s) => <option key={s} value={s}>{statusCustoLabel(s)}</option>)}
          </select>
        </div>
        <div className="min-w-0 space-y-1.5">
          <FieldLabel htmlFor="pc-aq-just" required={status !== "conhecido"}>Justificativa</FieldLabel>
          <input id="pc-aq-just" className={inputCls} value={justificativa} maxLength={500} onChange={(e) => setJustificativa(e.target.value)} placeholder="Obrigatória para estimado ou desconhecido (mín. 10 caracteres)" />
        </div>
      </div>
      <p className="text-xs text-muted-foreground">O valor de aquisição continua sendo o da ficha. Marcar como desconhecido tira o valor do total (não vira zero).</p>
      <div className="flex justify-end"><Button size="sm" variant="outline" disabled={pending || !mudou} onClick={() => void salvar()}>{pending && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}Salvar situação</Button></div>
    </div>
  )
}

export function CustosTab({ storeId, data, perms, onChanged }: {
  storeId: string; data: Prontuario; perms: AparelhoPermissions; onChanged: () => void
}) {
  const [estorno, setEstorno] = useState<{ id: string; motivo: string } | null>(null)
  const [pendingEstorno, setPendingEstorno] = useState(false)
  const verCusto = data.composicao !== null
  const a = data.aparelho
  const unidadeVendida = a.status === "vendido"
  const bloqueio = a.status === "vendido" ? "Unidade vendida: o custo histórico está congelado na venda."
    : a.status === "baixado" ? "Unidade baixada não recebe custo."
    : a.propriedade !== "loja" ? "A unidade ainda não é da loja: confirme a aquisição antes de lançar custos." : null

  async function estornar() {
    if (!estorno || pendingEstorno) return
    setPendingEstorno(true)
    try {
      const r = await apiComercial<{ replay?: boolean; aviso?: string }>(storeId, `/custos/${estorno.id}/estorno`, { method: "POST", body: { motivo: estorno.motivo.trim() } })
      toast.success(r.replay ? "Este custo já estava estornado." : "Custo estornado.")
      if (r.aviso) toast.warning(r.aviso)
      setEstorno(null)
      onChanged()
    } catch (e) { toast.error((e as Error).message) } finally { setPendingEstorno(false) }
  }

  return (
    <div className="min-w-0 space-y-4">
      {verCusto ? <ComposicaoCard composicao={data.composicao!} /> : (
        <p className="rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">Valores de custo ocultos para o seu perfil. Os lançamentos aparecem sem valor.</p>
      )}
      {verCusto && perms.definirCusto && <CustoAquisicaoEditor key={data.perfil.version} storeId={storeId} data={data} onDone={onChanged} />}

      <section aria-label="Lançamentos de custo" className="min-w-0 space-y-2">
        <h4 className="text-sm font-semibold text-foreground">Lançamentos</h4>
        {data.lancamentos.length === 0 ? (
          <EmptyState icon={<Receipt className="h-4 w-4" />} title="Nenhum custo aplicado">Peças, serviços, frete e mão de obra aplicados nesta unidade aparecem aqui.</EmptyState>
        ) : (
          <ul className="min-w-0 space-y-2">
            {[...data.lancamentos].reverse().map((l) => (
              <li key={l.id} className={cn("min-w-0 space-y-1 rounded-xl border border-border p-3 text-sm", l.status !== "ativo" && "bg-muted/50")}>
                <div className="flex min-w-0 items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className={cn("min-w-0 truncate font-medium text-foreground", l.status !== "ativo" && "line-through decoration-muted-foreground")}>{l.descricao}{l.quantidade > 1 ? ` × ${l.quantidade}` : ""}</p>
                    <p className="min-w-0 truncate text-xs text-muted-foreground">{origemCustoLabel(l.origem)} · {categoriaCustoLabel(l.categoria)}</p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    {verCusto ? <ValorCusto valorCentavos={l.valorCentavos} custoStatus={l.custoStatus} /> : <Pill>{statusCustoLabel(l.custoStatus)}</Pill>}
                    {l.status === "ativo" ? <Pill tone="success">Ativo</Pill> : <Pill tone="neutral">Estornado</Pill>}
                  </div>
                </div>
                <p className="min-w-0 text-xs text-muted-foreground">{dataHoraBr(l.createdAt)} · {l.operador || "sistema"}{l.contaPagarTituloId ? " · obrigação em Contas a Pagar" : ""}</p>
                {l.justificativa && <p className="min-w-0 text-xs text-muted-foreground">{l.justificativa}</p>}
                {l.status !== "ativo" && <p className="min-w-0 text-xs text-muted-foreground">Estornado {dataHoraBr(l.estornadoEm)} por {l.estornadoPor || "—"}{l.motivoEstorno ? `: ${l.motivoEstorno}` : ""}</p>}
                {podeEstornar(l, perms, unidadeVendida) && estorno?.id !== l.id && (
                  <Button size="sm" variant="ghost" onClick={() => setEstorno({ id: l.id, motivo: "" })}><Undo2 className="mr-1.5 h-3.5 w-3.5" />Estornar</Button>
                )}
                {estorno?.id === l.id && (
                  <div className="min-w-0 space-y-1.5 pt-1">
                    <FieldLabel htmlFor={`pc-estorno-${l.id}`} required>Motivo do estorno</FieldLabel>
                    <input id={`pc-estorno-${l.id}`} className={inputCls} value={estorno.motivo} maxLength={300} onChange={(e) => setEstorno({ ...estorno, motivo: e.target.value })} placeholder="Mínimo 5 caracteres" />
                    {l.origem === "estoque" && <p className="text-xs text-muted-foreground">O material volta ao estoque pelo custo original.</p>}
                    {l.contaPagarTituloId && <p className="text-xs text-muted-foreground">A obrigação em Contas a Pagar não é cancelada aqui: cancele-a no Financeiro se a compra não ocorreu.</p>}
                    <div className="flex gap-2">
                      <Button size="sm" variant="ghost" onClick={() => setEstorno(null)}>Cancelar</Button>
                      <Button size="sm" variant="destructive" disabled={pendingEstorno || estorno.motivo.trim().length < 5} onClick={() => void estornar()}>
                        {pendingEstorno && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}Confirmar estorno
                      </Button>
                    </div>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <AdicionarCustoForm storeId={storeId} aparelhoId={a.id} perms={perms} bloqueio={bloqueio} onDone={onChanged} />
    </div>
  )
}
