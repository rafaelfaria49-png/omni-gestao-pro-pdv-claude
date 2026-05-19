// ============================================================
// lib/importador-avancado/parser.ts
// Parser server-side: xlsx, csv, zip → PlanilhaParseada[]
// Roda apenas no Node.js (API route) — não importar no cliente
// ============================================================

import type { PlanilhaParseada } from "./types"
import { detectarDominio } from "./detector"

// ── xlsx via SheetJS (pacote "xlsx", instalado no projeto) ──
// Suporta .xlsx, .xls, .xlsm, .ods e .csv

async function parseXlsxBuffer(
  buffer: Buffer,
  nomeArquivo: string
): Promise<{ headers: string[]; linhas: Record<string, unknown>[] }> {
  try {
    const XLSX = await import("xlsx")
    const wb = XLSX.read(buffer, { type: "buffer", cellDates: true })
    const wsName = wb.SheetNames[0]
    if (!wsName) return { headers: [], linhas: [] }
    const ws = wb.Sheets[wsName]
    const dados = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws!, {
      defval: null,
      raw: false,
    })
    if (dados.length === 0) return { headers: [], linhas: [] }
    const headers = Object.keys(dados[0] ?? {})
    const linhas = dados.filter((row) => Object.values(row).some((v) => v !== null && v !== ""))
    return { headers, linhas }
  } catch (e) {
    console.error(`[importador-avancado/parser] Falha ao parsear ${nomeArquivo}:`, e)
    return { headers: [], linhas: [] }
  }
}

async function parseCsvBuffer(
  buffer: Buffer,
  nomeArquivo: string
): Promise<{ headers: string[]; linhas: Record<string, unknown>[] }> {
  try {
    const text = buffer.toString("utf-8")
    // Detecta separador: ; ou ,
    const primeiraLinha = text.split("\n")[0] ?? ""
    const sep = primeiraLinha.includes(";") ? ";" : ","

    const linhasTexto = text.split("\n").filter((l) => l.trim())
    if (linhasTexto.length === 0) return { headers: [], linhas: [] }

    const headers = linhasTexto[0]!.split(sep).map((h) => h.replace(/^"|"$/g, "").trim())
    const linhas: Record<string, unknown>[] = []

    for (let i = 1; i < linhasTexto.length; i++) {
      const cols = linhasTexto[i]!.split(sep).map((c) => c.replace(/^"|"$/g, "").trim())
      const linha: Record<string, unknown> = {}
      let temValor = false
      for (let j = 0; j < headers.length; j++) {
        if (cols[j] && cols[j] !== "") {
          linha[headers[j]!] = cols[j]
          temValor = true
        }
      }
      if (temValor) linhas.push(linha)
    }

    return { headers, linhas }
  } catch (e) {
    console.error(`[importador-avancado/parser] Falha CSV ${nomeArquivo}:`, e)
    return { headers: [], linhas: [] }
  }
}

/** Parseia um arquivo (xlsx, csv, xls) em PlanilhaParseada */
export async function parsearArquivo(
  buffer: Buffer,
  nomeArquivo: string
): Promise<PlanilhaParseada | null> {
  const ext = nomeArquivo.toLowerCase().split(".").pop() ?? ""
  let parsed: { headers: string[]; linhas: Record<string, unknown>[] }

  if (ext === "xlsx" || ext === "xls" || ext === "ods" || ext === "xlsm") {
    parsed = await parseXlsxBuffer(buffer, nomeArquivo)
  } else if (ext === "csv" || ext === "tsv") {
    parsed = await parseCsvBuffer(buffer, nomeArquivo)
  } else {
    return null
  }

  if (parsed.headers.length === 0) return null

  const { dominio, confianca, chaveJoin } = detectarDominio(parsed.headers, nomeArquivo)

  return {
    nomeArquivo,
    dominio,
    confianca,
    chaveJoin,
    headers: parsed.headers,
    linhas: parsed.linhas,
    totalLinhas: parsed.linhas.length,
  }
}

/** Descomprime um ZIP e parseia todos os xlsx/csv dentro */
export async function parsearZip(
  buffer: Buffer,
  nomeArquivo: string
): Promise<PlanilhaParseada[]> {
  const resultados: PlanilhaParseada[] = []
  const diag = { entriesTotais: 0, ignoradosFiltro: 0, falhasParse: 0, planilhasOk: 0, lib: "" }

  try {
    let entries: Array<{ name: string; getData: () => Buffer | Promise<Buffer> }> = []

    try {
      // @ts-ignore — adm-zip é dependência opcional; se não instalada cai no fallback JSZip
      const AdmZip = ((await import("adm-zip")) as any).default
      const zip = new AdmZip(buffer)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      entries = zip.getEntries().map((e: any) => ({
        name: e.entryName as string,
        getData: () => e.getData() as Buffer,
      }))
      diag.lib = "adm-zip"
    } catch (eAdm) {
      console.warn(`[importador-avancado/parser] adm-zip falhou em ${nomeArquivo}, fallback JSZip:`, eAdm instanceof Error ? eAdm.message : eAdm)
      // Fallback: JSZip
      // @ts-ignore — jszip é dependência opcional; se não instalada o ZIP não é suportado
      const JSZip = ((await import("jszip")) as any).default
      const zip = await JSZip.loadAsync(buffer)
      for (const [name, file] of Object.entries(zip.files)) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const f = file as any
        if (f.dir) continue
        entries.push({ name, getData: () => f.async("nodebuffer") as Promise<Buffer> })
      }
      diag.lib = "jszip"
    }

    diag.entriesTotais = entries.length

    for (const entry of entries) {
      const nome = entry.name
      const nomeBase = nome.split(/[\\/]/).pop() ?? nome
      const ext = nomeBase.toLowerCase().split(".").pop() ?? ""

      // Filtro 1: extensão suportada
      if (!["xlsx", "xls", "csv", "tsv", "ods"].includes(ext)) {
        diag.ignoradosFiltro++
        continue
      }
      // Filtro 2: lixo de SO (__MACOSX em qualquer posição do path, arquivos ocultos)
      if (nome.includes("__MACOSX") || nomeBase.startsWith(".") || nomeBase.startsWith("~$")) {
        diag.ignoradosFiltro++
        continue
      }

      try {
        const data = await Promise.resolve(entry.getData())
        const planilha = await parsearArquivo(data, nomeBase)
        if (planilha) {
          resultados.push(planilha)
          diag.planilhasOk++
        } else {
          diag.falhasParse++
        }
      } catch (eEntry) {
        diag.falhasParse++
        console.error(`[importador-avancado/parser] Erro ao parsear entry ${nome} de ${nomeArquivo}:`, eEntry instanceof Error ? eEntry.message : eEntry)
      }
    }
  } catch (e) {
    console.error(`[importador-avancado/parser] Falha ao descomprimir ZIP ${nomeArquivo}:`, e)
  }

  console.info(`[importador-avancado/parser] ZIP ${nomeArquivo} (${diag.lib}): ${diag.entriesTotais} entries, ${diag.planilhasOk} planilhas OK, ${diag.ignoradosFiltro} ignoradas (filtro), ${diag.falhasParse} falhas`)
  return resultados
}

/** Entry point principal: recebe File (FormData) e retorna planilhas parseadas */
export async function parsearArquivos(
  arquivos: Array<{ buffer: Buffer; nome: string }>
): Promise<PlanilhaParseada[]> {
  const todas: PlanilhaParseada[] = []

  for (const { buffer, nome } of arquivos) {
    const ext = nome.toLowerCase().split(".").pop() ?? ""
    if (ext === "zip") {
      const planilhas = await parsearZip(buffer, nome)
      todas.push(...planilhas)
    } else {
      const planilha = await parsearArquivo(buffer, nome)
      if (planilha) todas.push(planilha)
    }
  }

  return todas
}
