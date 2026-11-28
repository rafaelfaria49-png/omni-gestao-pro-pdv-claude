"use client"

import * as React from "react"
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  FileImage,
  FileText,
  HardDrive,
  Link2,
  Loader2,
  Mic,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Upload,
  X,
} from "lucide-react"
import { cn } from "@/lib/utils"
import {
  MEIOS_PAGAMENTO_GASTO,
  type AnaliseMultimodalResultado,
  type AssistenteWhatsAppConfig,
  type CandidatoDuplicidadeMultimodalUI,
  type CapacidadeMultimodalUI,
  type ConsultaFinanceiraSnapshot,
  type DiagnosticoMultimodalUI,
  type FinanceiroPerfilSeletor,
  type MeioPagamentoGasto,
  type OperacaoFeedback,
} from "@/lib/gestor-money/contracts"
import type { GestorMoneyGateway } from "@/lib/gestor-money/gateway"
import {
  formatarCentavosBRL,
  formatarDataBR,
  formatarTamanhoArquivo,
  hojeSaoPaulo,
  normalizarNomeCategoria,
  parseBRLParaCentavos,
  rotuloMeioPagamento,
} from "@/lib/gestor-money/money"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

export type MultimodalAnalyzerInput = {
  tipo: "audio" | "documento"
  file: File
  legenda?: string
}

export type MultimodalAnalyzerFn = (
  input: MultimodalAnalyzerInput
) => Promise<AnaliseMultimodalResultado>

const MultimodalAnalyzerContext = React.createContext<MultimodalAnalyzerFn | null>(null)

export function MultimodalAnalyzerProvider({
  analyzer,
  children,
}: {
  analyzer: MultimodalAnalyzerFn | null
  children: React.ReactNode
}) {
  return (
    <MultimodalAnalyzerContext.Provider value={analyzer}>
      {children}
    </MultimodalAnalyzerContext.Provider>
  )
}

function diagnosticoPadraoFailClosed(
  config: AssistenteWhatsAppConfig,
  snapshot: ConsultaFinanceiraSnapshot
): DiagnosticoMultimodalUI {
  const canalAtivo = Boolean(
    config.podeAlterarConexaoReal &&
      config.canalAtivo &&
      config.estadoConexao !== "DESCONECTADO_AGUARDANDO_G007" &&
      config.estadoConexao !== "CANAL_INATIVO"
  )
  const storageDisp = Boolean(snapshot.storageDiagnostico?.privacidadeComprovadaNoRuntime)
  const storageMotivo =
    snapshot.storageDiagnostico?.motivo ??
    "Armazenamento permanente privado (G003-STORAGE) indisponível neste ambiente."

  return {
    audioG009: {
      providerId: "INDISPONIVEL",
      providerConfigurado: false,
      processamentoDisponivel: false,
      homologacaoConcluida: false,
      canalOficialDisponivel: canalAtivo,
      motivoIndisponivel: "Provider de transcrição (G009) não configurado neste ambiente.",
    },
    documentoG010: {
      providerId: "INDISPONIVEL",
      providerConfigurado: false,
      processamentoDisponivel: false,
      homologacaoConcluida: false,
      canalOficialDisponivel: canalAtivo,
      motivoIndisponivel: "Provider de leitura de documentos (G010) não configurado neste ambiente.",
    },
    storagePermanenteG003: {
      disponivel: storageDisp,
      privacidadeComprovada: storageDisp,
      motivo: storageMotivo,
    },
  }
}

function centavosParaInputBR(centavos: string | null | undefined): string {
  if (!centavos || !/^\d+$/.test(centavos)) return ""
  const valor = BigInt(centavos)
  const reais = valor / BigInt(100)
  const frac = (valor % BigInt(100)).toString().padStart(2, "0")
  return `${reais.toString()},${frac}`
}

function rotuloTipoDoc(tipo?: string): string {
  const mapa: Record<string, string> = {
    COMPROVANTE_PIX: "Comprovante Pix",
    RECIBO: "Recibo",
    CUPOM_FISCAL: "Cupom fiscal",
    NOTA_FISCAL: "Nota fiscal",
    BOLETO: "Boleto",
    CONTA_A_PAGAR: "Conta a pagar",
    FATURA: "Fatura",
    COMPROVANTE_BANCARIO: "Comprovante bancário",
    EXTRATO: "Extrato bancário",
    DOCUMENTO_COMERCIAL: "Documento comercial",
    NAO_FINANCEIRO: "Não financeiro",
  }
  return tipo ? mapa[tipo] ?? tipo : "Documento"
}

function rotuloMotivoDuplicidade(motivo: CandidatoDuplicidadeMultimodalUI["motivo"]): string {
  switch (motivo) {
    case "MESMA_MENSAGEM":
      return "Mesma mensagem recebida"
    case "MESMO_HASH_ARQUIVO":
      return "Mesmo arquivo já enviado"
    case "MESMO_ID_TRANSACAO":
      return "Mesmo ID de transação"
    case "MESMO_DOCUMENTO":
      return "Mesmo número de documento"
    case "CORRESPONDENCIA_APROXIMADA":
      return "Valor e período próximos"
  }
}

function AxisPill({
  label,
  ok,
  okText,
  offText,
}: {
  label: string
  ok: boolean
  okText: string
  offText: string
}) {
  return (
    <div className="flex flex-col justify-between gap-1 rounded-xl border border-border/70 bg-muted/20 px-2.5 py-2">
      <span className="text-[10px] leading-tight text-muted-foreground">{label}</span>
      <span
        className={cn(
          "inline-flex w-fit items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold",
          ok
            ? "border-emerald-500/30 bg-emerald-500/12 text-emerald-700 dark:text-emerald-300"
            : "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300"
        )}
      >
        {ok ? <CheckCircle2 className="h-2.5 w-2.5 shrink-0" /> : <AlertCircle className="h-2.5 w-2.5 shrink-0" />}
        {ok ? okText : offText}
      </span>
    </div>
  )
}

function CapabilityStatusCard({
  testId,
  title,
  subtitle,
  icon,
  cap,
}: {
  testId: string
  title: string
  subtitle: string
  icon: React.ReactNode
  cap: CapacidadeMultimodalUI
}) {
  return (
    <div
      data-testid={testId}
      className={cn(
        "min-w-0 rounded-2xl border bg-card p-4 shadow-sm",
        cap.processamentoDisponivel ? "border-border" : "border-amber-500/30"
      )}
    >
      <div className="mb-3 flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2.5">
          <div
            className={cn(
              "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl",
              cap.processamentoDisponivel
                ? "bg-primary/12 text-primary"
                : "bg-amber-500/15 text-amber-600 dark:text-amber-400"
            )}
          >
            {icon}
          </div>
          <div className="min-w-0">
            <h4 className="truncate font-display text-sm font-semibold text-foreground">{title}</h4>
            <p className="truncate text-[11px] text-muted-foreground">{subtitle}</p>
          </div>
        </div>
        <span className="shrink-0 rounded-full border border-border bg-muted/40 px-2 py-0.5 font-mono text-[10px] text-muted-foreground">
          {cap.providerId}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <AxisPill
          label="Provider configurado"
          ok={cap.providerConfigurado}
          okText="Sim"
          offText="Não"
        />
        <AxisPill
          label="Processamento disponível"
          ok={cap.processamentoDisponivel}
          okText="Disponível"
          offText="Indisponível"
        />
        <AxisPill
          label="Homologação concluída"
          ok={cap.homologacaoConcluida}
          okText="Homologado"
          offText="Não homologado"
        />
        <AxisPill
          label="Canal oficial disponível"
          ok={cap.canalOficialDisponivel}
          okText="Disponível"
          offText="Indisponível"
        />
      </div>

      {!cap.processamentoDisponivel && (
        <div
          data-testid={`${testId}-unavailable`}
          className="mt-3 flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-800 dark:text-amber-200"
        >
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <p className="min-w-0 break-words leading-relaxed">
            {cap.motivoIndisponivel ??
              "Processamento indisponível neste ambiente. O envio permanece desabilitado."}
          </p>
        </div>
      )}
    </div>
  )
}

export function MultimodalAssistantPanel({
  snapshot,
  config,
  gateway,
  onSaved,
  analisarMidia,
}: {
  snapshot: ConsultaFinanceiraSnapshot
  config: AssistenteWhatsAppConfig
  gateway: GestorMoneyGateway
  onSaved: (feedback: OperacaoFeedback) => Promise<void> | void
  analisarMidia?: MultimodalAnalyzerFn
}) {
  const contextAnalyzer = React.useContext(MultimodalAnalyzerContext)
  const diag = React.useMemo(
    () => config.multimodal ?? diagnosticoPadraoFailClosed(config, snapshot),
    [config, snapshot]
  )

  const seletor = React.useMemo<FinanceiroPerfilSeletor>(() => {
    if (snapshot.perfil.tipo === "PESSOAL") {
      return { tipo: "PESSOAL", perfilId: snapshot.perfil.perfilId }
    }
    return {
      tipo: "EMPRESA",
      perfilId: snapshot.perfil.perfilId,
      storeId: snapshot.perfil.storeId,
    }
  }, [snapshot.perfil])

  const contasAtivas = React.useMemo(
    () => snapshot.contas.filter((c) => c.ativo),
    [snapshot.contas]
  )
  const categoriasDespesa = React.useMemo(
    () => snapshot.categorias.filter((c) => c.ativo && c.natureza === "DESPESA"),
    [snapshot.categorias]
  )

  const [legenda, setLegenda] = React.useState("")
  const [selectedFile, setSelectedFile] = React.useState<{
    tipo: "audio" | "documento"
    file: File
  } | null>(null)
  const [previewUrl, setPreviewUrl] = React.useState<string | null>(null)
  const [processing, setProcessing] = React.useState(false)
  const [errorMsg, setErrorMsg] = React.useState<string | null>(null)
  const [analise, setAnalise] = React.useState<AnaliseMultimodalResultado | null>(null)

  // Duplicate resolution state
  const [ignorarDuplicidade, setIgnorarDuplicidade] = React.useState(false)
  const [vinculoExistente, setVinculoExistente] = React.useState<{
    candidato: CandidatoDuplicidadeMultimodalUI
    storageDisponivel: boolean
    storageMotivo: string
  } | null>(null)

  // Editable proposal state
  const [natureza, setNatureza] = React.useState<"DESPESA" | "DIVIDA">("DESPESA")
  const [descricao, setDescricao] = React.useState("")
  const [valorTexto, setValorTexto] = React.useState("")
  const [contraparte, setContraparte] = React.useState("")
  const [dataLancamento, setDataLancamento] = React.useState(() => hojeSaoPaulo())
  const [formaPagamento, setFormaPagamento] = React.useState<MeioPagamentoGasto>("pix")
  const [carteiraId, setCarteiraId] = React.useState<string>(() => contasAtivas[0]?.id ?? "")
  const [categoriaId, setCategoriaId] = React.useState<string>(() => categoriasDespesa[0]?.id ?? "")
  const [confirming, setConfirming] = React.useState(false)
  const [confirmError, setConfirmError] = React.useState<string | null>(null)
  const [savedNotice, setSavedNotice] = React.useState<string | null>(null)

  const audioInputRef = React.useRef<HTMLInputElement | null>(null)
  const docInputRef = React.useRef<HTMLInputElement | null>(null)

  // Manage object URL safely for image previews and ALWAYS revoke on cleanup
  React.useEffect(() => {
    if (
      !selectedFile ||
      selectedFile.tipo !== "documento" ||
      !selectedFile.file.type.startsWith("image/") ||
      typeof URL === "undefined" ||
      typeof URL.createObjectURL !== "function"
    ) {
      setPreviewUrl(null)
      return
    }
    const url = URL.createObjectURL(selectedFile.file)
    setPreviewUrl(url)
    return () => {
      if (typeof URL.revokeObjectURL === "function") {
        URL.revokeObjectURL(url)
      }
    }
  }, [selectedFile])

  // Keep account/category defaults valid when profile switches
  React.useEffect(() => {
    if (!contasAtivas.some((c) => c.id === carteiraId)) {
      setCarteiraId(contasAtivas[0]?.id ?? "")
    }
    if (!categoriasDespesa.some((c) => c.id === categoriaId)) {
      setCategoriaId(categoriasDespesa[0]?.id ?? "")
    }
  }, [contasAtivas, categoriasDespesa, carteiraId, categoriaId])

  const defaultRealAnalyzer = React.useCallback<MultimodalAnalyzerFn>(
    async ({ tipo, file, legenda: caption }) => {
      const fd = new FormData()
      fd.set("tipo", tipo)
      fd.set("perfilTipo", seletor.tipo)
      fd.set("perfilId", seletor.perfilId)
      if (seletor.tipo === "EMPRESA") {
        fd.set("storeId", seletor.storeId)
      }
      if (caption?.trim()) {
        fd.set("legenda", caption.trim())
      }
      fd.set("file", file, file.name)

      const res = await fetch("/api/gestor-money/assistente/multimodal", {
        method: "POST",
        body: fd,
        cache: "no-store",
      })
      let body: { ok?: boolean; error?: string; resultado?: AnaliseMultimodalResultado }
      try {
        body = (await res.json()) as {
          ok?: boolean
          error?: string
          resultado?: AnaliseMultimodalResultado
        }
      } catch {
        throw new Error("Resposta inválida ao processar mídia multimodal.")
      }
      if (!res.ok || !body.ok || !body.resultado) {
        throw new Error(
          body.error ?? "Não foi possível processar a mídia neste momento. Nada foi registrado."
        )
      }
      return body.resultado
    },
    [seletor]
  )

  const resolvedAnalyzer = analisarMidia ?? contextAnalyzer ?? defaultRealAnalyzer

  const preencherProposta = React.useCallback(
    (res: AnaliseMultimodalResultado) => {
      const p = res.proposta
      setNatureza(p.naturezaSugerida)
      setDescricao(p.descricao || "")
      setValorTexto(centavosParaInputBR(p.valorCentavos))
      setContraparte(p.contraparte || "")
      setDataLancamento(
        (p.naturezaSugerida === "DIVIDA" ? p.vencimento : p.data) || p.data || hojeSaoPaulo()
      )
      setFormaPagamento(p.formaPagamento ?? "pix")

      if (p.contaSugeridaNome) {
        const alvo = normalizarNomeCategoria(p.contaSugeridaNome)
        const matchConta = contasAtivas.find((c) =>
          normalizarNomeCategoria(c.nome).includes(alvo)
        )
        if (matchConta) setCarteiraId(matchConta.id)
      }
      if (p.categoriaSugeridaNome) {
        const alvoCat = normalizarNomeCategoria(p.categoriaSugeridaNome)
        const matchCat = categoriasDespesa.find((c) =>
          normalizarNomeCategoria(c.nome).includes(alvoCat)
        )
        if (matchCat) setCategoriaId(matchCat.id)
      }
    },
    [contasAtivas, categoriasDespesa]
  )

  const executarAnalise = React.useCallback(
    async (tipo: "audio" | "documento", file: File, captionOverride?: string) => {
      const disponivel =
        tipo === "audio"
          ? diag.audioG009.processamentoDisponivel
          : diag.documentoG010.processamentoDisponivel
      if (!disponivel) return

      setSelectedFile({ tipo, file })
      setProcessing(true)
      setErrorMsg(null)
      setConfirmError(null)
      setSavedNotice(null)
      setVinculoExistente(null)
      setIgnorarDuplicidade(false)
      setAnalise(null)

      try {
        const res = await resolvedAnalyzer({
          tipo,
          file,
          legenda: (captionOverride ?? legenda).trim() || undefined,
        })
        setAnalise(res)
        preencherProposta(res)
      } catch (err) {
        setErrorMsg(
          err instanceof Error && err.message
            ? err.message
            : "Falha ao processar a mídia. Tente novamente ou informe manualmente."
        )
      } finally {
        setProcessing(false)
      }
    },
    [diag, legenda, preencherProposta, resolvedAnalyzer]
  )

  const handleFileChange = (tipo: "audio" | "documento", e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    void executarAnalise(tipo, file)
  }

  const handleCancelar = () => {
    setAnalise(null)
    setSelectedFile(null)
    setErrorMsg(null)
    setConfirmError(null)
    setVinculoExistente(null)
    setIgnorarDuplicidade(false)
    if (audioInputRef.current) audioInputRef.current.value = ""
    if (docInputRef.current) docInputRef.current.value = ""
  }

  const handleVincularExistente = (candidato: CandidatoDuplicidadeMultimodalUI) => {
    if (!analise) return
    // ZERO financial write: links only conceptually/in-session and displays honest G003-STORAGE status.
    setVinculoExistente({
      candidato,
      storageDisponivel: analise.storagePermanenteDisponivel,
      storageMotivo: analise.storagePermanenteMotivo,
    })
    setAnalise(null)
    setConfirmError(null)
  }

  const temDuplicidadePendente =
    Boolean(analise && analise.candidatosDuplicidade.length > 0 && !ignorarDuplicidade)

  const handleConfirmarProposta = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!analise || temDuplicidadePendente) return

    setConfirmError(null)
    const centavos = parseBRLParaCentavos(valorTexto)
    if (!centavos || BigInt(centavos) <= BigInt(0)) {
      setConfirmError("Informe um valor monetário válido maior que R$ 0,00.")
      return
    }
    if (descricao.trim().length < 2) {
      setConfirmError("Informe uma descrição válida para o lançamento.")
      return
    }
    if (!categoriaId) {
      setConfirmError("Selecione uma categoria ativa.")
      return
    }
    if (natureza === "DESPESA" && !carteiraId) {
      setConfirmError("Selecione uma conta ativa para debitar a despesa.")
      return
    }

    setConfirming(true)
    try {
      let feedback: OperacaoFeedback
      if (natureza === "DESPESA") {
        feedback = await gateway.registrarDespesa(seletor, {
          descricao: descricao.trim(),
          valorCentavos: centavos,
          dataGasto: dataLancamento,
          pagoAgora: true,
          categoriaId,
          carteiraId,
          formaPagamento,
          contraparte: contraparte.trim() || undefined,
        })
      } else {
        feedback = await gateway.registrarDivida(seletor, {
          credor: contraparte.trim() || descricao.trim(),
          descricao: descricao.trim(),
          valorOriginalCentavos: centavos,
          vencimento: dataLancamento,
          parcelasTotal: 1,
          categoriaId,
          observacao: `Confirmado via revisão multimodal (${analise.tipo === "audio" ? "G009" : "G010"}).`,
        })
      }

      await onSaved(feedback)
      setSavedNotice(
        `${feedback.mensagem} (${feedback.contratoG004})${
          !analise.storagePermanenteDisponivel
            ? " · Mídia descartada após uso temporário (G003-STORAGE bloqueado)."
            : ""
        }`
      )
      setAnalise(null)
      setSelectedFile(null)
      if (audioInputRef.current) audioInputRef.current.value = ""
      if (docInputRef.current) docInputRef.current.value = ""
    } catch (err) {
      setConfirmError(
        err instanceof Error && err.message
          ? err.message
          : "Não foi possível confirmar o lançamento no motor financeiro."
      )
    } finally {
      setConfirming(false)
    }
  }

  const audioDisponivel = diag.audioG009.processamentoDisponivel
  const docDisponivel = diag.documentoG010.processamentoDisponivel
  const algumDisponivel = audioDisponivel || docDisponivel

  return (
    <section
      data-testid="multimodal-assistant-panel"
      className="space-y-4 rounded-2xl border border-border bg-card/60 p-4 shadow-sm sm:p-5"
    >
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <Sparkles className="h-4 w-4 shrink-0 text-primary" />
            <h3 className="font-display text-base font-semibold text-foreground">
              Assistente Multimodal · Áudio (G009) &amp; Comprovantes (G010)
            </h3>
          </div>
          <p className="text-xs leading-relaxed text-muted-foreground">
            Envie áudio ou comprovante (imagem/PDF) para gerar uma proposta editável. Nenhuma gravação financeira ocorre sem sua confirmação explícita (G004/G008).
          </p>
        </div>
        <span className="shrink-0 rounded-full border border-border bg-muted/40 px-2.5 py-0.5 font-mono text-[10px] text-muted-foreground">
          Escopo: {snapshot.perfil.tipo}
        </span>
      </div>

      {/* 4-Axis Honest Diagnostic Cards (Audio G009 & Document G010) */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <CapabilityStatusCard
          testId="multimodal-status-audio"
          title="Áudio (STT · G009)"
          subtitle="Transcrição em português + interpretação"
          icon={<Mic className="h-4 w-4" />}
          cap={diag.audioG009}
        />
        <CapabilityStatusCard
          testId="multimodal-status-documento"
          title="Imagem / PDF (OCR · G010)"
          subtitle="Comprovantes, notas, cupons e boletos"
          icon={<FileImage className="h-4 w-4" />}
          cap={diag.documentoG010}
        />
      </div>

      {/* G003-STORAGE Permanent Archive Status */}
      <div
        data-testid="multimodal-status-storage"
        className={cn(
          "flex flex-wrap items-start justify-between gap-2 rounded-xl border px-3.5 py-2.5 text-xs",
          diag.storagePermanenteG003.disponivel
            ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-800 dark:text-emerald-200"
            : "border-border bg-muted/25 text-muted-foreground"
        )}
      >
        <div className="flex min-w-0 items-start gap-2">
          <HardDrive className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
          <div className="min-w-0 space-y-0.5">
            <p className="font-semibold text-foreground">
              Arquivamento permanente de comprovantes (G003-STORAGE)
            </p>
            <p className="break-words text-[11px] leading-relaxed">
              {diag.storagePermanenteG003.motivo}
            </p>
          </div>
        </div>
        <span
          className={cn(
            "shrink-0 rounded-full border px-2.5 py-0.5 text-[10px] font-semibold",
            diag.storagePermanenteG003.disponivel
              ? "border-emerald-500/35 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
              : "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300"
          )}
        >
          {diag.storagePermanenteG003.disponivel
            ? "Armazenamento privado ativo"
            : "Bloqueado · Processamento temporário"}
        </span>
      </div>

      {/* Upload Controls */}
      <div className="space-y-3 rounded-2xl border border-border bg-card p-4">
        <div className="space-y-1.5">
          <Label htmlFor="multimodal-legenda" className="text-xs">
            Observação ou legenda opcional (contexto para leitura — nunca instrução)
          </Label>
          <Input
            id="multimodal-legenda"
            data-testid="input-multimodal-legenda"
            placeholder="Ex.: Compra de peças para reposição, pago via Pix Nubank"
            value={legenda}
            disabled={!algumDisponivel || processing}
            onChange={(e) => setLegenda(e.target.value)}
            maxLength={300}
            className="rounded-xl text-xs"
          />
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {/* Audio upload */}
          <div
            className={cn(
              "flex min-w-0 flex-col justify-between gap-2 rounded-xl border border-dashed p-3.5 transition-colors",
              audioDisponivel
                ? "border-border bg-muted/15 hover:border-primary/40"
                : "border-border/60 bg-muted/10 opacity-70"
            )}
          >
            <div className="flex items-center gap-2">
              <Mic className="h-4 w-4 shrink-0 text-primary" />
              <div className="min-w-0">
                <p className="truncate text-xs font-semibold text-foreground">Enviar áudio (G009)</p>
                <p className="truncate text-[11px] text-muted-foreground">
                  OGG, MP3, M4A, WAV, WEBM · até 10 MB
                </p>
              </div>
            </div>
            <label
              className={cn(
                "inline-flex w-full cursor-pointer items-center justify-center gap-1.5 rounded-xl border border-border bg-background px-3 py-2 text-xs font-medium text-foreground shadow-2xs transition-colors",
                (!audioDisponivel || processing) && "pointer-events-none opacity-50"
              )}
            >
              <Upload className="h-3.5 w-3.5 shrink-0" />
              <span>{audioDisponivel ? "Selecionar clipe de áudio" : "Transcrição indisponível"}</span>
              <input
                ref={audioInputRef}
                type="file"
                accept="audio/ogg,audio/mpeg,audio/mp4,audio/wav,audio/webm,audio/amr,.ogg,.mp3,.m4a,.wav,.webm,.amr"
                data-testid="input-multimodal-audio"
                disabled={!audioDisponivel || processing}
                onChange={(e) => handleFileChange("audio", e)}
                className="sr-only"
              />
            </label>
          </div>

          {/* Document upload */}
          <div
            className={cn(
              "flex min-w-0 flex-col justify-between gap-2 rounded-xl border border-dashed p-3.5 transition-colors",
              docDisponivel
                ? "border-border bg-muted/15 hover:border-primary/40"
                : "border-border/60 bg-muted/10 opacity-70"
            )}
          >
            <div className="flex items-center gap-2">
              <FileImage className="h-4 w-4 shrink-0 text-primary" />
              <div className="min-w-0">
                <p className="truncate text-xs font-semibold text-foreground">
                  Enviar imagem ou PDF (G010)
                </p>
                <p className="truncate text-[11px] text-muted-foreground">
                  JPG, PNG, WebP ou PDF (até 10 págs / 10 MB)
                </p>
              </div>
            </div>
            <label
              className={cn(
                "inline-flex w-full cursor-pointer items-center justify-center gap-1.5 rounded-xl border border-border bg-background px-3 py-2 text-xs font-medium text-foreground shadow-2xs transition-colors",
                (!docDisponivel || processing) && "pointer-events-none opacity-50"
              )}
            >
              <Upload className="h-3.5 w-3.5 shrink-0" />
              <span>{docDisponivel ? "Selecionar comprovante / PDF" : "Leitura OCR indisponível"}</span>
              <input
                ref={docInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,application/pdf,.jpg,.jpeg,.png,.webp,.pdf"
                data-testid="input-multimodal-documento"
                disabled={!docDisponivel || processing}
                onChange={(e) => handleFileChange("documento", e)}
                className="sr-only"
              />
            </label>
          </div>
        </div>
      </div>

      {/* Processing indicator */}
      {processing && (
        <div
          data-testid="multimodal-processing"
          role="status"
          className="flex items-center gap-3 rounded-xl border border-primary/30 bg-primary/10 px-4 py-3 text-xs text-foreground"
        >
          <Loader2 className="h-4 w-4 shrink-0 animate-spin text-primary" />
          <div className="min-w-0">
            <p className="font-semibold">
              {selectedFile?.tipo === "audio"
                ? "Transcrevendo e interpretando áudio..."
                : "Extraindo dados do documento com validação de segurança..."}
            </p>
            <p className="truncate text-[11px] text-muted-foreground">
              {selectedFile?.file.name} · Nenhum valor é gravado nesta etapa.
            </p>
          </div>
        </div>
      )}

      {/* Document Preview (Image object URL or PDF metadata card) */}
      {selectedFile?.tipo === "documento" && (
        <div
          data-testid="multimodal-doc-preview"
          className="flex flex-col gap-3 rounded-xl border border-border bg-card p-3.5 sm:flex-row sm:items-center"
        >
          {previewUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={previewUrl}
              alt={`Pré-visualização de ${selectedFile.file.name}`}
              className="h-24 w-full rounded-lg border border-border object-cover sm:h-20 sm:w-28 sm:shrink-0"
            />
          ) : (
            <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl border border-border bg-muted/40 text-primary">
              {selectedFile.file.type === "application/pdf" ? (
                <FileText className="h-7 w-7" />
              ) : (
                <FileImage className="h-7 w-7" />
              )}
            </div>
          )}
          <div className="min-w-0 flex-1 space-y-1 text-xs">
            <p className="truncate font-semibold text-foreground">{selectedFile.file.name}</p>
            <div className="flex flex-wrap gap-2 text-[11px] text-muted-foreground">
              <span>{selectedFile.file.type || "Documento"}</span>
              <span>·</span>
              <span>{formatarTamanhoArquivo(selectedFile.file.size)}</span>
              {analise?.paginasPdf !== undefined && (
                <>
                  <span>·</span>
                  <span>
                    {analise.paginasPdf} {analise.paginasPdf === 1 ? "página" : "páginas"}
                  </span>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Error banner + retry */}
      {errorMsg && (
        <div
          data-testid="multimodal-error-banner"
          role="alert"
          className="flex flex-col gap-3 rounded-xl border border-rose-500/35 bg-rose-500/10 px-4 py-3 text-xs text-rose-700 dark:text-rose-200 sm:flex-row sm:items-center sm:justify-between"
        >
          <div className="flex min-w-0 items-start gap-2.5">
            <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
            <div className="min-w-0 space-y-0.5">
              <p className="font-semibold">Não foi possível concluir a análise multimodal</p>
              <p className="break-words text-[11px] opacity-95">{errorMsg}</p>
            </div>
          </div>
          {selectedFile && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              data-testid="btn-multimodal-retry"
              disabled={processing}
              className="shrink-0 rounded-xl border-rose-500/40 text-xs"
              onClick={() => void executarAnalise(selectedFile.tipo, selectedFile.file)}
            >
              <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
              Tentar novamente
            </Button>
          )}
        </div>
      )}

      {/* Linked to existing entry feedback (ZERO financial write) */}
      {vinculoExistente && (
        <div
          data-testid="multimodal-linked-feedback"
          role="status"
          className="space-y-1.5 rounded-xl border border-emerald-500/35 bg-emerald-500/10 px-4 py-3 text-xs text-emerald-800 dark:text-emerald-200"
        >
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-start gap-2">
              <Link2 className="mt-0.5 h-4 w-4 shrink-0" />
              <div className="space-y-1">
                <p className="font-semibold">
                  Associado ao lançamento existente sem criar despesa duplicada
                </p>
                <p className="text-[11px]">
                  Referência: <strong>{vinculoExistente.candidato.descricao}</strong> ·{" "}
                  {formatarCentavosBRL(vinculoExistente.candidato.valorCentavos)} ·{" "}
                  {formatarDataBR(vinculoExistente.candidato.data)}. Nenhum novo lançamento financeiro foi gravado.
                </p>
                <p className="text-[11px] opacity-90">
                  {vinculoExistente.storageDisponivel
                    ? "Armazenamento permanente privado (G003-STORAGE) disponível para anexação oficial."
                    : `Arquivamento permanente (G003-STORAGE) indisponível neste ambiente: ${vinculoExistente.storageMotivo}`}
                </p>
              </div>
            </div>
            <button
              type="button"
              aria-label="Fechar aviso"
              onClick={() => setVinculoExistente(null)}
              className="rounded-md p-1 opacity-75 hover:opacity-100"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* Saved confirmation feedback */}
      {savedNotice && (
        <div
          data-testid="multimodal-saved-feedback"
          role="status"
          className="flex items-center justify-between gap-2 rounded-xl border border-emerald-500/35 bg-emerald-500/10 px-4 py-2.5 text-xs text-emerald-800 dark:text-emerald-200"
        >
          <span className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            {savedNotice}
          </span>
          <button
            type="button"
            onClick={() => setSavedNotice(null)}
            className="text-[11px] underline opacity-80 hover:opacity-100"
          >
            Fechar
          </button>
        </div>
      )}

      {/* Duplicate Alert Box */}
      {analise && temDuplicidadePendente && (
        <div
          data-testid="multimodal-duplicate-alert"
          role="alert"
          className="space-y-3 rounded-2xl border border-amber-500/45 bg-amber-500/10 p-4 text-xs text-amber-900 dark:text-amber-100"
        >
          <div className="flex items-start gap-2.5">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
            <div className="min-w-0 space-y-1">
              <p className="font-semibold">
                Possível lançamento duplicado encontrado neste perfil
              </p>
              <p className="text-[11px] opacity-90">
                Antes de criar um novo gasto, verifique se esta mídia corresponde a um lançamento já registrado. Nada foi gravado automaticamente.
              </p>
            </div>
          </div>

          <div className="space-y-2">
            {analise.candidatosDuplicidade.map((cand) => (
              <div
                key={`${cand.alvoTipo}-${cand.alvoId}`}
                className="flex flex-col gap-2 rounded-xl border border-amber-500/30 bg-background/80 p-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0 space-y-0.5">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="font-semibold text-foreground">{cand.descricao}</span>
                    <span className="rounded-full border border-amber-500/35 bg-amber-500/15 px-2 py-0.5 text-[10px] font-semibold">
                      {cand.correspondenciaExata ? "Correspondência exata" : "Aproximada"}
                    </span>
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    {formatarCentavosBRL(cand.valorCentavos)} · {formatarDataBR(cand.data)} ·{" "}
                    {rotuloMotivoDuplicidade(cand.motivo)}
                    {cand.contraparte ? ` · ${cand.contraparte}` : ""}
                  </p>
                </div>
                <Button
                  type="button"
                  size="sm"
                  data-testid="btn-multimodal-vincular"
                  className="shrink-0 rounded-xl text-xs"
                  onClick={() => handleVincularExistente(cand)}
                >
                  <Link2 className="mr-1.5 h-3.5 w-3.5" />
                  Vincular ao lançamento existente
                </Button>
              </div>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-2 pt-1">
            <Button
              type="button"
              size="sm"
              variant="outline"
              data-testid="btn-multimodal-registrar-mesmo-assim"
              className="rounded-xl text-xs"
              onClick={() => setIgnorarDuplicidade(true)}
            >
              Registrar mesmo assim
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              data-testid="btn-multimodal-cancelar"
              className="rounded-xl text-xs"
              onClick={handleCancelar}
            >
              Cancelar
            </Button>
          </div>
        </div>
      )}

      {/* Extracted Data & Editable Proposal Card */}
      {analise && (
        <form
          onSubmit={(e) => void handleConfirmarProposta(e)}
          data-testid="multimodal-proposal-card"
          className="space-y-4 rounded-2xl border border-primary/30 bg-card p-4 shadow-sm sm:p-5"
        >
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0 space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <ShieldCheck className="h-4 w-4 shrink-0 text-primary" />
                <h4 className="font-display text-sm font-semibold text-foreground">
                  Proposta extraída para revisão e confirmação explícita
                </h4>
              </div>
              <div className="flex flex-wrap items-center gap-1.5 text-[10px]">
                <span className="rounded-full border border-border bg-muted/40 px-2 py-0.5 font-mono text-muted-foreground">
                  {analise.tipo === "audio" ? "Áudio G009" : rotuloTipoDoc(analise.tipoDocumento)}
                </span>
                <span className="rounded-full border border-border bg-muted/40 px-2 py-0.5 font-mono text-muted-foreground">
                  {analise.provedor}
                </span>
                <span
                  className={cn(
                    "rounded-full border px-2 py-0.5 font-semibold",
                    analise.homologado
                      ? "border-emerald-500/30 bg-emerald-500/12 text-emerald-700 dark:text-emerald-300"
                      : "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300"
                  )}
                >
                  {analise.homologado ? "Homologado" : "Não homologado"}
                </span>
              </div>
            </div>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={handleCancelar}
              className="h-8 rounded-lg px-2 text-xs text-muted-foreground"
            >
              <X className="mr-1 h-3.5 w-3.5" />
              Descartar
            </Button>
          </div>

          {/* Transcript / OCR summary */}
          {(analise.resumoTranscricao || analise.textoResumo) && (
            <div className="rounded-xl border border-border/80 bg-muted/25 p-3 text-xs">
              <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                {analise.tipo === "audio" ? "Resumo da transcrição" : "Resumo extraído (OCR)"}
              </p>
              <p className="break-words leading-relaxed text-foreground">
                {analise.tipo === "audio" ? analise.resumoTranscricao : analise.textoResumo}
              </p>
            </div>
          )}

          {/* Honesty Warning Banner */}
          <div
            data-testid="multimodal-honesty-warning"
            className="space-y-1.5 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3.5 py-2.5 text-xs text-amber-800 dark:text-amber-200"
          >
            <p className="font-semibold">{analise.avisoHonestidade}</p>
            {analise.avisosAdicionais.map((aviso, i) => (
              <p key={i} className="break-words text-[11px] opacity-90">
                • {aviso}
              </p>
            ))}
          </div>

          {/* Ambiguous candidate values selector */}
          {analise.proposta.valoresCandidatosCentavos &&
            analise.proposta.valoresCandidatosCentavos.length > 1 && (
              <div className="space-y-1.5 rounded-xl border border-border bg-muted/20 p-3 text-xs">
                <p className="font-semibold text-foreground">
                  Múltiplos valores encontrados — escolha explicitamente:
                </p>
                <div className="flex flex-wrap gap-2">
                  {analise.proposta.valoresCandidatosCentavos.map((c) => (
                    <Button
                      key={c}
                      type="button"
                      size="sm"
                      variant="outline"
                      className="rounded-lg text-xs"
                      onClick={() => setValorTexto(centavosParaInputBR(c))}
                    >
                      {formatarCentavosBRL(c)}
                    </Button>
                  ))}
                </div>
              </div>
            )}

          {/* Editable Proposal Form */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="mm-natureza" className="text-xs">
                Natureza do lançamento
              </Label>
              <select
                id="mm-natureza"
                data-testid="select-multimodal-natureza"
                value={natureza}
                onChange={(e) => setNatureza(e.target.value as "DESPESA" | "DIVIDA")}
                className="flex h-9 w-full rounded-xl border border-input bg-background px-3 py-1 text-xs text-foreground shadow-2xs focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring"
              >
                <option value="DESPESA">DESPESA (Gasto pago · G004)</option>
                <option value="DIVIDA">DIVIDA (Conta a pagar · G004)</option>
              </select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="mm-valor" className="text-xs">
                Valor exato (R$)
              </Label>
              <Input
                id="mm-valor"
                data-testid="input-multimodal-valor"
                placeholder="0,00"
                value={valorTexto}
                onChange={(e) => setValorTexto(e.target.value)}
                required
                className="rounded-xl text-xs"
              />
            </div>

            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="mm-descricao" className="text-xs">
                Descrição
              </Label>
              <Input
                id="mm-descricao"
                data-testid="input-multimodal-descricao"
                placeholder="Ex.: Compra de 2 telas para reposição"
                value={descricao}
                onChange={(e) => setDescricao(e.target.value)}
                required
                className="rounded-xl text-xs"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="mm-contraparte" className="text-xs">
                {natureza === "DIVIDA" ? "Credor / Fornecedor" : "Fornecedor / Contraparte"}
              </Label>
              <Input
                id="mm-contraparte"
                data-testid="input-multimodal-contraparte"
                placeholder="Ex.: Fornecedor Alfa"
                value={contraparte}
                onChange={(e) => setContraparte(e.target.value)}
                className="rounded-xl text-xs"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="mm-data" className="text-xs">
                {natureza === "DIVIDA" ? "Data de vencimento" : "Data do gasto"}
              </Label>
              <Input
                id="mm-data"
                type="date"
                data-testid="input-multimodal-data"
                value={dataLancamento}
                onChange={(e) => setDataLancamento(e.target.value)}
                required
                className="rounded-xl text-xs"
              />
            </div>

            {natureza === "DESPESA" && (
              <>
                <div className="space-y-1.5">
                  <Label htmlFor="mm-forma" className="text-xs">
                    Meio de pagamento
                  </Label>
                  <select
                    id="mm-forma"
                    data-testid="select-multimodal-forma"
                    value={formaPagamento}
                    onChange={(e) => setFormaPagamento(e.target.value as MeioPagamentoGasto)}
                    className="flex h-9 w-full rounded-xl border border-input bg-background px-3 py-1 text-xs text-foreground shadow-2xs focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring"
                  >
                    {MEIOS_PAGAMENTO_GASTO.map((m) => (
                      <option key={m} value={m}>
                        {rotuloMeioPagamento(m)}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="mm-conta" className="text-xs">
                    Conta / Carteira
                  </Label>
                  <select
                    id="mm-conta"
                    data-testid="select-multimodal-conta"
                    value={carteiraId}
                    onChange={(e) => setCarteiraId(e.target.value)}
                    className="flex h-9 w-full rounded-xl border border-input bg-background px-3 py-1 text-xs text-foreground shadow-2xs focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring"
                  >
                    {contasAtivas.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.nome}
                      </option>
                    ))}
                  </select>
                </div>
              </>
            )}

            <div className={cn("space-y-1.5", natureza === "DESPESA" && "sm:col-span-2")}>
              <Label htmlFor="mm-categoria" className="text-xs">
                Categoria
              </Label>
              <select
                id="mm-categoria"
                data-testid="select-multimodal-categoria"
                value={categoriaId}
                onChange={(e) => setCategoriaId(e.target.value)}
                className="flex h-9 w-full rounded-xl border border-input bg-background px-3 py-1 text-xs text-foreground shadow-2xs focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring"
              >
                {categoriasDespesa.map((cat) => (
                  <option key={cat.id} value={cat.id}>
                    {cat.nome}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {confirmError && (
            <div
              data-testid="multimodal-confirm-error"
              className="rounded-xl border border-rose-500/35 bg-rose-500/10 px-3 py-2 text-xs text-rose-700 dark:text-rose-200"
            >
              {confirmError}
            </div>
          )}

          <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border pt-3">
            {!temDuplicidadePendente && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                data-testid="btn-multimodal-cancelar"
                disabled={confirming}
                className="rounded-xl text-xs"
                onClick={handleCancelar}
              >
                Cancelar
              </Button>
            )}
            <Button
              type="submit"
              size="sm"
              data-testid="btn-multimodal-confirmar"
              disabled={confirming || temDuplicidadePendente}
              className="rounded-xl text-xs font-semibold"
            >
              {confirming ? (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              ) : (
                <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />
              )}
              {natureza === "DESPESA"
                ? "Confirmar e registrar despesa"
                : "Confirmar e registrar dívida"}
            </Button>
          </div>
        </form>
      )}
    </section>
  )
}
