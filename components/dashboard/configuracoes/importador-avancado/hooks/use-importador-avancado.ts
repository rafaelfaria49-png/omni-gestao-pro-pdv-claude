"use client"

import { useCallback, useMemo, useRef, useState } from "react"
import { ASSISTEC_LOJA_HEADER } from "@/lib/assistec-headers"
import { useLojaAtiva } from "@/lib/loja-ativa"

/**
 * Hook do Importador Avançado.
 *
 * Encapsula:
 * - upload de múltiplos arquivos (inclui .zip do GestaoClick),
 * - chamada de preview (POST /api/import/advanced?modo=preview),
 * - chamada de import efetivo (POST /api/import/advanced?modo=importar),
 * - estado de progresso e dados para LogAuditoria.
 *
 * Contrato espelha o app/api/import/advanced/route.ts (Commit 2):
 * - resposta de import tem { ok, modo, batchId, storeId, duracaoMs,
 *   totais, porDominio, errosDetalhados }.
 * - resposta de preview tem { ok, modo, planilhas[], erros? }.
 * - falha total devolve { ok: false, error, detalhe }.
 *
 * Multi-loja: usa useLojaAtiva() — sem fallback silencioso.
 */

// ---------- Tipos cruzados com o endpoint /api/import/advanced ----------

/**
 * Domínios suportados pelo detector/persistidor (Commit 1 + 2).
 * Nomes em snake_case e no plural para bater com `porDominio` do backend
 * (ex.: `ordens_servicos`, `clientes`, `contas_receber`).
 */
export type DominioImport =
  | "clientes"
  | "produtos"
  | "fornecedores"
  | "vendas"
  | "ordens_servicos"
  | "contas_receber"
  | "contas_pagar"
  | "fluxo_caixa"
  | "estoque_movimentos"
  | "categorias"
  | "marcas"
  | "tecnicos"
  | "desconhecido"

/**
 * Item de planilha detectada (saída do preview).
 * Backend devolve pelo menos { fileName, dominio, confianca, totalLinhas }.
 * Campos extras (sheetName, amostra, headers, totais previstos) são opcionais.
 */
export type PreviewSheet = {
  fileName: string
  sheetName?: string | null
  dominio: DominioImport
  /** 0..1 — confiança do auto-detect. */
  confianca: number
  totalLinhas: number
  totalCriar?: number
  totalAtualizar?: number
  totalIgnorar?: number
  headers?: string[]
  amostra?: Record<string, unknown>[]
  /** Aviso específico desta planilha (ex.: cabeçalho não identificado). */
  observacao?: string | null
}

export type PreviewResult = {
  ok: boolean
  modo: "preview"
  arquivos?: number
  /** Campo real do backend (route.ts atual). */
  planilhasDetectadas: PreviewSheet[]
  /** Backward-compat: consumidores existentes (PreviewCruzamento) leem "planilhas".
   *  Obrigatório porque o hook sempre preenche ambos os campos. */
  planilhas: PreviewSheet[]
  /** Totais agregados por domínio principal (criados+atualizados). */
  grupos?: Record<string, number>
  /** Lista de domínios que serão alvo do importar. */
  dominiosParaImportar?: string[]
  /** Erros globais de parsing/leitura (ZIP corrompido, formato inválido, etc.). */
  erros?: string[]
}

/** Contadores globais agregados (modo=importar). */
export type ImportTotais = {
  criados: number
  atualizados: number
  ignorados: number
  erros: number
}

/** Contadores por domínio — `erros` aqui é o nº de erros vindos de `errosDetalhados`. */
export type ImportPorDominio = Partial<
  Record<
    DominioImport,
    {
      criados: number
      atualizados: number
      ignorados?: number
      erros: number
    }
  >
>

/** Erro detalhado de uma linha que falhou. */
export type ErroDetalhado = {
  dominio: DominioImport | string
  /** Chave de negócio do registro (ex.: "OS-37", CPF/CNPJ, SKU). */
  chave: string
  detalhe: string
}

export type ImportarResult = {
  ok: boolean
  modo: "importar"
  batchId: string
  storeId: string
  duracaoMs: number
  totais: ImportTotais
  porDominio: ImportPorDominio
  errosDetalhados: ErroDetalhado[]
}

/** Falha total (catch do servidor). */
export type ImportFalhaTotal = {
  ok: false
  error: string
  detalhe?: string
}

export type EstadoImportador =
  | { fase: "idle" }
  | { fase: "preview-loading" }
  | { fase: "preview-ok"; preview: PreviewResult }
  | { fase: "import-loading"; progresso: number; mensagem: string }
  | { fase: "import-ok"; result: ImportarResult }
  | { fase: "erro"; mensagem: string; detalhe?: string }

const ENDPOINT_BASE = "/api/import/advanced"

// ---------- Hook ----------

export function useImportadorAvancado() {
  const { lojaAtivaId } = useLojaAtiva()
  const lojaHeader = (lojaAtivaId ?? "").trim()
  const temLojaObrigatoria = lojaHeader.length > 0

  const [arquivos, setArquivos] = useState<File[]>([])
  const [estado, setEstado] = useState<EstadoImportador>({ fase: "idle" })
  const abortRef = useRef<AbortController | null>(null)

  // ---- Manipulação de arquivos ----

  const adicionarArquivos = useCallback((files: FileList | File[] | null | undefined) => {
    if (!files) return
    const arr = Array.from(files as ArrayLike<File>)
    if (arr.length === 0) return
    setArquivos((prev) => {
      // Dedup por (nome + tamanho); mesmo nome+tamanho substitui.
      const next = [...prev]
      for (const f of arr) {
        const idx = next.findIndex((x) => x.name === f.name && x.size === f.size)
        if (idx >= 0) {
          next[idx] = f
        } else {
          next.push(f)
        }
      }
      return next
    })
  }, [])

  const removerArquivo = useCallback((nome: string) => {
    setArquivos((prev) => prev.filter((f) => f.name !== nome))
  }, [])

  const limparArquivos = useCallback(() => {
    setArquivos([])
  }, [])

  const limparEstado = useCallback(() => {
    abortRef.current?.abort()
    abortRef.current = null
    setEstado({ fase: "idle" })
  }, [])

  // ---- Build do FormData (multipart) ----

  const buildFormData = useCallback(
    (lista: File[], dominios?: DominioImport[]): FormData => {
      const fd = new FormData()
      for (const f of lista) {
        fd.append("arquivos[]", f, f.name)
      }
      if (dominios && dominios.length > 0) {
        for (const d of dominios) {
          fd.append("dominios[]", d)
        }
      }
      return fd
    },
    [],
  )

  // ---- Parsing defensivo da resposta ----

  const parseErroResposta = useCallback(
    async (r: Response): Promise<{ mensagem: string; detalhe?: string }> => {
      try {
        const j = (await r.json()) as Partial<ImportFalhaTotal> & { error?: string; detalhe?: string }
        const mensagem = j.error || `HTTP ${r.status}`
        const detalhe = j.detalhe
        return { mensagem, detalhe }
      } catch {
        return { mensagem: `HTTP ${r.status}` }
      }
    },
    [],
  )

  // ---- Chamadas API ----

  const rodarPreview = useCallback(
    async (dominios?: DominioImport[]): Promise<PreviewResult | null> => {
      if (!temLojaObrigatoria) {
        setEstado({ fase: "erro", mensagem: "Selecione a unidade (loja) ativa antes de pré-visualizar." })
        return null
      }
      if (arquivos.length === 0) {
        setEstado({ fase: "erro", mensagem: "Selecione ao menos um arquivo para pré-visualizar." })
        return null
      }

      abortRef.current?.abort()
      const ctrl = new AbortController()
      abortRef.current = ctrl
      setEstado({ fase: "preview-loading" })

      try {
        const fd = buildFormData(arquivos, dominios)
        const r = await fetch(`${ENDPOINT_BASE}?modo=preview`, {
          method: "POST",
          credentials: "include",
          headers: { [ASSISTEC_LOJA_HEADER]: lojaHeader },
          body: fd,
          signal: ctrl.signal,
          cache: "no-store",
        })
        if (!r.ok) {
          const { mensagem, detalhe } = await parseErroResposta(r)
          setEstado({ fase: "erro", mensagem, detalhe })
          return null
        }
        const j = (await r.json()) as PreviewResult
        const listaPlanilhas: PreviewSheet[] = Array.isArray(j.planilhasDetectadas)
          ? j.planilhasDetectadas
          : Array.isArray(j.planilhas)
            ? j.planilhas
            : []
        const safe: PreviewResult = {
          ok: Boolean(j.ok),
          modo: "preview",
          arquivos: typeof j.arquivos === "number" ? j.arquivos : arquivos.length,
          planilhasDetectadas: listaPlanilhas,
          planilhas: listaPlanilhas,
          grupos: j.grupos && typeof j.grupos === "object" ? j.grupos as Record<string, number> : undefined,
          dominiosParaImportar: Array.isArray(j.dominiosParaImportar) ? j.dominiosParaImportar : undefined,
          erros: Array.isArray(j.erros) ? j.erros : undefined,
        }
        setEstado({ fase: "preview-ok", preview: safe })
        return safe
      } catch (e) {
        if ((e as { name?: string })?.name === "AbortError") return null
        const msg = e instanceof Error ? e.message : String(e)
        setEstado({ fase: "erro", mensagem: msg })
        return null
      }
    },
    [arquivos, buildFormData, lojaHeader, parseErroResposta, temLojaObrigatoria],
  )

  const rodarImport = useCallback(
    async (dominios?: DominioImport[]): Promise<ImportarResult | null> => {
      if (!temLojaObrigatoria) {
        setEstado({ fase: "erro", mensagem: "Selecione a unidade (loja) ativa antes de importar." })
        return null
      }
      if (arquivos.length === 0) {
        setEstado({ fase: "erro", mensagem: "Selecione ao menos um arquivo para importar." })
        return null
      }

      abortRef.current?.abort()
      const ctrl = new AbortController()
      abortRef.current = ctrl

      // Progresso indeterminado simulado (o endpoint é síncrono).
      setEstado({ fase: "import-loading", progresso: 5, mensagem: "Enviando arquivos…" })
      let tick = 5
      const interval = window.setInterval(() => {
        tick = Math.min(tick + 4, 92)
        setEstado((prev) =>
          prev.fase === "import-loading"
            ? {
                fase: "import-loading",
                progresso: tick,
                mensagem:
                  tick < 40
                    ? "Enviando arquivos…"
                    : tick < 70
                      ? "Processando planilhas…"
                      : "Persistindo no banco…",
              }
            : prev,
        )
      }, 350)

      try {
        const fd = buildFormData(arquivos, dominios)
        const r = await fetch(`${ENDPOINT_BASE}?modo=importar`, {
          method: "POST",
          credentials: "include",
          headers: { [ASSISTEC_LOJA_HEADER]: lojaHeader },
          body: fd,
          signal: ctrl.signal,
          cache: "no-store",
        })
        window.clearInterval(interval)
        if (!r.ok) {
          const { mensagem, detalhe } = await parseErroResposta(r)
          setEstado({ fase: "erro", mensagem, detalhe })
          return null
        }
        const j = (await r.json()) as ImportarResult
        const safe: ImportarResult = {
          ok: Boolean(j.ok),
          modo: "importar",
          batchId: typeof j.batchId === "string" ? j.batchId : "",
          storeId: typeof j.storeId === "string" ? j.storeId : lojaHeader,
          duracaoMs: typeof j.duracaoMs === "number" ? j.duracaoMs : 0,
          totais: {
            criados: typeof j.totais?.criados === "number" ? j.totais.criados : 0,
            atualizados: typeof j.totais?.atualizados === "number" ? j.totais.atualizados : 0,
            ignorados: typeof j.totais?.ignorados === "number" ? j.totais.ignorados : 0,
            erros: typeof j.totais?.erros === "number" ? j.totais.erros : 0,
          },
          porDominio: j.porDominio && typeof j.porDominio === "object" ? j.porDominio : {},
          errosDetalhados: Array.isArray(j.errosDetalhados) ? j.errosDetalhados : [],
        }
        setEstado({ fase: "import-ok", result: safe })
        return safe
      } catch (e) {
        window.clearInterval(interval)
        if ((e as { name?: string })?.name === "AbortError") return null
        const msg = e instanceof Error ? e.message : String(e)
        setEstado({ fase: "erro", mensagem: msg })
        return null
      }
    },
    [arquivos, buildFormData, lojaHeader, parseErroResposta, temLojaObrigatoria],
  )

  // ---- Derivados úteis para a UI ----

  const totalArquivos = arquivos.length
  const tamanhoTotalBytes = useMemo(
    () => arquivos.reduce((acc, f) => acc + (Number.isFinite(f.size) ? f.size : 0), 0),
    [arquivos],
  )

  return {
    // estado
    estado,
    arquivos,
    totalArquivos,
    tamanhoTotalBytes,
    lojaHeader,
    temLojaObrigatoria,

    // ações
    adicionarArquivos,
    removerArquivo,
    limparArquivos,
    limparEstado,
    rodarPreview,
    rodarImport,
  }
}

export type UseImportadorAvancadoReturn = ReturnType<typeof useImportadorAvancado>
