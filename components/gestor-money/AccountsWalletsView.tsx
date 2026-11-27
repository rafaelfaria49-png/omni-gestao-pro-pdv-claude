"use client"

import * as React from "react"
import {
  ArrowLeftRight,
  Banknote,
  Building,
  Landmark,
  Plus,
  QrCode,
  Smartphone,
  Wallet,
} from "lucide-react"
import { cn } from "@/lib/utils"
import {
  TIPOS_CONTA_CARTEIRA,
  type ConsultaFinanceiraSnapshot,
  type OperacaoFeedback,
  type TipoContaCarteira,
} from "@/lib/gestor-money/contracts"
import type { GestorMoneyGateway } from "@/lib/gestor-money/gateway"
import {
  formatarCentavosBRL,
  formatarDataBR,
  parseBRLParaCentavos,
  rotuloTipoConta,
} from "@/lib/gestor-money/money"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { EmptyStateCard } from "./shared"
import type { QuickEntryTab } from "./QuickEntrySheet"

function tipoIcon(tipo: TipoContaCarteira) {
  switch (tipo) {
    case "dinheiro":
      return Banknote
    case "banco":
      return Landmark
    case "pix":
      return QrCode
    case "carteira_digital":
      return Smartphone
    case "caixa":
      return Building
    default:
      return Wallet
  }
}

export function AccountsWalletsView({
  snapshot,
  gateway,
  onOpenQuickEntry,
  onMutationSuccess,
}: {
  snapshot: ConsultaFinanceiraSnapshot
  gateway: GestorMoneyGateway
  onOpenQuickEntry: (tab: QuickEntryTab) => void
  onMutationSuccess: (feedback: OperacaoFeedback) => Promise<void> | void
}) {
  const [filtroTipo, setFiltroTipo] = React.useState<"todos" | TipoContaCarteira>("todos")
  const [modalOpen, setModalOpen] = React.useState(false)
  const [nome, setNome] = React.useState("")
  const [tipo, setTipo] = React.useState<TipoContaCarteira>("banco")
  const [instituicao, setInstituicao] = React.useState("")
  const [identificador, setIdentificador] = React.useState("")
  const [saldoInicial, setSaldoInicial] = React.useState("0,00")
  const [submitting, setSubmitting] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  const contasFiltradas = React.useMemo(
    () => snapshot.contas.filter((c) => filtroTipo === "todos" || c.tipo === filtroTipo),
    [snapshot.contas, filtroTipo]
  )

  const transferencias = React.useMemo(
    () => snapshot.eventos.filter((e) => e.transferencia).slice(0, 8),
    [snapshot.eventos]
  )

  const seletor =
    snapshot.perfil.tipo === "PESSOAL"
      ? ({ tipo: "PESSOAL", perfilId: snapshot.perfil.perfilId } as const)
      : ({ tipo: "EMPRESA", perfilId: snapshot.perfil.perfilId, storeId: snapshot.perfil.storeId } as const)

  const handleCriarConta = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      const centavos = parseBRLParaCentavos(saldoInicial) ?? "0"
      const fb = await gateway.criarConta(seletor, {
        nome,
        tipo,
        saldoInicialCentavos: centavos,
        instituicao: instituicao || undefined,
        identificadorInstrumento: identificador || undefined,
      })
      await onMutationSuccess(fb)
      setModalOpen(false)
      setNome("")
      setInstituicao("")
      setIdentificador("")
      setSaldoInicial("0,00")
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao criar conta.")
    } finally {
      setSubmitting(false)
    }
  }

  const handleToggleAtiva = async (contaId: string, ativo: boolean) => {
    try {
      const fb = await gateway.alternarContaAtiva(seletor, contaId, ativo)
      await onMutationSuccess(fb)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao atualizar status.")
    }
  }

  return (
    <div className="space-y-6" data-testid="gestor-money-contas">
      {/* Header consolidated balance */}
      <div className="flex flex-col gap-4 rounded-2xl border border-emerald-500/25 bg-gradient-to-br from-emerald-500/12 via-card to-card p-5 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-medium text-muted-foreground">
            Saldo consolidado em contas e carteiras ({snapshot.perfil.tipo})
          </p>
          <p className="mt-1 font-display text-3xl font-bold tracking-tight tabular-nums text-foreground">
            {formatarCentavosBRL(snapshot.saldoDisponivelCentavos)}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {snapshot.contas.filter((c) => c.ativo).length} contas ativas · Escopo{" "}
            {snapshot.perfil.tipo === "PESSOAL" ? "pessoal global (sem loja)" : "empresarial da loja"}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="rounded-xl text-xs"
            data-testid="btn-transferir-contas"
            onClick={() => onOpenQuickEntry("transferencia")}
          >
            <ArrowLeftRight className="mr-1.5 h-3.5 w-3.5" />
            Transferir
          </Button>
          <Button
            type="button"
            size="sm"
            className="rounded-xl text-xs"
            data-testid="btn-nova-conta"
            onClick={() => {
              setError(null)
              setModalOpen(true)
            }}
          >
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            Nova conta / carteira
          </Button>
        </div>
      </div>

      {/* Type filter pills */}
      <div className="flex flex-wrap items-center gap-2">
        {(["todos", "dinheiro", "banco", "pix", "carteira_digital"] as const).map((t) => (
          <Button
            key={t}
            type="button"
            size="sm"
            variant={filtroTipo === t ? "default" : "outline"}
            className="rounded-xl text-xs"
            onClick={() => setFiltroTipo(t)}
          >
            {t === "todos" ? "Todas" : rotuloTipoConta(t)}
          </Button>
        ))}
      </div>

      {/* Wallets grid */}
      {contasFiltradas.length === 0 ? (
        <EmptyStateCard
          icon={<Wallet className="h-5 w-5" />}
          title="Nenhuma conta neste filtro"
          description="Cadastre uma conta bancária, chave Pix, dinheiro ou carteira digital para acompanhar saldos e transferências."
          actionLabel="Criar conta"
          onAction={() => setModalOpen(true)}
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {contasFiltradas.map((conta) => {
            const Icon = tipoIcon(conta.tipo)
            return (
              <div
                key={conta.id}
                data-testid={`wallet-card-${conta.id}`}
                className={cn(
                  "rounded-2xl border border-border bg-card p-5 shadow-sm transition-all",
                  !conta.ativo && "opacity-60"
                )}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div
                      className="flex h-11 w-11 items-center justify-center rounded-xl text-white shadow-sm"
                      style={{ backgroundColor: conta.cor }}
                    >
                      <Icon className="h-5 w-5" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="font-display text-base font-semibold text-foreground">{conta.nome}</h3>
                        <span className="rounded-md bg-muted px-2 py-0.5 text-[10px] font-semibold uppercase text-muted-foreground">
                          {rotuloTipoConta(conta.tipo)}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {conta.instituicao || "Conta própria"}
                        {conta.identificadorInstrumento ? ` · ${conta.identificadorInstrumento}` : ""}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] text-muted-foreground">{conta.ativo ? "Ativa" : "Inativa"}</span>
                    <Switch
                      checked={conta.ativo}
                      onCheckedChange={(checked) => handleToggleAtiva(conta.id, checked)}
                      aria-label={`Alternar status da conta ${conta.nome}`}
                    />
                  </div>
                </div>

                <div className="mt-4 flex items-end justify-between gap-4 border-t border-border/70 pt-4">
                  <div>
                    <p className="text-[11px] text-muted-foreground">Saldo atual</p>
                    <p className="font-display text-2xl font-bold tabular-nums text-foreground">
                      {formatarCentavosBRL(conta.saldoCentavos)}
                    </p>
                  </div>
                  <div className="flex gap-4 text-right text-xs">
                    <div>
                      <p className="text-[10px] text-muted-foreground">Entradas</p>
                      <p className="font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">
                        +{formatarCentavosBRL(conta.entradasCentavos)}
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] text-muted-foreground">Saídas</p>
                      <p className="font-semibold tabular-nums text-rose-600 dark:text-rose-400">
                        −{formatarCentavosBRL(conta.saidasCentavos)}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Recent internal transfers */}
      <div className="rounded-2xl border border-border bg-card p-4 sm:p-5 shadow-sm">
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ArrowLeftRight className="h-4 w-4 text-primary" />
            <h3 className="font-display text-sm font-semibold text-foreground">
              Transferências internas recentes
            </h3>
          </div>
          <span className="text-[11px] text-muted-foreground">
            Neutras no DRE/Gastos (G005)
          </span>
        </div>
        {transferencias.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            Nenhuma transferência interna registrada neste período. Use o botão &ldquo;Transferir&rdquo; para movimentar saldo entre contas do mesmo perfil.
          </p>
        ) : (
          <div className="space-y-2">
            {transferencias.map((tr) => (
              <div
                key={tr.id}
                className="flex items-center justify-between gap-2 rounded-xl border border-border/70 bg-muted/20 px-3.5 py-2.5 text-xs"
              >
                <div>
                  <p className="font-medium text-foreground">{tr.descricao}</p>
                  <p className="text-muted-foreground">
                    {formatarDataBR(tr.dia)} · {tr.carteiraNome}
                  </p>
                </div>
                <span className="font-display font-bold tabular-nums text-foreground">
                  {tr.tipo === "entrada" ? "+" : "−"}
                  {formatarCentavosBRL(tr.valorCentavos)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Create account modal */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="rounded-2xl sm:max-w-[440px]">
          <DialogHeader>
            <DialogTitle className="font-display">Nova conta ou carteira</DialogTitle>
            <DialogDescription className="text-xs">
              Contrato G002 · Vinculada exclusivamente ao perfil {snapshot.perfil.tipo}.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCriarConta} className="space-y-3.5">
            <div className="space-y-1.5">
              <Label>Nome da conta</Label>
              <Input
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                placeholder="Ex: Conta Corrente Itaú"
                required
                className="rounded-xl"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Tipo</Label>
                <Select value={tipo} onValueChange={(v) => setTipo(v as TipoContaCarteira)}>
                  <SelectTrigger className="rounded-xl">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TIPOS_CONTA_CARTEIRA.map((t) => (
                      <SelectItem key={t} value={t}>
                        {rotuloTipoConta(t)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Saldo inicial (R$)</Label>
                <Input
                  value={saldoInicial}
                  onChange={(e) => setSaldoInicial(e.target.value)}
                  placeholder="0,00"
                  className="rounded-xl"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Instituição (opcional)</Label>
                <Input
                  value={instituicao}
                  onChange={(e) => setInstituicao(e.target.value)}
                  placeholder="Ex: Nubank, Inter..."
                  className="rounded-xl"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Identificador / Chave</Label>
                <Input
                  value={identificador}
                  onChange={(e) => setIdentificador(e.target.value)}
                  placeholder="Chave Pix ou Agência"
                  className="rounded-xl"
                />
              </div>
            </div>
            {error && <p className="text-xs text-rose-500">{error}</p>}
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" className="rounded-xl" onClick={() => setModalOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" className="rounded-xl" disabled={submitting}>
                Salvar conta
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
