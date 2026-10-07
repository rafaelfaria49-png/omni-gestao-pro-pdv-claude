import { prisma } from "@/lib/prisma"
import { dataCivil, dataCivilDto, hojeCivil, PessoasError, texto } from "./domain"
import { executarComando } from "./commands"
import { CAPACIDADES, exigirBootstrap, exigirEscopo, listarEscopos, type Capacidade } from "./scope"

type Endereco = Record<string, string>
function enderecoSeguro(entrada: Endereco | null | undefined): Endereco | undefined {
  if (entrada == null) return undefined
  const chaves = ["logradouro", "numero", "complemento", "bairro", "cidade", "uf", "cep"]
  if (typeof entrada !== "object" || Array.isArray(entrada) || Object.keys(entrada).some((k) => !chaves.includes(k))) {
    throw new PessoasError("ENDERECO_INVALIDO")
  }
  const saida: Endereco = {}
  for (const [chave, valor] of Object.entries(entrada)) {
    if (typeof valor !== "string") throw new PessoasError("ENDERECO_INVALIDO")
    saida[chave] = texto(valor, 160) ?? ""
  }
  return saida
}

export type CriarEmpregadorInput = {
  comandoId: string
  tipoInscricao: string
  inscricao: string
  nome: string
  validFrom: string
  endereco?: Endereco
  regime?: string
  estabelecimento: {
    tipoInscricao: string
    inscricao: string
    nome: string
    endereco?: Endereco
    lotacaoRef?: string
  }
  motivo: string
}

/** Bootstrap deliberado: admin ativo + vínculo explícito com a Store gestora. */
export async function criarEmpregador(input: CriarEmpregadorInput) {
  const ator = await exigirBootstrap()
  const tipoInscricao = texto(input.tipoInscricao, 12, true)!
  const inscricao = texto(input.inscricao, 32, true)!
  const nome = texto(input.nome, 240, true)!
  const data = dataCivil(input.validFrom, true)!
  if (data > hojeCivil()) throw new PessoasError("VIGENCIA_FUTURA_NAO_SUPORTADA")
  const motivo = texto(input.motivo, 1000, true)!
  const est = input.estabelecimento
  const estTipo = texto(est?.tipoInscricao, 12, true)!
  const estInscricao = texto(est?.inscricao, 32, true)!
  const estNome = texto(est?.nome, 240, true)!
  const endereco = enderecoSeguro(input.endereco)
  const estEndereco = enderecoSeguro(est.endereco)
  const regime = texto(input.regime, 80)
  const lotacaoRef = texto(est.lotacaoRef, 80)
  const id = await executarComando(ator, "EMPREGADOR_CRIAR", input.comandoId, input, async (tx) => {
    const empregador = await tx.dpEmpregador.create({
      data: { storeGestoraId: ator.storeId, tipoInscricao, inscricao, nome },
    })
    await tx.dpEmpregadorVersao.create({
      data: {
        empregadorId: empregador.id, versao: 1, tipoInscricao, inscricao, nome,
        endereco, regime, validFrom: data, autorId: ator.userId, motivo,
      },
    })
    const estabelecimento = await tx.dpEstabelecimento.create({
      data: { empregadorId: empregador.id, tipoInscricao: estTipo, inscricao: estInscricao },
    })
    await tx.dpEstabelecimentoVersao.create({
      data: {
        empregadorId: empregador.id, estabelecimentoId: estabelecimento.id, versao: 1,
        nome: estNome, endereco: estEndereco, lotacaoRef, validFrom: data, autorId: ator.userId, motivo,
      },
    })
    await tx.dpUnidadeVinculo.create({
      data: {
        empregadorId: empregador.id, estabelecimentoId: estabelecimento.id,
        storeId: ator.storeId, validFrom: data, aprovadoPorId: ator.userId, motivo,
      },
    })
    await tx.dpAcesso.create({
      data: {
        empregadorId: empregador.id, storeId: ator.storeId, adminUserId: ator.userId,
        capacidades: [...CAPACIDADES], concedidoPorId: ator.userId, motivo: "Bootstrap explícito: " + motivo,
      },
    })
    return { empregadorId: empregador.id, entidade: "empregador", entidadeId: empregador.id, justificativa: motivo, campos: ["identificacao", "estabelecimento", "unidade", "acesso"] }
  })
  return obterEmpregador(id)
}

export async function listarEmpregadores() {
  const escopos = await listarEscopos("viewCadastro")
  if (escopos.length === 0) return []
  const rows = await prisma.dpEmpregador.findMany({
    where: { id: { in: escopos.map((e) => e.empregadorId) }, status: "ATIVO" },
    select: { id: true, nome: true, tipoInscricao: true, inscricao: true, storeGestoraId: true },
    orderBy: { nome: "asc" },
  })
  return rows
}

export async function obterEmpregador(empregadorId: string) {
  const escopo = await exigirEscopo(empregadorId, "viewCadastro")
  const empregador = await prisma.dpEmpregador.findUnique({
    where: { id: escopo.empregadorId },
    include: {
      versoes: { orderBy: { versao: "desc" } },
      estabelecimentos: { include: { versoes: { orderBy: { versao: "desc" } } } },
      unidades: { where: { storeId: escopo.storeId }, orderBy: { recordedAt: "desc" } },
    },
  })
  if (!empregador) throw new PessoasError("NAO_ENCONTRADO", 404)
  return {
    id: empregador.id,
    nome: empregador.nome,
    tipoInscricao: empregador.tipoInscricao,
    inscricao: empregador.inscricao,
    storeGestoraId: empregador.storeGestoraId,
    versaoAtual: empregador.versaoAtual,
    versoes: empregador.versoes.map((v) => ({
      id: v.id, versao: v.versao, nome: v.nome, inscricao: v.inscricao,
      tipoInscricao: v.tipoInscricao, endereco: v.endereco, regime: v.regime,
      validFrom: dataCivilDto(v.validFrom), validTo: dataCivilDto(v.validTo),
      recordedAt: v.recordedAt.toISOString(), supersedesId: v.supersedesId,
      autorId: v.autorId, motivo: v.motivo,
    })),
    estabelecimentos: empregador.estabelecimentos.map((e) => ({
      id: e.id, tipoInscricao: e.tipoInscricao, inscricao: e.inscricao, status: e.status,
      nome: e.versoes[0]?.nome ?? null, versaoAtual: e.versaoAtual,
      versoes: e.versoes.map((v) => ({ id: v.id, versao: v.versao, nome: v.nome, endereco: v.endereco,
        lotacaoRef: v.lotacaoRef, validFrom: dataCivilDto(v.validFrom), validTo: dataCivilDto(v.validTo),
        recordedAt: v.recordedAt.toISOString(), supersedesId: v.supersedesId, autorId: v.autorId, motivo: v.motivo })),
    })),
    unidades: empregador.unidades.map((u) => ({
      id: u.id, storeId: u.storeId, estabelecimentoId: u.estabelecimentoId,
      validFrom: dataCivilDto(u.validFrom), validTo: dataCivilDto(u.validTo),
    })),
  }
}

export async function atualizarEmpregador(input: {
  empregadorId: string; comandoId: string; expectedVersion: number; validFrom: string
  nome: string; tipoInscricao: string; inscricao: string; endereco?: Endereco; regime?: string; motivo: string
}) {
  const escopo = await exigirEscopo(input.empregadorId, "manageAccess")
  const nome = texto(input.nome, 240, true)!
  const tipoInscricao = texto(input.tipoInscricao, 12, true)!
  const inscricao = texto(input.inscricao, 32, true)!
  const motivo = texto(input.motivo, 1000, true)!
  const data = dataCivil(input.validFrom, true)!
  const endereco = enderecoSeguro(input.endereco)
  const regime = texto(input.regime, 80)
  await executarComando(escopo, "EMPREGADOR_EDITAR", input.comandoId, input, async (tx) => {
    const atual = await tx.dpEmpregador.findUnique({ where: { id: escopo.empregadorId } })
    if (!atual || atual.storeGestoraId !== escopo.storeId) throw new PessoasError("ESCOPO_NEGADO", 403)
    if (atual.versaoAtual !== input.expectedVersion) throw new PessoasError("VERSION_CONFLICT", 409)
    const anterior = await tx.dpEmpregadorVersao.findUnique({
      where: { empregadorId_versao: { empregadorId: atual.id, versao: atual.versaoAtual } },
    })
    if (!anterior || data < anterior.validFrom) throw new PessoasError("VIGENCIA_SOBREPOSTA", 409)
    const mudou = await tx.dpEmpregador.updateMany({
      where: { id: atual.id, versaoAtual: input.expectedVersion },
      data: { nome, tipoInscricao, inscricao, versaoAtual: { increment: 1 } },
    })
    if (mudou.count !== 1) throw new PessoasError("VERSION_CONFLICT", 409)
    await tx.dpEmpregadorVersao.update({ where: { id: anterior.id }, data: { supersededAt: new Date() } })
    await tx.dpEmpregadorVersao.create({
      data: {
        empregadorId: atual.id, versao: input.expectedVersion + 1, nome, tipoInscricao, inscricao,
        endereco, regime, validFrom: data, supersedesId: anterior.id, autorId: escopo.userId, motivo,
      },
    })
    return { empregadorId: atual.id, entidade: "empregador", entidadeId: atual.id, justificativa: motivo, campos: ["identificacao", "versao"] }
  }, escopo.empregadorId)
  return obterEmpregador(input.empregadorId)
}

export async function criarEstabelecimento(input: {
  empregadorId: string; comandoId: string; tipoInscricao: string; inscricao: string
  nome: string; endereco?: Endereco; lotacaoRef?: string; validFrom: string; motivo: string
}) {
  const escopo = await exigirEscopo(input.empregadorId, "manageAccess")
  const tipoInscricao = texto(input.tipoInscricao, 12, true)!
  const inscricao = texto(input.inscricao, 32, true)!
  const nome = texto(input.nome, 240, true)!
  const lotacaoRef = texto(input.lotacaoRef, 80)
  const endereco = enderecoSeguro(input.endereco)
  const validFrom = dataCivil(input.validFrom, true)!
  const motivo = texto(input.motivo, 1000, true)!
  const id = await executarComando(escopo, "ESTABELECIMENTO_CRIAR", input.comandoId, input, async (tx) => {
    const est = await tx.dpEstabelecimento.create({
      data: { empregadorId: escopo.empregadorId, tipoInscricao, inscricao },
    })
    await tx.dpEstabelecimentoVersao.create({
      data: {
        empregadorId: escopo.empregadorId, estabelecimentoId: est.id, versao: 1,
        nome, endereco, lotacaoRef, validFrom, autorId: escopo.userId, motivo,
      },
    })
    return { empregadorId: escopo.empregadorId, entidade: "estabelecimento", entidadeId: est.id, justificativa: motivo, campos: ["identificacao"] }
  }, escopo.empregadorId)
  return { id }
}

export async function atualizarEstabelecimento(input: {
  empregadorId: string; estabelecimentoId: string; comandoId: string; expectedVersion: number
  tipoInscricao: string; inscricao: string; nome: string; endereco?: Endereco
  lotacaoRef?: string; validFrom: string; motivo: string
}) {
  const escopo = await exigirEscopo(input.empregadorId, "manageAccess")
  const tipoInscricao = texto(input.tipoInscricao, 12, true)!
  const inscricao = texto(input.inscricao, 32, true)!
  const nome = texto(input.nome, 240, true)!
  const endereco = enderecoSeguro(input.endereco)
  const lotacaoRef = texto(input.lotacaoRef, 80)
  const validFrom = dataCivil(input.validFrom, true)!
  const motivo = texto(input.motivo, 1000, true)!
  const id = await executarComando(escopo, "ESTABELECIMENTO_EDITAR", input.comandoId, input, async (tx) => {
    const est = await tx.dpEstabelecimento.findFirst({
      where: { id: input.estabelecimentoId, empregadorId: escopo.empregadorId },
    })
    if (!est) throw new PessoasError("NAO_ENCONTRADO", 404)
    if (est.versaoAtual !== input.expectedVersion) throw new PessoasError("VERSION_CONFLICT", 409)
    const anterior = await tx.dpEstabelecimentoVersao.findUnique({
      where: { estabelecimentoId_versao: { estabelecimentoId: est.id, versao: est.versaoAtual } },
    })
    if (!anterior || validFrom < anterior.validFrom) throw new PessoasError("VIGENCIA_SOBREPOSTA", 409)
    const mudou = await tx.dpEstabelecimento.updateMany({
      where: { id: est.id, empregadorId: escopo.empregadorId, versaoAtual: input.expectedVersion },
      data: { tipoInscricao, inscricao, versaoAtual: { increment: 1 } },
    })
    if (mudou.count !== 1) throw new PessoasError("VERSION_CONFLICT", 409)
    await tx.dpEstabelecimentoVersao.update({ where: { id: anterior.id }, data: { supersededAt: new Date() } })
    await tx.dpEstabelecimentoVersao.create({
      data: {
        empregadorId: escopo.empregadorId, estabelecimentoId: est.id,
        versao: input.expectedVersion + 1, nome, endereco, lotacaoRef, validFrom,
        supersedesId: anterior.id, autorId: escopo.userId, motivo,
      },
    })
    return { empregadorId: escopo.empregadorId, entidade: "estabelecimento", entidadeId: est.id, justificativa: motivo, campos: ["identificacao", "versao"] }
  }, escopo.empregadorId)
  return { id }
}
export async function vincularUnidade(input: {
  empregadorId: string; comandoId: string; storeId: string; estabelecimentoId: string
  validFrom: string; motivo: string; confirmarAcessoGestor: true
}) {
  const escopo = await exigirEscopo(input.empregadorId, "manageAccess")
  if (input.confirmarAcessoGestor !== true) throw new PessoasError("CONFIRMACAO_NECESSARIA")
  const storeId = texto(input.storeId, 100, true)!
  const estabelecimentoId = texto(input.estabelecimentoId, 100, true)!
  const validFrom = dataCivil(input.validFrom, true)!
  if (validFrom > hojeCivil()) throw new PessoasError("VIGENCIA_FUTURA_NAO_SUPORTADA")
  const motivo = texto(input.motivo, 1000, true)!
  const id = await executarComando(escopo, "UNIDADE_VINCULAR", input.comandoId, input, async (tx) => {
    const [usuario, membro, store, est, existente] = await Promise.all([
      tx.adminUser.findUnique({ where: { id: escopo.userId }, select: { lojaId: true } }),
      tx.adminUserStore.findUnique({ where: { adminUserId_storeId: { adminUserId: escopo.userId, storeId } } }),
      tx.store.findUnique({ where: { id: storeId }, select: { id: true } }),
      tx.dpEstabelecimento.findUnique({ where: { id: estabelecimentoId }, select: { empregadorId: true } }),
      tx.dpUnidadeVinculo.findFirst({ where: { empregadorId: escopo.empregadorId, storeId, validTo: null } }),
    ])
    if (!store || !usuario || (usuario.lojaId !== storeId && !membro) || est?.empregadorId !== escopo.empregadorId) {
      throw new PessoasError("ESCOPO_NEGADO", 403)
    }
    if (existente) throw new PessoasError("UNIDADE_JA_VINCULADA", 409)
    const unidade = await tx.dpUnidadeVinculo.create({
      data: { empregadorId: escopo.empregadorId, estabelecimentoId, storeId, validFrom, aprovadoPorId: escopo.userId, motivo },
    })
    await tx.dpAcesso.create({
      data: { empregadorId: escopo.empregadorId, storeId, adminUserId: escopo.userId,
        capacidades: [...CAPACIDADES], concedidoPorId: escopo.userId, motivo: "Acesso gestor explicitamente confirmado: " + motivo },
    })
    return { empregadorId: escopo.empregadorId, entidade: "unidade", entidadeId: unidade.id, justificativa: motivo, campos: ["storeId", "estabelecimentoId"] }
  }, escopo.empregadorId)
  return { id }
}

export async function concederAcesso(input: {
  empregadorId: string; comandoId: string; adminUserId: string; storeId: string
  capacidades: Capacidade[]; motivo: string
}) {
  const escopo = await exigirEscopo(input.empregadorId, "manageAccess")
  const motivo = texto(input.motivo, 1000, true)!
  if (!Array.isArray(input.capacidades) || input.capacidades.length === 0 ||
      input.capacidades.some((c) => !CAPACIDADES.includes(c)) ||
      new Set(input.capacidades).size !== input.capacidades.length) {
    throw new PessoasError("CAPACIDADE_INVALIDA")
  }
  if ((input.capacidades.includes("editCadastro") || input.capacidades.includes("editContrato") ||
       input.capacidades.includes("manageAccess")) && !input.capacidades.includes("viewCadastro")) {
    throw new PessoasError("CAPACIDADE_INVALIDA")
  }
  if (input.capacidades.includes("editContrato") && !input.capacidades.includes("viewRemuneracao")) {
    throw new PessoasError("CAPACIDADE_INVALIDA")
  }  const id = await executarComando(escopo, "ACESSO_CONCEDER", input.comandoId, input, async (tx) => {
    const [usuario, membro, unidade, ativo] = await Promise.all([
      tx.adminUser.findUnique({ where: { id: input.adminUserId }, select: { active: true, lojaId: true } }),
      tx.adminUserStore.findUnique({ where: { adminUserId_storeId: { adminUserId: input.adminUserId, storeId: input.storeId } } }),
      tx.dpUnidadeVinculo.findFirst({ where: { empregadorId: escopo.empregadorId, storeId: input.storeId, validTo: null } }),
      tx.dpAcesso.findFirst({ where: { empregadorId: escopo.empregadorId, storeId: input.storeId, adminUserId: input.adminUserId, revogadoEm: null } }),
    ])
    if (!usuario?.active || (usuario.lojaId !== input.storeId && !membro) || !unidade) throw new PessoasError("ESCOPO_NEGADO", 403)
    if (input.storeId !== escopo.storeId) throw new PessoasError("ESCOPO_NEGADO", 403)
    if (ativo) throw new PessoasError("ACESSO_JA_ATIVO", 409)
    const acesso = await tx.dpAcesso.create({
      data: {
        empregadorId: escopo.empregadorId, storeId: input.storeId, adminUserId: input.adminUserId,
        capacidades: input.capacidades, concedidoPorId: escopo.userId, motivo,
      },
    })
    return { empregadorId: escopo.empregadorId, entidade: "acesso", entidadeId: acesso.id, justificativa: motivo, campos: ["capacidades"] }
  }, escopo.empregadorId)
  return { id }
}

export async function revogarAcesso(input: { empregadorId: string; comandoId: string; acessoId: string; motivo: string }) {
  const escopo = await exigirEscopo(input.empregadorId, "manageAccess")
  const motivo = texto(input.motivo, 1000, true)!
  const id = await executarComando(escopo, "ACESSO_REVOGAR", input.comandoId, input, async (tx) => {
    const acesso = await tx.dpAcesso.findFirst({
      where: { id: input.acessoId, empregadorId: escopo.empregadorId, storeId: escopo.storeId, revogadoEm: null },
    })
    if (!acesso) throw new PessoasError("NAO_ENCONTRADO", 404)
    if (acesso.adminUserId === escopo.userId && acesso.capacidades.includes("manageAccess")) {
      const outros = await tx.dpAcesso.count({
        where: { empregadorId: escopo.empregadorId, storeId: escopo.storeId, revogadoEm: null, id: { not: acesso.id }, capacidades: { has: "manageAccess" } },
      })
      if (outros === 0) throw new PessoasError("ULTIMO_GESTOR", 409)
    }
    const mudou = await tx.dpAcesso.updateMany({
      where: { id: acesso.id, revogadoEm: null },
      data: { revogadoEm: new Date(), revogadoPorId: escopo.userId },
    })
    if (mudou.count !== 1) throw new PessoasError("VERSION_CONFLICT", 409)
    return { empregadorId: escopo.empregadorId, entidade: "acesso", entidadeId: acesso.id, justificativa: motivo, campos: ["revogadoEm"] }
  }, escopo.empregadorId)
  return { id }
}
