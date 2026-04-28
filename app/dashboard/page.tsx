"use client"

import Link from "next/link"
import {
  AlertTriangle,
  Banknote,
  ClipboardList,
  ShoppingCart,
  TrendingUp,
} from "lucide-react"
import { useEffect, useMemo, useState } from "react"
import { ASSISTEC_LOJA_HEADER } from "@/lib/assistec-headers"
import { resolveLojaIdParaConsultaClientes } from "@/lib/clientes-loja-resolve"
import { useLojaAtiva } from "@/lib/loja-ativa"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { cn } from "@/lib/utils"
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import { Button } from "@/components/ui/button"
import { KpiCard } from "@/components/master-console/KpiCard"

export default function DashboardInicioPage() {
  const { lojaAtivaId, lojas } = useLojaAtiva()
  const lojaHeader = useMemo(() => resolveLojaIdParaConsultaClientes(lojaAtivaId), [lojaAtivaId])
  const lojaNome = useMemo(() => {
    const id = (lojaAtivaId || "").trim()
    const hit = id ? lojas.find((l) => l.id === id) : null
    return (hit?.nomeFantasia || "").trim() || "sua loja"
  }, [lojaAtivaId, lojas])

  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)
  const [cards, setCards] = useState({
    faturamentoHoje: 0,
    osEmAberto: 0,
    alertaEstoqueCount: 0,
    contasReceberHoje: 0,
  })
  const [faturamento7d, setFaturamento7d] = useState<Array<{ day: string; total: number }>>([])
  const [movimentos, setMovimentos] = useState<
    Array<{ kind: "venda" | "os"; id: string; label: string; value: number; at: string }>
  >([])
  const [estoqueCritico, setEstoqueCritico] = useState<Array<{ id: string; name: string; stock: number }>>([])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        setLoading(true)
        const r = await fetch(`/api/dashboard/elite?storeId=${encodeURIComponent(lojaHeader)}`, {
          cache: "no-store",
          credentials: "include",
          headers: { [ASSISTEC_LOJA_HEADER]: lojaHeader },
        })
        const j = (await r.json().catch(() => null)) as any
        if (cancelled) return
        if (!r.ok || !j?.ok) throw new Error(String(j?.error || "Falha ao carregar dashboard"))

        setErr(null)
        setCards({
          faturamentoHoje: Number(j.cards?.faturamentoHoje || 0),
          osEmAberto: Number(j.cards?.osEmAberto || 0),
          alertaEstoqueCount: Number(j.cards?.alertaEstoqueCount || 0),
          contasReceberHoje: Number(j.cards?.contasReceberHoje || 0),
        })
        setFaturamento7d(Array.isArray(j.faturamento7d) ? j.faturamento7d : [])
        setMovimentos(Array.isArray(j.movimentos) ? j.movimentos : [])
        setEstoqueCritico(Array.isArray(j.estoqueCritico) ? j.estoqueCritico : [])
      } catch {
        if (!cancelled) {
          setErr("Falha ao carregar dashboard")
          setCards({ faturamentoHoje: 0, osEmAberto: 0, alertaEstoqueCount: 0, contasReceberHoje: 0 })
          setFaturamento7d([])
          setMovimentos([])
          setEstoqueCritico([])
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [lojaHeader])

  const brl = useMemo(
    () => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }),
    []
  )

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-background p-4 lg:p-8">
      <div className="mx-auto max-w-[1600px] space-y-6 animate-fade-in">
        <div className="flex flex-col gap-1">
          <p className="text-sm font-medium text-muted-foreground">Visão geral</p>
          <h1 className="text-2xl font-bold tracking-tight text-foreground md:text-4xl">
            Olá, <span className="text-primary">Administrador</span>. Acompanhe a{" "}
            <span className="text-primary">{lojaNome}</span>.
          </h1>
          {err ? <p className="text-sm text-destructive">{err}</p> : null}
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
          <KpiCard compact label="Faturamento hoje" value={loading ? "—" : brl.format(cards.faturamentoHoje)} trend="PDV + operações" icon={TrendingUp} tone="success" highlight />
          <KpiCard compact label="OS em aberto" value={loading ? "—" : String(cards.osEmAberto)} trend="Aberto + em análise" icon={ClipboardList} tone="purple" />
          <KpiCard compact label="Estoque crítico" value={loading ? "—" : String(cards.alertaEstoqueCount)} trend="Reposição necessária" icon={AlertTriangle} tone="info" />
          <KpiCard compact label="Receber hoje" value={loading ? "—" : brl.format(cards.contasReceberHoje)} trend="Vencimentos pendentes" icon={Banknote} tone="success" />
        </div>

        <RevenueChart data={faturamento7d} brl={brl} />

        <div className="grid gap-4 xl:grid-cols-2">
          <RecentActivityTable movimentos={movimentos} loading={loading} brl={brl} />
          <CriticalStock items={estoqueCritico} loading={loading} />
        </div>
      </div>
    </div>
  )
}

function RevenueChart({
  data,
  brl,
}: {
  data: Array<{ day: string; total: number }>
  brl: Intl.NumberFormat
}) {
  return (
    <Card className="border-border bg-card shadow-card">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base text-foreground">
          <ShoppingCart className="h-4 w-4 text-primary" />
          RevenueChart · Faturamento dos últimos 7 dias
        </CardTitle>
      </CardHeader>
      <CardContent className="h-[320px]">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ left: 8, right: 8, top: 10, bottom: 0 }}>
            <CartesianGrid stroke="var(--border)" strokeDasharray="4 4" />
            <XAxis
              dataKey="day"
              tickLine={false}
              axisLine={false}
              tick={{ fill: "var(--muted-foreground)", fontSize: 12 }}
              tickFormatter={(v) => String(v).slice(5)}
            />
            <YAxis
              tickLine={false}
              axisLine={false}
              tick={{ fill: "var(--muted-foreground)", fontSize: 12 }}
              tickFormatter={(v) => `${Number(v) / 1000}k`}
            />
            <Tooltip
              cursor={{ stroke: "var(--primary)", strokeWidth: 1 }}
              contentStyle={{
                background: "var(--card)",
                border: "1px solid var(--border)",
                borderRadius: 12,
                color: "var(--foreground)",
              }}
              formatter={(value: any) => brl.format(Number(value || 0))}
              labelFormatter={(l) => `Dia ${String(l)}`}
            />
            <Area
              type="monotone"
              dataKey="total"
              stroke="var(--primary)"
              fill="color-mix(in oklch, var(--primary) 18%, transparent)"
              strokeWidth={2.25}
              dot={false}
              activeDot={{ r: 4 }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  )
}

function RecentActivityTable({
  movimentos,
  loading,
  brl,
}: {
  movimentos: Array<{ kind: "venda" | "os"; id: string; label: string; value: number; at: string }>
  loading: boolean
  brl: Intl.NumberFormat
}) {
  return (
    <Card className="border-border bg-card shadow-card">
      <CardHeader className="pb-3">
        <CardTitle className="text-base text-foreground">RecentActivityTable</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="overflow-hidden rounded-xl border border-border">
          <table className="w-full text-sm">
            <thead className="bg-panel">
              <tr className="text-left">
                <th className="px-3 py-2 font-semibold text-foreground">Cliente</th>
                <th className="px-3 py-2 font-semibold text-foreground">Valor</th>
                <th className="px-3 py-2 font-semibold text-foreground">Data</th>
              </tr>
            </thead>
            <tbody>
              {movimentos.length === 0 ? (
                <tr>
                  <td colSpan={3} className="px-3 py-6 text-center text-muted-foreground">
                    {loading ? "Carregando..." : "Sem movimentações recentes."}
                  </td>
                </tr>
              ) : (
                movimentos.map((m) => (
                  <tr key={`${m.kind}-${m.id}`} className="border-t border-border transition-smooth hover:bg-panel/60">
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-2">
                        <span
                          className={cn(
                            "inline-flex h-6 items-center rounded-md px-2 text-[11px] font-semibold",
                            m.kind === "venda" ? "bg-success/15 text-success" : "bg-info/15 text-info"
                          )}
                        >
                          {m.kind === "venda" ? "Venda" : "OS"}
                        </span>
                        <span className="truncate font-medium text-foreground">{m.label}</span>
                      </div>
                    </td>
                    <td className="px-3 py-2 tabular-nums font-semibold text-foreground">{brl.format(m.value)}</td>
                    <td className="px-3 py-2 text-muted-foreground">{new Date(m.at).toLocaleString("pt-BR")}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  )
}

function CriticalStock({
  items,
  loading,
}: {
  items: Array<{ id: string; name: string; stock: number }>
  loading: boolean
}) {
  return (
    <Card className="border-border bg-card shadow-card">
      <CardHeader className="pb-3">
        <CardTitle className="text-base text-foreground">CriticalStock</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {items.length === 0 ? (
          <div className="rounded-xl border border-border bg-panel/50 px-4 py-6 text-center text-sm text-muted-foreground">
            {loading ? "Carregando..." : "Sem itens para exibir."}
          </div>
        ) : (
          <ul className="space-y-2">
            {items.map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-3 rounded-xl border border-border bg-panel/50 px-3 py-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-foreground">{p.name}</p>
                  <p className="text-xs text-muted-foreground">
                    Estoque atual: <span className="font-semibold tabular-nums">{p.stock}</span>
                  </p>
                </div>
                <Button type="button" size="sm" variant="outline" asChild className="shrink-0 rounded-xl">
                  <Link href="/?page=planejamento-compras">Pedir mais</Link>
                </Button>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}
