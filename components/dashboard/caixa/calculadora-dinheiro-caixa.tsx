"use client"

import { useRef, useState, type KeyboardEvent } from "react"
import { Coins, Banknote, ChevronDown, Check, Eraser } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { cn } from "@/lib/utils"
import type { DinheiroContadoDetalhado } from "@/lib/caixa-fechamento-resumo"

const fmt = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v)

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

  const status = !temContagem
    ? { label: "Aguardando contagem", cls: "text-muted-foreground" }
    : conferido
      ? { label: "Contagem confere", cls: "text-success" }
      : diferenca > 0
        ? { label: "Sobra", cls: "text-success" }
        : { label: "Falta", cls: "text-destructive" }

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
    <Card className="border-border bg-secondary">
      <CardContent className="p-0">
        <button
          type="button"
          onClick={() => setAberta((v) => !v)}
          aria-expanded={aberta}
          className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
        >
          <span className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <Coins className="h-4 w-4 text-primary" />
            Calculadora de cédulas e moedas
          </span>
          <span className="flex items-center gap-2 text-xs text-muted-foreground">
            {temContagem ? (
              <span className="font-medium tabular-nums text-foreground">{fmt(total)}</span>
            ) : (
              "Contar dinheiro"
            )}
            <ChevronDown className={cn("h-4 w-4 transition-transform", aberta && "rotate-180")} />
          </span>
        </button>

        {aberta && (
          <div className="space-y-3 border-t border-border px-4 pb-4 pt-3">
            <div className="space-y-1.5">
              {DENOMINACOES.map((d, i) => {
                const valor = d.centavos / 100
                const qtd = qtdDe(d.centavos)
                const subtotal = (d.centavos * qtd) / 100
                const primeiraMoeda = d.tipo === "moeda" && DENOMINACOES[i - 1]?.tipo === "cedula"
                return (
                  <div key={d.centavos}>
                    {i === 0 && <GroupLabel icon={Banknote} text="Cédulas" />}
                    {primeiraMoeda && <GroupLabel icon={Coins} text="Moedas" />}
                    <div
                      className={cn(
                        "grid grid-cols-[minmax(0,1fr)_4.5rem_5.5rem] items-center gap-2",
                        d.discreta && "opacity-70",
                      )}
                    >
                      <Label
                        htmlFor={`denom-${d.centavos}`}
                        className="text-sm tabular-nums text-muted-foreground"
                      >
                        {fmt(valor)}
                      </Label>
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
                        className="h-9 bg-background text-center tabular-nums"
                      />
                      <span
                        className={cn(
                          "text-right text-sm tabular-nums",
                          qtd > 0 ? "font-medium text-foreground" : "text-muted-foreground/50",
                        )}
                      >
                        {fmt(subtotal)}
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>

            <Separator className="bg-border" />

            <div className="space-y-1.5 text-sm">
              <div className="flex items-center justify-between gap-3">
                <span className="font-semibold text-foreground">Total contado</span>
                <span className="text-lg font-bold tabular-nums text-foreground">{fmt(total)}</span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-muted-foreground">Dinheiro esperado</span>
                <span className="tabular-nums text-muted-foreground">{fmt(saldoDinheiroEsperado)}</span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className={cn("font-medium", status.cls)}>{status.label}</span>
                {temContagem && (
                  <span className={cn("font-bold tabular-nums", status.cls)}>
                    {diferenca > 0 ? "+" : ""}
                    {fmt(diferenca)}
                  </span>
                )}
              </div>
            </div>

            <div className="flex flex-col gap-2 sm:flex-row">
              <Button
                type="button"
                onClick={handleAplicar}
                disabled={!temContagem}
                className="h-10 flex-1 gap-2 font-semibold"
              >
                <Check className="h-4 w-4" />
                Aplicar no dinheiro contado
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={handleLimpar}
                disabled={!temContagem}
                className="h-10 gap-2 border-border"
              >
                <Eraser className="h-4 w-4" />
                Limpar contagem
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function GroupLabel({ icon: Icon, text }: { icon: typeof Coins; text: string }) {
  return (
    <div className="flex items-center gap-1.5 pb-1 pt-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
      <Icon className="h-3 w-3" />
      {text}
    </div>
  )
}
