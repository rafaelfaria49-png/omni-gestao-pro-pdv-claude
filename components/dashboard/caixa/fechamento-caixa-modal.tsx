"use client"

import { useEffect, useMemo, useState } from "react"
import {
  Lock,
  DollarSign,
  TrendingUp,
  TrendingDown,
  CheckCircle,
  AlertTriangle,
  Printer,
  Copy,
  Layers,
  Wallet,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"
import { useSession } from "next-auth/react"
import { useCaixa } from "./caixa-provider"
import { ensureLedger, useOperationsStore } from "@/lib/operations-store"
import { appendAuditLog } from "@/lib/audit-log"
import { useLojaAtiva } from "@/lib/loja-ativa"
import { operatorDisplayName } from "@/lib/pdv-operator-label"
import { usePdvOperadorNome } from "@/lib/pdv-operador-nome"
import { useTerminalAtivo } from "@/lib/pdv-terminal"
import { useToast } from "@/hooks/use-toast"
import { escapeHtml, openThermalHtmlPrint } from "@/lib/thermal-print"
import {
  aggregateCaixaOperacoes,
  computeFechamentoResumo,
  filterSalesDaSessao,
  receitaTotalDoDia,
  type CaixaOperacaoLinha,
  type FechamentoResumo,
} from "@/lib/caixa-fechamento-resumo"

interface FechamentoCaixaModalProps {
  isOpen: boolean
  onClose: () => void
}

const fmt = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v)

export function FechamentoCaixaModal({ isOpen, onClose }: FechamentoCaixaModalProps) {
  const { caixa, fecharCaixa, getSaldoAtual, sessaoId } = useCaixa()
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
  const [observacao, setObservacao] = useState("")
  const [salvando, setSalvando] = useState(false)
  const [sessaoOperacoes, setSessaoOperacoes] = useState<CaixaOperacaoLinha[]>([])
  const [opsCarregando, setOpsCarregando] = useState(false)

  const ledger = ensureLedger(dailyLedger)
  const userAudit = (empresaDocumentos.nomeFantasia || "").trim() || "Loja"

  // Operações da sessão no servidor (sangria / suprimento / recebimento_cr).
  useEffect(() => {
    if (!isOpen || !sessaoId?.trim() || !lojaAtivaId) {
      setSessaoOperacoes([])
      return
    }
    let cancelled = false
    setOpsCarregando(true)
    void fetch(`/api/ops/caixa/sessao-detalhe?sessaoId=${encodeURIComponent(sessaoId)}`, {
      credentials: "include",
      headers: { "x-assistec-loja-id": lojaAtivaId },
      cache: "no-store",
    })
      .then((r) => r.json())
      .then((j: { sessao?: { operacoes?: CaixaOperacaoLinha[] } }) => {
        if (cancelled) return
        const ops = j.sessao?.operacoes
        setSessaoOperacoes(
          Array.isArray(ops)
            ? ops.map((o) => ({ tipo: o.tipo, valor: o.valor, payload: o.payload }))
            : [],
        )
      })
      .catch(() => {
        if (!cancelled) setSessaoOperacoes([])
      })
      .finally(() => {
        if (!cancelled) setOpsCarregando(false)
      })
    return () => {
      cancelled = true
    }
  }, [isOpen, sessaoId, lojaAtivaId])

  const resumo: FechamentoResumo = useMemo(() => {
    const sessionSales = filterSalesDaSessao(sales, {
      sessaoId,
      dataAbertura: caixa.dataAbertura,
    })
    const opsAgg = aggregateCaixaOperacoes(sessaoOperacoes)
    const usarOpsServidor = !!sessaoId?.trim() && !opsCarregando
    const totalLiquidoSessao = sessionSales.reduce((s, v) => s + (v.total ?? 0), 0)
    const sangrias = usarOpsServidor ? opsAgg.sangrias : caixa.totalSaidas
    const suprimentos = usarOpsServidor
      ? opsAgg.suprimentos
      : Math.max(0, caixa.totalEntradas - totalLiquidoSessao)
    return computeFechamentoResumo({
      sales: sessionSales,
      sangrias,
      suprimentos,
      saldoInicial: caixa.saldoInicial,
      recebimentosContas: opsAgg.recebimentosContas,
      recebimentosContasDinheiro: opsAgg.recebimentosContasDinheiro,
      qtdRecebimentosContas: opsAgg.qtdRecebimentosContas,
    })
  }, [
    sales,
    sessaoId,
    caixa.dataAbertura,
    caixa.totalSaidas,
    caixa.totalEntradas,
    caixa.saldoInicial,
    sessaoOperacoes,
    opsCarregando,
  ])

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

  // Receita total do dia (faturamento) — vendas líquidas + serviços recebidos.
  // Fonte única (helper) para casar com a reimpressão do histórico.
  const receitaTotalDia = receitaTotalDoDia(resumo)

  // Saldo total movimentado (inclui pix/cartão) — mantém compatibilidade com getSaldoAtual.
  const saldoEsperado = getSaldoAtual()
  // Conferência de gaveta usa o DINHEIRO físico esperado (não inclui pix/cartão).
  const saldoDinheiroEsperado = resumo.saldoDinheiroEsperado
  const valorContadoNum = parseFloat(valorContado) || 0
  const diferenca = valorContadoNum - saldoDinheiroEsperado
  const temDiferenca = valorContado !== "" && Math.abs(diferenca) > 0.01

  const buildResumoTexto = () => {
    const pg = resumo.porPagamento
    const lines = [
      "==== FECHAMENTO DE CAIXA ====",
      `Loja: ${userAudit}`,
      `Data: ${new Date().toLocaleString("pt-BR")}`,
      sessaoId ? `Sessão: ${sessaoId}` : "",
      `Terminal: ${terminalLabel}`,
      operadoresSessao.length ? `Operador(es): ${operadoresSessao.join(", ")}` : "",
      "--- RESUMO FINANCEIRO ---",
      `Vendas produtos:  ${fmt(resumo.totalLiquido)}`,
      `Serviços receb.:  ${fmt(resumo.recebimentosContas)}`,
      resumo.outrosRecebimentos > 0 ? `Outros receb.:    ${fmt(resumo.outrosRecebimentos)}` : "",
      "----------------------------",
      `RECEITA TOTAL DIA:${fmt(receitaTotalDia)}`,
      "--- VENDAS POR ORIGEM ---",
      ...resumo.porOrigem.map((o) => `${o.label.padEnd(20)} ${fmt(o.valorBruto)} (${o.qtdItens} itens)`),
      "--- FORMAS DE PAGAMENTO ---",
      `Dinheiro:   ${fmt(pg.dinheiro)}`,
      `Pix:        ${fmt(pg.pix)}`,
      `Débito:     ${fmt(pg.cartaoDebito)}`,
      `Crédito:    ${fmt(pg.cartaoCredito)}`,
      `Carnê:      ${fmt(pg.carne)}`,
      `A prazo:    ${fmt(pg.aPrazo)}`,
      `Vale/Créd.: ${fmt(pg.creditoVale)}`,
      "--- CONSOLIDAÇÃO ---",
      `Vendas (qtd):     ${resumo.qtdVendas}`,
      `Subtotal bruto:   ${fmt(resumo.subtotalBruto)}`,
      `Descontos:       -${fmt(resumo.descontos)}`,
      `Total líquido:    ${fmt(resumo.totalLiquido)}`,
      `Total recebido:   ${fmt(resumo.totalRecebido)}`,
      `A prazo (fiado):  ${fmt(resumo.aPrazo)}`,
      `Ticket médio:     ${fmt(resumo.ticketMedio)}`,
      resumo.qtdRecebimentosContas > 0
        ? `Serviços recebidos: ${fmt(resumo.recebimentosContas)} (${resumo.qtdRecebimentosContas})`
        : "",
      resumo.recebimentosContasDinheiro > 0
        ? `  CR em dinheiro: ${fmt(resumo.recebimentosContasDinheiro)}`
        : "",
      "================================",
      "    RECEITA TOTAL DO DIA",
      `        ${fmt(receitaTotalDia)}`,
      "================================",
      "--- CAIXA (GAVETA) ---",
      `Abertura:         ${fmt(resumo.saldoInicial)}`,
      `(+) Dinheiro:     ${fmt(pg.dinheiro)}`,
      resumo.recebimentosContasDinheiro > 0
        ? `(+) Receb. CR:    ${fmt(resumo.recebimentosContasDinheiro)}`
        : "",
      `(+) Suprimentos:  ${fmt(resumo.suprimentos)}`,
      `(-) Sangrias:     ${fmt(resumo.sangrias)}`,
      `= Saldo dinheiro: ${fmt(saldoDinheiroEsperado)}`,
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
    ): Promise<{ ok: boolean; status: number; error?: string }> => {
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
              totalEntradas: caixa.totalEntradas,
              totalSaidas: caixa.totalSaidas,
              dataAberturaReal: caixa.dataAbertura?.toISOString() ?? null,
              // Consolidação ERP (por origem + por pagamento + totais) para o
              // comprovante de fechamento e futura impressão térmica. JSONB — sem schema novo.
              resumoFechamento: resumo,
              saldoDinheiroEsperado,
              operadores: operadoresSessao,
              terminalId,
              terminalLabel,
            },
          }),
        })
        if (res.ok) return { ok: true, status: res.status }
        const errData = (await res.json().catch(() => null)) as { error?: string } | null
        return { ok: false, status: res.status, error: errData?.error }
      } catch (err: unknown) {
        return { ok: false, status: 0, error: err instanceof Error ? err.message : "Falha de rede" }
      }
    }

    // Reconciliação (Regra 5): busca a sessão ABERTA atual da loja no servidor.
    const buscarSessaoAberta = async (): Promise<string | null> => {
      try {
        const res = await fetch("/api/ops/caixa/sessoes?status=ABERTA&take=1", {
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

        if (r.ok) persisted = true
        else lastError = { status: r.status, error: r.error }
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

    // ── Sucesso confirmado pelo servidor: agora sim, encerra localmente ─────
    if (valorContado !== "" && temDiferenca) {
      appendAuditLog({
        action: "quebra_caixa",
        userLabel: `${userAudit} (fechamento)`,
        detail: `Esperado ${fmt(saldoEsperado)} | Contado ${fmt(valorContadoNum)} | Diferença ${fmt(diferenca)} | Dia: Din ${fmt(ledger.vendasDinheiro)} Pix ${fmt(ledger.vendasPix)} Déb ${fmt(ledger.vendasCartaoDebito)} Créd ${fmt(ledger.vendasCartaoCredito)} Carnê ${fmt(ledger.vendasCarne)} Vale ${fmt(ledger.vendasCreditoVale)}`,
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
    setObservacao("")
    onClose()
    toast({ title: "Caixa fechado", description: "Sessão encerrada e registrada no servidor." })
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-lg border-border bg-card p-0">
        <div className="flex max-h-[90vh] flex-col overflow-hidden">
          <DialogHeader className="shrink-0 px-6 pb-2 pt-6">
            <DialogTitle className="flex items-center gap-2 text-xl font-bold text-foreground">
              <Lock className="h-6 w-6 text-red-500" />
              Fechamento de Caixa
            </DialogTitle>
            <DialogDescription className="text-muted-foreground">
              Confira os valores e conte o dinheiro em caixa antes de fechar.
            </DialogDescription>
          </DialogHeader>

          <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-6">
            <div className="space-y-4 pt-4">
              {/* Cabeçalho da sessão (operador / sessão / data) */}
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                <span className="truncate">
                  {sessaoId ? `Sessão ${sessaoId.slice(0, 12)}…` : "Sessão não registrada"}
                </span>
                <span className="truncate">
                  {operadoresSessao.length
                    ? `Operador: ${operadoresSessao.join(", ")}`
                    : "Operador: —"}
                </span>
                <span className="truncate">{`Terminal: ${terminalLabel}`}</span>
              </div>

              {/* Resumo financeiro — RECEITA TOTAL DO DIA (faturamento, separado da gaveta) */}
              <Card className="border-primary/30 bg-primary/5">
                <CardContent className="space-y-2 pt-4 pb-4">
                  <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
                    <TrendingUp className="h-4 w-4 text-primary" />
                    Resumo financeiro do dia
                  </h3>
                  <div className="space-y-1.5 text-sm">
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">Vendas de produtos</span>
                      <span className="font-medium text-foreground">{fmt(resumo.totalLiquido)}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">Serviços recebidos</span>
                      <span className="font-medium text-foreground">{fmt(resumo.recebimentosContas)}</span>
                    </div>
                    {resumo.outrosRecebimentos > 0 && (
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">Outros recebimentos</span>
                        <span className="font-medium text-foreground">{fmt(resumo.outrosRecebimentos)}</span>
                      </div>
                    )}
                    <Separator className="bg-border" />
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-foreground">Receita total do dia</span>
                      <span className="text-xl font-bold text-primary">{fmt(receitaTotalDia)}</span>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Faturamento do dia (vendas + serviços recebidos). Não inclui abertura nem suprimentos.
                  </p>
                </CardContent>
              </Card>

              {/* KPIs operacionais */}
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <KpiMini label="Vendas" value={String(resumo.qtdVendas)} sub="quantidade" />
                <KpiMini label="Total líquido" value={fmt(resumo.totalLiquido)} accent="text-primary" />
                <KpiMini label="Recebido" value={fmt(resumo.totalRecebido)} accent="text-emerald-500" />
                <KpiMini label="Ticket médio" value={fmt(resumo.ticketMedio)} accent="text-sky-500" />
              </div>

              {/* Vendas por origem */}
              <Card className="bg-secondary border-border">
                <CardContent className="space-y-2 pt-4 pb-4">
                  <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
                    <Layers className="h-4 w-4 text-primary" />
                    Vendas por origem
                  </h3>
                  {resumo.porOrigem.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Nenhuma venda nesta sessão.</p>
                  ) : (
                    <div className="space-y-1.5 text-sm">
                      {resumo.porOrigem.map((o) => (
                        <div key={o.key} className="flex items-center justify-between">
                          <span className="text-muted-foreground">
                            {o.label}
                            <span className="ml-1 text-xs text-muted-foreground/70">({o.qtdItens})</span>
                          </span>
                          <span className="font-medium text-foreground">{fmt(o.valorBruto)}</span>
                        </div>
                      ))}
                      <Separator className="bg-border" />
                      <div className="flex items-center justify-between text-sm font-semibold">
                        <span>Subtotal bruto</span>
                        <span className="text-foreground">{fmt(resumo.subtotalBruto)}</span>
                      </div>
                      {resumo.descontos > 0 && (
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-amber-500">Descontos</span>
                          <span className="font-medium text-amber-500">- {fmt(resumo.descontos)}</span>
                        </div>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Recebimentos de contas (PDV F5 — não são vendas) */}
              {resumo.qtdRecebimentosContas > 0 && (
                <Card className="bg-secondary border-border">
                  <CardContent className="space-y-2 pt-4 pb-4">
                    <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
                      <Wallet className="h-4 w-4 text-violet-500" />
                      Serviços recebidos
                      {opsCarregando ? (
                        <span className="text-xs font-normal text-muted-foreground">(atualizando…)</span>
                      ) : null}
                    </h3>
                    <div className="space-y-1.5 text-sm">
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">
                          Títulos recebidos ({resumo.qtdRecebimentosContas})
                        </span>
                        <span className="font-medium text-violet-600 dark:text-violet-400">
                          {fmt(resumo.recebimentosContas)}
                        </span>
                      </div>
                      {resumo.recebimentosContasDinheiro > 0 &&
                        resumo.recebimentosContasDinheiro < resumo.recebimentosContas && (
                          <div className="flex items-center justify-between text-xs">
                            <span className="text-muted-foreground">Em dinheiro (gaveta)</span>
                            <span className="font-medium text-foreground">
                              {fmt(resumo.recebimentosContasDinheiro)}
                            </span>
                          </div>
                        )}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Baixas de Contas a Receber no PDV — não entram no total de vendas.
                    </p>
                  </CardContent>
                </Card>
              )}

              {/* Formas de pagamento */}
              <Card className="bg-secondary border-border">
                <CardContent className="space-y-2 pt-4 pb-4">
                  <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
                    <DollarSign className="h-4 w-4 text-primary" />
                    Formas de pagamento
                  </h3>
                  <div className="grid grid-cols-1 gap-1.5 text-sm sm:grid-cols-2">
                    <PgtoRow label="Dinheiro" value={resumo.porPagamento.dinheiro} />
                    <PgtoRow label="Pix" value={resumo.porPagamento.pix} />
                    <PgtoRow label="Cartão débito" value={resumo.porPagamento.cartaoDebito} />
                    <PgtoRow label="Cartão crédito" value={resumo.porPagamento.cartaoCredito} />
                    <PgtoRow label="Carnê" value={resumo.porPagamento.carne} />
                    <PgtoRow label="A prazo (fiado)" value={resumo.porPagamento.aPrazo} />
                    <PgtoRow label="Crédito/Vale" value={resumo.porPagamento.creditoVale} />
                  </div>
                  <Separator className="bg-border" />
                  <div className="flex items-center justify-between text-sm font-semibold">
                    <span>Total das vendas</span>
                    <span className="text-primary">{fmt(resumo.porPagamento.total)}</span>
                  </div>
                  {resumo.qtdVendasMultiplas > 0 && (
                    <p className="text-xs text-muted-foreground">
                      {resumo.qtdVendasMultiplas} venda(s) com múltiplas formas de pagamento.
                    </p>
                  )}
                </CardContent>
              </Card>

              {/* Caixa (gaveta) — conferência de dinheiro físico */}
              <Card className="bg-secondary border-border">
                <CardContent className="space-y-3 pt-4 pb-4">
                  <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
                    <Wallet className="h-4 w-4 text-primary" />
                    Caixa (gaveta) — dinheiro físico
                  </h3>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Abertura</span>
                      <span className="font-medium text-foreground">{fmt(resumo.saldoInicial)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-emerald-500">+ Dinheiro (vendas)</span>
                      <span className="font-medium text-emerald-500">+ {fmt(resumo.porPagamento.dinheiro)}</span>
                    </div>
                    {resumo.recebimentosContasDinheiro > 0 && (
                      <div className="flex justify-between">
                        <span className="text-violet-600 dark:text-violet-400">+ Serviços recebidos (dinheiro)</span>
                        <span className="font-medium text-violet-600 dark:text-violet-400">
                          + {fmt(resumo.recebimentosContasDinheiro)}
                        </span>
                      </div>
                    )}
                    <div className="flex justify-between">
                      <span className="text-emerald-500 flex items-center gap-1.5">
                        <TrendingUp className="h-3.5 w-3.5" />+ Suprimentos
                      </span>
                      <span className="font-medium text-emerald-500">+ {fmt(resumo.suprimentos)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-rose-500 flex items-center gap-1.5">
                        <TrendingDown className="h-3.5 w-3.5" />- Sangrias
                      </span>
                      <span className="font-medium text-rose-500">- {fmt(resumo.sangrias)}</span>
                    </div>
                    <Separator className="bg-border" />
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-foreground">Saldo esperado em dinheiro</span>
                      <span className="text-xl font-bold text-primary">{fmt(saldoDinheiroEsperado)}</span>
                    </div>
                  </div>
                  <p className="rounded-md border border-border bg-background/50 px-2.5 py-1.5 text-xs text-muted-foreground">
                    Saldo total movimentado (inclui pix/cartão): {fmt(saldoEsperado)}
                  </p>
                </CardContent>
              </Card>

              {/* Input de Contagem */}
              <div className="space-y-3">
                <Label className="text-sm font-medium">Dinheiro contado na gaveta</Label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground text-lg">
                    R$
                  </span>
                  <Input
                    type="number"
                    placeholder="Digite o dinheiro contado..."
                    value={valorContado}
                    onChange={(e) => setValorContado(e.target.value)}
                    className="pl-12 h-14 text-xl font-bold bg-secondary border-border"
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  Conferência contra o saldo esperado em dinheiro ({fmt(saldoDinheiroEsperado)}). Pix/cartão não entram na gaveta.
                </p>
              </div>

              <div className="space-y-3">
                <Label className="text-sm font-medium">Observação (opcional)</Label>
                <Input
                  placeholder="Ex.: Conferido por supervisor, sangria realizada..."
                  value={observacao}
                  onChange={(e) => setObservacao(e.target.value)}
                  className="h-11 bg-secondary border-border"
                />
              </div>

              {/* Status da Conferência */}
              {valorContado !== "" && (
                <Card
                  className={`border ${temDiferenca ? "bg-amber-500/10 border-amber-500/30" : "bg-green-500/10 border-green-500/30"}`}
                >
                  <CardContent className="pt-4 pb-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        {temDiferenca ? (
                          <AlertTriangle className="w-5 h-5 text-amber-500" />
                        ) : (
                          <CheckCircle className="w-5 h-5 text-green-500" />
                        )}
                        <span className={temDiferenca ? "text-amber-500" : "text-green-500"}>
                          {temDiferenca ? "Diferença Encontrada" : "Conferência OK"}
                        </span>
                      </div>
                      {temDiferenca && (
                        <span
                          className={`font-bold ${diferenca > 0 ? "text-green-500" : "text-red-500"}`}
                        >
                          {diferenca > 0 ? "+" : ""}
                          {fmt(diferenca)}
                        </span>
                      )}
                    </div>
                    {temDiferenca && (
                      <p className="text-xs text-muted-foreground mt-2">
                        {diferenca > 0
                          ? "Há dinheiro a mais no caixa. Verifique se houve entrada não registrada."
                          : "Há dinheiro faltando no caixa. Verifique se houve saída não registrada."}
                      </p>
                    )}
                  </CardContent>
                </Card>
              )}
            </div>
          </div>

          <div className="sticky bottom-0 shrink-0 border-t border-border bg-card px-6 py-4">
            <div className="space-y-3">
              <div className="flex flex-col gap-2 sm:flex-row">
                <Button
                  variant="outline"
                  className="h-12 flex-1 border-border gap-2"
                  onClick={handleImprimirRelatorio}
                >
                  <Printer className="h-4 w-4" />
                  Imprimir relatório
                </Button>
                <Button
                  variant="outline"
                  className="h-12 flex-1 border-border gap-2"
                  onClick={() => void handleCopiarRelatorio()}
                >
                  <Copy className="h-4 w-4" />
                  Copiar resumo
                </Button>
              </div>

              <div className="flex gap-3">
                <Button
                  variant="outline"
                  onClick={onClose}
                  className="h-12 flex-1 border-border"
                  disabled={salvando}
                >
                  Cancelar
                </Button>
                <Button
                  onClick={handleFecharCaixa}
                  disabled={salvando}
                  className="h-12 flex-1 bg-red-500 font-semibold hover:bg-red-600"
                >
                  <Lock className="mr-2 h-4 w-4" />
                  {salvando ? "Salvando..." : "Confirmar Fechamento"}
                </Button>
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function KpiMini({
  label,
  value,
  sub,
  accent = "text-foreground",
}: {
  label: string
  value: string
  sub?: string
  accent?: string
}) {
  return (
    <div className="min-w-0 rounded-lg border border-border bg-card p-3">
      <p className="truncate text-xs text-muted-foreground">{label}</p>
      <p className={`mt-1 truncate text-sm font-bold ${accent}`}>{value}</p>
      {sub && <p className="text-[10px] text-muted-foreground">{sub}</p>}
    </div>
  )
}

function PgtoRow({ label, value }: { label: string; value: number }) {
  const fmtRow = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value)
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className={value > 0 ? "font-medium text-foreground" : "text-muted-foreground/50"}>
        {fmtRow}
      </span>
    </div>
  )
}
