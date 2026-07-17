"use client"

/**
 * Contador HUB · botão real de download do Pacote do Contador (GOAL 008).
 *
 * Substitui o CTA de preview: baixa de verdade o ZIP gerado sob demanda pelo endpoint
 * interno autenticado `GET /api/contador/pacote?c=AAAA-MM`. Nada persiste no cliente
 * (sem armazenamento local nem cache) — apenas um Blob temporário revogado após o clique.
 *
 * Honestidade: o pacote reflete os dados vivos da competência no momento do download,
 * NÃO é fechamento oficial e NÃO inclui XML fiscal nesta fase. Quando os dados reais não
 * estão disponíveis (escopo/leitura), o botão fica desabilitado com o motivo explícito.
 */
import { useCallback, useState } from "react"
import { AlertTriangle, Check, Download, FileArchive, Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"
import { formatCompetencia, type Competencia } from "@/lib/contador/competencia"

/** Endpoint interno autenticado do pacote (GET, download direto). */
export const PACOTE_ENDPOINT = "/api/contador/pacote"

export const PACOTE_INDISPONIVEL_TITLE =
  "Disponível quando os dados reais da competência carregam (sessão + loja ativa + permissão financeiro)."

type EstadoDownload = "idle" | "carregando" | "erro"

export type UsePacoteDownload = Readonly<{
  estado: EstadoDownload
  erro: string | null
  baixar: () => void
}>

/** Extrai o filename do Content-Disposition, se presente. */
function nomeDoDisposition(header: string | null): string | null {
  if (!header) return null
  const m = /filename="?([^"]+)"?/.exec(header)
  return m ? m[1] : null
}

/**
 * Hook de download compartilhado: um único estado dá para o botão do cabeçalho e para o
 * cartão da seção, mantendo-os em sincronia. Sem persistência.
 */
export function usePacoteDownload(competencia: Competencia): UsePacoteDownload {
  const [estado, setEstado] = useState<EstadoDownload>("idle")
  const [erro, setErro] = useState<string | null>(null)

  const baixar = useCallback(() => {
    const codigo = formatCompetencia(competencia)
    setEstado("carregando")
    setErro(null)
    void (async () => {
      try {
        const res = await fetch(`${PACOTE_ENDPOINT}?c=${encodeURIComponent(codigo)}`, {
          method: "GET",
          headers: { Accept: "application/zip" },
        })
        if (!res.ok) {
          let mensagem = "Não foi possível gerar o pacote agora. Tente novamente em instantes."
          try {
            const corpo = (await res.json()) as { mensagem?: unknown }
            if (typeof corpo?.mensagem === "string" && corpo.mensagem.trim()) {
              mensagem = corpo.mensagem
            }
          } catch {
            /* resposta sem JSON — mantém a mensagem padrão */
          }
          setErro(mensagem)
          setEstado("erro")
          return
        }
        const blob = await res.blob()
        const nome = nomeDoDisposition(res.headers.get("Content-Disposition")) ?? `pacote-contador-${codigo}.zip`
        const url = URL.createObjectURL(blob)
        const link = document.createElement("a")
        link.href = url
        link.download = nome
        document.body.appendChild(link)
        link.click()
        link.remove()
        URL.revokeObjectURL(url)
        setEstado("idle")
      } catch {
        setErro("Falha ao baixar o pacote. Verifique a conexão e tente novamente.")
        setEstado("erro")
      }
    })()
  }, [competencia])

  return { estado, erro, baixar }
}

const INCLUIDO: readonly string[] = [
  "Resumo da competência (RESUMO.md)",
  "CSVs reais: vendas, devoluções, financeiro e caixa",
  "Formas de pagamento e reconciliação",
  "Alertas de qualidade e checklist de fechamento",
  "Índice e manifesto com sha256 de cada arquivo",
]

const NAO_INCLUIDO: readonly string[] = [
  "Notas fiscais (XML) — placeholder honesto, próxima fase",
  "Documentos anexos — placeholder honesto, próxima fase",
]

export type ContadorPacoteDownloadProps = Readonly<{
  competencia: Competencia
  /** Dados reais disponíveis (escopo ok + leitura). Quando false, o download fica bloqueado. */
  disponivel: boolean
  /** Motivo honesto quando indisponível (escopo/leitura). */
  motivoIndisponivel?: string | null
  /** Estado de download compartilhado (mesmo hook do cabeçalho). */
  download: UsePacoteDownload
}>

/**
 * Cartão premium on-brand do Pacote do Contador com download real. Substitui o antigo
 * `PacoteCard` de preview (lista ilustrativa + botão desabilitado).
 */
export function ContadorPacoteDownload({
  competencia,
  disponivel,
  motivoIndisponivel,
  download,
}: ContadorPacoteDownloadProps) {
  const carregando = download.estado === "carregando"
  const motivo = motivoIndisponivel?.trim() || PACOTE_INDISPONIVEL_TITLE

  return (
    <div className="rounded-xl border border-primary/20 bg-gradient-to-br from-primary/10 via-primary/[0.04] to-transparent p-5">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h3 className="flex items-center gap-2 text-[17px] font-bold text-foreground">
          <FileArchive className="h-4.5 w-4.5 text-primary" />
          Pacote do Contador
        </h3>
        <span className="rounded-md bg-primary/10 px-2 py-1 font-mono text-[11px] text-primary">
          {formatCompetencia(competencia)}
        </span>
      </div>

      <p className="mb-4 text-[12.5px] leading-relaxed text-muted-foreground">
        Gera um único arquivo <b className="text-foreground">.zip</b> com a leitura real da competência —
        sob demanda, sem armazenar nada. Reflete os dados vivos no momento do download; não é
        fechamento oficial.
      </p>

      <div className="mb-4 grid gap-1.5">
        {INCLUIDO.map((item) => (
          <div key={item} className="flex items-center gap-2.5 text-[12.5px] text-foreground">
            <span className="grid h-[18px] w-[18px] shrink-0 place-items-center rounded-md bg-primary text-primary-foreground">
              <Check className="h-3 w-3" strokeWidth={3} />
            </span>
            {item}
          </div>
        ))}
        {NAO_INCLUIDO.map((item) => (
          <div key={item} className="flex items-center gap-2.5 text-[12.5px] text-muted-foreground">
            <span className="grid h-[18px] w-[18px] shrink-0 place-items-center rounded-md border border-dashed border-border" />
            {item}
          </div>
        ))}
      </div>

      <button
        type="button"
        disabled={!disponivel || carregando}
        title={disponivel ? undefined : motivo}
        onClick={download.baixar}
        className={cn(
          "inline-flex w-full items-center justify-center gap-2 rounded-lg border border-primary bg-primary px-3.5 py-2 text-[13px] font-semibold text-primary-foreground transition-colors hover:bg-primary/90",
          "disabled:cursor-not-allowed disabled:opacity-40",
        )}
      >
        {carregando ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            Gerando pacote…
          </>
        ) : (
          <>
            <Download className="h-4 w-4" />
            Baixar pacote (.zip)
          </>
        )}
      </button>

      {!disponivel ? (
        <p className="mt-2.5 flex items-start gap-2 text-[11.5px] leading-snug text-muted-foreground">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600 dark:text-amber-400" />
          {motivo}
        </p>
      ) : null}

      {download.estado === "erro" && download.erro ? (
        <p
          role="alert"
          className="mt-2.5 flex items-start gap-2 rounded-lg border border-rose-500/30 bg-rose-500/10 p-2.5 text-[11.5px] leading-snug text-foreground"
        >
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-rose-500" />
          {download.erro}
        </p>
      ) : null}
    </div>
  )
}
