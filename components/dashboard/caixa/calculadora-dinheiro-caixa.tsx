"use client"

import { useRef, useState, type KeyboardEvent } from "react"
import {
  Banknote,
  Calculator,
  Check,
  CheckCircle2,
  ChevronRight,
  Coins,
  Eraser,
  History,
  MinusCircle,
  PlusCircle,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { cn } from "@/lib/utils"
import type { DinheiroContadoDetalhado } from "@/lib/caixa-fechamento-resumo"
import {
  DENOMINACOES_CONTAGEM,
  contagemPreenchida,
  detalheContagem,
  lerDraftContagem,
  limparDraftContagem,
  quantidadeContagem,
  salvarDraftContagem,
  sanitizarQuantidade,
  sessionStorageContagem,
  totalContagemCentavos,
  type DenominacaoContagem,
  type QuantidadesContagem,
} from "@/lib/caixa/contagem-cedulas"

const fmt = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v)

/** Valor de face curto para o rótulo da linha ("R$ 200", "R$ 0,50"). */
const fmtFace = (v: number) =>
  `R$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: v < 1 ? 2 : 0, maximumFractionDigits: 2 })}`

/** Colunas do diálogo (cédulas | moedas). A ordem de foco segue `DENOMINACOES_CONTAGEM`. */
const GRUPOS: Array<{ tipo: DenominacaoContagem["tipo"]; titulo: string; icon: typeof Coins }> = [
  { tipo: "cedula", titulo: "Cédulas", icon: Banknote },
  { tipo: "moeda", titulo: "Moedas", icon: Coins },
]

/**
 * Diferença enquanto conta: neutra sem valor, sucesso quando bate, atenção quando não bate —
 * ainda é contagem, não quebra de caixa (o veredito oficial fica no painel do fechamento).
 * Texto em foreground: a cor semântica vive no ícone, na borda e no fundo.
 */
const ESTADO_CONTAGEM = {
  neutro: { rotulo: "Aguardando quantidades", caixa: "border-border bg-card", icone: "text-muted-foreground", icon: Calculator },
  confere: { rotulo: "Confere com o esperado", caixa: "border-success/40 bg-success/10", icone: "text-success", icon: CheckCircle2 },
  falta: { rotulo: "Falta para o esperado", caixa: "border-warning/50 bg-warning/15", icone: "text-warning", icon: MinusCircle },
  sobra: { rotulo: "Sobra acima do esperado", caixa: "border-warning/50 bg-warning/15", icone: "text-warning", icon: PlusCircle },
} as const

interface CalculadoraDinheiroCaixaProps {
  saldoDinheiroEsperado: number
  /**
   * Chave do rascunho (loja + sessão de caixa — `chaveDraftContagem`). `null` = sessão não
   * identificável: a contagem vive só em memória.
   */
  chaveDraft: string | null
  /** Aplica o total contado (em reais) + o detalhamento no campo "dinheiro contado". */
  onAplicar: (total: number, detalhe: DinheiroContadoDetalhado) => void
}

/**
 * Calculadora de conferência de dinheiro físico do Fechamento de Caixa, em diálogo próprio
 * (antes expandia inline no painel da gaveta). Digita-se a quantidade por denominação e o
 * total é calculado em centavos. O total só vai para o campo "dinheiro contado" por ação
 * explícita ("Aplicar"). Fechar o diálogo (X, Esc, clique fora, "Fechar") NUNCA apaga a
 * contagem: ela fica em rascunho por loja + sessão até "Limpar contagem" ou até o fechamento
 * do caixa ser confirmado pelo servidor (GOAL CAIXA-FECHAMENTO-CALCULADORA-MODAL-PREMIUM-005).
 */
export function CalculadoraDinheiroCaixa({
  saldoDinheiroEsperado,
  chaveDraft,
  onAplicar,
}: CalculadoraDinheiroCaixaProps) {
  const [aberta, setAberta] = useState(false)
  const [quantidades, setQuantidades] = useState<QuantidadesContagem>(() =>
    lerDraftContagem(sessionStorageContagem(), chaveDraft),
  )
  // Contagem veio do rascunho (fechamento reaberto na mesma sessão) — aviso discreto no diálogo.
  const [recuperada, setRecuperada] = useState(() => contagemPreenchida(quantidades))
  // Sessão de caixa mudou com o componente montado: carrega o rascunho DA NOVA sessão (ou nada).
  // A contagem de um caixa nunca é reaproveitada em outro.
  const [chaveCarregada, setChaveCarregada] = useState(chaveDraft)
  if (chaveCarregada !== chaveDraft) {
    const doRascunho = lerDraftContagem(sessionStorageContagem(), chaveDraft)
    setChaveCarregada(chaveDraft)
    setQuantidades(doRascunho)
    setRecuperada(contagemPreenchida(doRascunho))
  }
  const [confirmandoLimpeza, setConfirmandoLimpeza] = useState(false)
  const inputsRef = useRef<Array<HTMLInputElement | null>>([])
  const aplicarRef = useRef<HTMLButtonElement | null>(null)

  const totalCentavos = totalContagemCentavos(quantidades)
  const total = totalCentavos / 100
  const temContagem = totalCentavos > 0
  const preenchida = contagemPreenchida(quantidades)
  const diferenca = total - saldoDinheiroEsperado
  const conferido = Math.abs(diferenca) < 0.01

  const estado: keyof typeof ESTADO_CONTAGEM = !temContagem
    ? "neutro"
    : conferido
      ? "confere"
      : diferenca > 0
        ? "sobra"
        : "falta"
  const cfgEstado = ESTADO_CONTAGEM[estado]
  const EstadoIcon = cfgEstado.icon
  const valorDiferenca = !temContagem
    ? "—"
    : conferido
      ? fmt(0)
      : `${diferenca > 0 ? "+" : "−"} ${fmt(Math.abs(diferenca))}`

  // Toda edição grava o rascunho da sessão (contagem vazia apaga a chave).
  const atualizarQuantidades = (proximas: QuantidadesContagem) => {
    setQuantidades(proximas)
    setRecuperada(false)
    setConfirmandoLimpeza(false)
    salvarDraftContagem(sessionStorageContagem(), chaveDraft, proximas)
  }

  const setQtd = (centavos: number, raw: string) => {
    atualizarQuantidades({ ...quantidades, [centavos]: sanitizarQuantidade(raw) })
  }

  const handleAplicar = () => {
    onAplicar(total, detalheContagem(quantidades))
    // Fecha só a calculadora: o caixa ainda não foi fechado, então o rascunho continua.
    setAberta(false)
  }

  // "Limpar contagem" zera e apaga o rascunho. Com valor contado, pede um segundo clique.
  const handleLimpar = () => {
    if (temContagem && !confirmandoLimpeza) {
      setConfirmandoLimpeza(true)
      return
    }
    setQuantidades({})
    setRecuperada(false)
    setConfirmandoLimpeza(false)
    limparDraftContagem(sessionStorageContagem(), chaveDraft)
    inputsRef.current[0]?.focus()
  }

  // X, Esc, clique fora e "Fechar" só escondem o diálogo — contagem e rascunho permanecem.
  const handleOpenChange = (open: boolean) => {
    setAberta(open)
    setConfirmandoLimpeza(false)
  }

  // Enter avança para o próximo campo (fluxo rápido de caixa); no último, vai para "Aplicar".
  // Nunca submete nem fecha (preventDefault); Tab/Shift+Tab seguem o comportamento nativo.
  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>, index: number) => {
    if (e.key === "Enter") {
      e.preventDefault()
      const proximo = inputsRef.current[index + 1]
      if (proximo) proximo.focus()
      else aplicarRef.current?.focus()
    }
  }

  return (
    <Dialog open={aberta} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <button
          type="button"
          className="group flex w-full min-w-0 items-center gap-2.5 rounded-lg border border-border bg-secondary/40 px-2.5 py-2 text-left transition-colors hover:bg-secondary focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
        >
          <span
            aria-hidden
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-border bg-card text-muted-foreground group-hover:text-foreground"
          >
            <Coins className="h-4 w-4" />
          </span>
          <span className="min-w-0 flex-1 truncate text-sm font-semibold text-foreground">
            Contar por cédulas e moedas
          </span>
          <span className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
            {temContagem ? (
              <span className="whitespace-nowrap font-semibold tabular-nums text-foreground">{fmt(total)}</span>
            ) : (
              "Opcional"
            )}
            <ChevronRight aria-hidden className="h-4 w-4" />
          </span>
        </button>
      </DialogTrigger>

      {/* `p-0!`/`gap-0!` vencem o padding/gap `!important` da densidade operacional. Altura presa
          à viewport: cabeçalho, total e ações ficam sempre visíveis — só o corpo rola. */}
      <DialogContent className="flex max-h-[calc(100dvh-2rem)] flex-col gap-0! overflow-hidden border-border bg-card p-0! sm:max-w-2xl">
        <DialogHeader className="shrink-0 gap-1 border-b border-border px-4 py-3 pr-12 text-left sm:px-5">
          <DialogTitle className="font-display font-bold tracking-tight text-foreground">
            Contagem por cédulas e moedas
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            Informe as quantidades para calcular o dinheiro físico da gaveta.
          </DialogDescription>
          {recuperada && (
            <p className="flex items-center gap-1.5 text-[11px] font-medium text-foreground">
              <History aria-hidden className="h-3.5 w-3.5 shrink-0 text-info" />
              Contagem em andamento recuperada
            </p>
          )}
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3 sm:px-5 sm:py-4">
          <div className="grid min-w-0 grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2">
            {GRUPOS.map((g) => {
              const itens = DENOMINACOES_CONTAGEM.map((d, i) => ({ d, i })).filter(({ d }) => d.tipo === g.tipo)
              const subtotalGrupo =
                itens.reduce((acc, { d }) => acc + d.centavos * quantidadeContagem(quantidades, d.centavos), 0) / 100
              const GrupoIcon = g.icon
              return (
                <fieldset key={g.tipo} className="min-w-0">
                  <legend className="sr-only">{g.titulo}</legend>
                  <div
                    aria-hidden
                    className="mb-1.5 flex min-w-0 items-center justify-between gap-2 rounded-md bg-secondary/70 px-2.5 py-1.5"
                  >
                    <span className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                      <GrupoIcon className="h-3.5 w-3.5" />
                      {g.titulo}
                    </span>
                    <span className="whitespace-nowrap text-xs font-semibold tabular-nums text-foreground">
                      {fmt(subtotalGrupo)}
                    </span>
                  </div>
                  <div className="space-y-1">
                    {itens.map(({ d, i }) => {
                      const valor = d.centavos / 100
                      const qtd = quantidadeContagem(quantidades, d.centavos)
                      const subtotal = (d.centavos * qtd) / 100
                      return (
                        <div
                          key={d.centavos}
                          className={cn(
                            "grid min-w-0 grid-cols-[4.25rem_0.75rem_4.75rem_minmax(0,1fr)] items-center gap-2 rounded-md px-1 py-0.5",
                            qtd > 0 && "bg-secondary/60",
                            d.discreta && "opacity-70",
                          )}
                        >
                          <label
                            htmlFor={`denom-${d.centavos}`}
                            className="whitespace-nowrap text-right text-sm font-semibold tabular-nums text-foreground"
                          >
                            {fmtFace(valor)}
                          </label>
                          <span aria-hidden className="text-center text-xs text-muted-foreground">
                            ×
                          </span>
                          {/* Input nativo (sem data-slot): a densidade operacional encolhe o Input padrão. */}
                          <input
                            id={`denom-${d.centavos}`}
                            ref={(el) => {
                              inputsRef.current[i] = el
                            }}
                            type="text"
                            inputMode="numeric"
                            pattern="[0-9]*"
                            autoComplete="off"
                            placeholder="0"
                            value={quantidades[d.centavos] ?? ""}
                            onChange={(e) => setQtd(d.centavos, e.target.value)}
                            onKeyDown={(e) => handleKeyDown(e, i)}
                            onFocus={(e) => e.currentTarget.select()}
                            aria-label={`Quantidade de ${fmt(valor)}`}
                            className={cn(
                              "h-8 w-full min-w-0 rounded-md border px-2 text-center text-sm font-semibold tabular-nums text-foreground outline-none transition-[color,box-shadow] placeholder:font-normal placeholder:text-muted-foreground/50 focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50",
                              qtd > 0 ? "border-foreground/30 bg-card" : "border-border bg-background",
                            )}
                          />
                          <span
                            className={cn(
                              "whitespace-nowrap text-right text-sm tabular-nums",
                              qtd > 0 ? "font-semibold text-foreground" : "text-muted-foreground/60",
                            )}
                          >
                            {fmt(subtotal)}
                          </span>
                        </div>
                      )
                    })}
                  </div>
                </fieldset>
              )
            })}
          </div>
        </div>

        {/* Total contado × esperado — fora da área rolável, sempre visível. */}
        <div className="grid shrink-0 grid-cols-2 items-stretch gap-x-3 gap-y-2 border-t border-border bg-secondary/40 px-4 py-3 sm:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,1fr)] sm:px-5">
          <div className="col-span-2 flex min-w-0 flex-col justify-center sm:col-span-1">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Total contado</p>
            <p className="whitespace-nowrap font-display text-3xl font-bold leading-tight tracking-tight tabular-nums text-foreground">
              {fmt(total)}
            </p>
          </div>
          <div className="flex min-w-0 flex-col justify-center rounded-md border border-border bg-card px-3 py-2">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Esperado no caixa
            </p>
            <p className="whitespace-nowrap font-display text-base font-bold tabular-nums text-foreground">
              {fmt(saldoDinheiroEsperado)}
            </p>
          </div>
          <div className={cn("flex min-w-0 flex-col justify-center rounded-md border px-3 py-2", cfgEstado.caixa)}>
            <p className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              <EstadoIcon aria-hidden className={cn("h-3.5 w-3.5 shrink-0", cfgEstado.icone)} />
              Diferença
            </p>
            <p className="whitespace-nowrap font-display text-base font-bold tabular-nums text-foreground">
              {valorDiferenca}
            </p>
            <p role="status" className="truncate text-[11px] font-medium text-muted-foreground">
              {cfgEstado.rotulo}
            </p>
          </div>
        </div>

        <div className="flex shrink-0 flex-col-reverse gap-2 border-t border-border bg-card px-4 py-3 sm:flex-row sm:items-center sm:px-5">
          <Button
            type="button"
            variant="ghost"
            onClick={handleLimpar}
            onBlur={() => setConfirmandoLimpeza(false)}
            disabled={!preenchida}
            className={cn(
              "gap-1.5 sm:mr-auto",
              confirmandoLimpeza
                ? "text-destructive hover:text-destructive"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <Eraser className="h-4 w-4" />
            {confirmandoLimpeza ? "Confirmar limpeza" : "Limpar contagem"}
          </Button>
          <Button type="button" variant="outline" onClick={() => handleOpenChange(false)} className="border-border">
            Fechar
          </Button>
          <Button
            ref={aplicarRef}
            type="button"
            onClick={handleAplicar}
            disabled={!temContagem}
            className="gap-2 font-semibold"
          >
            <Check className="h-4 w-4" />
            Aplicar no dinheiro contado
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
