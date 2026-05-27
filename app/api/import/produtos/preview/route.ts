import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/auth"
import { getVerifiedSubscriptionFromCookies } from "@/lib/api-auth"
import { isVencimentoExpired } from "@/lib/subscription-seal"
import { getTrustedTimeMs } from "@/lib/trusted-time"
import { storeIdFromAssistecRequestForWrite } from "@/lib/store-id-from-request"
import {
  fatiarEmLotes,
  processarArquivoProdutos,
  recortarParaPreview,
} from "@/lib/importador-produtos/parser"
import {
  analisarDuplicadosBanco,
  contarDuplicadosInternos,
} from "@/lib/importador-produtos/dedupe"
import type { PreviewProdutosErro, PreviewProdutosResult } from "@/lib/importador-produtos/types"

export const runtime = "nodejs"
export const maxDuration = 120

const TAMANHO_LOTE_DEFAULT = 500
const MAX_BYTES = 50 * 1024 * 1024 // 50MB
const EXTENSOES_OK = new Set(["xls", "xlsx", "xlsm", "ods", "csv", "tsv"])

async function requireAuth(): Promise<{ ok: true } | { ok: false; res: NextResponse }> {
  try {
    const session = await auth()
    if (session?.user) return { ok: true }
  } catch {
    /* fallback abaixo */
  }
  const sub = await getVerifiedSubscriptionFromCookies()
  if (!sub || !sub.ok) {
    return { ok: false, res: NextResponse.json({ error: "forbidden" }, { status: 403 }) }
  }
  const now = await getTrustedTimeMs()
  if (isVencimentoExpired(now, sub.vencimento)) {
    return {
      ok: false,
      res: NextResponse.json({ error: "subscription_expired" }, { status: 402 }),
    }
  }
  return { ok: true }
}

function erro(error: string, status = 400, detalhe?: string): NextResponse<PreviewProdutosErro> {
  return NextResponse.json<PreviewProdutosErro>({ ok: false, error, detalhe }, { status })
}

export async function POST(req: NextRequest) {
  const a = await requireAuth()
  if (!a.ok) return a.res

  const storeId = storeIdFromAssistecRequestForWrite(req)
  if (!storeId) {
    return erro(
      "Unidade ativa não enviada (header x-assistec-loja-id obrigatório)",
      400,
      "Selecione a unidade no cabeçalho do sistema antes de pré-visualizar.",
    )
  }

  let formData: FormData
  try {
    formData = await req.formData()
  } catch {
    return erro("FormData inválido", 400)
  }

  const arquivo = formData.get("arquivo")
  if (!(arquivo instanceof File)) {
    return erro("Envie um arquivo no campo 'arquivo'", 400)
  }
  if (arquivo.size > MAX_BYTES) {
    return erro(`Arquivo maior que ${(MAX_BYTES / 1024 / 1024) | 0} MB`, 413)
  }
  const ext = arquivo.name.toLowerCase().split(".").pop() ?? ""
  if (!EXTENSOES_OK.has(ext)) {
    return erro(`Extensão não suportada (.${ext}). Use XLS, XLSX, ODS, CSV ou TSV.`, 415)
  }

  const tamanhoLoteRaw = Number(formData.get("tamanhoLote") ?? TAMANHO_LOTE_DEFAULT)
  const tamanhoLote =
    Number.isFinite(tamanhoLoteRaw) && tamanhoLoteRaw >= 50 && tamanhoLoteRaw <= 1000
      ? Math.floor(tamanhoLoteRaw)
      : TAMANHO_LOTE_DEFAULT

  let buffer: Buffer
  try {
    const arr = await arquivo.arrayBuffer()
    buffer = Buffer.from(arr)
  } catch (e) {
    return erro("Falha ao ler bytes do arquivo", 400, e instanceof Error ? e.message : String(e))
  }

  let processado
  try {
    processado = await processarArquivoProdutos(buffer, arquivo.name)
  } catch (e) {
    return erro(
      "Falha ao parsear planilha (formato inválido ou corrompido?)",
      422,
      e instanceof Error ? e.message : String(e),
    )
  }

  if (processado.cabecalho.colunas.length === 0) {
    return erro("Nenhum cabeçalho reconhecível na planilha (verifique se há uma linha com colunas como Código/Nome/Preço/Estoque).", 422)
  }

  const { cabecalho, totalLinhasLidas, validos, invalidos } = processado

  const duplicadosInternos = contarDuplicadosInternos(validos)

  // Análise por força do match — a MESMA usada pelo persistidor (defesa contra
  // divergência preview vs execução).
  let analiseDuplicadosBanco = { forte: 0, fraco: 0, semChave: 0 }
  try {
    analiseDuplicadosBanco = await analisarDuplicadosBanco(storeId, validos)
  } catch (e) {
    console.warn(
      "[import/produtos/preview] análise de duplicados no DB falhou:",
      e instanceof Error ? e.message : e,
    )
  }
  const possiveisDuplicadosBanco = analiseDuplicadosBanco.forte + analiseDuplicadosBanco.fraco

  const { amostra, invalidasReportadas } = recortarParaPreview(validos, invalidos)
  const lotes = fatiarEmLotes(validos, tamanhoLote)

  console.info(
    `[import/produtos/preview] storeId=${storeId} arquivo=${arquivo.name} ` +
      `lidas=${totalLinhasLidas} validas=${validos.length} invalidas=${invalidos.length} ` +
      `dup.int=${duplicadosInternos} match.forte=${analiseDuplicadosBanco.forte} ` +
      `match.fraco=${analiseDuplicadosBanco.fraco} sem.chave=${analiseDuplicadosBanco.semChave} ` +
      `lotes=${lotes.length}`,
  )

  const resp: PreviewProdutosResult = {
    ok: true,
    arquivo: arquivo.name,
    storeId,
    cabecalho,
    totalLinhasLidas,
    totalLinhasValidas: validos.length,
    totalLinhasInvalidas: invalidos.length,
    duplicadosInternos,
    possiveisDuplicadosBanco,
    analiseDuplicadosBanco,
    amostra,
    linhasInvalidas: invalidasReportadas,
    lotes,
    tamanhoLote,
    totalLotes: lotes.length,
  }
  return NextResponse.json(resp)
}
