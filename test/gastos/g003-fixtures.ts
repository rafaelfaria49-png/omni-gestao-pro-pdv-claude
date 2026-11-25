/** Massa exclusiva G003. Só a sessão NextAuth é substituída; gates/Prisma/serviços são reais. */
import type { Session } from "next-auth"
import { NextRequest } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireFinanceiroPerfilAccess } from "@/lib/gastos/access"

export const G003_URL = "postgresql://gastos_g003@127.0.0.1:55495/gastos_g003_test"
export const L1 = "g003-fixture-L1", L2 = "g003-fixture-L2", L3 = "g003-fixture-L3"
export const U1 = "g003-fixture-U1", U2 = "g003-fixture-U2"
export const EXT = "g003-fixture-contador-externo"
export const requestCookiesG003 = new Map<string, string>()
export const E1 = "g003-fixture-E1", E2 = "g003-fixture-E2", P1 = "g003-fixture-P1", P2 = "g003-fixture-P2"
export const perfis = [E1, E2, P1, P2], stores = [L1, L2, L3]
export const ids = (perfilId: string) => ({ conta: `${perfilId}-conta`, pagar: `${perfilId}-pagar`,
  receber: `${perfilId}-receber`, movimento: `${perfilId}-movimento`, categoria: `${perfilId}-categoria` })
export const hoje = () => new Date().toISOString().slice(0, 10)
export const periodo = () => ({ dataInicio: hoje(), dataFim: hoje() })
export let sessaoAtual: Session | null = null

export function login(userId = U1, allowedStoreIds = stores, role = "ADMIN") {
  sessaoAtual = { expires: "2099-01-01T00:00:00.000Z", user: {
    id: userId, role, name: "Synthetic G003", email: `${userId}@example.invalid`,
    storeAccess: "restricted", allowedStoreIds, lojaId: allowedStoreIds[0] ?? null,
  } }
}
export function logout() { sessaoAtual = null }

export async function contexto(perfilId = P1) {
  const storeId = perfilId === E1 ? L1 : perfilId === E2 ? L2 : null
  const access = await requireFinanceiroPerfilAccess(storeId
    ? { tipo: "EMPRESA", perfilId, storeId } : { tipo: "PESSOAL", perfilId }, "view")
  if (!access.ok) throw new Error("Contexto sintético G003 indisponível")
  return access.contexto
}

export function request(path: string, storeId = L1, extra: HeadersInit = {}) {
  const headers = new Headers(extra)
  headers.set("x-assistec-loja-id", storeId)
  return new NextRequest(`http://localhost${path}`, { headers })
}

export async function confirmarBancoG003() {
  if (process.env.GASTOS_G003_TEST_DATABASE_URL !== G003_URL || process.env.DATABASE_URL !== G003_URL) {
    throw new Error("G003 exige URL sintética exata; não usa .env nem outro destino como fallback.")
  }
  const [identity] = await prisma.$queryRaw<Array<{ database: string; user: string; host: string; port: number; rolsuper: boolean; rolbypassrls: boolean }>>`
    SELECT current_database() AS database, current_user AS user, host(inet_server_addr()) AS host,
      inet_server_port() AS port, rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user`
  if (identity.database !== "gastos_g003_test" || identity.user !== "gastos_g003" || identity.port !== 55495
    || identity.host !== "127.0.0.1" || identity.rolsuper || identity.rolbypassrls) throw new Error("Identidade PostgreSQL G003 divergente")
  const owners = await prisma.$queryRaw<Array<{ tableowner: string }>>`
    SELECT tableowner FROM pg_tables WHERE schemaname='public' AND tablename IN ('documentos_gastos','documentos_vinculos')`
  if (owners.length !== 2 || owners.some(row => row.tableowner !== identity.user)) throw new Error("Owner G003 inesperado")
  return { ...identity, tableOwner: true, certifiesProductionRls: false }
}

export async function limparG003() {
  const scope = { OR: [{ storeId: { in: stores } }, { perfilId: { in: perfis } }] }
  await prisma.contadorAcesso.deleteMany({ where: { usuarioId: EXT } })
  await prisma.contadorSessaoExterna.deleteMany({ where: { usuarioId: EXT } })
  await prisma.contadorUsuario.deleteMany({ where: { id: EXT } })
  await prisma.documentoVinculo.deleteMany({ where: { perfilId: { in: perfis } } })
  await prisma.documentoGasto.deleteMany({ where: { perfilId: { in: perfis } } })
  await prisma.omniAgentMemory.deleteMany({ where: { storeId: { in: stores } } })
  await prisma.omniAgentCommand.deleteMany({ where: { storeId: { in: stores } } })
  await prisma.omniAgentAutomation.deleteMany({ where: { storeId: { in: stores } } })
  await prisma.auditoriaFinanceira.deleteMany({ where: { storeId: { in: stores } } })
  await prisma.conciliacaoFinanceira.deleteMany({ where: { storeId: { in: stores } } })
  await prisma.fechamentoFinanceiro.deleteMany({ where: { storeId: { in: stores } } })
  await prisma.devolucaoVenda.deleteMany({ where: { storeId: { in: stores } } })
  await prisma.caixaOperacao.deleteMany({ where: { storeId: { in: stores } } })
  await prisma.venda.deleteMany({ where: { storeId: { in: stores } } })
  await prisma.ordemServico.deleteMany({ where: { storeId: { in: stores } } })
  await prisma.sessaoCaixa.deleteMany({ where: { storeId: { in: stores } } })
  await prisma.movimentacaoFinanceira.deleteMany({ where: scope })
  await prisma.contaPagarTitulo.deleteMany({ where: scope })
  await prisma.contaReceberTitulo.deleteMany({ where: scope })
  await prisma.categoriaGasto.deleteMany({ where: { perfilId: { in: perfis } } })
  await prisma.carteiraFinanceira.deleteMany({ where: scope })
  await prisma.perfilMembro.deleteMany({ where: { storeId: { in: stores } } })
  await prisma.financeiroPerfil.deleteMany({ where: { OR: [{ id: { in: perfis } }, { storeId: { in: stores } }] } })
  await prisma.adminUserStore.deleteMany({ where: { adminUserId: { in: [U1, U2] } } })
  await prisma.adminUser.deleteMany({ where: { id: { in: [U1, U2] } } })
  await prisma.store.deleteMany({ where: { id: { in: stores } } })
}

export async function prepararG003() {
  requestCookiesG003.clear()
  await confirmarBancoG003()
  await limparG003()
  await prisma.store.createMany({ data: stores.map(id => ({ id, name: id })) })
  await prisma.adminUser.createMany({ data: [U1, U2].map(id => ({ id, email: `${id}@example.invalid`,
    password: "synthetic-only", lojaId: L1, role: "ADMIN" })) })
  await prisma.adminUserStore.createMany({ data: [...stores.map(storeId => ({ adminUserId: U1, storeId })), { adminUserId: U2, storeId: L1 }] })
  await prisma.financeiroPerfil.createMany({ data: [
    { id: E1, tipo: "EMPRESA", storeId: L1 }, { id: E2, tipo: "EMPRESA", storeId: L2 },
    { id: P1, tipo: "PESSOAL", ownerAdminUserId: U1 }, { id: P2, tipo: "PESSOAL", ownerAdminUserId: U2 },
  ] })
  await prisma.perfilMembro.createMany({ data: [
    { perfilId: E1, storeId: L1, adminUserId: U1 }, { perfilId: E1, storeId: L1, adminUserId: U2 },
    { perfilId: E2, storeId: L2, adminUserId: U1 },
  ] })
  for (const perfilId of perfis) {
    const storeId = perfilId === E1 ? L1 : perfilId === E2 ? L2 : null
    const row = ids(perfilId)
    // P2 repete nomes/valores de E1; P1/E2 têm valores distintos. O filtro não pode
    // se apoiar em sentinelas textuais ou na desigualdade dos valores.
    const nomePerfil = perfilId === P2 ? E1 : perfilId
    const valores = perfilId === P1 ? { titulo: 1444.11, tituloCentavos: "144411", movimento: 777.21, movimentoCentavos: "77721", saldo: 700 }
      : perfilId === E2 ? { titulo: 2666.22, tituloCentavos: "266622", movimento: 888.32, movimentoCentavos: "88832", saldo: 900 }
      : { titulo: 365.01, tituloCentavos: "36501", movimento: 123.45, movimentoCentavos: "12345", saldo: 100 }
    await prisma.carteiraFinanceira.create({ data: { id: row.conta, perfilId, storeId, nome: `CONTA_${nomePerfil}`, tipo: "banco", saldoAtual: valores.saldo } })
    await prisma.categoriaGasto.create({ data: { id: row.categoria, perfilId, storeId, nome: `CATEGORIA_${nomePerfil}`, nomeNormalizado: "categoria", natureza: "DESPESA" } })
    const titulo = { perfilId, storeId, descricao: `SENTINELA_${nomePerfil}`, valor: valores.titulo, valorCentavos: valores.tituloCentavos,
      precisaoStatus: "CENTAVOS", carteiraId: row.conta, vencimento: hoje(), status: "pendente",
      localKey: storeId ? "mesma-chave" : null, identidadePessoal: storeId ? null : `gastos:pessoal:${perfilId}:mesma-chave` }
    await prisma.contaPagarTitulo.create({ data: { id: row.pagar, ...titulo, categoriaId: row.categoria } })
    await prisma.contaReceberTitulo.create({ data: { id: row.receber, ...titulo } })
    await prisma.movimentacaoFinanceira.create({ data: { id: row.movimento, perfilId, storeId, carteiraId: row.conta,
      categoriaId: row.categoria, pagarTituloId: row.pagar, tipo: "saida", origem: "pagar", descricao: `SENTINELA_${nomePerfil}`,
      valor: valores.movimento, valorCentavos: valores.movimentoCentavos, precisaoStatus: "CENTAVOS", ocorridoEm: new Date(), referenciaId: row.pagar } })
  }
  await prisma.contaPagarTitulo.create({ data: { id: "g003-legado-pagar", storeId: L1, localKey: "legado", descricao: "EMPRESA_LEGADO", valor: 10, vencimento: hoje() } })
  await prisma.contaReceberTitulo.create({ data: { id: "g003-legado-receber", storeId: L1, localKey: "legado", descricao: "EMPRESA_LEGADO", valor: 10, vencimento: hoje() } })
  await prisma.carteiraFinanceira.create({ data: { id: "g003-legado-conta", storeId: L1, nome: "EMPRESA_LEGADO" } })
  await prisma.movimentacaoFinanceira.create({ data: { id: "g003-legado-mov", storeId: L1, tipo: "saida", origem: "manual", descricao: "EMPRESA_LEGADO", valor: 10 } })
  await prisma.venda.create({ data: { id: "g003-venda", pedidoId: "g003-pedido", storeId: L1, total: 365.01, contaReceberTituloId: ids(E1).receber } })
  await prisma.sessaoCaixa.create({ data: { id: "g003-sessao", storeId: L1, operador: "Synthetic" } })
  await prisma.conciliacaoFinanceira.createMany({ data: [
    { id: "g003-conciliacao-E1", storeId: L1, carteiraId: ids(E1).conta, dataReferencia: hoje(), saldoSistema: 100, saldoInformado: 101, diferenca: 1, status: "divergente" },
    { id: "g003-conciliacao-legado", storeId: L1, carteiraId: "g003-legado-conta", dataReferencia: hoje(), saldoSistema: 0, saldoInformado: 0, diferenca: 0, status: "conciliado" },
    // Relações históricas que o FK simples aceita: storeId sozinho não protege.
    { id: "g003-conciliacao-P1", storeId: L1, carteiraId: ids(P1).conta, dataReferencia: hoje(), saldoSistema: 700, saldoInformado: 811, diferenca: 111, status: "divergente" },
    { id: "g003-conciliacao-P2", storeId: L1, carteiraId: ids(P2).conta, dataReferencia: hoje(), saldoSistema: 100, saldoInformado: 322, diferenca: 222, status: "divergente" },
    { id: "g003-conciliacao-E2-cruzada", storeId: L1, carteiraId: ids(E2).conta, dataReferencia: hoje(), saldoSistema: 900, saldoInformado: 1233, diferenca: 333, status: "divergente" },
    { id: "g003-conciliacao-E2", storeId: L2, carteiraId: ids(E2).conta, dataReferencia: hoje(), saldoSistema: 900, saldoInformado: 1344, diferenca: 444, status: "divergente" },
  ] })
  const [ano, mes] = hoje().split("-").map(Number)
  await prisma.fechamentoFinanceiro.createMany({ data: [
    { id: "g003-fechamento-E1", storeId: L1, tipo: "diario", dataReferencia: hoje(), mes, ano, saldoSistema: -133.45, snapshotDRE: { despesa: 133.45, origem: "EMPRESA_E1_LEGADO" } },
    { id: "g003-fechamento-E2", storeId: L2, tipo: "diario", dataReferencia: hoje(), mes, ano, saldoSistema: -888.32, snapshotDRE: { despesa: 888.32, origem: E2 } },
  ] })
  await prisma.auditoriaFinanceira.createMany({ data: [
    { id: "g003-audit-E1", storeId: L1, entidade: "pagar", entidadeId: ids(E1).pagar, acao: "editar",
      antes: { status: "pendente", valor: 365.01, descricao: "TEXTO_LIVRE_EMPRESARIAL", anexos: ["PRIVADO"] },
      depois: { status: "pago", valor: 365.01, perfilId: E1, storageRef: "PRIVADO", descricao: "TEXTO_LIVRE_EMPRESARIAL" } },
    { id: "g003-audit-legado", storeId: L1, entidade: "pagar", entidadeId: "g003-legado-pagar", acao: "criar", depois: { status: "pendente", valor: 10, descricao: "LEGADO_TEXTO_LIVRE" } },
    { id: "g003-audit-P1", storeId: L1, entidade: "pagar", entidadeId: ids(P1).pagar, acao: "criar",
      antes: { tipoPerfil: "PESSOAL", ownerAdminUserId: U1, descricao: `SENTINELA_${P1}`, valor: 1444.11 },
      depois: { tipoPerfil: "PESSOAL", perfilId: P1, texto: `SENTINELA_${P1}`, valor: 1444.11 } },
    { id: "g003-audit-P2", storeId: L1, entidade: "pagar", entidadeId: ids(P2).pagar, acao: "criar",
      antes: { tipoPerfil: "PESSOAL", ownerAdminUserId: U2, descricao: `SENTINELA_${P2}`, valor: 365.01 },
      depois: { tipoPerfil: "PESSOAL", perfilId: P2, texto: `SENTINELA_${P2}`, valor: 365.01 } },
    { id: "g003-audit-E2-cruzada", storeId: L1, entidade: "pagar", entidadeId: ids(E2).pagar, acao: "editar", depois: { perfilId: E2, valor: 2666.22, descricao: `SENTINELA_${E2}` } },
    { id: "g003-audit-E2", storeId: L2, entidade: "pagar", entidadeId: ids(E2).pagar, acao: "editar", depois: { perfilId: E2, valor: 2666.22 } },
  ] })
  login()
}

export async function estadoFinanceiroG003() {
  const [perfisAtuais, contas, pagar, receber, movimentos, documentos, vinculos, memorias, comandos, auditoria,
    categorias, conciliacoes, fechamentos, membros] = await Promise.all([
    prisma.financeiroPerfil.findMany({ orderBy: { id: "asc" } }), prisma.carteiraFinanceira.findMany({ orderBy: { id: "asc" } }),
    prisma.contaPagarTitulo.findMany({ orderBy: { id: "asc" } }), prisma.contaReceberTitulo.findMany({ orderBy: { id: "asc" } }),
    prisma.movimentacaoFinanceira.findMany({ orderBy: { id: "asc" } }), prisma.documentoGasto.findMany({ orderBy: { id: "asc" } }),
    prisma.documentoVinculo.findMany({ orderBy: { id: "asc" } }), prisma.omniAgentMemory.count(), prisma.omniAgentCommand.count(), prisma.auditoriaFinanceira.count(),
    prisma.categoriaGasto.findMany({ orderBy: { id: "asc" } }), prisma.conciliacaoFinanceira.findMany({ orderBy: { id: "asc" } }),
    prisma.fechamentoFinanceiro.findMany({ orderBy: { id: "asc" } }), prisma.perfilMembro.findMany({ orderBy: { id: "asc" } }),
  ])
  return JSON.stringify({ perfisAtuais, contas, pagar, receber, movimentos, documentos, vinculos, memorias, comandos, auditoria,
    categorias, conciliacoes, fechamentos, membros })
}
