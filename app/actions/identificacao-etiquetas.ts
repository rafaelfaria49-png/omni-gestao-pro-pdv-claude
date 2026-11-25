"use server"
import { identificationAccess } from "@/lib/identificacao/access.server"
import type { CatalogContext } from "@/lib/vestuario/catalog-service"
import type { Result } from "@/lib/identificacao/contracts"

type Service = typeof import("@/lib/identificacao/service")
type Db = typeof import("@/lib/prisma")["prisma"]
async function guarded<T>(storeId: unknown, fn: (svc: Service, db: Db, ctx: CatalogContext) => Promise<Result<T>>): Promise<Result<T>> {
  const gate = await identificationAccess(storeId)
  if (!gate.ok) return gate
  // Flags off não carregam leitores pesados nem consultam tabela P03.
  try {
    const [{ prisma }, svc] = await Promise.all([import("@/lib/prisma"), import("@/lib/identificacao/service")])
    return await fn(svc, prisma, gate.value)
  } catch {
    return { ok: false, code: "UNKNOWN_RESULT", message: "Resultado não confirmado. Consulte ou repita com a mesma chave de solicitação." }
  }
}
export async function getIdentificacaoStatus(storeId: string) { return { enabled: (await identificationAccess(storeId)).ok } }
export async function listIdentificacaoTargets(storeId: string, q = "") { return guarded(storeId, (s, db, ctx) => s.listTargets(db, ctx, q)) }
export async function lookupIdentificacao(storeId: string, codigo: string) { return guarded(storeId, (s, db, ctx) => s.lookup(db, ctx, codigo)) }
export async function listIdentificadores(storeId: string, target: unknown) { return guarded(storeId, (s, db, ctx) => s.listIdentifiers(db, ctx, target)) }
export async function emitirCodigoInterno(storeId: string, input: unknown) { return guarded(storeId, (s, db, ctx) => s.issueInternal(db, ctx, input)) }
export async function registrarIdentificador(storeId: string, input: unknown) { return guarded(storeId, (s, db, ctx) => s.registerIdentifier(db, ctx, input)) }
export async function alterarIdentificadorAtivo(storeId: string, input: unknown) { return guarded(storeId, (s, db, ctx) => s.setIdentifierActive(db, ctx, input)) }
export async function criarLoteEtiquetas(storeId: string, input: unknown) { return guarded(storeId, (s, db, ctx) => s.createJob(db, ctx, input)) }
export async function reimprimirLoteEtiquetas(storeId: string, input: unknown) { return guarded(storeId, (s, db, ctx) => s.reprintJob(db, ctx, input)) }
export async function getLoteEtiquetas(storeId: string, id: string) { return guarded(storeId, (s, db, ctx) => s.getJob(db, ctx, id)) }
export async function listLotesEtiquetas(storeId: string) { return guarded(storeId, (s, db, ctx) => s.listJobs(db, ctx)) }
export async function iniciarImpressaoEtiquetas(storeId: string, input: unknown) { return guarded(storeId, (s, db, ctx) => s.startAttempt(db, ctx, input)) }
export async function registrarEventoImpressao(storeId: string, input: unknown) { return guarded(storeId, (s, db, ctx) => s.recordAttemptEvent(db, ctx, input)) }
export async function consultarSolicitacaoIdentificacao(storeId: string, operation: string, key: string) { return guarded(storeId, (s, db, ctx) => s.recoverRequest(db, ctx, operation, key)) }
