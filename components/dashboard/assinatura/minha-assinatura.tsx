"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import {
  Check,
  CheckCircle2,
  Crown,
  FileClock,
  Gem,
  Info,
  QrCode,
  Sparkles,
  XCircle,
  Zap,
  ArrowRight,
} from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { useConfigEmpresa } from "@/lib/config-empresa"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { useToast } from "@/hooks/use-toast"
import { APP_DISPLAY_NAME } from "@/lib/app-brand"
import {
  BILLING_DASHBOARD_PATH,
  OFFICIAL_SUBSCRIPTION_PLANS,
  findOfficialPlanByLocalId,
  type PlanLocalId,
} from "@/lib/subscription-plans-catalog"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

const PLAN_ICONS = {
  bronze: Zap,
  prata: Sparkles,
  ouro: Crown,
  diamante: Gem,
} as const

const recursosComparativo: Record<
  PlanLocalId,
  readonly [string, boolean][]
> = {
  bronze: [
    ["250 créditos IA/mês", true],
    ["PDV rápido", true],
    ["Estoque básico", true],
    ["1 usuário", true],
    ["Suporte chat", true],
    ["NF-e / NFC-e", false],
    ["Multi-lojas", false],
    ["API / integrações", false],
  ],
  prata: [
    ["700 créditos IA/mês", true],
    ["PDV rápido", true],
    ["NF-e / NFC-e", true],
    ["Relatórios de vendas", true],
    ["3 usuários", true],
    ["Marketing IA", false],
    ["Multi-lojas", false],
  ],
  ouro: [
    ["2.000 créditos IA/mês", true],
    ["Marketing IA", true],
    ["Automação WhatsApp", true],
    ["Multi-lojas", true],
    ["Master console", true],
    ["Até 25 lojas", false],
    ["IA preditiva de estoque", false],
  ],
  diamante: [
    ["7.000 créditos IA/mês", true],
    ["IA avançada", true],
    ["Até 25 lojas", true],
    ["API / integrações", true],
    ["IA preditiva de estoque", true],
  ],
}

const GRID_PLANOS = OFFICIAL_SUBSCRIPTION_PLANS.map((plan) => ({
  id: plan.localId,
  nome: plan.name,
  preco: plan.monthlyPrice,
  icone: PLAN_ICONS[plan.localId],
  subtitulo: plan.description,
  bullets: plan.features,
  highlighted: plan.highlighted ?? false,
}))

const notasFiscaisServico = [
  { id: "NF-000213", emissao: "2026-02-10", valor: 99.9, situacao: "Pago" },
  { id: "NF-000214", emissao: "2026-03-10", valor: 99.9, situacao: "Pago" },
  { id: "NF-000215", emissao: "2026-04-10", valor: 99.9, situacao: "Em aberto" },
]

export function MinhaAssinatura() {
  const searchParams = useSearchParams()
  const { config, updateAssinatura, configHydrated } = useConfigEmpresa()
  const { toast } = useToast()
  const [isRenewModalOpen, setIsRenewModalOpen] = useState(false)
  const [serverTrustExpired, setServerTrustExpired] = useState<boolean | null>(null)
  const [mounted, setMounted] = useState(false)
  /** Exemplo estático (não é PIX válido); apenas para demonstração de cópia no painel. */
  const pixPayload =
    "00020126330014BR.GOV.BCB.PIX0111482412050001955204000053039865802BR5920MINHA LOJA PJ     6008CIDADE62070503***6304ABCD"

  useEffect(() => setMounted(true), [])

  const vencimentoStr = (config?.assinatura?.vencimento ?? "").trim()
  const vencimentoValido = /^\d{4}-\d{2}-\d{2}$/.test(vencimentoStr)
  const expiradoLocal = useMemo(() => {
    if (!mounted || !vencimentoValido) return false
    const d = new Date(`${vencimentoStr}T12:00:00`)
    if (Number.isNaN(d.getTime())) return false
    return Date.now() > d.getTime()
  }, [mounted, vencimentoStr, vencimentoValido])

  const expirado = serverTrustExpired ?? expiradoLocal
  const planoRaw = (config?.assinatura?.plano ?? "bronze").toLowerCase()
  const planoAtual: PlanLocalId =
    planoRaw === "prata" || planoRaw === "ouro" || planoRaw === "diamante" ? planoRaw : "bronze"
  const planoOficial = findOfficialPlanByLocalId(planoAtual)
  const recursos = useMemo(() => recursosComparativo[planoAtual] ?? recursosComparativo.bronze, [planoAtual])
  const blockedFlow = searchParams.get("blocked") === "1"

  useEffect(() => {
    void (async () => {
      for (let i = 0; i < 30; i++) {
        try {
          const r = await fetch("/api/subscription/verify", { credentials: "include", cache: "no-store" })
          const j = (await r.json()) as { expired?: boolean; pendingSeal?: boolean }
          if (j.pendingSeal) {
            await new Promise((res) => setTimeout(res, 200))
            continue
          }
          setServerTrustExpired(!!j.expired)
          return
        } catch {
          setServerTrustExpired(true)
          return
        }
      }
      setServerTrustExpired(true)
    })()
  }, [config.assinatura.vencimento, config.assinatura.status])

  useEffect(() => {
    const renew = searchParams.get("renew") === "1"
    const blocked = searchParams.get("blocked") === "1"
    if (renew || blocked) setIsRenewModalOpen(true)
  }, [searchParams])

  const formatDate = (v: string) => {
    const t = (v ?? "").trim()
    if (!/^\d{4}-\d{2}-\d{2}$/.test(t)) return "—"
    const d = new Date(`${t}T12:00:00`)
    return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString("pt-BR")
  }
  const formatCurrency = (value: number) =>
    new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value)


  if (!configHydrated) {
    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center gap-3 rounded-xl bg-background p-8 text-center">
        <p className="text-muted-foreground">Carregando dados da assinatura…</p>
        <p className="text-xs text-muted-foreground max-w-sm">
          Sincronizando com o armazenamento local do navegador para evitar divergência de exibição.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-8 rounded-xl bg-background p-4 lg:p-6">
      <div className="text-center space-y-3">
        <h1 className="text-3xl font-bold text-foreground">Minha Assinatura</h1>
        <p className="text-muted-foreground">Visualização legada — planos alinhados ao site oficial</p>
        <div className="flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
          <Button asChild size="lg" className="gap-2">
            <Link href={BILLING_DASHBOARD_PATH}>
              Gerenciar assinatura
              <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
        </div>
        <p className="mx-auto flex max-w-xl items-center justify-center gap-1.5 text-xs text-muted-foreground">
          <Info className="h-3.5 w-3.5 shrink-0" />
          Gerenciamento real da assinatura em{" "}
          <Link
            href={BILLING_DASHBOARD_PATH}
            className="font-medium text-primary underline-offset-2 hover:underline"
          >
            /dashboard/billing
          </Link>
        </p>
      </div>
      {blockedFlow && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950 dark:border-amber-700 dark:bg-amber-950/30 dark:text-amber-100">
          Seu plano precisa estar ativo para usar PDV, Ordens de Serviço e o Financeiro. Renove abaixo com
          segurança via Pix — em instantes você recupera o acesso completo.
        </div>
      )}

      <div>
        <h2 className="text-lg font-semibold text-foreground text-center mb-2">
          Planos {APP_DISPLAY_NAME}
        </h2>
        <p className="text-sm text-muted-foreground text-center mb-6 max-w-2xl mx-auto">
          Valores e recursos iguais à Landing Page. Checkout, trial e portal Stripe ficam na página de
          assinatura oficial.
        </p>
        <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-4 max-w-6xl mx-auto">
          {GRID_PLANOS.map((p) => {
            const Icon = p.icone
            const isCurrent = p.id === planoAtual
            return (
              <Card
                key={p.id}
                className={`relative flex flex-col border bg-card text-card-foreground shadow-sm transition-colors ${
                  isCurrent
                    ? "border-primary ring-2 ring-primary/30"
                    : p.highlighted
                      ? "border-primary/50 ring-1 ring-primary/20"
                      : "border-border hover:border-primary/40"
                }`}
              >
                {p.highlighted && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-primary px-3 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary-foreground">
                    Mais escolhido
                  </div>
                )}
                {p.id === "diamante" && !p.highlighted && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full border border-border bg-muted px-3 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Enterprise
                  </div>
                )}
                <CardHeader className="pb-2 pt-6">
                  <div className="flex items-center gap-2 text-primary">
                    <Icon className="h-6 w-6" />
                    <CardTitle className="text-xl">{p.nome}</CardTitle>
                  </div>
                  <p className="text-sm text-muted-foreground mt-1">{p.subtitulo}</p>
                  <div className="mt-4 flex items-baseline gap-1">
                    <span className="text-3xl font-bold text-foreground">{formatCurrency(p.preco)}</span>
                    <span className="text-sm text-muted-foreground">/mês</span>
                  </div>
                </CardHeader>
                <CardContent className="flex flex-1 flex-col gap-4 pt-0">
                  <ul className="space-y-2 text-sm text-muted-foreground flex-1">
                    {p.bullets.map((b) => (
                      <li key={b} className="flex gap-2">
                        <Check className="h-4 w-4 shrink-0 text-primary mt-0.5" aria-hidden />
                        <span>{b}</span>
                      </li>
                    ))}
                  </ul>
                  {isCurrent ? (
                    <Button disabled className="w-full bg-secondary text-secondary-foreground cursor-default">
                      Plano atual (local)
                    </Button>
                  ) : (
                    <Button asChild className="w-full bg-primary text-primary-foreground hover:bg-primary/90">
                      <Link href={BILLING_DASHBOARD_PATH}>Assinar via Stripe</Link>
                    </Button>
                  )}
                </CardContent>
              </Card>
            )
          })}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle>Plano Contratado</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="rounded-lg border border-dashed border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
              Dados abaixo vêm do armazenamento local legado (cookie/PIN). Para status real, trial e
              faturas use{" "}
              <Link href={BILLING_DASHBOARD_PATH} className="font-medium text-primary hover:underline">
                /dashboard/billing
              </Link>
              .
            </p>
            <div className="rounded-lg border border-border overflow-hidden">
              <Table>
                <TableBody>
                  <TableRow>
                    <TableCell className="font-medium">Nome do Plano</TableCell>
                    <TableCell className="text-right uppercase">
                      {planoOficial?.name ?? config.assinatura.plano}
                    </TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="font-medium">Referência oficial</TableCell>
                    <TableCell className="text-right">
                      {planoOficial ? formatCurrency(planoOficial.monthlyPrice) : "—"}/mês
                    </TableCell>
                  </TableRow>
                  <TableRow><TableCell className="font-medium">Vencimento</TableCell><TableCell className="text-right">{formatDate(config.assinatura.vencimento)}</TableCell></TableRow>
                  <TableRow><TableCell className="font-medium">Período</TableCell><TableCell className="text-right capitalize">{config.assinatura.periodo}</TableCell></TableRow>
                  <TableRow><TableCell className="font-medium">Valor</TableCell><TableCell className="text-right">{formatCurrency(config.assinatura.valor)}</TableCell></TableRow>
                  <TableRow>
                    <TableCell className="font-medium">Situação</TableCell>
                    <TableCell className="text-right">
                      <Badge className={expirado ? "bg-amber-500 text-white" : "bg-green-600 text-white"}>
                        {expirado ? "Expirado" : "Ativo"}
                      </Badge>
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </div>
            <div className="space-y-2">
              <p className="text-sm font-semibold text-foreground">Forma de Pagamento</p>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  className="border-border bg-secondary hover:bg-secondary/80"
                  onClick={() => toast({ title: "Funcionalidade em breve", description: "Edicao de forma de pagamento sera integrada ao gateway." })}
                >
                  Editar Forma
                </Button>
                <Button
                  className="bg-primary text-primary-foreground hover:bg-primary/90"
                  onClick={() => toast({ title: "Historico exibido abaixo", description: "Consulte a tabela de notas fiscais de servico." })}
                >
                  Historico de Pagamentos
                </Button>
                <Button className="bg-green-600 hover:bg-green-700 text-white" onClick={() => setIsRenewModalOpen(true)}>
                  Renovar (legado / demo)
                </Button>
                <Button variant="outline" asChild>
                  <Link href={BILLING_DASHBOARD_PATH}>Ir para assinatura real</Link>
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle>Recursos</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {recursos.map(([nome, liberado]) => (
              <div key={nome} className="flex items-center justify-between rounded-lg border border-border px-3 py-2 bg-secondary/30">
                <span className="text-sm">{nome}</span>
                {liberado ? (
                  <CheckCircle2 className="w-4 h-4 text-green-600" />
                ) : (
                  <XCircle className="w-4 h-4 text-red-500" />
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileClock className="w-5 h-5 text-primary" />
            Notas Fiscais de Serviço
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nota</TableHead>
                <TableHead>Emissão</TableHead>
                <TableHead className="text-right">Valor</TableHead>
                <TableHead className="text-right">Situação</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {notasFiscaisServico.map((nf) => (
                <TableRow key={nf.id}>
                  <TableCell className="font-medium">{nf.id}</TableCell>
                  <TableCell>{formatDate(nf.emissao)}</TableCell>
                  <TableCell className="text-right">{formatCurrency(nf.valor)}</TableCell>
                  <TableCell className="text-right">{nf.situacao}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={isRenewModalOpen} onOpenChange={setIsRenewModalOpen}>
        <DialogContent className="max-w-lg bg-card border-border text-card-foreground">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <QrCode className="w-5 h-5 text-primary" />
              Renovar Assinatura via Pix
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="rounded-lg border border-border bg-secondary p-3 text-xs break-all">
              {pixPayload}
            </div>
            <Button
              className="w-full bg-green-600 hover:bg-green-700 text-white"
              onClick={async () => {
                await navigator.clipboard.writeText(pixPayload)
                toast({ title: "Pix Copia e Cola copiado" })
              }}
            >
              <Crown className="w-4 h-4 mr-2" />
              Copiar Código Pix
            </Button>
            <Button
              variant="outline"
              className="w-full"
              onClick={() => {
                const novoVencimento = new Date()
                novoVencimento.setMonth(novoVencimento.getMonth() + 1)
                updateAssinatura({
                  status: "ativa",
                  vencimento: novoVencimento.toISOString().split("T")[0],
                })
                setIsRenewModalOpen(false)
                toast({ title: "Assinatura renovada", description: "Vencimento atualizado com sucesso." })
              }}
            >
              Simular confirmação de pagamento
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

