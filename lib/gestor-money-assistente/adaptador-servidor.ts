import "server-only"
/**
 * Adaptador de servidor: liga as portas do motor conversacional aos contratos REAIS
 * do Gestor Money (#405), sem segundo motor financeiro e sem schema novo.
 *
 * - Autorização: G001 `requireFinanceiroPerfilAccess` (sessão web + banco a cada chamada).
 *   Principal de vínculo WhatsApp (G007) usa `whatsapp/gateway.ts` (emissor G001 por principal); aqui é recusado.
 * - Leituras de cadastro: G003 `comLeituraFinanceira` (transação READ ONLY + RLS do dono).
 * - Consultas: G005 `consultarFinanceiro` (motor canônico, base CAIXA_REALIZADO).
 * - Escrita: G004 `prepararRevisaoGasto` → `aplicarOperacaoGasto` (idempotente por chave).
 *
 * DORMENTE: nenhuma rota, Server Action, UI ou worker importa este módulo nesta etapa.
 * Ativação depende de `GESTOR_MONEY_ENABLED`, das migrations G002–G005 em produção e de
 * gate próprio — nada disso é alterado aqui.
 */
import { prisma } from "@/lib/prisma"
import { resolveStoreModules } from "@/lib/auth/access-policy"
import { requireFinanceiroPerfilAccess } from "@/lib/gastos/access"
import { aplicarOperacaoGasto } from "@/lib/gastos/apply"
import { prepararRevisaoGasto } from "@/lib/gastos/operacoes"
import { OperacaoGastoError } from "@/lib/gastos/operacao-schema"
import { consultarFinanceiro, type ConsultaFinanceiraDTO } from "@/lib/gastos/query"
import { consultarCartoesGasto, planejarPagamentoFaturaGasto } from "@/lib/gastos/cartoes"
import { registrarDocumentoGasto, vincularDocumentoGasto } from "@/lib/gastos/documentos"
import type { DocumentoStoragePort } from "@/lib/gastos/documentos-fixture"
import { comLeituraFinanceira, leituraPerfilWhere } from "@/lib/gastos/read-scope"
import { declararDonoPessoalRls } from "@/lib/gastos/rls-contexto"
import type { FinanceiroContextoAutorizado } from "@/lib/gastos/types"
import { filtroDoPlano } from "./consultas"
import { diaCivil, somarDias } from "./datas"
import type {
  CandidatoDuplicidade,
  PortaArquivamentoDocumento,
  PortaDuplicidadeFinanceira,
} from "./multimodal/contratos"
import type {
  DependenciasMotor, PerfilAutorizado, PortaAutorizacao, PortaCadastros, PortaConsulta, PortaExecucao,
  Principal, RepositorioConversa, ResumoConsulta,
} from "./tipos"

// Garantia de compilação: o DTO canônico G005 satisfaz o subconjunto usado pelo motor.
const _dtoCompativel = (dto: ConsultaFinanceiraDTO): ResumoConsulta => dto
void _dtoCompativel

function escopoCarteira(ctx: FinanceiroContextoAutorizado) {
  return ctx.tipo === "PESSOAL"
    ? { storeId: null, perfilId: ctx.perfilId }
    : { storeId: ctx.storeId, OR: [{ perfilId: ctx.perfilId }, { perfilId: null }] }
}
const storeDe = (ctx: FinanceiroContextoAutorizado) => (ctx.tipo === "EMPRESA" ? ctx.storeId : null)

/** Perfis candidatos do usuário (sugestão de escolha; cada uso passa pela autorização G001). */
export async function listarPerfisDoUsuario(userId: string): Promise<PerfilAutorizado[]> {
    const principal = { userId }
    const empresas = await prisma.financeiroPerfil.findMany({
      where: { tipo: "EMPRESA", ativo: true, membros: { some: { adminUserId: principal.userId, revogadoEm: null } } },
      select: { id: true, storeId: true, store: { select: { name: true, moduleAccess: true } } },
    })
    const pessoal = await prisma.$transaction(async tx => {
      await declararDonoPessoalRls(tx, principal.userId)
      return tx.financeiroPerfil.findFirst({ where: { tipo: "PESSOAL", ativo: true, ownerAdminUserId: principal.userId }, select: { id: true } })
    })
    // Lista é só sugestão de escolha: cada uso passa por requireFinanceiroPerfilAccess.
    return [
      ...(pessoal ? [{ ref: { tipo: "PESSOAL" as const, perfilId: pessoal.id }, rotulo: "Pessoal" }] : []),
      // Loja sem o módulo finance contratado não é oferecida (a autorização G001 recusaria de todo modo).
      ...empresas.filter(e => e.storeId && e.store && resolveStoreModules(e.store.moduleAccess).includes("finance")).map(e => ({ ref: { tipo: "EMPRESA" as const, perfilId: e.id, storeId: e.storeId! },
        rotulo: e.store?.name ?? "Empresa", apelidos: [] })),
    ]
}

export const autorizacaoSessaoWeb: PortaAutorizacao = {
  async listarPerfis(principal: Principal): Promise<PerfilAutorizado[]> {
    if (principal.origem !== "SESSAO_WEB") return []
    return listarPerfisDoUsuario(principal.userId)
  },
  async contexto(principal, ref, acao) {
    if (principal.origem !== "SESSAO_WEB") return { ok: false }
    const r = await requireFinanceiroPerfilAccess(ref.tipo === "PESSOAL"
      ? { tipo: "PESSOAL", perfilId: ref.perfilId } : { tipo: "EMPRESA", perfilId: ref.perfilId, storeId: ref.storeId }, acao)
    if (!r.ok || r.contexto.userId !== principal.userId) return { ok: false }
    return { ok: true, contexto: r.contexto }
  },
}

export const cadastrosGestorMoney: PortaCadastros = {
  listarContas: ctx => comLeituraFinanceira(ctx, (db, c) => db.carteiraFinanceira.findMany({
    where: escopoCarteira(c), select: { id: true, nome: true, tipo: true, ativo: true }, orderBy: { nome: "asc" } })),
  listarCategorias: ctx => comLeituraFinanceira(ctx, (db, c) => db.categoriaGasto.findMany({
    where: { perfilId: c.perfilId, storeId: storeDe(c), ativo: true, natureza: "DESPESA" }, select: { id: true, nome: true } })),
  listarCartoes: ctx => comLeituraFinanceira(ctx, (db, c) => db.cartaoInstrumento.findMany({
    where: { perfilId: c.perfilId, storeId: storeDe(c), ativo: true }, select: { id: true, nome: true }, orderBy: { nome: "asc" } })),
  resolverCiclos: (ctx, i) => comLeituraFinanceira(ctx, async (db, c) => {
    const ciclos = await db.cartaoCiclo.findMany({ where: { perfilId: c.perfilId, storeId: storeDe(c), cartaoId: i.cartaoId, ativo: true },
      select: { id: true, vencimento: true, fechamentoEm: true }, orderBy: { vencimento: "asc" } })
    // Primeira fatura cujo fechamento (ou vencimento, se não houver) é igual/posterior à compra.
    const inicio = ciclos.findIndex(x => (x.fechamentoEm ?? x.vencimento).toISOString().slice(0, 10) >= i.dataCompra)
    if (inicio < 0 || ciclos.length - inicio < i.parcelas) return null
    return ciclos.slice(inicio, inicio + i.parcelas).map(x => x.id)
  }),
  /** Contrato canônico #405: cartões com limites e faturas por ciclo. */
  listarFaturas: ctx => consultarCartoesGasto(ctx, {}),
  planejarFatura,
  async listarTitulosAReceber(ctx) {
    const hoje = diaCivil(new Date())
    const q = await consultarFinanceiro(ctx, filtroDoPlano(hoje.slice(0, 7) + "-01", hoje))
    return q.receber.filter(t => !t.cancelado && BigInt(t.restanteCentavos) > BigInt(0))
      .map(t => ({ id: t.id, descricao: t.descricao, contraparte: t.contraparte, restanteCentavos: t.restanteCentavos, vencimento: t.vencimento }))
  },
  async listarTitulosAbertos(ctx) {
    const hoje = diaCivil(new Date())
    const q = await consultarFinanceiro(ctx, filtroDoPlano(hoje.slice(0, 7) + "-01", hoje))
    return q.pagar.filter(t => !t.cancelado && BigInt(t.restanteCentavos) > BigInt(0))
      .map(t => ({ id: t.id, descricao: t.descricao, contraparte: t.contraparte, restanteCentavos: t.restanteCentavos, vencimento: t.vencimento }))
  },
}

/** Plano canônico #405 de pagamento de fatura (só leitura). Recusa conhecida vira código, nunca valor inventado. */
async function planejarFatura(ctx: unknown, input: { cicloId: string; valorCentavos?: string; quitar?: true }) {
  try {
    const p = await planejarPagamentoFaturaGasto(ctx, input)
    return { ok: true as const, restanteCentavos: p.restanteCentavos, valorCentavos: p.valorCentavos, alocacoes: p.alocacoes }
  } catch (e) {
    return { ok: false as const, codigo: e instanceof OperacaoGastoError ? e.code : "indisponivel" }
  }
}

export const consultaG005: PortaConsulta = {
  consultar: (ctx, filtro) => consultarFinanceiro(ctx, filtro),
}

/**
 * Busca candidatos de duplicidade EXCLUSIVAMENTE dentro do perfil/loja autorizado (`ctx`),
 * usando transação READ ONLY + RLS G001/G003. Jamais consulta outro usuário, perfil ou loja.
 */
export const duplicidadeG005: PortaDuplicidadeFinanceira = {
  async buscarCandidatos(ctx, criterios): Promise<CandidatoDuplicidade[]> {
    return comLeituraFinanceira(ctx, async (db, c) => {
      const encontrados: CandidatoDuplicidade[] = []
      const wherePerfil = leituraPerfilWhere(c)

      // 1. Mesmo hash SHA-256 em documentos_gastos do MESMO perfil/loja
      if (criterios.sha256) {
        const doc = await db.documentoGasto.findFirst({
          where: {
            perfilId: c.perfilId,
            storeId: storeDe(c),
            ownerAdminUserId: c.tipo === "PESSOAL" ? c.userId : null,
            sha256: criterios.sha256,
          },
          select: {
            id: true,
            nomeArquivo: true,
            createdAt: true,
            vinculos: {
              select: { movimentacaoId: true, pagarTituloId: true, receberTituloId: true },
              take: 1,
            },
          },
        })
        if (doc) {
          const vinc = doc.vinculos[0]
          const alvoTipo: "MOVIMENTACAO" | "PAGAR" | "RECEBER" = vinc?.pagarTituloId
            ? "PAGAR"
            : vinc?.receberTituloId
              ? "RECEBER"
              : "MOVIMENTACAO"
          const alvoId = vinc?.pagarTituloId ?? vinc?.receberTituloId ?? vinc?.movimentacaoId ?? doc.id
          encontrados.push({
            alvoTipo,
            alvoId,
            descricao: `Documento já arquivado (${doc.nomeArquivo})`,
            valorCentavos: criterios.valorCentavos ?? "0",
            data: diaCivil(doc.createdAt),
            motivo: "MESMO_HASH_ARQUIVO",
            correspondenciaExata: true,
          })
        }
      }

      // 2. Correspondência por valor + data (±3 dias) em movimentações e títulos do MESMO perfil/loja
      if (criterios.valorCentavos && /^[1-9]\d{0,12}$/.test(criterios.valorCentavos)) {
        const refDia = criterios.dataReferencia ?? diaCivil(new Date())
        const inicio = new Date(`${somarDias(refDia, -3)}T00:00:00.000Z`)
        const fim = new Date(`${somarDias(refDia, 4)}T00:00:00.000Z`)

        const movs = await db.movimentacaoFinanceira.findMany({
          where: {
            ...wherePerfil,
            valorCentavos: criterios.valorCentavos,
            ocorridoEm: { gte: inicio, lt: fim },
          },
          select: {
            id: true,
            descricao: true,
            valorCentavos: true,
            ocorridoEm: true,
            createdAt: true,
            operacaoFinanceiraId: true,
          },
          orderBy: { ocorridoEm: "desc" },
          take: 5,
        })
        for (const m of movs) {
          encontrados.push({
            alvoTipo: "MOVIMENTACAO",
            alvoId: m.id,
            operacaoId: m.operacaoFinanceiraId ?? undefined,
            descricao: m.descricao,
            valorCentavos: String(m.valorCentavos ?? criterios.valorCentavos),
            data: diaCivil(m.ocorridoEm ?? m.createdAt),
            motivo: "CORRESPONDENCIA_APROXIMADA",
            correspondenciaExata: false,
          })
        }

        const titulos = await db.contaPagarTitulo.findMany({
          where: {
            ...wherePerfil,
            valorCentavos: criterios.valorCentavos,
            ativo: true,
          },
          select: {
            id: true,
            descricao: true,
            valorCentavos: true,
            vencimento: true,
          },
          orderBy: { createdAt: "desc" },
          take: 5,
        })
        for (const t of titulos) {
          encontrados.push({
            alvoTipo: "PAGAR",
            alvoId: t.id,
            descricao: t.descricao,
            valorCentavos: String(t.valorCentavos ?? criterios.valorCentavos),
            data: t.vencimento ?? refDia,
            motivo: "CORRESPONDENCIA_APROXIMADA",
            correspondenciaExata: false,
          })
        }
      }

      return encontrados.slice(0, 5)
    })
  },
}

/**
 * Adaptador G003-STORAGE para arquivamento permanente de comprovantes sob confirmação explícita.
 * Falha fechado com mensagem honesta quando storage privado R2 não está comprovado —
 * jamais afirma arquivamento permanente quando só houve processamento temporário.
 */
export function criarArquivamentoG003(storage?: DocumentoStoragePort | null): PortaArquivamentoDocumento {
  return {
    async arquivarEVincular(ctx, input) {
      if (!storage) {
        return {
          arquivado: false,
          motivo: "STORAGE_BLOQUEADO",
          mensagemUsuario:
            "O arquivo foi processado apenas temporariamente: o armazenamento permanente privado (G003-STORAGE) está bloqueado neste ambiente.",
        }
      }
      try {
        const doc = await registrarDocumentoGasto(
          ctx,
          { nomeArquivo: input.nomeArquivo, conteudo: input.conteudo, proveniencia: "UPLOAD_INTERNO" },
          storage
        )
        if (input.alvo) {
          await vincularDocumentoGasto(ctx, doc.id, input.alvo)
        }
        return { arquivado: true, documentoId: doc.id }
      } catch {
        return {
          arquivado: false,
          motivo: "STORAGE_BLOQUEADO",
          mensagemUsuario:
            "Não foi possível arquivar permanentemente no storage privado (G003-STORAGE indisponível ou bloqueado). O arquivo temporário foi descartado com segurança.",
        }
      }
    },
  }
}

/** Escrita EXCLUSIVAMENTE pelo G004. Erro conhecido < 500 = recusado antes do COMMIT. */
export const execucaoG004: PortaExecucao = {
  async executar(ctx, input) {
    try {
      const revisao = await prepararRevisaoGasto(ctx, { grupoChave: input.grupoChave, proposta: input.proposta })
      const r = await aplicarOperacaoGasto(ctx, { revisaoId: revisao.id, versaoEsperada: revisao.versao, chave: input.chave })
      return { ok: true, operacaoId: r.operacaoId, valorCentavos: r.valorCentavos }
    } catch (e) {
      if (e instanceof OperacaoGastoError && e.status < 500) return { ok: false, tipo: "DEFINITIVO", codigo: e.code }
      return { ok: false, tipo: "INCERTO", codigo: e instanceof OperacaoGastoError ? e.code : "indisponivel" }
    }
  },
}

/**
 * Monta as dependências reais. O repositório de conversa é OBRIGATÓRIO e externo:
 * não há tabela de estado conversacional (schema compartilhado congelado nesta etapa).
 */
export function dependenciasServidor(repositorio: RepositorioConversa, novoId: () => string): DependenciasMotor {
  return { autorizacao: autorizacaoSessaoWeb, cadastros: cadastrosGestorMoney, consulta: consultaG005,
    execucao: execucaoG004, repositorio, agora: () => new Date(), novoId }
}
