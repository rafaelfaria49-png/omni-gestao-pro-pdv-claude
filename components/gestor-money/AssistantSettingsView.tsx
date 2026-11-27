"use client"

import * as React from "react"
import {
  AlertCircle,
  Bell,
  CheckCircle2,
  Lock,
  MessageSquare,
  Save,
  ShieldAlert,
  ShieldCheck,
  WifiOff,
} from "lucide-react"
import { cn } from "@/lib/utils"
import type {
  AssistenteWhatsAppConfig,
  ConsultaFinanceiraSnapshot,
  OperacaoFeedback,
} from "@/lib/gestor-money/contracts"
import type { GestorMoneyGateway } from "@/lib/gestor-money/gateway"
import { formatarCentavosBRL, parseBRLParaCentavos } from "@/lib/gestor-money/money"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

export function AssistantSettingsView({
  snapshot,
  config,
  gateway,
  onSaved,
}: {
  snapshot: ConsultaFinanceiraSnapshot
  config: AssistenteWhatsAppConfig
  gateway: GestorMoneyGateway
  onSaved: (feedback: OperacaoFeedback) => Promise<void> | void
}) {
  const [exigirConfirmacaoSempre, setExigirConfirmacaoSempre] = React.useState(
    config.preferenciasConfirmacao.exigirConfirmacaoSempre
  )
  const [confirmarTrocaPerfil, setConfirmarTrocaPerfil] = React.useState(
    config.preferenciasConfirmacao.confirmarTrocaPerfil
  )
  const [limiteTexto, setLimiteTexto] = React.useState(
    (Number(config.preferenciasConfirmacao.limiteConfirmacaoDuplaCentavos) / 100).toFixed(2).replace(".", ",")
  )
  const [alertasVencimento, setAlertasVencimento] = React.useState(config.notificacoes.alertasVencimento)
  const [diasAntecedencia, setDiasAntecedencia] = React.useState<string>(
    String(config.notificacoes.diasAntecedenciaVencimento)
  )
  const [resumoDiario, setResumoDiario] = React.useState(config.notificacoes.resumoDiario)
  const [horarioResumo, setHorarioResumo] = React.useState(config.notificacoes.horarioResumoDiario)
  const [alertasFatura, setAlertasFatura] = React.useState(config.notificacoes.alertasFaturaCartao)
  const [alertasDivida, setAlertasDivida] = React.useState(config.notificacoes.alertasDividaVencida)
  const [saving, setSaving] = React.useState(false)

  const seletor =
    snapshot.perfil.tipo === "PESSOAL"
      ? ({ tipo: "PESSOAL", perfilId: snapshot.perfil.perfilId } as const)
      : ({ tipo: "EMPRESA", perfilId: snapshot.perfil.perfilId, storeId: snapshot.perfil.storeId } as const)

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    try {
      const limiteCentavos = parseBRLParaCentavos(limiteTexto) ?? "50000"
      const fb = await gateway.salvarPreferenciasAssistente(seletor, {
        preferenciasConfirmacao: {
          exigirConfirmacaoSempre,
          limiteConfirmacaoDuplaCentavos: limiteCentavos,
          confirmarTrocaPerfil,
          exigirComprovanteAcimaCentavos: config.preferenciasConfirmacao.exigirComprovanteAcimaCentavos,
        },
        notificacoes: {
          alertasVencimento,
          diasAntecedenciaVencimento: (Number(diasAntecedencia) as 1 | 3 | 7) || 3,
          resumoDiario,
          horarioResumoDiario: horarioResumo,
          alertasFaturaCartao: alertasFatura,
          alertasDividaVencida: alertasDivida,
        },
      })
      await onSaved(fb)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6" data-testid="gestor-money-assistente">
      <div>
        <h2 className="font-display text-lg font-semibold text-foreground">Configurações do assistente</h2>
        <p className="text-xs text-muted-foreground">
          WhatsApp canal GESTAO (G006/G007), preferências de confirmação e notificações financeiras
        </p>
      </div>

      {/* Real WhatsApp Connection State Card — NEVER faked as connected */}
      <div className="rounded-2xl border border-amber-500/30 bg-card p-5 shadow-sm">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-3.5">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-amber-500/15 text-amber-600 dark:text-amber-400">
              {config.estadoConexao === "ATIVO" ? (
                <MessageSquare className="h-5 w-5" />
              ) : (
                <WifiOff className="h-5 w-5" />
              )}
            </div>
            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="font-display text-base font-semibold text-foreground">
                  Conexão WhatsApp · Canal {config.canalPapel}
                </h3>
                <span
                  data-testid="whatsapp-real-status-badge"
                  className={cn(
                    "inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold",
                    config.estadoConexao === "ATIVO"
                      ? "border-emerald-500/30 bg-emerald-500/12 text-emerald-600 dark:text-emerald-300"
                      : "border-amber-500/30 bg-amber-500/12 text-amber-700 dark:text-amber-300"
                  )}
                >
                  <AlertCircle className="h-3 w-3" />
                  {config.estadoConexao === "DESCONECTADO_AGUARDANDO_G007"
                    ? "Desconectado · Aguardando G007"
                    : config.estadoConexao}
                </span>
              </div>
              <p className="text-xs leading-relaxed text-muted-foreground">{config.estadoDescricao}</p>
              <div className="mt-2 flex flex-wrap gap-3 pt-1 text-[11px] text-muted-foreground">
                <span>
                  Canal G006: <strong>{config.canalAtivo ? "Ativo" : "Inativo"}</strong>
                </span>
                <span>
                  Worker fila: <strong>{config.workerFilaAtivo ? "Online" : "Offline"}</strong>
                </span>
                <span>
                  Número vinculado: <strong>{config.numeroVinculadoMascarado ?? "Nenhum"}</strong>
                </span>
              </div>
            </div>
          </div>

          <div className="flex shrink-0 flex-col items-end gap-1.5">
            <Button
              type="button"
              size="sm"
              disabled={!config.podeAlterarConexaoReal}
              data-testid="btn-conectar-whatsapp-disabled"
              className="rounded-xl text-xs"
            >
              <Lock className="mr-1.5 h-3.5 w-3.5" />
              Vincular WhatsApp (Requer G007)
            </Button>
            {config.motivoConexaoIndisponivel && (
              <span className="max-w-[260px] text-right text-[10px] text-muted-foreground">
                {config.motivoConexaoIndisponivel}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Preferences Form */}
      <form onSubmit={handleSave} className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="space-y-4 rounded-2xl border border-border bg-card p-5 shadow-sm">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-primary" />
            <h3 className="font-display text-sm font-semibold text-foreground">
              Preferências de confirmação
            </h3>
          </div>

          <div className="flex items-center justify-between gap-3 rounded-xl bg-muted/25 p-3">
            <div>
              <p className="text-xs font-medium text-foreground">Exigir confirmação antes de gravar</p>
              <p className="text-[11px] text-muted-foreground">
                O assistente prepara revisão G004 e aguarda seu &ldquo;Confirmar&rdquo; antes de aplicar.
              </p>
            </div>
            <Switch checked={exigirConfirmacaoSempre} onCheckedChange={setExigirConfirmacaoSempre} />
          </div>

          <div className="flex items-center justify-between gap-3 rounded-xl bg-muted/25 p-3">
            <div>
              <p className="text-xs font-medium text-foreground">Confirmar troca entre Pessoal e Empresa</p>
              <p className="text-[11px] text-muted-foreground">
                Impede lançar gasto pessoal na empresa por engano em conversas ambíguas (G008).
              </p>
            </div>
            <Switch checked={confirmarTrocaPerfil} onCheckedChange={setConfirmarTrocaPerfil} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="assist-limite" className="text-xs">
              Limite para confirmação reforçada (R$)
            </Label>
            <Input
              id="assist-limite"
              value={limiteTexto}
              onChange={(e) => setLimiteTexto(e.target.value)}
              className="rounded-xl font-display font-semibold tabular-nums"
            />
            <p className="text-[11px] text-muted-foreground">
              Atual: {formatarCentavosBRL(config.preferenciasConfirmacao.limiteConfirmacaoDuplaCentavos)}
            </p>
          </div>
        </div>

        <div className="space-y-4 rounded-2xl border border-border bg-card p-5 shadow-sm">
          <div className="flex items-center gap-2">
            <Bell className="h-4 w-4 text-primary" />
            <h3 className="font-display text-sm font-semibold text-foreground">Notificações e alertas</h3>
          </div>

          <div className="flex items-center justify-between gap-3 rounded-xl bg-muted/25 p-3">
            <div>
              <p className="text-xs font-medium text-foreground">Alertas de próximos vencimentos</p>
              <p className="text-[11px] text-muted-foreground">
                Notificar contas a pagar e parcelas antes do vencimento.
              </p>
            </div>
            <Switch checked={alertasVencimento} onCheckedChange={setAlertasVencimento} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Antecedência</Label>
              <Select value={diasAntecedencia} onValueChange={setDiasAntecedencia}>
                <SelectTrigger className="rounded-xl text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">1 dia antes</SelectItem>
                  <SelectItem value="3">3 dias antes</SelectItem>
                  <SelectItem value="7">7 dias antes</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="assist-hora" className="text-xs">
                Horário do resumo diário
              </Label>
              <Input
                id="assist-hora"
                type="time"
                value={horarioResumo}
                onChange={(e) => setHorarioResumo(e.target.value)}
                className="rounded-xl text-xs"
              />
            </div>
          </div>

          <div className="flex items-center justify-between gap-3 rounded-xl bg-muted/25 p-3">
            <span className="text-xs font-medium text-foreground">Resumo diário de saldo e vencimentos</span>
            <Switch checked={resumoDiario} onCheckedChange={setResumoDiario} />
          </div>

          <div className="flex items-center justify-between gap-3 rounded-xl bg-muted/25 p-3">
            <span className="text-xs font-medium text-foreground">Alertas de fechamento/vencimento de fatura</span>
            <Switch checked={alertasFatura} onCheckedChange={setAlertasFatura} />
          </div>

          <div className="flex items-center justify-between gap-3 rounded-xl bg-muted/25 p-3">
            <span className="text-xs font-medium text-foreground">Alertas de dívidas vencidas</span>
            <Switch checked={alertasDivida} onCheckedChange={setAlertasDivida} />
          </div>
        </div>

        <div className="flex items-center justify-between rounded-2xl border border-border bg-card px-5 py-3.5 shadow-sm lg:col-span-2">
          <p className="text-xs text-muted-foreground">
            {gateway.mode === "synthetic"
              ? "As preferências abaixo são validadas em memória no ambiente isolado (persistência real após G007)."
              : "Persistência real habilitada após integração com G007."}
          </p>
          <Button
            type="submit"
            size="sm"
            className="rounded-xl text-xs"
            disabled={saving || gateway.mode === "real"}
            data-testid="btn-salvar-preferencias-assistente"
          >
            <Save className="mr-1.5 h-3.5 w-3.5" />
            Salvar preferências
          </Button>
        </div>
      </form>

      {/* G007 / G008 Visual Alignment Readiness (PR #417 — read-only, zero engine duplication) */}
      {config.alinhamentoG007 && (
        <div className="rounded-2xl border border-border bg-card p-5 shadow-sm" data-testid="assistant-g007-alignment">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-primary" />
              <h3 className="font-display text-sm font-semibold text-foreground">
                Contratos G007 & Motor Conversacional G008 (PR #417)
              </h3>
            </div>
            <span className="rounded-full border border-border bg-muted/40 px-2.5 py-0.5 font-mono text-[10px] text-muted-foreground">
              Principal: {config.alinhamentoG007.principalAutorizadoAtual}
            </span>
          </div>
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3 text-xs">
            <div className="rounded-xl border border-border/70 bg-muted/20 p-3">
              <p className="text-[11px] text-muted-foreground">VerificadorVinculo (G007)</p>
              <p className="mt-1 font-semibold text-foreground">
                {config.alinhamentoG007.verificadorVinculoDisponivel ? "Ativo" : "Aguardando G007"}
              </p>
            </div>
            <div className="rounded-xl border border-border/70 bg-muted/20 p-3">
              <p className="text-[11px] text-muted-foreground">Canal GESTAO (G006)</p>
              <p className="mt-1 font-semibold text-foreground">
                {config.alinhamentoG007.canalGestaoRegistrado
                  ? `Registrado (v${config.alinhamentoG007.canalVersao ?? 1})`
                  : "Não registrado"}
              </p>
            </div>
            <div className="rounded-xl border border-border/70 bg-muted/20 p-3">
              <p className="text-[11px] text-muted-foreground">Motor G008 (PR #417)</p>
              <p className="mt-1 font-semibold text-foreground">
                {config.alinhamentoG007.motorConversacionalPr417 === "ATIVO"
                  ? "Ativo"
                  : "Dormente · PR #417"}
              </p>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap gap-2 text-[11px]">
            <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-0.5 text-amber-700 dark:text-amber-300">
              WhatsApp oficial: {config.alinhamentoG007.homologacoes.whatsappOficial ? "Homologado" : "Não homologado"}
            </span>
            <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-0.5 text-amber-700 dark:text-amber-300">
              Áudio (STT): {config.alinhamentoG007.homologacoes.audioStt ? "Homologado" : "Não homologado"}
            </span>
            <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-0.5 text-amber-700 dark:text-amber-300">
              Imagem (OCR): {config.alinhamentoG007.homologacoes.imagemOcr ? "Homologado" : "Não homologado"}
            </span>
          </div>
        </div>
      )}

      {/* Real Integration Dependencies Transparency Matrix */}
      <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
        <div className="mb-3 flex items-center gap-2">
          <ShieldAlert className="h-4 w-4 text-primary" />
          <h3 className="font-display text-sm font-semibold text-foreground">
            Dependências reais de integração (transparência operacional)
          </h3>
        </div>
        <div className="space-y-2">
          {config.dependenciasPendentes.map((dep) => (
            <div
              key={dep.codigo}
              className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border/80 bg-muted/20 px-3.5 py-2.5 text-xs"
            >
              <div>
                <p className="font-semibold text-foreground">
                  <span className="mr-2 font-mono text-[11px] text-primary">{dep.codigo}</span>
                  {dep.titulo}
                </p>
                <p className="text-[11px] text-muted-foreground">{dep.detalhe}</p>
              </div>
              <span className="inline-flex items-center gap-1 rounded-full border border-border bg-background px-2.5 py-0.5 text-[10px] font-semibold text-muted-foreground">
                {dep.status === "DISPONIVEL_EM_SANDBOX" ? (
                  <CheckCircle2 className="h-3 w-3 text-emerald-500" />
                ) : (
                  <Lock className="h-3 w-3 text-amber-500" />
                )}
                {dep.status}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
