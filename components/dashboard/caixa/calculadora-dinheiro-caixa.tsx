"use client"

import { useRef, useState, type KeyboardEvent } from "react"
import { Coins, Banknote, ChevronDown, Check, Eraser } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { cn } from "@/lib/utils"
import type { DinheiroContadoDetalhado } from "@/lib/caixa-fechamento-resumo"

const fmt = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v)

/** Valor de face curto para o rótulo da linha ("R$ 200", "R$ 0,50"). */
const fmtFace = (v: number) =>
  `R$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: v < 1 ? 2 : 0, maximumFractionDigits: 2 })}`

/** Subtotal sem símbolo — a coluna já é monetária e precisa caber na grade de duas colunas. */
const fmtNum = (v: number) => v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })

/**
 * Denominações do Real em **centavos** (cálculo monetário seguro — evita erro de
 * ponto flutuante). `discreta` = pouco usada (R$ 0,01), renderizada com menos destaque.
 */
interface Denominacao {
  centavos: number
  tipo: "cedula" | "moeda"
  discreta?: boolean
}

const DENOMINACOES: Denominacao[] = [
  { centavos: 20000, tipo: "cedula" },
  { centavos: 10000, tipo: "cedula" },
  { centavos: 5000, tipo: "cedula" },
  { centavos: 2000, tipo: "cedula" },
  { centavos: 1000, tipo: "cedula" },
  { centavos: 500, tipo: "cedula" },
  { centavos: 200, tipo: "cedula" },
  { centavos: 100, tipo: "moeda" },
  { centavos: 50, tipo: "moeda" },
  { centavos: 25, tipo: "moeda" },
  { centavos: 10, tipo: "moeda" },
  { centavos: 5, tipo: "moeda" },
  { centavos: 1, tipo: "moeda", discreta: true },
]

/** Colunas da grade (cédulas | moedas). A ordem de foco segue `DENOMINACOES`. */
const GRUPOS: Array<{ tipo: Denominacao["tipo"]; titulo: string; icon: typeof Coins }> = [
  { tipo: "cedula", titulo: "Cédulas", icon: Banknote },
  { tipo: "moeda", titulo: "Moedas", icon: Coins },
]

interface CalculadoraDinheiroCaixaProps {
  saldoDinheiroEsperado: number
  /** Aplica o total contado (em reais) + o detalhamento no campo "dinheiro contado". */
  onAplicar: (total: number, detalhe: DinheiroContadoDetalhado) => void
}

/**
 * Calculadora de conferência de dinheiro físico do Fechamento de Caixa. Digita-se
 * a quantidade por denominação (cédulas/moedas) e o total é calculado em centavos.
 * O total só é escrito no campo "dinheiro contado" por ação explícita ("Aplicar");
 * "Limpar" zera apenas as quantidades da calculadora, sem tocar no valor já aplicado.
 */
export function CalculadoraDinheiroCaixa({
  saldoDinheiroEsperado,
  onAplicar,
}: CalculadoraDinheiroCaixaProps) {
  const [aberta, setAberta] = useState(false)
  // Quantidade por denominação (chave = centavos). String para permitir campo vazio;
  // sempre sanitizada para inteiro ≥ 0 (sem NaN, negativo ou decimal).
  const [quantidades, setQuantidades] = useState<Record<number, string>>({})
  const inputsRef = useRef<Array<HTMLInputElement | null>>([])

  const qtdDe = (centavos: number) => {
    const n = parseInt(quantidades[centavos] ?? "", 10)
    return Number.isFinite(n) && n > 0 ? n : 0
  }

  const totalCentavos = DENOMINACOES.reduce((acc, d) => acc + d.centavos * qtdDe(d.centavos), 0)
  const total = totalCentavos / 100
  const temContagem = totalCentavos > 0
  const diferenca = total - saldoDinheiroEsperado
  const conferido = Math.abs(diferenca) < 0.01

  // Texto em foreground: o estado é dito por extenso (success/destructive sobre
  // `bg-secondary` ficam abaixo de 4,5:1 em texto pequeno).
  const status = !temContagem
    ? { label: `Esperado ${fmt(saldoDinheiroEsperado)}`, cls: "text-muted-foreground" }
    : conferido
      ? { label: "Confere com o esperado", cls: "text-foreground" }
      : diferenca > 0
        ? { label: `Sobra ${fmt(diferenca)} acima do esperado`, cls: "text-foreground" }
        : { label: `Falta ${fmt(Math.abs(diferenca))} para o esperado`, cls: "text-foreground" }

  const setQtd = (centavos: number, raw: string) => {
    // Só dígitos → inteiro ≥ 0; remove zeros à esquerda; vazio permanece vazio.
    const digits = raw.replace(/\D/g, "")
    const norm = digits === "" ? "" : String(parseInt(digits, 10))
    setQuantidades((prev) => ({ ...prev, [centavos]: norm }))
  }

  const handleAplicar = () => {
    const detalhe: DinheiroContadoDetalhado = {
      total,
      denominacoes: DENOMINACOES.map((d) => {
        const quantidade = qtdDe(d.centavos)
        return {
          valor: d.centavos / 100,
          quantidade,
          subtotal: (d.centavos * quantidade) / 100,
        }
      }),
    }
    onAplicar(total, detalhe)
  }

  const handleLimpar = () => {
    setQuantidades({})
    inputsRef.current[0]?.focus()
  }

  // Enter avança para o próximo campo (fluxo rápido de caixa). Nunca submete nem
  // fecha o modal (preventDefault); Tab/Shift+Tab seguem o comportamento nativo.
  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>, index: number) => {
    if (e.key === "Enter") {
      e.preventDefault()
      inputsRef.current[index + 1]?.focus()
    }
  }

  return (
    <div className="min-w-0 rounded-lg border border-border bg-card">
      <button
        type="button"
        onClick={() => setAberta((v) => !v)}
        aria-expanded={aberta}
        aria-controls="calculadora-denominacoes"
        className="flex w-full min-w-0 items-center justify-between gap-3 rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-secondary/60 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
      >
        <span className="flex min-w-0 items-center gap-2 text-sm font-semibold text-foreground">
          <Coins className="h-4 w-4 shrink-0 text-muted-foreground" />
          <span className="truncate">Contar por cédulas e moedas</span>
        </span>
        <span className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
          {temContagem ? (
            <span className="font-semibold tabular-nums text-foreground">{fmt(total)}</span>
          ) : (
            "Opcional"
          )}
          <ChevronDown className={cn("h-4 w-4 transition-transform", aberta && "rotate-180")} />
        </span>
      </button>

      {aberta && (
        <div id="calculadora-denominacoes" className="space-y-3 border-t border-border px-3 pb-3 pt-2.5">
          <div className="grid min-w-0 grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-2">
            {GRUPOS.map((g) => {
              const itens = DENOMINACOES.map((d, i) => ({ d, i })).filter(({ d }) => d.tipo === g.tipo)
              const subtotalGrupo = itens.reduce((acc, { d }) => acc + d.centavos * qtdDe(d.centavos), 0) / 100
              const GrupoIcon = g.icon
              return (
                <fieldset key={g.tipo} className="min-w-0 space-y-1.5">
                  <legend className="sr-only">{g.titulo}</legend>
                  <div
                    aria-hidden
                    className="flex items-baseline justify-between gap-2 border-b border-border pb-1"
                  >
                    <span className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                      <GrupoIcon className="h-3 w-3" />
                      {g.titulo}
                    </span>
                    <span className="text-xs font-semibold tabular-nums text-muted-foreground">
                      {fmt(subtotalGrupo)}
                    </span>
                  </div>
                  {itens.map(({ d, i }) => {
                    const valor = d.centavos / 100
                    const qtd = qtdDe(d.centavos)
                    const subtotal = (d.centavos * qtd) / 100
                    return (
                      <div
                        key={d.centavos}
                        className={cn(
                          "grid grid-cols-[3.5rem_0.625rem_3.5rem_minmax(0,1fr)] items-center gap-1.5",
                          d.discreta && "opacity-70",
                        )}
                      >
                        <Label
                          htmlFor={`denom-${d.centavos}`}
                          className="justify-end whitespace-nowrap text-right font-semibold tabular-nums text-foreground"
                        >
                          {fmtFace(valor)}
                        </Label>
                        <span aria-hidden className="text-center text-xs text-muted-foreground">
                          ×
                        </span>
                        <Input
                          id={`denom-${d.centavos}`}
                          ref={(el) => {
                            inputsRef.current[i] = el
                          }}
                          inputMode="numeric"
                          pattern="[0-9]*"
                          placeholder="0"
                          value={quantidades[d.centavos] ?? ""}
                          onChange={(e) => setQtd(d.centavos, e.target.value)}
                          onKeyDown={(e) => handleKeyDown(e, i)}
                          onFocus={(e) => e.currentTarget.select()}
                          aria-label={`Quantidade de ${fmt(valor)}`}
                          className={cn(
                            "h-8 px-1 text-center font-semibold tabular-nums",
                            qtd > 0 ? "border-border bg-card" : "bg-background",
                          )}
                        />
                        <span
                          className={cn(
                            "truncate text-right text-xs tabular-nums",
                            qtd > 0 ? "font-semibold text-foreground" : "text-muted-foreground/60",
                          )}
                        >
                          {fmtNum(subtotal)}
                        </span>
                      </div>
                    )
                  })}
                </fieldset>
              )
            })}
          </div>

          <div className="flex min-w-0 items-center justify-between gap-3 rounded-md bg-secondary px-3 py-2">
            <div className="min-w-0 leading-tight">
              <p className="text-xs text-muted-foreground">Total pelas denominações</p>
              <p className={cn("truncate text-xs font-medium", status.cls)}>{status.label}</p>
            </div>
            <span className="shrink-0 font-display text-xl font-bold tabular-nums text-foreground">
              {fmt(total)}
            </span>
          </div>

          <div className="flex min-w-0 gap-2">
            <Button
              type="button"
              onClick={handleAplicar}
              disabled={!temContagem}
              className="min-w-0 flex-1 gap-2 font-semibold"
            >
              <Check className="h-4 w-4" />
              <span className="truncate">Aplicar no dinheiro contado</span>
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={handleLimpar}
              disabled={!temContagem}
              className="shrink-0 gap-1.5 text-muted-foreground"
            >
              <Eraser className="h-4 w-4" />
              Limpar contagem
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
