"use client"

import { useMemo, useState, type ReactNode } from "react"
import {
  Lock,
  Printer,
  Copy,
  Calculator,
  CheckCircle2,
  MinusCircle,
  PlusCircle,
  type LucideIcon,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { ConferenciaCaixa } from "./conferencia-caixa"
import { useSession } from "next-auth/react"
import { useCaixa } from "./caixa-provider"
import { ensureLedger, useOperationsStore } from "@/lib/operations-store"
import { appendAuditLog } from "@/lib/audit-log"
import { useLojaAtiva } from "@/lib/loja-ativa"
import { operatorDisplayName } from "@/lib/pdv-operator-label"
import { usePdvOperadorNome } from "@/lib/pdv-operador-nome"
import { useTerminalAtivo } from "@/lib/pdv-terminal"
import { activeCaixaSessionUrl } from "@/lib/pdv-caixa-session"
import { useToast } from "@/hooks/use-toast"
import { cn } from "@/lib/utils"
import { escapeHtml, openThermalHtmlPrint } from "@/lib/thermal-print"
import {
  filterSalesDaSessao,
  type FechamentoPosSnapshot,
  type DinheiroContadoDetalhado,
} from "@/lib/caixa-fechamento-resumo"
import {
  linhasTextoFechamento,
  montarBlocosFechamento,
  quantidadeLinhaBloco,
  type BlocoFechamento,
  type LinhaBloco,
} from "@/lib/caixa/fechamento-blocos"
import { useCaixaResumo } from "./use-caixa-resumo"
import { FechamentoPosFechamentoDialog } from "./fechamento-pos-fechamento-dialog"
import { CalculadoraDinheiroCaixa } from "./calculadora-dinheiro-caixa"

interface FechamentoCaixaModalProps {
  isOpen: boolean
  onClose: () => void
}

const fmt = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v)

/** Abas sublinhadas — sobrescrevem o visual "pílula" do TabsTrigger base. */
const TAB_TRIGGER =
  "relative h-10 flex-none rounded-none border-0 bg-transparent font-semibold text-muted-foreground shadow-none hover:text-foreground data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:shadow-none dark:text-muted-foreground dark:data-[state=active]:bg-transparent dark:data-[state=active]:text-foreground after:absolute after:inset-x-2 after:-bottom-px after:h-0.5 after:rounded-full after:bg-transparent data-[state=active]:after:bg-primary"

export function FechamentoCaixaModal({ isOpen, onClose }: FechamentoCaixaModalProps) {
  const { caixa, fecharCaixa, sessaoId } = useCaixa()
  const { dailyLedger, sales } = useOperationsStore()
  const { empresaDocumentos, lojaAtivaId } = useLojaAtiva()
  const { data: session } = useSession()
  const operadorNomeAbertura = usePdvOperadorNome(lojaAtivaId)
  const { terminal } = useTerminalAtivo(lojaAtivaId)
  // Terminal ativo do device (mesmo em que o caixa foi aberto) — Fase 3: mostrar
  // o PDV no comprovante/relatório de fechamento. "Sem terminal" para sessões legadas.
  const terminalLabel = terminal
    ? `${terminal.code}${terminal.name && terminal.name !== terminal.code ? ` · ${terminal.name}` : ""}`
    : "Sem terminal"
  const { toast } = useToast()

  const [valorContado, setValorContado] = useState("")
  // Detalhamento por denominação (calculadora). Só existe quando o total da
  // calculadora foi aplicado no campo; edição manual do valor o invalida (→ null).
  const [dinheiroContadoDetalhado, setDinheiroContadoDetalhado] =
    useState<DinheiroContadoDetalhado | null>(null)
  const [observacao, setObservacao] = useState("")
  const [salvando, setSalvando] = useState(false)
  const [posFechamentoOpen, setPosFechamentoOpen] = useState(false)
  const [posFechamentoSnapshot, setPosFechamentoSnapshot] = useState<FechamentoPosSnapshot | null>(null)

  const ledger = ensureLedger(dailyLedger)
  const userAudit = (empresaDocumentos.nomeFantasia || "").trim() || "Loja"

  // Fonte ÚNICA e autoritativa — idêntica à do Resumo do caixa e da barra de status.
  // Reconcilia o status das vendas (cancelamentos da tela Vendas) e exclui canceladas
  // de TODOS os totais. Garante que o fechamento grave os mesmos números exibidos.
  const {
    resumo,
    opsCarregando,
    saldoEsperado,
    entradas,
    saidas,
    sessionSales,
    operacoesSessao,
    vendasSessao,
    qtdCanceladas,
  } = useCaixaResumo(isOpen)

  // Operador da sessão para o comprovante — nome LEGÍVEL (fonte única: abertura do
  // caixa → sessão → e-mail; nunca o `cashierId` técnico). O `cashierId` permanece
  // em cada venda para auditoria. Mostra o operador quando houve venda na sessão;
  // mantém vazio (→ "—") em sessão sem vendas para não inventar dado.
  const operadorDisplay = operatorDisplayName({ aberturaNome: operadorNomeAbertura, session })
  const operadoresSessao = useMemo(() => {
    const houveVenda = filterSalesDaSessao(sales, {
      sessaoId,
      dataAbertura: caixa.dataAbertura,
    }).some((s) => !!s.cashierId)
    return houveVenda && operadorDisplay ? [operadorDisplay] : []
  }, [sales, sessaoId, caixa.dataAbertura, operadorDisplay])

  // Vendas da sessão × Recebido (origem e forma) × Gaveta — fonte única da tela, da
  // impressão/cópia, do comprovante e do histórico (GOAL CAIXA-FECHAMENTO-ORIGENS-PAGAMENTO-003A).
  const blocos = useMemo(() => montarBlocosFechamento(resumo), [resumo])

  // Saldo total movimentado (inclui pix/cartão) — AUTORITATIVO (resumo das vendas ativas,
  // sem canceladas). Substitui o antigo acumulador local `getSaldoAtual()` que ficava
  // inflado por vendas canceladas. É o número gravado como `saldoFinal` no fechamento.
  // Conferência de gaveta usa o DINHEIRO físico esperado (não inclui pix/cartão).
  const saldoDinheiroEsperado = resumo.saldoDinheiroEsperado
  const valorContadoNum = parseFloat(valorContado) || 0
  const diferenca = valorContadoNum - saldoDinheiroEsperado
  const temDiferenca = valorContado !== "" && Math.abs(diferenca) > 0.01

  const buildResumoTexto = () => {
    const lines = [
      "==== FECHAMENTO DE CAIXA ====",
      `Loja: ${userAudit}`,
      `Data: ${new Date().toLocaleString("pt-BR")}`,
      sessaoId ? `Sessão: ${sessaoId}` : "",
      `Terminal: ${terminalLabel}`,
      operadoresSessao.length ? `Operador(es): ${operadoresSessao.join(", ")}` : "",
      // Vendas da sessão, Recebido (origem e forma) e Gaveta — os mesmos blocos da tela.
      ...linhasTextoFechamento(blocos),
      valorContado ? `Valor contado:    ${fmt(valorContadoNum)}` : "",
      temDiferenca ? `Diferença:        ${fmt(diferenca)}` : "",
      observacao ? `Obs: ${observacao}` : "",
      "=============================",
    ]
      .filter(Boolean)
      .join("\n")
    return lines
  }

  const handleImprimirRelatorio = () => {
    const inner = `
      <div style="text-align:center;font-weight:700">FECHAMENTO DE CAIXA</div>
      <div style="font-size:10px;text-align:center;margin:4px 0">${escapeHtml(userAudit)}</div>
      <div style="border-top:1px dashed #000;margin:6px 0"></div>
      <pre style="white-space:pre-wrap;font-family:inherit;font-size:11px;margin:0">${escapeHtml(buildResumoTexto())}</pre>
      <div style="height:14mm" aria-hidden="true"></div>
    `
    openThermalHtmlPrint(inner, "Fechamento de caixa")
  }

  const handleCopiarRelatorio = async () => {
    try {
      await navigator.clipboard.writeText(buildResumoTexto())
      toast({ title: "Copiado", description: "Resumo do fechamento na área de transferência." })
    } catch {
      toast({ title: "Erro", description: "Não foi possível copiar.", variant: "destructive" })
    }
  }

  const handleFecharCaixa = async () => {
    // ── Regra 4: validar unidade ativa ANTES de qualquer coisa ──────────────
    // Sem unidade não há como persistir nem identificar a sessão no servidor.
    if (!lojaAtivaId) {
      console.error("[caixa/fechar] bloqueado: lojaAtivaId ausente")
      toast({
        variant: "destructive",
        title: "Unidade não selecionada",
        description: "Selecione a unidade ativa antes de fechar o caixa.",
      })
      return
    }

    const lojaId = lojaAtivaId
    const terminalId = terminal?.id ?? null

    // POST de fechamento (reutilizado na reconciliação). Devolve ok + status + erro.
    const postFechar = async (
      sessaoIdToClose: string,
    ): Promise<{ ok: boolean; status: number; error?: string; fechadaEm?: string | null }> => {
      try {
        const res = await fetch("/api/ops/caixa/fechar", {
          method: "POST",
          credentials: "include",
          cache: "no-store",
          headers: { "Content-Type": "application/json", "x-assistec-loja-id": lojaId },
          body: JSON.stringify({
            sessaoId: sessaoIdToClose,
            saldoFinal: saldoEsperado,
            saldoContado: valorContado !== "" ? valorContadoNum : undefined,
            observacao: observacao.trim(),
            payload: {
              ledger,
              saldoInicial: caixa.saldoInicial,
              // Autoritativos (vendas ativas + operações do servidor) — sem canceladas.
              totalEntradas: entradas,
              totalSaidas: saidas,
              dataAberturaReal: caixa.dataAbertura?.toISOString() ?? null,
              // Consolidação ERP (por origem + por pagamento + totais) para o
              // comprovante de fechamento e futura impressão térmica. JSONB — sem schema novo.
              resumoFechamento: resumo,
              saldoDinheiroEsperado,
              operadores: operadoresSessao,
              terminalId,
              terminalLabel,
              // Metadado opcional (JSONB aditivo) — só quando a calculadora foi usada
              // e seu total corresponde ao valor contado aplicado. Sem schema novo.
              ...(dinheiroContadoDetalhado && valorContado !== ""
                ? { dinheiroContadoDetalhado }
                : {}),
            },
          }),
        })
        if (res.ok) {
          const data = (await res.json().catch(() => null)) as
            | { sessao?: { fechadaEm?: string | null } }
            | null
          return { ok: true, status: res.status, fechadaEm: data?.sessao?.fechadaEm ?? null }
        }
        const errData = (await res.json().catch(() => null)) as { error?: string } | null
        return { ok: false, status: res.status, error: errData?.error }
      } catch (err: unknown) {
        return { ok: false, status: 0, error: err instanceof Error ? err.message : "Falha de rede" }
      }
    }

    // Reconciliação (Regra 5): busca a sessão ABERTA atual da loja E DESTE TERMINAL.
    // Sem o escopo de terminal, um PDV sem `sessaoId` local fechava a sessão do
    // outro PDV da mesma loja (mesma causa do F-01 da readiness 002A).
    const buscarSessaoAberta = async (): Promise<string | null> => {
      try {
        const res = await fetch(activeCaixaSessionUrl(lojaId, terminalId), {
          credentials: "include",
          cache: "no-store",
          headers: { "x-assistec-loja-id": lojaId },
        })
        if (!res.ok) return null
        const data = (await res.json()) as { sessoes?: Array<{ id: string }> }
        return data.sessoes?.[0]?.id ?? null
      } catch {
        return null
      }
    }

    setSalvando(true)
    let persisted = false
    let lastError: { status: number; error?: string } | null = null
    let fechadaEmResult: string | null = null
    let sid = sessaoId

    try {
      // Regra 5 (passo 1): sem sessaoId local → reconcilia buscando a sessão ABERTA
      // da loja. Se não houver nenhuma, tenta abertura retroativa idempotente (o guard
      // do /abrir devolve a sessão existente ou registra uma recuperável).
      if (!sid) {
        console.warn("[caixa/fechar] sessaoId ausente — reconciliando", { storeId: lojaId, terminalId })
        sid = await buscarSessaoAberta()
        if (!sid) {
          try {
            const abrirRes = await fetch("/api/ops/caixa/abrir", {
              method: "POST",
              credentials: "include",
              cache: "no-store",
              headers: { "Content-Type": "application/json", "x-assistec-loja-id": lojaId },
              body: JSON.stringify({
                saldoInicial: caixa.saldoInicial,
                observacao: "Sessão retroativa — abertura não registrada no servidor",
                ...(terminalId ? { terminalId } : {}),
              }),
            })
            if (abrirRes.ok) {
              const abrirData = (await abrirRes.json()) as { sessaoId?: string }
              sid = abrirData.sessaoId ?? null
            }
          } catch (err: unknown) {
            console.error("[caixa/fechar] abertura retroativa falhou:", err)
          }
        }
      }

      if (sid) {
        console.info("[caixa/fechar] fechando", { storeId: lojaId, sessaoId: sid, terminalId })
        let r = await postFechar(sid)
        console.info("[caixa/fechar] resposta", {
          storeId: lojaId, sessaoId: sid, terminalId, status: r.status, ok: r.ok, error: r.error,
        })

        // Regra 5 (passo 2): sessaoId inválido (404) → reconcilia e tenta UMA vez mais.
        if (!r.ok && r.status === 404) {
          const reconciliado = await buscarSessaoAberta()
          if (reconciliado && reconciliado !== sid) {
            console.warn("[caixa/fechar] sessaoId inválido — reconciliado", {
              storeId: lojaId, antigo: sid, novo: reconciliado, terminalId,
            })
            sid = reconciliado
            r = await postFechar(sid)
            console.info("[caixa/fechar] resposta (retry)", {
              storeId: lojaId, sessaoId: sid, terminalId, status: r.status, ok: r.ok, error: r.error,
            })
          }
        }

        if (r.ok) {
          persisted = true
          fechadaEmResult = r.fechadaEm ?? null
        } else {
          lastError = { status: r.status, error: r.error }
        }
      } else {
        console.error("[caixa/fechar] nenhuma sessão ABERTA encontrada", { storeId: lojaId, terminalId })
        lastError = { status: 0, error: "Nenhuma sessão de caixa aberta encontrada no servidor." }
      }
    } finally {
      setSalvando(false)
    }

    // ── Regras 1, 2, 3: sem confirmação do servidor → NÃO fecha localmente ──
    // Mantém o caixa aberto, a sessão e os inputs intactos para nova tentativa.
    if (!persisted) {
      const detalhe =
        lastError?.status === 404
          ? "A sessão não consta como aberta no servidor. Atualize a página e tente novamente."
          : lastError?.error
            ? `Erro do servidor: ${lastError.error}`
            : "Não foi possível confirmar o fechamento no servidor. O caixa continua ABERTO."
      toast({
        variant: "destructive",
        title: "Fechamento não concluído",
        description: detalhe,
      })
      return
    }

    // ── Sucesso confirmado pelo servidor: monta o snapshot ANTES de resetar ──
    // qualquer estado local (Regra 7 do GOAL) — o diálogo pós-fechamento depende
    // dele para o comprovante, e não deve inventar/buscar nada novo.
    const snapshot: FechamentoPosSnapshot = {
      loja: userAudit,
      sessaoId: sid,
      terminalLabel,
      operadores: operadoresSessao,
      dataAbertura: caixa.dataAbertura ? caixa.dataAbertura.toISOString() : null,
      fechadaEm: fechadaEmResult,
      saldoInicial: caixa.saldoInicial,
      totalEntradas: entradas,
      totalSaidas: saidas,
      saldoDinheiroEsperado,
      saldoMovimentadoEsperado: saldoEsperado,
      valorContado: valorContado !== "" ? valorContadoNum : null,
      diferenca: valorContado !== "" && temDiferenca ? diferenca : null,
      observacao: observacao.trim(),
      resumo,
      dinheiroContadoDetalhado: valorContado !== "" ? dinheiroContadoDetalhado : null,
    }

    if (valorContado !== "" && temDiferenca) {
      const pgAudit = resumo.porPagamento
      appendAuditLog({
        action: "quebra_caixa",
        userLabel: `${userAudit} (fechamento)`,
        detail: `Esperado ${fmt(saldoEsperado)} | Contado ${fmt(valorContadoNum)} | Diferença ${fmt(diferenca)} | Dia: Din ${fmt(pgAudit.dinheiro)} Pix ${fmt(pgAudit.pix)} Déb ${fmt(pgAudit.cartaoDebito)} Créd ${fmt(pgAudit.cartaoCredito)} Carnê ${fmt(pgAudit.carne)} Vale ${fmt(pgAudit.creditoVale)}`,
      })
    }
    if (observacao.trim()) {
      appendAuditLog({
        action: "quebra_caixa",
        userLabel: `${userAudit} (fechamento)`,
        detail: `Obs: ${observacao.trim()}`,
      })
    }

    fecharCaixa()
    setValorContado("")
    setDinheiroContadoDetalhado(null)
    setObservacao("")
    onClose()
    toast({ title: "Caixa fechado", description: "Sessão encerrada e registrada no servidor." })
    setPosFechamentoSnapshot(snapshot)
    setPosFechamentoOpen(true)
  }

  // ── Apresentação ──────────────────────────────────────────────────────────
  const estadoGaveta = resolverEstadoGaveta(valorContado !== "", temDiferenca, diferenca)
  // Recebido por forma (formas zeradas já ficam fora dos blocos). A barra mede a participação
  // sobre o que ENTROU; dedução (estorno sem forma) aparece sem barra.
  const linhasForma = blocos.recebidoPorForma.linhas.filter((l) => l.tipo !== "total")
  const baseParticipacao = linhasForma.reduce(
    (acc, l) => (l.tipo === "item" && l.valor > 0 ? acc + l.valor : acc),
    0,
  )
  const horaAbertura = caixa.dataAbertura
    ? caixa.dataAbertura.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })
    : null
  const notasFormas = [
    resumo.qtdVendasMultiplas > 0
      ? `${resumo.qtdVendasMultiplas} venda(s) com múltiplas formas — cada forma somada na sua linha`
      : null,
    ...blocos.recebidoPorForma.notas,
  ].filter((n): n is string => Boolean(n))
  const notasVendas = [
    ...blocos.vendas.notas,
    qtdCanceladas > 0 ? `${qtdCanceladas} cancelada(s) fora dos totais` : null,
  ].filter((n): n is string => Boolean(n))

  return (
    <>
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      {/* `p-0!`/`gap-0!`: modal full-bleed (cabeçalho, trilho e rodapé de borda a borda) —
          precisa vencer o padding/gap `!important` da densidade operacional do dialog. */}
      <DialogContent className="w-[96vw] gap-0! border-border bg-card p-0! sm:max-w-3xl lg:max-w-4xl xl:max-w-[76rem]">
        <div className="flex max-h-[92dvh] min-h-0 flex-col overflow-hidden xl:h-[min(92dvh,52rem)]">
          <DialogHeader className="shrink-0 gap-1 border-b border-border px-4 py-3 pr-12 text-left sm:px-5">
            <div className="flex min-w-0 flex-col gap-1 xl:flex-row xl:items-baseline xl:gap-4">
              <DialogTitle className="shrink-0 font-display font-bold tracking-tight text-foreground">
                Fechamento de Caixa
              </DialogTitle>
              <p className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
                <span className="font-semibold text-foreground">
                  <span className="sr-only">Terminal: </span>
                  {terminalLabel}
                </span>
                <MetaSeparador />
                {operadoresSessao.length ? (
                  <span className="font-semibold text-foreground">
                    <span className="sr-only">Operador: </span>
                    {operadoresSessao.join(", ")}
                  </span>
                ) : (
                  <span>Operador: —</span>
                )}
                <MetaSeparador />
                <span title={sessaoId ?? undefined}>
                  {sessaoId ? (
                    <>
                      Sessão <span className="font-mono text-[11px]">{sessaoId.slice(0, 8)}</span>
                    </>
                  ) : (
                    "Sessão não registrada"
                  )}
                </span>
                {horaAbertura && (
                  <>
                    <MetaSeparador />
                    <span>
                      Aberto às <span className="font-semibold tabular-nums text-foreground">{horaAbertura}</span>
                    </span>
                  </>
                )}
              </p>
            </div>
            <DialogDescription className="sr-only">
              Confira os valores e conte o dinheiro em caixa antes de fechar.
            </DialogDescription>
          </DialogHeader>

          <div className="min-h-0 flex-1 overflow-y-auto xl:grid xl:grid-cols-[minmax(0,1fr)_29rem] xl:grid-rows-[minmax(0,1fr)] xl:overflow-hidden">
            {/* ── Consulta (esquerda) ─────────────────────────────────────── */}
            <Tabs defaultValue="resumo" className="min-w-0 gap-0 xl:min-h-0 xl:overflow-hidden">
              <div className="sticky top-0 z-[2] flex shrink-0 items-center gap-3 border-b border-border bg-card px-2 sm:px-3 xl:static">
                <TabsList className="h-auto w-auto gap-1 rounded-none border-0 bg-transparent p-0 dark:border-0 dark:bg-transparent dark:backdrop-blur-none">
                  <TabsTrigger value="resumo" className={TAB_TRIGGER}>
                    Resumo
                  </TabsTrigger>
                  <TabsTrigger value="conferencia" className={TAB_TRIGGER}>
                    Conferência
                  </TabsTrigger>
                </TabsList>
                <span className="ml-auto hidden truncate text-[11px] text-muted-foreground md:block">
                  Somente consulta — nada aqui altera valores
                </span>
              </div>

              <TabsContent value="resumo" className="space-y-3 p-3 sm:p-4 xl:min-h-0 xl:flex-1 xl:overflow-y-auto">
                {/* Recebido na sessão = vendas à vista + contas e O.S. recebidas − estornos, aberto
                    pela forma usada. À prazo e crédito/vale ficam em "Vendas da sessão". */}
                <section
                  aria-label="Recebido na sessão"
                  className="grid min-w-0 overflow-hidden rounded-lg border border-border bg-card sm:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]"
                >
                  <div className="flex min-w-0 flex-col justify-center gap-0.5 border-b border-border bg-secondary/50 px-4 py-3 sm:border-b-0 sm:border-r">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Recebido na sessão
                    </p>
                    <p className="truncate font-display text-3xl font-bold leading-tight tracking-tight tabular-nums text-foreground">
                      {fmt(blocos.totais.recebidoSessao)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {opsCarregando
                        ? "Atualizando recebimentos…"
                        : "Vendas à vista + contas e O.S. recebidas − estornos"}
                    </p>
                  </div>
                  <div className="flex min-w-0 flex-col justify-center gap-2 px-4 py-3">
                    <TituloSecao>Por forma</TituloSecao>
                    {linhasForma.length === 0 ? (
                      <p className="text-sm text-muted-foreground">Nenhum recebimento nesta sessão.</p>
                    ) : (
                      // Uma grade para todas as formas: rótulo longo (ex.: estorno sem forma) alarga a
                      // coluna de todas as linhas e as barras continuam alinhadas.
                      <div className="grid min-w-0 grid-cols-[minmax(5.25rem,max-content)_minmax(2rem,1fr)_auto_2.25rem] items-center gap-x-2.5 gap-y-2 text-sm">
                        {linhasForma.map((l) => (
                          <FormaRecebidaLinha key={l.id} linha={l} base={baseParticipacao} />
                        ))}
                      </div>
                    )}
                    {notasFormas.length > 0 && (
                      <p className="text-[11px] text-muted-foreground">{notasFormas.join(" · ")}</p>
                    )}
                  </div>
                </section>

                {/* Vendas (competência) à esquerda; recebido por origem e gaveta à direita. */}
                <div className="grid min-w-0 items-start gap-3 md:grid-cols-2">
                  <BlocoResumo bloco={blocos.vendas} meta={blocos.vendas.meta} notas={notasVendas} />
                  <div className="grid min-w-0 gap-3">
                    <BlocoResumo
                      bloco={blocos.recebidoPorOrigem}
                      meta={opsCarregando ? "atualizando…" : undefined}
                    />
                    <BlocoResumo bloco={blocos.gaveta} composicao />
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="conferencia" className="xl:min-h-0 xl:flex-1 xl:overflow-y-auto">
                <ConferenciaCaixa
                  vendasSessao={vendasSessao}
                  sessionSales={sessionSales}
                  operacoesSessao={operacoesSessao}
                />
              </TabsContent>
            </Tabs>

            {/* ── Contagem da gaveta (direita) — sempre visível, independente da aba ── */}
            <aside
              aria-label="Contagem da gaveta"
              className="min-w-0 border-t border-border bg-card xl:min-h-0 xl:overflow-y-auto xl:border-l xl:border-t-0"
            >
              <div className="space-y-2 bg-card px-3 pb-2 pt-3 sm:px-4 xl:sticky xl:top-0 xl:z-[1] xl:border-b xl:border-border/60 xl:pb-3">
                <div className="flex items-baseline justify-between gap-2">
                  <h3 className="font-display text-sm font-semibold text-foreground">Contagem da gaveta</h3>
                  <span className="text-[11px] text-muted-foreground">dinheiro físico</span>
                </div>
                <ResultadoGaveta
                  estado={estadoGaveta}
                  esperado={saldoDinheiroEsperado}
                  contado={valorContado !== "" ? valorContadoNum : null}
                  diferenca={diferenca}
                />
              </div>

              <div className="space-y-3 px-3 pb-4 pt-2 sm:px-4 xl:pt-3">
                <div className="space-y-1.5">
                  <Label htmlFor="fechamento-dinheiro-contado">Dinheiro contado na gaveta</Label>
                  <div className="relative">
                    <span
                      aria-hidden
                      className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm font-semibold text-muted-foreground"
                    >
                      R$
                    </span>
                    {/* Input nativo (sem data-slot): a densidade operacional força 13px no Input
                        padrão, e o valor contado precisa de leitura imediata. */}
                    <input
                      id="fechamento-dinheiro-contado"
                      type="number"
                      inputMode="decimal"
                      placeholder="0,00"
                      value={valorContado}
                      onChange={(e) => {
                        setValorContado(e.target.value)
                        // Edição manual invalida o detalhamento aplicado pela calculadora.
                        setDinheiroContadoDetalhado(null)
                      }}
                      className="h-12 w-full min-w-0 rounded-lg border border-input bg-background pl-10 pr-3 font-display text-2xl font-bold tabular-nums text-foreground shadow-xs outline-none transition-[color,box-shadow] [appearance:textfield] placeholder:font-normal placeholder:text-muted-foreground/50 focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                    />
                  </div>
                  <p className="text-[11px] leading-snug text-muted-foreground">
                    Só o <span className="font-semibold text-foreground">dinheiro físico</span> entra na gaveta. PIX,
                    cartão, à prazo e crédito/vale não entram.
                  </p>
                </div>

                {/* Calculadora de conferência de dinheiro físico (cédulas/moedas).
                    Aplica o total no campo acima por ação explícita do operador. */}
                <CalculadoraDinheiroCaixa
                  saldoDinheiroEsperado={saldoDinheiroEsperado}
                  onAplicar={(t, detalhe) => {
                    setValorContado(t.toFixed(2))
                    setDinheiroContadoDetalhado(detalhe)
                  }}
                />

                <div className="space-y-1.5">
                  <Label htmlFor="fechamento-observacao" className="w-full justify-between">
                    Observação
                    <span className="text-[11px] font-normal text-muted-foreground">opcional</span>
                  </Label>
                  <Input
                    id="fechamento-observacao"
                    placeholder="Ex.: conferido pelo supervisor, sangria realizada…"
                    value={observacao}
                    onChange={(e) => setObservacao(e.target.value)}
                    className="h-9 bg-background"
                  />
                </div>
              </div>
            </aside>
          </div>

          <div className="shrink-0 border-t border-border bg-card px-3 py-2.5 sm:px-4">
            <div className="flex flex-col-reverse gap-2 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex items-center justify-center gap-1 lg:justify-start">
                <Button
                  variant="ghost"
                  size="sm"
                  className="gap-1.5 text-muted-foreground hover:text-foreground"
                  onClick={handleImprimirRelatorio}
                >
                  <Printer className="h-4 w-4" />
                  Imprimir relatório
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="gap-1.5 text-muted-foreground hover:text-foreground"
                  onClick={() => void handleCopiarRelatorio()}
                >
                  <Copy className="h-4 w-4" />
                  Copiar resumo
                </Button>
              </div>

              <div className="flex min-w-0 flex-wrap items-center gap-2 sm:flex-nowrap sm:justify-end">
                <ChipGaveta
                  estado={estadoGaveta}
                  diferenca={diferenca}
                  className="w-full justify-center sm:w-auto xl:hidden"
                />
                <Button
                  variant="outline"
                  onClick={onClose}
                  className="flex-1 border-border sm:flex-none"
                  disabled={salvando}
                >
                  Cancelar
                </Button>
                <Button
                  onClick={handleFecharCaixa}
                  disabled={salvando}
                  className="flex-1 gap-2 font-semibold sm:flex-none"
                >
                  <Lock className="h-4 w-4" />
                  {salvando ? "Salvando..." : "Confirmar Fechamento"}
                </Button>
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
    <FechamentoPosFechamentoDialog
      open={posFechamentoOpen}
      onOpenChange={setPosFechamentoOpen}
      snapshot={posFechamentoSnapshot}
    />
    </>
  )
}

type EstadoGaveta = "pendente" | "confere" | "falta" | "sobra"

/** Mesma regra do fechamento: diferença acima de 1 centavo é quebra de caixa. */
function resolverEstadoGaveta(contado: boolean, temDiferenca: boolean, diferenca: number): EstadoGaveta {
  if (!contado) return "pendente"
  if (!temDiferenca) return "confere"
  return diferenca < 0 ? "falta" : "sobra"
}

/**
 * Estado → texto + ícone + tom. Nunca só cor: cada estado tem ícone e título próprios.
 * O VALOR fica em `text-foreground`: success/destructive sobre o próprio tint não chegam a
 * 4,5:1 em texto pequeno nos temas atuais — a cor semântica vive no ícone, borda e fundo.
 */
const ESTADO_GAVETA: Record<
  EstadoGaveta,
  { titulo: string; dica: string; icon: LucideIcon; caixa: string; icone: string; celula: string; valor: string }
> = {
  pendente: {
    titulo: "Aguardando contagem",
    dica: "Informe o dinheiro contado na gaveta.",
    icon: Calculator,
    caixa: "border-dashed border-border",
    icone: "text-muted-foreground",
    celula: "",
    valor: "text-muted-foreground",
  },
  confere: {
    titulo: "Caixa confere",
    dica: "Dinheiro contado igual ao esperado.",
    icon: CheckCircle2,
    caixa: "border-success/40 bg-success/10",
    icone: "text-success",
    celula: "bg-success/10",
    valor: "text-foreground",
  },
  falta: {
    titulo: "Falta no caixa",
    dica: "Verifique se houve saída não registrada.",
    icon: MinusCircle,
    caixa: "border-destructive/40 bg-destructive/10",
    icone: "text-destructive",
    celula: "bg-destructive/10",
    valor: "text-foreground",
  },
  sobra: {
    titulo: "Sobra no caixa",
    dica: "Verifique se houve entrada não registrada.",
    icon: PlusCircle,
    caixa: "border-warning/50 bg-warning/15",
    icone: "text-warning",
    celula: "bg-warning/15",
    valor: "text-foreground",
  },
}

const fmtSinal = (v: number) => (Math.abs(v) <= 0.01 ? fmt(0) : `${v > 0 ? "+" : "−"} ${fmt(Math.abs(v))}`)

/** Esperado / Contado / Diferença + veredito da gaveta. */
function ResultadoGaveta({
  estado,
  esperado,
  contado,
  diferenca,
}: {
  estado: EstadoGaveta
  esperado: number
  contado: number | null
  diferenca: number
}) {
  const cfg = ESTADO_GAVETA[estado]
  const Icon = cfg.icon
  return (
    <div className="space-y-2">
      <dl className="grid grid-cols-3 overflow-hidden rounded-lg border border-border">
        <CelulaGaveta rotulo="Esperado" valor={fmt(esperado)} />
        <CelulaGaveta
          rotulo="Contado"
          valor={contado === null ? "—" : fmt(contado)}
          className="border-l border-border"
          valorClassName={contado === null ? "text-muted-foreground" : undefined}
        />
        <CelulaGaveta
          rotulo="Diferença"
          valor={contado === null ? "—" : fmtSinal(diferenca)}
          className={cn("border-l border-border", cfg.celula)}
          valorClassName={cfg.valor}
        />
      </dl>
      <div className={cn("flex min-w-0 items-center gap-2.5 rounded-lg border px-3 py-2", cfg.caixa)}>
        <Icon aria-hidden className={cn("h-4 w-4 shrink-0", cfg.icone)} />
        <div role="status" className="min-w-0 flex-1 leading-tight">
          <p className="text-sm font-semibold text-foreground">{cfg.titulo}</p>
          <p className="truncate text-[11px] text-muted-foreground">{cfg.dica}</p>
        </div>
        {estado !== "pendente" && (
          <span className={cn("shrink-0 font-display text-sm font-bold tabular-nums", cfg.valor)}>
            {fmtSinal(diferenca)}
          </span>
        )}
      </div>
    </div>
  )
}

function CelulaGaveta({
  rotulo,
  valor,
  className,
  valorClassName,
}: {
  rotulo: string
  valor: string
  className?: string
  valorClassName?: string
}) {
  return (
    <div className={cn("min-w-0 px-2.5 py-2", className)}>
      <dt className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{rotulo}</dt>
      <dd className={cn("truncate font-display text-base font-bold tabular-nums text-foreground", valorClassName)}>
        {valor}
      </dd>
    </div>
  )
}

/** Veredito compacto para o rodapé quando o trilho não está visível (abaixo de xl). */
function ChipGaveta({
  estado,
  diferenca,
  className,
}: {
  estado: EstadoGaveta
  diferenca: number
  className?: string
}) {
  const cfg = ESTADO_GAVETA[estado]
  const Icon = cfg.icon
  const texto =
    estado === "pendente"
      ? "Contagem pendente"
      : estado === "confere"
        ? "Caixa confere"
        : `${estado === "falta" ? "Falta" : "Sobra"} ${fmt(Math.abs(diferenca))}`
  return (
    <span
      className={cn(
        "inline-flex h-8 min-w-0 items-center gap-1.5 rounded-full border px-3 text-xs font-semibold text-foreground",
        cfg.caixa,
        className,
      )}
    >
      <Icon aria-hidden className={cn("h-3.5 w-3.5 shrink-0", cfg.icone)} />
      <span className="truncate tabular-nums">{texto}</span>
    </span>
  )
}

function MetaSeparador() {
  return <span aria-hidden className="h-1 w-1 shrink-0 rounded-full bg-muted-foreground/40" />
}

function TituloSecao({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <h3 className={cn("text-[10px] font-semibold uppercase tracking-wider text-muted-foreground", className)}>
      {children}
    </h3>
  )
}

function LinhaValor({
  rotulo,
  valor,
  detalhe,
  mutado = false,
  total = false,
  recuo = false,
}: {
  rotulo: string
  valor: string
  detalhe?: string
  mutado?: boolean
  total?: boolean
  /** Linha informativa subordinada à anterior (ex.: "A receber (à prazo)"). */
  recuo?: boolean
}) {
  return (
    <div
      className={cn(
        "flex min-w-0 items-baseline justify-between gap-3 text-sm",
        total && "mt-1 border-t border-border pt-2",
        recuo && "pl-3 text-[13px]",
      )}
    >
      <span className={cn("min-w-0 truncate", total ? "font-semibold text-foreground" : "text-muted-foreground")}>
        {rotulo}
        {detalhe && <span className="ml-1.5 text-[11px] text-muted-foreground/80">{detalhe}</span>}
      </span>
      <span
        className={cn(
          "shrink-0 tabular-nums",
          total
            ? "font-display text-base font-bold text-foreground"
            : mutado
              ? "text-muted-foreground"
              : "font-semibold text-foreground",
        )}
      >
        {valor}
      </span>
    </div>
  )
}

/** Bloco do Resumo desenhado a partir de `lib/caixa/fechamento-blocos` (mesmos dados da impressão). */
function BlocoResumo({
  bloco,
  meta,
  notas = bloco.notas,
  composicao = false,
}: {
  bloco: BlocoFechamento
  meta?: string
  notas?: string[]
  /** Gaveta: rótulos com o operador da composição ("+ Suprimentos", "− Sangrias"). */
  composicao?: boolean
}) {
  return (
    <section
      aria-label={bloco.titulo}
      className="min-w-0 space-y-1.5 rounded-lg border border-border bg-card px-4 py-3"
    >
      <div className="flex min-w-0 items-baseline justify-between gap-2">
        <TituloSecao className="shrink-0">{bloco.titulo}</TituloSecao>
        {meta && <span className="min-w-0 truncate text-[11px] text-muted-foreground">{meta}</span>}
      </div>
      {bloco.linhas.map((l) => (
        <LinhaValor
          key={l.id}
          rotulo={rotuloLinha(l, composicao)}
          detalhe={l.tipo === "total" ? undefined : quantidadeLinhaBloco(l) || undefined}
          valor={valorLinha(l)}
          total={l.tipo === "total"}
          mutado={l.tipo === "info"}
          recuo={l.tipo === "info"}
        />
      ))}
      {notas.length > 0 && <p className="pt-1 text-[11px] text-muted-foreground">{notas.join(" · ")}</p>}
    </section>
  )
}

/** Na gaveta o rótulo carrega o operador da composição; nos demais blocos o sinal fica no valor. */
function rotuloLinha(l: LinhaBloco, composicao: boolean): string {
  if (!composicao || l.tipo === "total") return l.rotulo
  if (l.tipo === "deducao") return `− ${l.rotulo}`
  return l.soma ? `+ ${l.rotulo}` : l.rotulo
}

/** Dedução (e valor líquido negativo) com sinal de menos tipográfico. */
function valorLinha(l: LinhaBloco): string {
  if (l.tipo === "deducao") return `− ${fmt(l.valor)}`
  return l.valor < 0 ? `− ${fmt(-l.valor)}` : fmt(l.valor)
}

/**
 * Forma recebida com barra de participação no que entrou (dedução fica sem barra).
 * `contents`: as quatro células entram na grade compartilhada do bloco "Por forma".
 */
function FormaRecebidaLinha({ linha, base }: { linha: LinhaBloco; base: number }) {
  const deducao = linha.tipo === "deducao" || linha.valor < 0
  const pct = !deducao && base > 0.001 ? Math.min(100, Math.round((linha.valor / base) * 100)) : null
  return (
    <div className="contents">
      <span className="truncate font-semibold text-foreground" title={linha.rotulo}>
        {linha.rotulo}
      </span>
      <span aria-hidden className="h-1.5 overflow-hidden rounded-full bg-secondary">
        {pct !== null && (
          <span className="block h-full rounded-full bg-foreground/50" style={{ width: `${pct}%` }} />
        )}
      </span>
      <span className="text-right font-semibold tabular-nums text-foreground">{valorLinha(linha)}</span>
      <span className="text-right text-[11px] tabular-nums text-muted-foreground">
        {pct === null ? "" : `${pct}%`}
      </span>
    </div>
  )
}
