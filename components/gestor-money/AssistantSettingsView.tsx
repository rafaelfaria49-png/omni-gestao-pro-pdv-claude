"use client"

import * as React from "react"
import {
  AlertCircle,
  AlertTriangle,
  Bell,
  Check,
  CheckCircle2,
  Clock,
  Copy,
  Loader2,
  Lock,
  MessageSquare,
  Phone,
  RefreshCw,
  Save,
  ShieldAlert,
  ShieldCheck,
  Trash2,
  WifiOff,
  XCircle,
} from "lucide-react"
import { cn } from "@/lib/utils"
import {
  CONSENTIMENTO_WHATSAPP_VERSAO,
  type AssistenteWhatsAppConfig,
  type CodigoPareamentoGerado,
  type ConsultaFinanceiraSnapshot,
  type OperacaoFeedback,
  type PerfilResumo,
  type SituacaoVinculoWhatsAppDados,
  type WhatsAppPairingActions,
} from "@/lib/gestor-money/contracts"
import type { GestorMoneyGateway } from "@/lib/gestor-money/gateway"
import { formatarCentavosBRL, formatarDataBR, parseBRLParaCentavos } from "@/lib/gestor-money/money"
import {
  calcularContagemRegressiva,
  normalizarTelefoneE164,
  validarTelefoneE164,
} from "@/lib/gestor-money/whatsapp-pairing"
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

const POLLING_INTERVAL_MS = 4000

function formatarCodigoDisplay(codigo: string): string {
  const digits = codigo.replace(/\D/g, "")
  if (digits.length === 6) return `${digits.slice(0, 3)} ${digits.slice(3)}`
  return codigo
}

function formatarDataHoraBR(iso: string): string {
  const data = formatarDataBR(iso)
  const horaMatch = /T(\d{2}:\d{2})/.exec(iso)
  return horaMatch ? `${data} às ${horaMatch[1]}` : data
}

export function AssistantSettingsView({
  snapshot,
  perfisAutorizados = [],
  config,
  gateway,
  pairingActions,
  onSaved,
  onPairingChanged,
  pollingIntervalMs = POLLING_INTERVAL_MS,
}: {
  snapshot: ConsultaFinanceiraSnapshot
  perfisAutorizados?: PerfilResumo[]
  config: AssistenteWhatsAppConfig
  gateway: GestorMoneyGateway
  pairingActions: WhatsAppPairingActions
  onSaved: (feedback: OperacaoFeedback) => Promise<void> | void
  onPairingChanged?: () => Promise<void> | void
  pollingIntervalMs?: number
}) {
  // ── Estado do pareamento WhatsApp (Server Actions canônicas G007/G008) ──
  const [situacao, setSituacao] = React.useState<SituacaoVinculoWhatsAppDados | null>(
    config.situacaoVinculoInicial ?? null
  )
  const [carregandoSituacao, setCarregandoSituacao] = React.useState(false)
  const [canalIndisponivelPorAcao, setCanalIndisponivelPorAcao] = React.useState(false)
  const [erroAcao, setErroAcao] = React.useState<string | null>(null)
  const [erroComunicacao, setErroComunicacao] = React.useState<string | null>(null)
  const [feedbackPareamento, setFeedbackPareamento] = React.useState<string | null>(null)

  // Formulário de início / novo pareamento
  const [telefoneInput, setTelefoneInput] = React.useState("")
  const [aceitouConsentimento, setAceitouConsentimento] = React.useState(false)
  const [mostrarFormNovoPareamento, setMostrarFormNovoPareamento] = React.useState(false)
  const [submittingPareamento, setSubmittingPareamento] = React.useState(false)
  const [cancelando, setCancelando] = React.useState(false)
  const [revogarDialogOpen, setRevogarDialogOpen] = React.useState(false)
  const [revogando, setRevogando] = React.useState(false)

  // Código temporário de uso único — mantido APENAS em memória transitória (nunca persistido)
  const [codigoAtivo, setCodigoAtivo] = React.useState<CodigoPareamentoGerado | null>(null)
  const [copiadoCodigo, setCopiadoCodigo] = React.useState(false)
  const [copiadoNumero, setCopiadoNumero] = React.useState(false)

  // Relógio visual 1s para contagem regressiva
  const [agoraMs, setAgoraMs] = React.useState<number>(() => Date.now())

  // ── Preferências autorizadas do assistente ──
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

  const canalDisponivelNoConfig =
    config.podeAlterarConexaoReal &&
    config.canalAtivo &&
    config.estadoConexao !== "DESCONECTADO_AGUARDANDO_G007" &&
    config.estadoConexao !== "CANAL_INATIVO"

  const canalOficialDisponivel = canalDisponivelNoConfig && !canalIndisponivelPorAcao
  const temPendente = Boolean(situacao?.pendente)
  const temVinculo = situacao?.estado === "VINCULADO" && Boolean(situacao.vinculado)

  // Regra inegociável: JAMAIS mostrar WhatsApp conectado quando vínculo OU canal oficial não estiver disponível.
  const whatsappConectadoReal = Boolean(canalOficialDisponivel && temVinculo)

  const consultarSituacaoReal = React.useCallback(
    async (opcoes?: { silencioso?: boolean }) => {
      if (!opcoes?.silencioso) setCarregandoSituacao(true)
      setErroComunicacao(null)
      try {
        const res = await pairingActions.consultarSituacao()
        if (!res.ok) {
          if (res.erro === "Indisponível.") {
            setCanalIndisponivelPorAcao(true)
          } else {
            setErroAcao(res.erro)
          }
          return
        }
        setCanalIndisponivelPorAcao(false)
        setSituacao((anterior) => {
          const novo = res.dados
          // Se o desafio pendente foi concluído, expirado, bloqueado ou cancelado, descartar código transitório da memória.
          if (!novo.pendente) {
            setCodigoAtivo(null)
          }
          // Se acabou de confirmar vínculo (novo pareamento ou inicial), fechar formulário e avisar o pai.
          const confirmouAgora =
            novo.estado === "VINCULADO" &&
            !novo.pendente &&
            (anterior?.pendente !== null || anterior?.estado !== "VINCULADO")
          if (confirmouAgora && anterior !== null) {
            setMostrarFormNovoPareamento(false)
            setFeedbackPareamento(
              `WhatsApp vinculado com sucesso (${novo.vinculado?.telefoneMascarado ?? ""}).`
            )
            void onPairingChanged?.()
          }
          return novo
        })
      } catch {
        setErroComunicacao(
          "Falha de comunicação ao consultar o estado do pareamento WhatsApp. Verifique sua conexão e tente novamente."
        )
      } finally {
        if (!opcoes?.silencioso) setCarregandoSituacao(false)
      }
    },
    [pairingActions, onPairingChanged]
  )

  // Consulta inicial quando o canal oficial ou flag G007 está disponível
  React.useEffect(() => {
    if (canalDisponivelNoConfig || config.canalFlagLigada) {
      void consultarSituacaoReal()
    }
  }, [canalDisponivelNoConfig, config.canalFlagLigada, consultarSituacaoReal])

  // Polling periódico enquanto houver pareamento PENDENTE
  React.useEffect(() => {
    if (!temPendente || !canalOficialDisponivel) return
    const timer = window.setInterval(() => {
      void consultarSituacaoReal({ silencioso: true })
    }, pollingIntervalMs)
    return () => window.clearInterval(timer)
  }, [temPendente, canalOficialDisponivel, pollingIntervalMs, consultarSituacaoReal])

  // Contagem regressiva de validade (1s) enquanto houver `expiraEm` ativo
  const expiraEmAtivo = situacao?.pendente?.expiraEm ?? codigoAtivo?.expiraEm ?? null
  const countdown = calcularContagemRegressiva(expiraEmAtivo, agoraMs)
  const expirouDisparadoRef = React.useRef<string | null>(null)

  React.useEffect(() => {
    if (!expiraEmAtivo) return
    setAgoraMs(Date.now())
    const tick = window.setInterval(() => {
      setAgoraMs(Date.now())
    }, 1000)
    return () => window.clearInterval(tick)
  }, [expiraEmAtivo])

  // Ao chegar em 00:00, reconsulta o relógio do banco para transicionar para EXPIRADO
  React.useEffect(() => {
    if (expiraEmAtivo && countdown.expirado && expirouDisparadoRef.current !== expiraEmAtivo) {
      expirouDisparadoRef.current = expiraEmAtivo
      setCodigoAtivo(null)
      void consultarSituacaoReal({ silencioso: true })
    }
  }, [expiraEmAtivo, countdown.expirado, consultarSituacaoReal])

  const seletor =
    snapshot.perfil.tipo === "PESSOAL"
      ? ({ tipo: "PESSOAL", perfilId: snapshot.perfil.perfilId } as const)
      : ({ tipo: "EMPRESA", perfilId: snapshot.perfil.perfilId, storeId: snapshot.perfil.storeId } as const)

  const handleIniciarPareamento = async (e: React.FormEvent) => {
    e.preventDefault()
    setErroAcao(null)
    setErroComunicacao(null)
    setFeedbackPareamento(null)

    const telefoneE164 = normalizarTelefoneE164(telefoneInput)
    if (!validarTelefoneE164(telefoneE164)) {
      setErroAcao("Informe o telefone no formato internacional E.164, por exemplo +5511999990000.")
      return
    }
    if (!aceitouConsentimento) {
      setErroAcao("É preciso aceitar os termos de uso do assistente pelo WhatsApp.")
      return
    }

    setSubmittingPareamento(true)
    try {
      const res = await pairingActions.gerarCodigo({
        telefoneE164,
        aceitouConsentimento,
      })
      if (!res.ok) {
        if (res.erro === "Indisponível.") {
          setCanalIndisponivelPorAcao(true)
        }
        setErroAcao(res.erro)
        return
      }
      setCanalIndisponivelPorAcao(false)
      setCodigoAtivo(res.dados)
      setMostrarFormNovoPareamento(false)
      setAgoraMs(Date.now())
      setFeedbackPareamento(
        `Código temporário gerado para ${res.dados.telefoneMascarado}. Envie-o pelo WhatsApp em até 10 minutos.`
      )
      // Atualiza a situação oficial do banco (estado PENDENTE + numeroAssistente + tentativasRestantes)
      const sit = await pairingActions.consultarSituacao()
      if (sit.ok) {
        setSituacao(sit.dados)
      } else {
        // Mesmo se a leitura seguinte falhar, preserva exibição local do desafio recém-criado
        setSituacao((prev) => ({
          estado: prev?.estado === "VINCULADO" ? "VINCULADO" : "PENDENTE",
          vinculado: prev?.vinculado ?? null,
          pendente: {
            telefoneMascarado: res.dados.telefoneMascarado,
            expiraEm: res.dados.expiraEm,
            tentativasRestantes: 5,
          },
          consentimentoVersao: prev?.consentimentoVersao ?? CONSENTIMENTO_WHATSAPP_VERSAO,
          numeroAssistente: prev?.numeroAssistente ?? null,
        }))
      }
    } catch {
      setErroComunicacao(
        "Falha de comunicação ao gerar o código de pareamento. Nenhuma vinculação foi alterada; tente novamente."
      )
    } finally {
      setSubmittingPareamento(false)
    }
  }

  const handleCancelarPareamento = async () => {
    setErroAcao(null)
    setErroComunicacao(null)
    setFeedbackPareamento(null)
    setCancelando(true)
    try {
      const res = await pairingActions.cancelarPareamento()
      if (!res.ok) {
        setErroAcao(res.erro)
        return
      }
      setCodigoAtivo(null)
      setFeedbackPareamento(
        res.dados.cancelado
          ? "Pareamento pendente cancelado. O código anterior foi invalidado."
          : "Nenhum pareamento pendente ativo."
      )
      await consultarSituacaoReal({ silencioso: true })
    } catch {
      setErroComunicacao("Falha de comunicação ao cancelar o pareamento pendente. Tente novamente.")
    } finally {
      setCancelando(false)
    }
  }

  const handleConfirmarRevogacao = async () => {
    setErroAcao(null)
    setErroComunicacao(null)
    setFeedbackPareamento(null)
    setRevogando(true)
    try {
      const res = await pairingActions.revogarVinculo()
      if (!res.ok) {
        setErroAcao(res.erro)
        setRevogarDialogOpen(false)
        return
      }
      setCodigoAtivo(null)
      setMostrarFormNovoPareamento(false)
      setRevogarDialogOpen(false)
      setFeedbackPareamento(
        "Vínculo WhatsApp revogado definitivamente. Para voltar a usar, faça um novo pareamento."
      )
      await consultarSituacaoReal({ silencioso: true })
      await onPairingChanged?.()
    } catch {
      setErroComunicacao("Falha de comunicação ao revogar o vínculo WhatsApp. Tente novamente.")
      setRevogarDialogOpen(false)
    } finally {
      setRevogando(false)
    }
  }

  const copiarTexto = async (texto: string, tipo: "codigo" | "numero") => {
    try {
      if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(texto)
      }
      if (tipo === "codigo") {
        setCopiadoCodigo(true)
        window.setTimeout(() => setCopiadoCodigo(false), 2000)
      } else {
        setCopiadoNumero(true)
        window.setTimeout(() => setCopiadoNumero(false), 2000)
      }
    } catch {
      // Sem permissão de clipboard: o usuário pode selecionar manualmente.
    }
  }

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

  const estadoTela = situacao?.estado ?? "SEM_VINCULO"
  const deveMostrarFormularioPareamento =
    canalOficialDisponivel &&
    !temPendente &&
    (!temVinculo || mostrarFormNovoPareamento)

  const badgeLabel = whatsappConectadoReal
    ? "WhatsApp conectado · Canal GESTAO"
    : !canalOficialDisponivel
      ? config.estadoConexao === "CANAL_INATIVO"
        ? "Desconectado · Canal oficial indisponível"
        : "Desconectado · Aguardando G007"
      : estadoTela === "PENDENTE"
        ? "Pareamento pendente"
        : estadoTela === "EXPIRADO"
          ? "Código expirado"
          : estadoTela === "BLOQUEADO"
            ? "Pareamento bloqueado"
            : "Sem vínculo · Pronto para parear"

  const telefoneMascaradoCabecalho =
    situacao?.vinculado?.telefoneMascarado ?? config.numeroVinculadoMascarado ?? null

  return (
    <div className="space-y-6" data-testid="gestor-money-assistente">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-lg font-semibold text-foreground">
            Assistente WhatsApp (G007 / G008)
          </h2>
          <p className="text-xs text-muted-foreground">
            Pareamento seguro por dupla posse (sessão web + código temporário no WhatsApp), status real do canal GESTAO e políticas autorizadas
          </p>
        </div>
        {(canalDisponivelNoConfig || config.canalFlagLigada) && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="rounded-xl text-xs"
            disabled={carregandoSituacao}
            data-testid="btn-atualizar-status-whatsapp"
            onClick={() => void consultarSituacaoReal()}
          >
            <RefreshCw className={cn("mr-1.5 h-3.5 w-3.5", carregandoSituacao && "animate-spin")} />
            Atualizar status
          </Button>
        )}
      </div>

      {/* Real WhatsApp Connection State Card — NEVER faked as connected */}
      <div
        className={cn(
          "rounded-2xl border bg-card p-5 shadow-sm",
          whatsappConectadoReal ? "border-emerald-500/35" : "border-amber-500/30"
        )}
        data-testid="whatsapp-connection-card"
      >
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-3.5">
            <div
              className={cn(
                "flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl",
                whatsappConectadoReal
                  ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                  : "bg-amber-500/15 text-amber-600 dark:text-amber-400"
              )}
            >
              {whatsappConectadoReal ? (
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
                    whatsappConectadoReal
                      ? "border-emerald-500/30 bg-emerald-500/12 text-emerald-600 dark:text-emerald-300"
                      : estadoTela === "BLOQUEADO"
                        ? "border-rose-500/30 bg-rose-500/12 text-rose-600 dark:text-rose-300"
                        : "border-amber-500/30 bg-amber-500/12 text-amber-700 dark:text-amber-300"
                  )}
                >
                  {whatsappConectadoReal ? (
                    <CheckCircle2 className="h-3 w-3" />
                  ) : (
                    <AlertCircle className="h-3 w-3" />
                  )}
                  {badgeLabel}
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
                  Número vinculado:{" "}
                  <strong data-testid="whatsapp-header-linked-number">
                    {telefoneMascaradoCabecalho ?? "Nenhum"}
                  </strong>
                </span>
              </div>
            </div>
          </div>

          {!canalOficialDisponivel && (
            <div className="flex shrink-0 flex-col items-end gap-1.5">
              <Button
                type="button"
                size="sm"
                disabled
                data-testid="btn-conectar-whatsapp-disabled"
                className="rounded-xl text-xs"
              >
                <Lock className="mr-1.5 h-3.5 w-3.5" />
                {config.estadoConexao === "CANAL_INATIVO"
                  ? "Canal oficial indisponível"
                  : "Vincular WhatsApp (Requer G007)"}
              </Button>
              {config.motivoConexaoIndisponivel && (
                <span className="max-w-[260px] text-right text-[10px] text-muted-foreground">
                  {config.motivoConexaoIndisponivel}
                </span>
              )}
            </div>
          )}
        </div>

        {/* Alerta explícito quando o canal oficial está indisponível */}
        {!canalOficialDisponivel && (
          <div
            data-testid="whatsapp-channel-unavailable-banner"
            className="mt-4 flex items-start gap-2.5 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3.5 py-2.5 text-xs text-amber-800 dark:text-amber-200"
          >
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <div className="space-y-1">
              <p className="font-semibold">Canal oficial WhatsApp GESTAO indisponível</p>
              <p className="text-[11px] opacity-90">
                {config.motivoConexaoIndisponivel ??
                  "O pareamento e o envio de mensagens permanecem bloqueados enquanto o canal oficial não estiver ativo e habilitado neste ambiente."}
              </p>
              {temVinculo && situacao?.vinculado && (
                <div className="flex flex-wrap items-center gap-2 pt-1.5">
                  <span className="text-[11px]">
                    Vínculo salvo para <strong>{situacao.vinculado.telefoneMascarado}</strong> (inativo sem canal).
                  </span>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-7 rounded-lg border-rose-500/40 text-[11px] text-rose-600 dark:text-rose-300"
                    data-testid="btn-revogar-vinculo"
                    onClick={() => setRevogarDialogOpen(true)}
                  >
                    <Trash2 className="mr-1 h-3 w-3" />
                    Revogar vínculo
                  </Button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Feedbacks e erros de comunicação / validação */}
      {feedbackPareamento && (
        <div
          role="status"
          data-testid="whatsapp-pairing-feedback"
          className="flex items-center justify-between gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-2.5 text-xs text-emerald-700 dark:text-emerald-300"
        >
          <span className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            {feedbackPareamento}
          </span>
          <button
            type="button"
            className="text-[11px] underline opacity-80 hover:opacity-100"
            onClick={() => setFeedbackPareamento(null)}
          >
            Fechar
          </button>
        </div>
      )}

      {erroComunicacao && (
        <div
          role="alert"
          data-testid="whatsapp-comm-error"
          className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-rose-500/35 bg-rose-500/10 px-4 py-3 text-xs text-rose-700 dark:text-rose-300"
        >
          <div className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{erroComunicacao}</span>
          </div>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-7 rounded-lg border-rose-500/40 text-[11px]"
            data-testid="btn-retry-whatsapp"
            onClick={() => void consultarSituacaoReal()}
          >
            Tentar novamente
          </Button>
        </div>
      )}

      {erroAcao && (
        <div
          role="alert"
          data-testid="whatsapp-pairing-error"
          className="flex items-start gap-2 rounded-xl border border-rose-500/35 bg-rose-500/10 px-4 py-2.5 text-xs text-rose-700 dark:text-rose-300"
        >
          <XCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{erroAcao}</span>
        </div>
      )}

      {/* ── FLUXO CANÔNICO DE PAREAMENTO WHATSAPP (G007 / PR #417) ── */}
      {canalOficialDisponivel && (
        <div
          className="space-y-4 rounded-2xl border border-border bg-card p-5 shadow-sm"
          data-testid="whatsapp-pairing-section"
        >
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-3">
            <div className="flex items-center gap-2">
              <Phone className="h-4 w-4 text-primary" />
              <h3 className="font-display text-sm font-semibold text-foreground">
                Pareamento do número WhatsApp (G007)
              </h3>
            </div>
            <span className="rounded-full border border-border bg-muted/40 px-2.5 py-0.5 font-mono text-[10px] text-muted-foreground">
              Estado: {estadoTela}
            </span>
          </div>

          {/* 1. Estado VINCULADO: telefone mascarado + novo pareamento + revogação */}
          {temVinculo && situacao?.vinculado && (
            <div
              data-testid="whatsapp-linked-card"
              className="flex flex-col gap-3 rounded-xl border border-emerald-500/30 bg-emerald-500/8 p-4 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-700 dark:text-emerald-300">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    Vínculo ativo
                  </span>
                  <span
                    data-testid="whatsapp-linked-phone"
                    className="font-mono text-sm font-bold text-foreground"
                  >
                    {situacao.vinculado.telefoneMascarado}
                  </span>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Vinculado desde {formatarDataHoraBR(situacao.vinculado.desde)} · Consentimento{" "}
                  <span className="font-mono">{situacao.consentimentoVersao}</span>
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {!temPendente && (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="rounded-xl text-xs"
                    data-testid="btn-novo-pareamento"
                    onClick={() => {
                      setErroAcao(null)
                      setMostrarFormNovoPareamento((v) => !v)
                    }}
                  >
                    <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
                    {mostrarFormNovoPareamento ? "Fechar troca" : "Vincular novo telefone"}
                  </Button>
                )}
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="rounded-xl border-rose-500/40 text-xs text-rose-600 hover:bg-rose-500/10 dark:text-rose-300"
                  data-testid="btn-revogar-vinculo"
                  onClick={() => setRevogarDialogOpen(true)}
                >
                  <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                  Revogar vínculo
                </Button>
              </div>
            </div>
          )}

          {/* 2. Estado EXPIRADO (últimos 30 min) */}
          {estadoTela === "EXPIRADO" && !temPendente && (
            <div
              data-testid="whatsapp-state-expirado"
              className="flex items-start gap-2.5 rounded-xl border border-amber-500/35 bg-amber-500/10 px-4 py-3 text-xs text-amber-800 dark:text-amber-200"
            >
              <Clock className="mt-0.5 h-4 w-4 shrink-0" />
              <div className="space-y-0.5">
                <p className="font-semibold">Código de pareamento expirado</p>
                <p className="text-[11px] opacity-90">
                  O código temporário venceu após 10 minutos sem confirmação no WhatsApp. Gere um novo código abaixo para tentar novamente.
                </p>
              </div>
            </div>
          )}

          {/* 3. Estado BLOQUEADO (5 códigos incorretos nos últimos 30 min) */}
          {estadoTela === "BLOQUEADO" && !temPendente && (
            <div
              data-testid="whatsapp-state-bloqueado"
              className="flex items-start gap-2.5 rounded-xl border border-rose-500/35 bg-rose-500/10 px-4 py-3 text-xs text-rose-700 dark:text-rose-300"
            >
              <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
              <div className="space-y-0.5">
                <p className="font-semibold">Pareamento bloqueado por tentativas inválidas</p>
                <p className="text-[11px] opacity-90">
                  Foram atingidas 5 tentativas com código incorreto no desafio anterior. Por segurança, o código foi bloqueado — gere um novo código abaixo.
                </p>
              </div>
            </div>
          )}

          {/* 4. Desafio PENDENTE (novo vínculo ou substituição de número) */}
          {temPendente && situacao?.pendente && (
            <div
              data-testid="whatsapp-pending-panel"
              className="space-y-4 rounded-xl border border-primary/30 bg-primary/5 p-4"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-xs font-semibold text-foreground">
                    {temVinculo
                      ? "Novo pareamento em andamento (substituirá o vínculo atual após confirmação)"
                      : "Aguardando confirmação pelo WhatsApp"}
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    Telefone de destino:{" "}
                    <strong className="font-mono text-foreground" data-testid="whatsapp-pending-phone">
                      {situacao.pendente.telefoneMascarado}
                    </strong>{" "}
                    · Tentativas restantes:{" "}
                    <strong data-testid="whatsapp-pending-attempts">
                      {situacao.pendente.tentativasRestantes}
                    </strong>
                    /5
                  </p>
                </div>
                <div
                  data-testid="whatsapp-pairing-countdown"
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 font-mono text-xs font-bold tabular-nums",
                    countdown.restanteSegundos <= 60
                      ? "border-rose-500/40 bg-rose-500/10 text-rose-600 dark:text-rose-300"
                      : "border-primary/30 bg-background text-foreground"
                  )}
                >
                  <Clock className="h-3.5 w-3.5 text-primary" />
                  <span>Validade: {countdown.formatado}</span>
                </div>
              </div>

              {/* Código temporário exibido UMA única vez (apenas se gerado nesta tela) */}
              {codigoAtivo ? (
                <div
                  data-testid="whatsapp-pairing-code-card"
                  className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div>
                    <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
                      Código temporário de uso único
                    </p>
                    <p
                      data-testid="whatsapp-pairing-code-value"
                      className="mt-1 font-mono text-2xl font-bold tracking-[0.25em] text-foreground"
                    >
                      {formatarCodigoDisplay(codigoAtivo.codigo)}
                    </p>
                    <p className="mt-1 text-[11px] text-amber-700 dark:text-amber-300">
                      Exibido apenas uma vez por segurança (armazenado somente como hash no banco).
                    </p>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="rounded-xl text-xs"
                    data-testid="btn-copiar-codigo"
                    onClick={() => void copiarTexto(codigoAtivo.codigo, "codigo")}
                  >
                    {copiadoCodigo ? (
                      <>
                        <Check className="mr-1.5 h-3.5 w-3.5 text-emerald-500" />
                        Copiado
                      </>
                    ) : (
                      <>
                        <Copy className="mr-1.5 h-3.5 w-3.5" />
                        Copiar código
                      </>
                    )}
                  </Button>
                </div>
              ) : (
                <div
                  data-testid="whatsapp-code-not-reshown-notice"
                  className="rounded-xl border border-border bg-card px-3.5 py-2.5 text-xs text-muted-foreground"
                >
                  Por segurança, o código gerado anteriormente não é reexibido após recarregar a tela. Envie o código que você anotou pelo WhatsApp ou cancele abaixo para gerar um novo.
                </div>
              )}

              {/* Instruções passo a passo de confirmação pelo WhatsApp */}
              <div
                data-testid="whatsapp-pairing-instructions"
                className="space-y-2 rounded-xl border border-border/80 bg-card/80 p-3.5 text-xs"
              >
                <p className="font-semibold text-foreground">Como confirmar pelo WhatsApp:</p>
                <ol className="list-decimal space-y-1.5 pl-4 text-muted-foreground">
                  <li>
                    Abra o WhatsApp no número{" "}
                    <strong className="font-mono text-foreground">
                      {situacao.pendente.telefoneMascarado}
                    </strong>
                    .
                  </li>
                  <li className="flex flex-wrap items-center gap-1.5">
                    <span>Envie apenas o código de 6 dígitos para o número do assistente:</span>
                    {situacao.numeroAssistente ? (
                      <span className="inline-flex items-center gap-1 rounded-md border border-border bg-muted/50 px-2 py-0.5 font-mono font-semibold text-foreground">
                        <span data-testid="whatsapp-assistant-number">{situacao.numeroAssistente}</span>
                        <button
                          type="button"
                          className="ml-1 text-muted-foreground hover:text-foreground"
                          aria-label="Copiar número do assistente"
                          onClick={() => void copiarTexto(situacao.numeroAssistente!, "numero")}
                        >
                          {copiadoNumero ? (
                            <Check className="h-3 w-3 text-emerald-500" />
                          ) : (
                            <Copy className="h-3 w-3" />
                          )}
                        </button>
                      </span>
                    ) : (
                      <span
                        data-testid="whatsapp-assistant-number-missing"
                        className="text-amber-700 dark:text-amber-300"
                      >
                        número oficial de gestão informado pela administração (variável de exibição não definida).
                      </span>
                    )}
                  </li>
                  <li>
                    Esta tela verifica a confirmação automaticamente enquanto estiver aberta (ou clique em{" "}
                    <strong>Atualizar status</strong>).
                  </li>
                </ol>
                <p className="pt-1 text-[11px] text-muted-foreground">
                  Se este telefone já estiver vinculado a outra conta, o assistente recusará o pareamento diretamente pelo WhatsApp até que o titular anterior revogue o vínculo.
                </p>
              </div>

              <div className="flex flex-wrap items-center justify-end gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="rounded-xl text-xs"
                  disabled={carregandoSituacao}
                  onClick={() => void consultarSituacaoReal()}
                >
                  <RefreshCw className={cn("mr-1.5 h-3.5 w-3.5", carregandoSituacao && "animate-spin")} />
                  Verificar agora
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="rounded-xl border-rose-500/40 text-xs text-rose-600 hover:bg-rose-500/10 dark:text-rose-300"
                  disabled={cancelando}
                  data-testid="btn-cancelar-pareamento"
                  onClick={() => void handleCancelarPareamento()}
                >
                  {cancelando ? (
                    <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <XCircle className="mr-1.5 h-3.5 w-3.5" />
                  )}
                  Cancelar pareamento
                </Button>
              </div>
            </div>
          )}

          {/* 5. Formulário para iniciar pareamento / gerar novo código */}
          {deveMostrarFormularioPareamento && (
            <form
              onSubmit={handleIniciarPareamento}
              className="space-y-4 rounded-xl border border-border/80 bg-muted/20 p-4"
              data-testid="whatsapp-pairing-form"
            >
              <div className="space-y-1.5">
                <Label htmlFor="whatsapp-telefone" className="text-xs">
                  Número do WhatsApp (formato internacional E.164)
                </Label>
                <Input
                  id="whatsapp-telefone"
                  data-testid="input-whatsapp-telefone"
                  type="tel"
                  inputMode="tel"
                  placeholder="+5511999990000"
                  value={telefoneInput}
                  onChange={(e) => setTelefoneInput(e.target.value)}
                  required
                  disabled={submittingPareamento}
                  className="rounded-xl font-mono text-sm"
                />
                <p className="text-[11px] text-muted-foreground">
                  Inclua o código do país e DDD (ex.: <span className="font-mono">+5511999990000</span>). Limite de 5 códigos por hora.
                </p>
              </div>

              <div className="flex items-start gap-3 rounded-xl border border-border bg-card p-3">
                <input
                  id="whatsapp-consentimento"
                  type="checkbox"
                  checked={aceitouConsentimento}
                  onChange={(e) => setAceitouConsentimento(e.target.checked)}
                  disabled={submittingPareamento}
                  data-testid="checkbox-whatsapp-consentimento"
                  className="mt-0.5 h-4 w-4 rounded border-border accent-primary"
                />
                <label htmlFor="whatsapp-consentimento" className="cursor-pointer space-y-1 text-xs">
                  <span className="font-medium text-foreground">
                    Aceito vincular meu WhatsApp ao assistente financeiro do OmniGestão
                  </span>
                  <p className="text-[11px] leading-relaxed text-muted-foreground">
                    Autorizo o uso deste número apenas para comandos de texto autenticados nos meus perfis autorizados (G001). Toda gravação exige confirmação explícita (G004/G008) e o vínculo pode ser revogado a qualquer momento. Versão:{" "}
                    <span className="font-mono">
                      {situacao?.consentimentoVersao ?? CONSENTIMENTO_WHATSAPP_VERSAO}
                    </span>
                    .
                  </p>
                </label>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-[11px] text-muted-foreground">
                  A confirmação é feita enviando o código pelo próprio WhatsApp (sem SMS/custo extra).
                </span>
                <Button
                  type="submit"
                  size="sm"
                  className="rounded-xl text-xs"
                  disabled={submittingPareamento}
                  data-testid="btn-iniciar-pareamento"
                >
                  {submittingPareamento ? (
                    <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <MessageSquare className="mr-1.5 h-3.5 w-3.5" />
                  )}
                  {estadoTela === "EXPIRADO" || estadoTela === "BLOQUEADO"
                    ? "Gerar novo código"
                    : temVinculo
                      ? "Gerar código para novo número"
                      : "Iniciar pareamento"}
                </Button>
              </div>
            </form>
          )}
        </div>
      )}

      {/* Preferências autorizadas do assistente */}
      <form onSubmit={handleSave} className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="space-y-4 rounded-2xl border border-border bg-card p-5 shadow-sm">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-primary" />
              <h3 className="font-display text-sm font-semibold text-foreground">
                Preferências autorizadas de confirmação
              </h3>
            </div>
            <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 dark:text-emerald-300">
              Política G004/G008
            </span>
          </div>

          <div className="flex items-center justify-between gap-3 rounded-xl bg-muted/25 p-3">
            <div>
              <p className="text-xs font-medium text-foreground">Exigir confirmação antes de gravar</p>
              <p className="text-[11px] text-muted-foreground">
                O assistente prepara revisão G004 e aguarda seu &ldquo;Sim / Confirmar&rdquo; antes de aplicar (invariante obrigatório).
              </p>
            </div>
            <Switch
              checked={gateway.mode === "real" ? true : exigirConfirmacaoSempre}
              disabled={gateway.mode === "real"}
              onCheckedChange={setExigirConfirmacaoSempre}
            />
          </div>

          <div className="flex items-center justify-between gap-3 rounded-xl bg-muted/25 p-3">
            <div>
              <p className="text-xs font-medium text-foreground">Confirmar troca entre Pessoal e Empresa</p>
              <p className="text-[11px] text-muted-foreground">
                Impede lançar gasto pessoal na empresa por engano em conversas ambíguas (G001/G008).
              </p>
            </div>
            <Switch
              checked={gateway.mode === "real" ? true : confirmarTrocaPerfil}
              disabled={gateway.mode === "real"}
              onCheckedChange={setConfirmarTrocaPerfil}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="assist-limite" className="text-xs">
              Limite para confirmação reforçada (R$)
            </Label>
            <Input
              id="assist-limite"
              value={limiteTexto}
              disabled={gateway.mode === "real"}
              onChange={(e) => setLimiteTexto(e.target.value)}
              className="rounded-xl font-display font-semibold tabular-nums"
            />
            <p className="text-[11px] text-muted-foreground">
              Referência ativa: {formatarCentavosBRL(config.preferenciasConfirmacao.limiteConfirmacaoDuplaCentavos)}
            </p>
          </div>

          {/* Perfis autorizados para esta sessão */}
          <div className="space-y-1.5 rounded-xl border border-border/80 bg-muted/20 p-3">
            <p className="text-[11px] font-semibold text-foreground">
              Escopos autorizados para o assistente (G001)
            </p>
            {perfisAutorizados.length === 0 ? (
              <p className="text-[11px] text-muted-foreground">
                Perfil ativo: {snapshot.perfil.nomeExibicao}
              </p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {perfisAutorizados.map((p) => (
                  <span
                    key={p.perfilId}
                    className="rounded-md border border-border bg-card px-2 py-0.5 text-[11px] text-foreground"
                  >
                    {p.nomeExibicao}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="space-y-4 rounded-2xl border border-border bg-card p-5 shadow-sm">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Bell className="h-4 w-4 text-primary" />
              <h3 className="font-display text-sm font-semibold text-foreground">Notificações e alertas</h3>
            </div>
            {gateway.mode === "real" && (
              <span className="rounded-full border border-border bg-muted/40 px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                Sem envio proativo nesta etapa
              </span>
            )}
          </div>

          <div className="flex items-center justify-between gap-3 rounded-xl bg-muted/25 p-3">
            <div>
              <p className="text-xs font-medium text-foreground">Alertas de próximos vencimentos</p>
              <p className="text-[11px] text-muted-foreground">
                Notificar contas a pagar e parcelas antes do vencimento.
              </p>
            </div>
            <Switch
              checked={alertasVencimento}
              disabled={gateway.mode === "real"}
              onCheckedChange={setAlertasVencimento}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Antecedência</Label>
              <Select
                value={diasAntecedencia}
                disabled={gateway.mode === "real"}
                onValueChange={setDiasAntecedencia}
              >
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
                disabled={gateway.mode === "real"}
                onChange={(e) => setHorarioResumo(e.target.value)}
                className="rounded-xl text-xs"
              />
            </div>
          </div>

          <div className="flex items-center justify-between gap-3 rounded-xl bg-muted/25 p-3">
            <span className="text-xs font-medium text-foreground">Resumo diário de saldo e vencimentos</span>
            <Switch
              checked={resumoDiario}
              disabled={gateway.mode === "real"}
              onCheckedChange={setResumoDiario}
            />
          </div>

          <div className="flex items-center justify-between gap-3 rounded-xl bg-muted/25 p-3">
            <span className="text-xs font-medium text-foreground">Alertas de fechamento/vencimento de fatura</span>
            <Switch
              checked={alertasFatura}
              disabled={gateway.mode === "real"}
              onCheckedChange={setAlertasFatura}
            />
          </div>

          <div className="flex items-center justify-between gap-3 rounded-xl bg-muted/25 p-3">
            <span className="text-xs font-medium text-foreground">Alertas de dívidas vencidas</span>
            <Switch
              checked={alertasDivida}
              disabled={gateway.mode === "real"}
              onCheckedChange={setAlertasDivida}
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-border bg-card px-5 py-3.5 shadow-sm lg:col-span-2">
          <p className="text-xs text-muted-foreground">
            {gateway.mode === "synthetic"
              ? "As preferências abaixo são validadas em memória no ambiente isolado."
              : "Políticas de confirmação G004/G008 são aplicadas automaticamente pelo motor; envios proativos agendados não estão ativos nesta etapa."}
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

      {/* G007 / G008 Contract Readiness (read-only transparency — zero Audio/OCR) */}
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
              Principal: {whatsappConectadoReal ? "VINCULO_TELEFONE_G007" : config.alinhamentoG007.principalAutorizadoAtual}
            </span>
          </div>
          <div className="grid grid-cols-1 gap-2.5 text-xs sm:grid-cols-3">
            <div className="rounded-xl border border-border/70 bg-muted/20 p-3">
              <p className="text-[11px] text-muted-foreground">VerificadorVinculo (G007)</p>
              <p className="mt-1 font-semibold text-foreground">
                {config.alinhamentoG007.verificadorVinculoDisponivel ? "Ativo" : "Dormente"}
              </p>
            </div>
            <div className="rounded-xl border border-border/70 bg-muted/20 p-3">
              <p className="text-[11px] text-muted-foreground">Canal GESTAO (G006)</p>
              <p className="mt-1 font-semibold text-foreground">
                {config.alinhamentoG007.canalGestaoRegistrado
                  ? `${config.canalAtivo ? "Ativo" : "Inativo"} (v${config.alinhamentoG007.canalVersao ?? 1})`
                  : "Não registrado"}
              </p>
            </div>
            <div className="rounded-xl border border-border/70 bg-muted/20 p-3">
              <p className="text-[11px] text-muted-foreground">Motor G008 (PR #417)</p>
              <p className="mt-1 font-semibold text-foreground">
                {config.alinhamentoG007.motorConversacionalPr417 === "ATIVO"
                  ? "Ativo (somente texto)"
                  : "Dormente · PR #417"}
              </p>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap gap-2 text-[11px]">
            <span
              className={cn(
                "rounded-full border px-2.5 py-0.5",
                config.alinhamentoG007.homologacoes.whatsappOficial
                  ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                  : "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300"
              )}
            >
              WhatsApp oficial: {config.alinhamentoG007.homologacoes.whatsappOficial ? "Canal ativo" : "Não ativo"}
            </span>
            <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-0.5 text-amber-700 dark:text-amber-300">
              Áudio (STT): Não habilitado (fora desta etapa)
            </span>
            <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-0.5 text-amber-700 dark:text-amber-300">
              Imagem (OCR): Não habilitado (fora desta etapa)
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
                {dep.status === "DISPONIVEL_EM_SANDBOX" || dep.status === "DISPONIVEL_NO_RUNTIME" ? (
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

      {/* Dialog: Confirmar Revogação do Vínculo WhatsApp */}
      <Dialog open={revogarDialogOpen} onOpenChange={setRevogarDialogOpen}>
        <DialogContent className="rounded-2xl sm:max-w-[440px]" data-testid="dialog-confirmar-revogacao">
          <DialogHeader>
            <DialogTitle className="font-display">Revogar vínculo WhatsApp?</DialogTitle>
            <DialogDescription className="text-xs">
              Esta ação encerra imediatamente o vínculo do número{" "}
              <strong className="font-mono">{telefoneMascaradoCabecalho ?? "vinculado"}</strong>, congela a conversa em andamento e impede qualquer nova operação pelo WhatsApp até um novo pareamento completo.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2 pt-3">
            <Button
              type="button"
              variant="outline"
              className="rounded-xl text-xs"
              disabled={revogando}
              onClick={() => setRevogarDialogOpen(false)}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              variant="destructive"
              className="rounded-xl text-xs"
              disabled={revogando}
              data-testid="btn-confirmar-revogacao"
              onClick={() => void handleConfirmarRevogacao()}
            >
              {revogando ? (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              ) : (
                <Trash2 className="mr-1.5 h-3.5 w-3.5" />
              )}
              Confirmar revogação
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
