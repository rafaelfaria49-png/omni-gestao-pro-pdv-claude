/**
 * Política de aparelhos da loja + sequências (OMNI-APARELHOS-ENDTOEND-001).
 * A política é versionada: cada venda guarda a versão e o texto aplicados no snapshot,
 * então alterar a política depois NUNCA muda garantia já emitida.
 */
import type { Prisma } from "@/generated/prisma"
import { CONTRATUAL_MAX_ABSOLUTO_DIAS, GARANTIA_LEGAL_DIAS, normalizePresets } from "./warranty"

export const TERMO_GARANTIA_VERSAO = "APA-TERMO-1"

export type PoliticaAparelhos = {
  versao: number
  presetsContratuaisDias: number[]
  contratualPadraoDias: number
  contratualMaxDias: number
  condicoesTermo: string
  aquisicaoExigeAprovacao: boolean
  liberacaoExigeConferencia: boolean
  persistida: boolean
}

export const POLITICA_PADRAO: PoliticaAparelhos = {
  versao: 0,
  presetsContratuaisDias: [0, 30, 90, 180, 365],
  contratualPadraoDias: 90,
  contratualMaxDias: 730,
  condicoesTermo: "",
  aquisicaoExigeAprovacao: true,
  liberacaoExigeConferencia: true,
  persistida: false,
}

type PoliticaRow = {
  versao: number
  presetsContratuaisDias: unknown
  contratualPadraoDias: number
  contratualMaxDias: number
  condicoesTermo: string
  aquisicaoExigeAprovacao: boolean
  liberacaoExigeConferencia: boolean
}

export function politicaFromRow(row: PoliticaRow | null): PoliticaAparelhos {
  if (!row) return POLITICA_PADRAO
  const max = Math.min(Math.max(0, row.contratualMaxDias), CONTRATUAL_MAX_ABSOLUTO_DIAS)
  const presets = normalizePresets(row.presetsContratuaisDias, max)
  return {
    versao: row.versao,
    presetsContratuaisDias: presets,
    contratualPadraoDias: presets.includes(row.contratualPadraoDias) ? row.contratualPadraoDias : 0,
    contratualMaxDias: max,
    condicoesTermo: row.condicoesTermo,
    aquisicaoExigeAprovacao: row.aquisicaoExigeAprovacao,
    liberacaoExigeConferencia: row.liberacaoExigeConferencia,
    persistida: true,
  }
}

export async function getPoliticaTx(tx: Prisma.TransactionClient, storeId: string): Promise<PoliticaAparelhos> {
  const row = await tx.aparelhoPoliticaLoja.findUnique({ where: { storeId } })
  return politicaFromRow(row)
}

/** Incremento atômico (INSERT … ON CONFLICT DO UPDATE … RETURNING) — seguro sob concorrência. */
export async function nextSequenceTx(tx: Prisma.TransactionClient, storeId: string, chave: string, ano: number): Promise<number> {
  const rows = await tx.$queryRaw<Array<{ ultimo: number }>>`
    INSERT INTO "aparelhos_sequencias" ("storeId", "chave", "ano", "ultimo", "updatedAt")
    VALUES (${storeId}, ${chave}, ${ano}, 1, NOW())
    ON CONFLICT ("storeId", "chave", "ano") DO UPDATE SET "ultimo" = "aparelhos_sequencias"."ultimo" + 1, "updatedAt" = NOW()
    RETURNING "ultimo"`
  return Number(rows[0]?.ultimo ?? 0)
}

/**
 * Condições do termo. O texto-base é fixo e garante os direitos legais; a loja só
 * ACRESCENTA condições (nunca remove o texto legal). Linguagem simples.
 */
export function textoCondicoesGarantia(condicoesLoja: string): string[] {
  const base = [
    `Garantia legal: ${GARANTIA_LEGAL_DIAS} dias para produto durável, novo ou usado (Código de Defesa do Consumidor, art. 26, II), contados da entrega. Para defeito que só aparece com o uso (vício oculto), o prazo começa quando o defeito ficar evidente (art. 26, § 3º).`,
    "Garantia contratual: quando oferecida, é um prazo ADICIONAL que complementa a garantia legal e não a substitui (CDC, art. 50). Nenhuma cláusula deste termo reduz direitos previstos em lei.",
    "Para usar a garantia, apresente este termo ou o comprovante da venda com o aparelho identificado pelo IMEI/série. A loja avalia o defeito e, conforme a lei, corrige, substitui o produto, abate o preço ou devolve o valor pago.",
    "Danos causados por queda, líquido, uso inadequado, abertura ou reparo por terceiros não autorizados podem não ser cobertos pela garantia contratual adicional. A garantia legal segue as regras do CDC em qualquer caso.",
    "A garantia do fabricante, quando existir, é prestada pelo fabricante conforme as condições dele e não é presumida a partir da data desta venda.",
  ]
  const extra = condicoesLoja
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .slice(0, 12)
  return [...base, ...extra]
}
