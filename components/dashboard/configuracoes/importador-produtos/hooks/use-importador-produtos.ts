"use client"

import { useCallback, useMemo, useRef, useState } from "react"
import { ASSISTEC_LOJA_HEADER } from "@/lib/assistec-headers"
import { useLojaAtiva } from "@/lib/loja-ativa"
import type {
  LoteResult,
  ModoConflito,
  PreviewProdutosResult,
} from "@/lib/importador-produtos/types"

/**
 * Hook do Importador de Produtos (planilhas grandes/legadas).
 *
 * Fluxo:
 *   idle → preview-loading → preview-ok → lotes-em-andamento → concluido
 *                                                    ↓
 *                                                  erro (qualquer fase)
 *
 * Diferente do importador avançado: parsing acontece no servidor uma vez
 * (preview), depois o cliente envia lote a lote (~500 itens) clicando em
 * "Importar próximo lote".
 *
 * SEGURANÇA (pós-incidente Smart):
 *  - Default seguro: modo "criar" (cria novos; pula apenas em match forte).
 *  - Reset HARD ao escolher novo arquivo: aborta fetch pendente, zera tudo
 *    para não reaproveitar preview de planilha anterior.
 *  - Envia `lojaAtivaIdConfirmado` no body — servidor valida contra header.
 *  - Reset também ao trocar de loja (lojaHeader muda → resetar tudo).
 */

type Estado =
  | { fase: "idle" }
  | { fase: "preview-loading" }
  | {
      fase: "preview-ok"
      preview: PreviewProdutosResult
      batchId: string
    }
  | {
      fase: "lotes-em-andamento"
      preview: PreviewProdutosResult
      batchId: string
      loteAtual: number
      resultados: LoteResult[]
      enviando: boolean
    }
  | {
      fase: "concluido"
      preview: PreviewProdutosResult
      batchId: string
      resultados: LoteResult[]
    }
  | { fase: "erro"; mensagem: string; detalhe?: string }

const PREVIEW_ENDPOINT = "/api/import/produtos/preview"
const LOTE_ENDPOINT = "/api/import/produtos/lote"

function gerarBatchId(): string {
  return `prod-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
}

export function useImportadorProdutos() {
  const { lojaAtivaId } = useLojaAtiva()
  const lojaHeader = (lojaAtivaId ?? "").trim()
  const temLojaObrigatoria = lojaHeader.length > 0

  const [arquivo, setArquivo] = useState<File | null>(null)
  // Default seguro: "criar" — não atualiza nada automaticamente.
  // (incidente Smart: "atualizar" era default e causou 0 criados / 500 atualizados)
  const [modoConflito, setModoConflito] = useState<ModoConflito>("criar")
  const [estado, setEstado] = useState<Estado>({ fase: "idle" })
  const abortRef = useRef<AbortController | null>(null)
  const lojaHeaderInicialRef = useRef<string>(lojaHeader)

  /** Reset hard: aborta fetch pendente, zera arquivo, batchId, preview, lotes. */
  const limpar = useCallback(() => {
    abortRef.current?.abort()
    abortRef.current = null
    setArquivo(null)
    setEstado({ fase: "idle" })
  }, [])

  const escolherArquivo = useCallback((f: File | null) => {
    // Reset hard ao trocar de arquivo — não reaproveitar nada da planilha anterior.
    abortRef.current?.abort()
    abortRef.current = null
    setArquivo(f)
    setEstado({ fase: "idle" })
  }, [])

  // Se a loja ativa muda no meio do fluxo, reset hard (evita gravar em loja errada).
  if (lojaHeader !== lojaHeaderInicialRef.current) {
    lojaHeaderInicialRef.current = lojaHeader
    abortRef.current?.abort()
    abortRef.current = null
    if (estado.fase !== "idle") {
      setEstado({ fase: "idle" })
      setArquivo(null)
    }
  }

  const rodarPreview = useCallback(async () => {
    if (!temLojaObrigatoria) {
      setEstado({ fase: "erro", mensagem: "Selecione a unidade (loja) ativa antes de pré-visualizar." })
      return
    }
    if (!arquivo) {
      setEstado({ fase: "erro", mensagem: "Selecione um arquivo para pré-visualizar." })
      return
    }

    abortRef.current?.abort()
    const ctrl = new AbortController()
    abortRef.current = ctrl
    setEstado({ fase: "preview-loading" })

    try {
      const fd = new FormData()
      fd.append("arquivo", arquivo, arquivo.name)
      fd.append("tamanhoLote", "500")
      const r = await fetch(PREVIEW_ENDPOINT, {
        method: "POST",
        credentials: "include",
        headers: { [ASSISTEC_LOJA_HEADER]: lojaHeader },
        body: fd,
        signal: ctrl.signal,
        cache: "no-store",
      })
      if (!r.ok) {
        const j = await safeJson(r)
        setEstado({
          fase: "erro",
          mensagem: j?.error || `HTTP ${r.status}`,
          detalhe: j?.detalhe,
        })
        return
      }
      const j = (await r.json()) as PreviewProdutosResult
      if (!j.ok) {
        setEstado({ fase: "erro", mensagem: "Resposta inválida do servidor" })
        return
      }
      // Validação extra: o storeId que o servidor confirmou deve bater com o
      // header que enviamos. Se diferir, o cookie pode estar furando — abortar.
      if (j.storeId !== lojaHeader) {
        setEstado({
          fase: "erro",
          mensagem: "Resposta com unidade divergente — recarregue a página",
          detalhe: `Enviei ${lojaHeader}, servidor confirmou ${j.storeId}. Risco de cookie cross-store. Não importe.`,
        })
        return
      }
      setEstado({ fase: "preview-ok", preview: j, batchId: gerarBatchId() })
    } catch (e) {
      if ((e as { name?: string })?.name === "AbortError") return
      setEstado({
        fase: "erro",
        mensagem: e instanceof Error ? e.message : String(e),
      })
    }
  }, [arquivo, lojaHeader, temLojaObrigatoria])

  const enviarProximoLote = useCallback(async () => {
    // Snapshot da loja ativa NO INÍCIO da operação — usado pelo body para
    // que o servidor valide que header e UI batem.
    const lojaAtivaNoMomento = lojaHeader
    if (!lojaAtivaNoMomento) {
      setEstado({ fase: "erro", mensagem: "Unidade ativa perdida — recarregue a página" })
      return
    }

    setEstado((prev) => {
      if (prev.fase !== "preview-ok" && prev.fase !== "lotes-em-andamento") return prev
      if (prev.fase === "lotes-em-andamento" && prev.enviando) return prev

      const preview = prev.preview
      const batchId = prev.batchId
      const loteAtual = prev.fase === "lotes-em-andamento" ? prev.loteAtual : 0
      const resultadosPrev = prev.fase === "lotes-em-andamento" ? prev.resultados : []

      if (loteAtual >= preview.totalLotes) return prev

      // Mais uma defesa: o storeId do preview deve bater com a loja ativa agora.
      // Se o usuário trocou de loja entre o preview e o "Importar lote", abortar.
      if (preview.storeId !== lojaAtivaNoMomento) {
        return {
          fase: "erro",
          mensagem: "Loja ativa mudou desde o preview — refaça o preview",
          detalhe: `Preview foi feito na loja ${preview.storeId}, mas a loja ativa agora é ${lojaAtivaNoMomento}.`,
        }
      }

      // Marca enviando antes do fetch (lock idempotente contra duplo-clique).
      const intermediario: Estado = {
        fase: "lotes-em-andamento",
        preview,
        batchId,
        loteAtual,
        resultados: resultadosPrev,
        enviando: true,
      }
      // Dispara fetch fora do setState (não pode usar await aqui).
      void (async () => {
        try {
          const itensLote = preview.lotes[loteAtual] ?? []
          const r = await fetch(LOTE_ENDPOINT, {
            method: "POST",
            credentials: "include",
            headers: {
              "content-type": "application/json",
              [ASSISTEC_LOJA_HEADER]: lojaAtivaNoMomento,
            },
            body: JSON.stringify({
              batchId,
              arquivo: preview.arquivo,
              modoConflito,
              loteIndex: loteAtual,
              totalLotes: preview.totalLotes,
              itens: itensLote,
              lojaAtivaIdConfirmado: lojaAtivaNoMomento,
            }),
            cache: "no-store",
          })
          if (!r.ok) {
            const j = await safeJson(r)
            setEstado({
              fase: "erro",
              mensagem: j?.error || `HTTP ${r.status}`,
              detalhe: j?.detalhe,
            })
            return
          }
          const j = (await r.json()) as LoteResult
          const novosResultados = [...resultadosPrev, j]
          const proximoLote = loteAtual + 1
          if (proximoLote >= preview.totalLotes) {
            setEstado({
              fase: "concluido",
              preview,
              batchId,
              resultados: novosResultados,
            })
          } else {
            setEstado({
              fase: "lotes-em-andamento",
              preview,
              batchId,
              loteAtual: proximoLote,
              resultados: novosResultados,
              enviando: false,
            })
          }
        } catch (e) {
          setEstado({
            fase: "erro",
            mensagem: e instanceof Error ? e.message : String(e),
          })
        }
      })()
      return intermediario
    })
  }, [lojaHeader, modoConflito])

  // Agregados úteis para a UI
  const totais = useMemo(() => {
    if (estado.fase !== "lotes-em-andamento" && estado.fase !== "concluido") {
      return { criados: 0, atualizados: 0, pulados: 0, erros: 0 }
    }
    return estado.resultados.reduce(
      (acc, r) => ({
        criados: acc.criados + r.criados,
        atualizados: acc.atualizados + r.atualizados,
        pulados: acc.pulados + r.pulados,
        erros: acc.erros + r.erros,
      }),
      { criados: 0, atualizados: 0, pulados: 0, erros: 0 },
    )
  }, [estado])

  return {
    // estado
    estado,
    arquivo,
    modoConflito,
    lojaHeader,
    temLojaObrigatoria,
    totais,
    // ações
    escolherArquivo,
    setModoConflito,
    limpar,
    rodarPreview,
    enviarProximoLote,
  }
}

async function safeJson(r: Response): Promise<{ error?: string; detalhe?: string } | null> {
  try {
    return (await r.json()) as { error?: string; detalhe?: string }
  } catch {
    return null
  }
}

export type UseImportadorProdutosReturn = ReturnType<typeof useImportadorProdutos>
