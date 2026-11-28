/**
 * G008 — memória conversacional PERSISTENTE (PostgreSQL, tabelas gm_assist_*) e principal de vínculo.
 *
 * - Estado (rascunho versionado, perfil fixado, confirmação, envio G004 em curso) com CAS por `versaoEstado`:
 *   dois workers com a mesma conversa → um perde o CAS, nenhum executa duas vezes.
 * - Idempotência por mensagem: a resposta é registrada uma vez; reentrega (Meta ou reclaim do job) devolve a
 *   mesma resposta sem reprocessar.
 * - Conversa amarrada ao VÍNCULO: chave = `${userId}::${vinculoId}`. Revogar o vínculo congela a conversa
 *   (gatilho recusa gravação) e um novo pareamento começa conversa nova — rascunho antigo nunca é retomado.
 * - Minimização: o estado guarda só o rascunho corrente e assinaturas recentes de duplicidade (motor);
 *   nenhum texto bruto da mensagem é persistido aqui.
 */
import { randomUUID } from "node:crypto"
import type { Prisma } from "@/generated/prisma"
import type { EstadoConversa, Principal, RepositorioConversa, RespostaAssistente } from "../tipos"
import { vinculoVigente, type GmDb, type VinculoAtivo } from "./vinculo"

export class VinculoRevogadoError extends Error {
  constructor() { super("vinculo_revogado"); this.name = "VinculoRevogadoError" }
}

const principais = new WeakMap<object, { vinculoId: string; versao: number; userId: string }>()

/** Principal opaco emitido no servidor a partir de um vínculo ATIVO. Clone/JSON não carrega o vínculo. */
export function emitirPrincipalVinculo(v: VinculoAtivo): Principal {
  const p = Object.freeze({ userId: v.adminUserId, origem: "BINDING_G007" as const })
  principais.set(p, { vinculoId: v.id, versao: v.versao, userId: v.adminUserId })
  return p
}

export function vinculoDoPrincipal(p: Principal) {
  return principais.get(p as object) ?? null
}

/** Verificador G001: revalida o vínculo (ativo, mesma versão, usuário ativo) a cada contexto/ato. */
export function verificadorDoPrincipal(db: GmDb, p: Principal) {
  const ref = vinculoDoPrincipal(p)
  return async () => {
    if (!ref || p.origem !== "BINDING_G007") return null
    const v = await vinculoVigente(db, ref.vinculoId, ref.versao)
    return v && v.adminUserId === ref.userId ? { userId: v.adminUserId } : null
  }
}

function partes(chave: string) {
  const i = chave.indexOf("::")
  if (i <= 0) throw new Error("chave_conversa_invalida")
  return { adminUserId: chave.slice(0, i), vinculoId: chave.slice(i + 2) }
}

const ehRevogacao = (e: unknown) => String((e as Error)?.message ?? "").includes("GM_ASSIST conversa sem vinculo ativo")

export function repositorioConversaPg(db: GmDb): RepositorioConversa {
  /** Garante a linha da conversa (versão 0) para ancorar as respostas registradas. */
  async function garantir(chave: string) {
    const { adminUserId, vinculoId } = partes(chave)
    try {
      await db.gmAssistConversa.createMany({ data: [{ chave, adminUserId, vinculoId, versaoEstado: 0,
        estado: { versaoEstado: 0, aplicadosRecentes: [] } as Prisma.InputJsonObject }], skipDuplicates: true })
    } catch (e) { if (ehRevogacao(e)) throw new VinculoRevogadoError(); throw e }
  }
  return {
    async carregar(chave) {
      const row = await db.gmAssistConversa.findUnique({ where: { chave } })
      return row ? ({ ...(row.estado as unknown as EstadoConversa), versaoEstado: row.versaoEstado }) : null
    },
    async salvar(chave, estado, versaoAnterior) {
      try {
        if (versaoAnterior === 0) await garantir(chave)
        const n = await db.gmAssistConversa.updateMany({ where: { chave, versaoEstado: versaoAnterior },
          data: { versaoEstado: estado.versaoEstado, estado: estado as unknown as Prisma.InputJsonObject, atualizadoEm: new Date() } })
        return n.count === 1
      } catch (e) { if (ehRevogacao(e)) throw new VinculoRevogadoError(); throw e }
    },
    async respostaRegistrada(chave, mensagemId) {
      const row = await db.gmAssistMensagem.findUnique({ where: { conversaChave_mensagemId: { conversaChave: chave, mensagemId } } })
      return row ? (row.resposta as unknown as RespostaAssistente) : null
    },
    async registrarResposta(chave, mensagemId, resposta) {
      await garantir(chave)
      await db.gmAssistMensagem.createMany({ data: [{ id: randomUUID(), conversaChave: chave, mensagemId,
        resposta: resposta as unknown as Prisma.InputJsonObject }], skipDuplicates: true })
    },
  }
}

/** Conversas com operação G004 em curso/incerta, para reconciliação periódica pelo worker. */
export async function conversasPendentes(db: GmDb, limite = 20, idadeMinimaMs = 60_000) {
  return db.$queryRaw<Array<{ chave: string; adminUserId: string; vinculoId: string }>>`
    SELECT c.chave,c."adminUserId",c."vinculoId" FROM gm_assist_conversas c JOIN gm_assist_vinculos v ON v.id=c."vinculoId" AND v.estado='ATIVO'
    WHERE c.estado->'rascunho'->>'estado' IN ('EM_EXECUCAO','INCERTO')
      AND c."atualizadoEm" <= clock_timestamp() - ${idadeMinimaMs} * interval '1 millisecond'
    ORDER BY c."atualizadoEm" LIMIT ${limite}`
}
