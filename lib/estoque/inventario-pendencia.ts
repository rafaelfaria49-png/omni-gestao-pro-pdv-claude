/**
 * INVENTARIO_ASSISTIDO_V1 — Fase 6 (Pendência Enterprise). Núcleo PURO e testável.
 *
 * Estado de uma linha de RECONCILIAÇÃO (`InventarioContagem.payload`) que ainda não tem produto
 * no catálogo: nome rápido (apelido informado no modal de bipe), número de leituras (quantas
 * vezes o operador confirmou o modal — distinto de `quantidadeContada`, que é a SOMA das
 * quantidades observadas em cada leitura) e o vínculo de fechamento (produto cadastrado ou
 * associado).
 *
 * Mesmo padrão de `inventario-ajuste.ts`/`inventario-reconciliacao.ts`: tudo vive no `payload`,
 * sem schema/migration novo. O vínculo é só BOOKKEEPING — fecha a pendência apontando para um
 * `produtoId`, nunca cria/altera `Produto` nem `Produto.stock` aqui (quem persiste é a Server
 * Action, no mesmo espírito de F4).
 *
 * Extensibilidade consciente (NÃO implementada agora): `tipo` no vínculo já diferencia formas de
 * fechamento, deixando espaço para novas variantes futuras sem mudar o formato. `produtoId` é
 * único por pendência hoje — suporte a múltiplos códigos de barras por produto (alias) e
 * depósito-alvo (multi-depósito/WMS) ficam para uma fase futura.
 */

export type TipoVinculoPendencia = "cadastrado" | "associado"

export type PendenciaInfo = {
  nomeRapido: string | null
  numeroLeituras: number
}

const PENDENCIA_VAZIA: PendenciaInfo = { nomeRapido: null, numeroLeituras: 0 }

export type VinculoPendencia = {
  produtoId: string
  tipo: TipoVinculoPendencia
  vinculadoEm: string
  operador: string | null
}

function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null
}

function asStringOrNull(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null
}

/** Lê nome rápido + número de leituras gravados no `payload` da contagem. PURO. */
export function lerPendencia(payload: unknown): PendenciaInfo {
  const p = asRecord(payload)
  if (!p) return PENDENCIA_VAZIA
  const n = Math.trunc(Number(p.pendenciaNumeroLeituras))
  return {
    nomeRapido: asStringOrNull(p.pendenciaNomeRapido),
    numeroLeituras: Number.isFinite(n) && n >= 0 ? n : 0,
  }
}

/**
 * Mescla uma nova leitura da pendência no `payload` (imutável): incrementa `numeroLeituras` e só
 * sobrescreve `nomeRapido` se vier um valor não vazio (preserva o nome já informado antes).
 */
export function marcarPendenciaPayload(
  payloadAtual: unknown,
  dados: { nomeRapido?: string | null }
): Record<string, unknown> {
  const base = asRecord(payloadAtual) ? { ...(payloadAtual as Record<string, unknown>) } : {}
  const atual = lerPendencia(payloadAtual)
  const nome = (dados.nomeRapido ?? "").trim()
  base.pendenciaNomeRapido = nome || atual.nomeRapido
  base.pendenciaNumeroLeituras = atual.numeroLeituras + 1
  return base
}

/** Lê o vínculo de fechamento (produto cadastrado/associado) gravado no `payload`. PURO. */
export function lerVinculoPendencia(payload: unknown): VinculoPendencia | null {
  const p = asRecord(payload)
  const v = p ? asRecord(p.pendenciaVinculo) : null
  if (!v) return null
  const produtoId = asStringOrNull(v.produtoId)
  const tipo = v.tipo === "cadastrado" || v.tipo === "associado" ? v.tipo : null
  if (!produtoId || !tipo) return null
  return {
    produtoId,
    tipo,
    vinculadoEm: typeof v.vinculadoEm === "string" ? v.vinculadoEm : "",
    operador: asStringOrNull(v.operador),
  }
}

/** `true` quando a pendência já foi fechada (cadastrada ou associada a um produto). PURO. */
export function pendenciaResolvida(payload: unknown): boolean {
  return lerVinculoPendencia(payload) !== null
}

/**
 * Mescla o vínculo de fechamento no `payload` (imutável). Idempotente: se já houver vínculo,
 * devolve o payload (com os demais campos preservados) sem sobrescrever.
 */
export function marcarVinculoPendencia(
  payloadAtual: unknown,
  dados: { produtoId: string; tipo: TipoVinculoPendencia; vinculadoEm: string; operador: string | null }
): Record<string, unknown> {
  const base = asRecord(payloadAtual) ? { ...(payloadAtual as Record<string, unknown>) } : {}
  if (lerVinculoPendencia(payloadAtual)) return base
  base.pendenciaVinculo = {
    produtoId: dados.produtoId,
    tipo: dados.tipo,
    vinculadoEm: dados.vinculadoEm,
    operador: dados.operador,
  }
  return base
}
