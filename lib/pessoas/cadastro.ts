import { Prisma } from "@/generated/prisma"
import { prisma } from "@/lib/prisma"
import { executarComando } from "./commands"
import { pendenciasCadastro, type CamposCadastro } from "./cadastro-validation"
import { abrirCpf, cpfNormalizado, dataCivil, dataCivilDto, decimalCanonico, PessoasError, protegerCpf, texto } from "./domain"
import { exigirEscopo, type EscopoPessoas } from "./scope"

export type FuncionarioInput = {
  empregadorId: string
  comandoId: string
  motivo: string
  nome?: string
  cpf?: string
  nascimento?: string
  matricula?: string
  admissao?: string
  regime?: string
  categoria?: string
  cargo?: string
  cbo?: string
  tipoContrato?: string
  salarioBase?: string
  unidadeSalario?: string
  jornadaSemanal?: string
  divisor?: number
  cctRef?: string
  contractValidFrom?: string
}

/** Campos do contrato inicial (DpContratoVersao v1): dado contratual/remuneratório. */
const CAMPOS_CONTRATO = [
  "cargo", "cbo", "tipoContrato", "salarioBase", "unidadeSalario",
  "jornadaSemanal", "divisor", "cctRef", "contractValidFrom",
] as const satisfies readonly (keyof FuncionarioInput)[]
const CAMPOS_FUNCIONARIO: ReadonlySet<string> = new Set<keyof FuncionarioInput>([
  "empregadorId", "comandoId", "motivo", "nome", "cpf", "nascimento",
  "matricula", "admissao", "regime", "categoria", ...CAMPOS_CONTRATO,
])

/**
 * editCadastro cria pessoa/vínculo/rascunho; contrato exige editContrato.
 * Campo contratual sem capacidade ou campo desconhecido é recusado, nunca descartado.
 */
function exigirCamposPermitidos(escopo: EscopoPessoas, input: FuncionarioInput) {
  if (Object.keys(input).some((k) => !CAMPOS_FUNCIONARIO.has(k))) throw new PessoasError("CAMPO_DESCONHECIDO")
  const contratual = CAMPOS_CONTRATO.some((c) => input[c] != null && input[c] !== "")
  if (contratual && !escopo.capacidades.includes("editContrato")) {
    throw new PessoasError("CONTRATO_NAO_AUTORIZADO", 403)
  }
}

function camposInput(input: FuncionarioInput): CamposCadastro {
  const divisor = input.divisor == null ? null : input.divisor
  if (divisor !== null && (!Number.isInteger(divisor) || divisor <= 0 || divisor > 1000)) {
    throw new PessoasError("DIVISOR_INVALIDO")
  }
  return {
    nome: texto(input.nome, 240),
    cpf: cpfNormalizado(input.cpf),
    matricula: texto(input.matricula, 64),
    admissao: dataCivil(input.admissao),
    regime: texto(input.regime, 80),
    categoria: texto(input.categoria, 80),
    cargo: texto(input.cargo, 160),
    cbo: texto(input.cbo, 12),
    salarioBase: decimalCanonico(input.salarioBase),
    unidadeSalario: texto(input.unidadeSalario, 24),
    jornadaSemanal: decimalCanonico(input.jornadaSemanal),
    divisor,
    contractValidFrom: dataCivil(input.contractValidFrom),
  }
}

export async function criarFuncionario(input: FuncionarioInput) {
  const escopo = await exigirEscopo(input.empregadorId, "editCadastro")
  exigirCamposPermitidos(escopo, input)
  const campos = camposInput(input)
  const nascimento = dataCivil(input.nascimento)
  const tipoContrato = texto(input.tipoContrato, 80)
  const cctRef = texto(input.cctRef, 160)
  const motivo = texto(input.motivo, 1000, true)!
  if (campos.admissao && campos.contractValidFrom && campos.contractValidFrom < campos.admissao) {
    throw new PessoasError("VIGENCIA_ANTES_ADMISSAO")
  }
  const pendencias = pendenciasCadastro(campos)
  const id = await executarComando(escopo, "FUNCIONARIO_CRIAR", input.comandoId, input, async (tx) => {
    const unidade = await tx.dpUnidadeVinculo.findFirst({
      where: { empregadorId: escopo.empregadorId, storeId: escopo.storeId, validTo: null },
      select: { estabelecimentoId: true },
    })
    if (!unidade) throw new PessoasError("ESCOPO_NEGADO", 403)
    let pessoa = campos.cpf
      ? await tx.dpPessoa.findUnique({
          where: { empregadorId_cpfHash: { empregadorId: escopo.empregadorId, cpfHash: protegerCpf(campos.cpf, escopo.empregadorId).cpfHash } },
        })
      : null
    if (pessoa) {
      const autorizada = await tx.dpVinculo.findFirst({
        where: { empregadorId: escopo.empregadorId, pessoaId: pessoa.id, storeId: escopo.storeId },
        select: { id: true },
      })
      if (!autorizada) throw new PessoasError("DUPLICIDADE", 409)
    } else {
      const protegido = campos.cpf ? protegerCpf(campos.cpf, escopo.empregadorId) : { cpfCipher: null, cpfHash: null }
      pessoa = await tx.dpPessoa.create({
        data: { empregadorId: escopo.empregadorId, cpfCipher: protegido.cpfCipher, cpfHash: protegido.cpfHash, versaoAtual: 1 },
      })
      await tx.dpPessoaVersao.create({
        data: {
          empregadorId: escopo.empregadorId, pessoaId: pessoa.id, versao: 1,
          nome: campos.nome, nascimento, cpfCipher: protegido.cpfCipher, cpfHash: protegido.cpfHash,
          autorId: escopo.userId, motivo,
        },
      })
    }
    const vinculo = await tx.dpVinculo.create({
      data: {
        empregadorId: escopo.empregadorId, pessoaId: pessoa.id, storeId: escopo.storeId,
        matricula: campos.matricula, admissao: campos.admissao,
        regime: campos.regime, categoria: campos.categoria,
        status: pendencias.length ? "RASCUNHO" : "ATIVO", versaoAtual: 1,
      },
    })
    await tx.dpContratoVersao.create({
      data: {
        empregadorId: escopo.empregadorId, vinculoId: vinculo.id,
        estabelecimentoId: unidade.estabelecimentoId, versao: 1,
        cargo: campos.cargo, cbo: campos.cbo, tipoContrato,
        salarioBase: campos.salarioBase ? new Prisma.Decimal(campos.salarioBase) : null,
        unidadeSalario: campos.unidadeSalario,
        jornadaSemanal: campos.jornadaSemanal ? new Prisma.Decimal(campos.jornadaSemanal) : null,
        divisor: campos.divisor, cctRef, validFrom: campos.contractValidFrom,
        autorId: escopo.userId, motivo,
      },
    })
    return { empregadorId: escopo.empregadorId, entidade: "vinculo", entidadeId: vinculo.id, justificativa: motivo, campos: ["pessoa", "vinculo", "contrato"] }
  }, escopo.empregadorId)
  return obterFuncionario(input.empregadorId, id)
}

export async function listarFuncionarios(empregadorId: string) {
  const escopo = await exigirEscopo(empregadorId, "viewCadastro")
  const rows = await prisma.dpVinculo.findMany({
    where: { empregadorId: escopo.empregadorId, storeId: escopo.storeId },
    include: {
      pessoa: { include: { versoes: { orderBy: { versao: "desc" }, take: 1 } } },
      contratos: { orderBy: { versao: "desc" }, take: 1 },
    },
    orderBy: { createdAt: "desc" },
  })
  const remuneracao = escopo.capacidades.includes("viewRemuneracao")
  return rows.map((v) => ({
    id: v.id, pessoaId: v.pessoaId, nome: v.pessoa.versoes[0]?.nome ?? null,
    matricula: v.matricula, admissao: dataCivilDto(v.admissao), status: v.status,
    versaoAtual: v.versaoAtual,
    cargo: v.contratos[0]?.cargo ?? null,
    salarioBase: remuneracao ? (v.contratos[0]?.salarioBase?.toFixed(2) ?? null) : null,
    remuneracaoOculta: !remuneracao,
  }))
}

export async function obterFuncionario(empregadorId: string, vinculoId: string) {
  const escopo = await exigirEscopo(empregadorId, "viewCadastro")
  const v = await prisma.dpVinculo.findFirst({
    where: { id: vinculoId, empregadorId: escopo.empregadorId, storeId: escopo.storeId },
    include: {
      pessoa: { include: { versoes: { orderBy: { versao: "desc" }, take: 1 } } },
      contratos: { orderBy: { versao: "desc" }, take: 1 },
    },
  })
  if (!v) throw new PessoasError("NAO_ENCONTRADO", 404)
  const p = v.pessoa.versoes[0]
  const c = v.contratos[0]
  const remuneracao = escopo.capacidades.includes("viewRemuneracao")
  const pendencias = pendenciasCadastro({
    nome: p?.nome ?? null, cpf: v.pessoa.cpfHash, matricula: v.matricula, admissao: v.admissao,
    regime: v.regime, categoria: v.categoria, cargo: c?.cargo ?? null, cbo: c?.cbo ?? null,
    salarioBase: c?.salarioBase?.toFixed(2) ?? null, unidadeSalario: c?.unidadeSalario ?? null,
    jornadaSemanal: c?.jornadaSemanal?.toFixed(2) ?? null, divisor: c?.divisor ?? null,
    contractValidFrom: c?.validFrom ?? null,
  })
  return {
    id: v.id, pessoaId: v.pessoaId, nome: p?.nome ?? null,
    cpf: v.pessoa.cpfCipher ? abrirCpf(v.pessoa.cpfCipher, escopo.empregadorId) : null,
    nascimento: dataCivilDto(p?.nascimento), matricula: v.matricula,
    admissao: dataCivilDto(v.admissao), termino: dataCivilDto(v.termino),
    regime: v.regime, categoria: v.categoria, status: v.status,
    versaoAtual: v.versaoAtual, pessoaVersaoAtual: v.pessoa.versaoAtual,
    contrato: c ? {
      id: c.id, versao: c.versao, cargo: c.cargo, cbo: c.cbo, tipoContrato: c.tipoContrato,
      salarioBase: remuneracao ? c.salarioBase?.toFixed(2) ?? null : null,
      unidadeSalario: c.unidadeSalario,
      jornadaSemanal: c.jornadaSemanal?.toFixed(2) ?? null, divisor: c.divisor, cctRef: c.cctRef,
      estabelecimentoId: c.estabelecimentoId, validFrom: dataCivilDto(c.validFrom),
      validTo: dataCivilDto(c.validTo), recordedAt: c.recordedAt.toISOString(),
      remuneracaoOculta: !remuneracao,
    } : null,
    pendencias,
  }
}

async function vinculoEscopado(tx: Prisma.TransactionClient, escopo: EscopoPessoas, id: string) {
  const vinculo = await tx.dpVinculo.findFirst({
    where: { id, empregadorId: escopo.empregadorId, storeId: escopo.storeId },
    include: { pessoa: { include: { versoes: { orderBy: { versao: "desc" }, take: 1 } } }, contratos: { orderBy: { versao: "desc" }, take: 1 } },
  })
  if (!vinculo) throw new PessoasError("NAO_ENCONTRADO", 404)
  return vinculo
}

export async function atualizarDadosPessoais(input: {
  empregadorId: string; vinculoId: string; comandoId: string; expectedPersonVersion: number
  nome?: string; cpf?: string; nascimento?: string; validFrom?: string; motivo: string
}) {
  const escopo = await exigirEscopo(input.empregadorId, "editCadastro")
  const motivo = texto(input.motivo, 1000, true)!
  const nome = input.nome === undefined ? undefined : texto(input.nome, 240)
  const cpf = input.cpf === undefined ? undefined : cpfNormalizado(input.cpf)
  const nascimento = input.nascimento === undefined ? undefined : dataCivil(input.nascimento)
  const validFrom = input.validFrom === undefined ? undefined : dataCivil(input.validFrom)
  await executarComando(escopo, "PESSOA_EDITAR", input.comandoId, input, async (tx) => {
    const v = await vinculoEscopado(tx, escopo, input.vinculoId)
    if (v.pessoa.versaoAtual !== input.expectedPersonVersion) throw new PessoasError("VERSION_CONFLICT", 409)
    const anterior = v.pessoa.versoes[0]
    if (!anterior) throw new PessoasError("HISTORICO_AUSENTE", 409)
    if ((nome === null || cpf === null) && await tx.dpVinculo.count({
      where: { empregadorId: escopo.empregadorId, pessoaId: v.pessoaId, status: "ATIVO" },
    }) > 0) throw new PessoasError("CADASTRO_INCOMPLETO", 409)
    const protegido = cpf === undefined
      ? { cpfCipher: v.pessoa.cpfCipher, cpfHash: v.pessoa.cpfHash }
      : cpf === null ? { cpfCipher: null, cpfHash: null } : protegerCpf(cpf, escopo.empregadorId)
    const mudou = await tx.dpPessoa.updateMany({
      where: { id: v.pessoaId, empregadorId: escopo.empregadorId, versaoAtual: input.expectedPersonVersion },
      data: { cpfCipher: protegido.cpfCipher, cpfHash: protegido.cpfHash, versaoAtual: { increment: 1 } },
    })
    if (mudou.count !== 1) throw new PessoasError("VERSION_CONFLICT", 409)
    await tx.dpPessoaVersao.create({
      data: {
        empregadorId: escopo.empregadorId, pessoaId: v.pessoaId, versao: input.expectedPersonVersion + 1,
        nome: nome === undefined ? anterior.nome : nome,
        nascimento: nascimento === undefined ? anterior.nascimento : nascimento,
        cpfCipher: protegido.cpfCipher, cpfHash: protegido.cpfHash,
        validFrom: validFrom === undefined ? anterior.validFrom : validFrom,
        supersedesId: anterior.id, autorId: escopo.userId, motivo,
      },
    })
    if (v.status === "RASCUNHO" || v.status === "ATIVO") {
      const c = v.contratos[0]
      const faltantes = pendenciasCadastro({
        nome: nome === undefined ? anterior.nome : nome,
        cpf: protegido.cpfHash, matricula: v.matricula, admissao: v.admissao,
        regime: v.regime, categoria: v.categoria, cargo: c?.cargo ?? null,
        cbo: c?.cbo ?? null, salarioBase: c?.salarioBase?.toFixed(2) ?? null,
        unidadeSalario: c?.unidadeSalario ?? null,
        jornadaSemanal: c?.jornadaSemanal?.toFixed(2) ?? null,
        divisor: c?.divisor ?? null, contractValidFrom: c?.validFrom ?? null,
      })
      if (v.status === "ATIVO" && faltantes.length > 0) throw new PessoasError("CADASTRO_INCOMPLETO", 409)
      if (v.status === "RASCUNHO" && faltantes.length === 0) {
        const ativado = await tx.dpVinculo.updateMany({
          where: { id: v.id, versaoAtual: v.versaoAtual, storeId: escopo.storeId },
          data: { status: "ATIVO", versaoAtual: { increment: 1 } },
        })
        if (ativado.count !== 1) throw new PessoasError("VERSION_CONFLICT", 409)
      }
    }
    return { empregadorId: escopo.empregadorId, entidade: "pessoa", entidadeId: v.pessoaId, justificativa: motivo, campos: ["versaoPessoal"] }
  }, escopo.empregadorId)
  return obterFuncionario(input.empregadorId, input.vinculoId)
}

export async function completarVinculoRascunho(input: {
  empregadorId: string; vinculoId: string; comandoId: string; expectedVersion: number
  matricula?: string; admissao?: string; regime?: string; categoria?: string; motivo: string
}) {
  const escopo = await exigirEscopo(input.empregadorId, "editCadastro")
  const motivo = texto(input.motivo, 1000, true)!
  const matricula = texto(input.matricula, 64)
  const admissao = dataCivil(input.admissao)
  const regime = texto(input.regime, 80)
  const categoria = texto(input.categoria, 80)
  await executarComando(escopo, "VINCULO_COMPLETAR", input.comandoId, input, async (tx) => {
    const v = await vinculoEscopado(tx, escopo, input.vinculoId)
    if (v.status !== "RASCUNHO" || v.versaoAtual !== input.expectedVersion) throw new PessoasError("VERSION_CONFLICT", 409)
    for (const [atual, novo] of [[v.matricula, matricula], [v.regime, regime], [v.categoria, categoria]]) {
      if (atual !== null && novo !== null && atual !== novo) throw new PessoasError("CAMPO_IMUTAVEL", 409)
    }
    if (v.admissao && admissao && v.admissao.getTime() !== admissao.getTime()) throw new PessoasError("ADMISSAO_IMUTAVEL", 409)
    const c = v.contratos[0]
    const pendencias = pendenciasCadastro({
      nome: v.pessoa.versoes[0]?.nome ?? null, cpf: v.pessoa.cpfHash,
      matricula: v.matricula ?? matricula, admissao: v.admissao ?? admissao,
      regime: v.regime ?? regime, categoria: v.categoria ?? categoria,
      cargo: c?.cargo ?? null, cbo: c?.cbo ?? null, salarioBase: c?.salarioBase?.toFixed(2) ?? null,
      unidadeSalario: c?.unidadeSalario ?? null, jornadaSemanal: c?.jornadaSemanal?.toFixed(2) ?? null,
      divisor: c?.divisor ?? null, contractValidFrom: c?.validFrom ?? null,
    })
    const mudou = await tx.dpVinculo.updateMany({
      where: { id: v.id, empregadorId: escopo.empregadorId, storeId: escopo.storeId, versaoAtual: input.expectedVersion },
      data: {
        matricula: v.matricula ?? matricula, admissao: v.admissao ?? admissao,
        regime: v.regime ?? regime, categoria: v.categoria ?? categoria,
        status: pendencias.length ? "RASCUNHO" : "ATIVO",
        versaoAtual: { increment: 1 },
      },
    })
    if (mudou.count !== 1) throw new PessoasError("VERSION_CONFLICT", 409)
    return { empregadorId: escopo.empregadorId, entidade: "vinculo", entidadeId: v.id, justificativa: motivo, campos: ["camposRascunho"] }
  }, escopo.empregadorId)
  return obterFuncionario(input.empregadorId, input.vinculoId)
}

export async function criarVersaoContrato(input: {
  empregadorId: string; vinculoId: string; comandoId: string; expectedVersion: number
  supersedesId: string; tipoMudanca: "ALTERACAO" | "CORRECAO"
  validFrom: string; validTo?: string; cargo: string; cbo: string; tipoContrato?: string
  salarioBase: string; unidadeSalario: string; jornadaSemanal: string; divisor: number
  cctRef?: string; motivo: string
}) {
  const escopo = await exigirEscopo(input.empregadorId, "editContrato")
  const validFrom = dataCivil(input.validFrom, true)!
  const validTo = dataCivil(input.validTo)
  if (validTo && validTo <= validFrom) throw new PessoasError("VIGENCIA_INVALIDA")
  const salario = decimalCanonico(input.salarioBase)
  const jornada = decimalCanonico(input.jornadaSemanal)
  if (!salario || !jornada || !Number.isInteger(input.divisor) || input.divisor <= 0 || input.divisor > 1000) {
    throw new PessoasError("CONTRATO_INVALIDO")
  }
  const cargo = texto(input.cargo, 160, true)!
  const cbo = texto(input.cbo, 12, true)!
  const tipoContrato = texto(input.tipoContrato, 80)
  const unidadeSalario = texto(input.unidadeSalario, 24, true)!
  const cctRef = texto(input.cctRef, 160)
  const motivo = texto(input.motivo, 1000, true)!
  await executarComando(escopo, "CONTRATO_VERSIONAR", input.comandoId, input, async (tx) => {
    const v = await vinculoEscopado(tx, escopo, input.vinculoId)
    if (v.status === "ARQUIVADO" || v.versaoAtual !== input.expectedVersion) throw new PessoasError("VERSION_CONFLICT", 409)
    const atual = v.contratos[0]
    if (!atual || atual.id !== input.supersedesId || atual.supersededAt) throw new PessoasError("SUPERSESSAO_INVALIDA", 409)
    if (v.admissao && validFrom < v.admissao) throw new PessoasError("VIGENCIA_ANTES_ADMISSAO")
    if (atual.validFrom && validFrom < atual.validFrom) throw new PessoasError("VIGENCIA_SOBREPOSTA", 409)
    if (atual.validFrom && validFrom.getTime() === atual.validFrom.getTime() && input.tipoMudanca !== "CORRECAO") {
      throw new PessoasError("CORRECAO_EXPLICITA_NECESSARIA", 409)
    }
    if (atual.validFrom && validFrom > atual.validFrom && input.tipoMudanca !== "ALTERACAO") {
      throw new PessoasError("TIPO_MUDANCA_INVALIDO", 409)
    }
    const mudou = await tx.dpVinculo.updateMany({
      where: { id: v.id, empregadorId: escopo.empregadorId, storeId: escopo.storeId, versaoAtual: input.expectedVersion },
      data: {
        status: pendenciasCadastro({
          nome: v.pessoa.versoes[0]?.nome ?? null, cpf: v.pessoa.cpfHash,
          matricula: v.matricula, admissao: v.admissao, regime: v.regime, categoria: v.categoria,
          cargo, cbo, salarioBase: salario, unidadeSalario, jornadaSemanal: jornada,
          divisor: input.divisor, contractValidFrom: validFrom,
        }).length ? "RASCUNHO" : "ATIVO",
        versaoAtual: { increment: 1 },
      },
    })
    if (mudou.count !== 1) throw new PessoasError("VERSION_CONFLICT", 409)
    await tx.dpContratoVersao.update({ where: { id: atual.id }, data: { supersededAt: new Date() } })
    await tx.dpContratoVersao.create({
      data: {
        empregadorId: escopo.empregadorId, vinculoId: v.id, estabelecimentoId: atual.estabelecimentoId,
        versao: atual.versao + 1, cargo, cbo, tipoContrato,
        salarioBase: new Prisma.Decimal(salario), unidadeSalario,
        jornadaSemanal: new Prisma.Decimal(jornada), divisor: input.divisor,
        cctRef, validFrom, validTo, supersedesId: atual.id, autorId: escopo.userId, motivo,
      },
    })
    return { empregadorId: escopo.empregadorId, entidade: "vinculo", entidadeId: v.id, justificativa: motivo, campos: ["contratoVersao", "vigencia"] }
  }, escopo.empregadorId)
  return obterFuncionario(input.empregadorId, input.vinculoId)
}

export async function arquivarVinculo(input: {
  empregadorId: string; vinculoId: string; comandoId: string; expectedVersion: number; motivo: string
}) {
  const escopo = await exigirEscopo(input.empregadorId, "editCadastro")
  const motivo = texto(input.motivo, 1000, true)!
  await executarComando(escopo, "VINCULO_ARQUIVAR", input.comandoId, input, async (tx) => {
    const v = await vinculoEscopado(tx, escopo, input.vinculoId)
    if (v.status === "ARQUIVADO" || v.versaoAtual !== input.expectedVersion) throw new PessoasError("VERSION_CONFLICT", 409)
    const mudou = await tx.dpVinculo.updateMany({
      where: { id: v.id, versaoAtual: input.expectedVersion, storeId: escopo.storeId },
      data: {
        status: "ARQUIVADO", versaoAtual: { increment: 1 },
        arquivadoEm: new Date(), arquivadoPorId: escopo.userId, motivoArquivo: motivo,
      },
    })
    if (mudou.count !== 1) throw new PessoasError("VERSION_CONFLICT", 409)
    return { empregadorId: escopo.empregadorId, entidade: "vinculo", entidadeId: v.id, justificativa: motivo, campos: ["arquivadoEm"] }
  }, escopo.empregadorId)
  return obterFuncionario(input.empregadorId, input.vinculoId)
}

export async function listarHistorico(empregadorId: string, vinculoId: string) {
  const escopo = await exigirEscopo(empregadorId, "viewCadastro")
  const v = await prisma.dpVinculo.findFirst({
    where: { id: vinculoId, empregadorId: escopo.empregadorId, storeId: escopo.storeId },
    include: {
      pessoa: { include: { versoes: { orderBy: { versao: "asc" } } } },
      contratos: { orderBy: { versao: "asc" } },
    },
  })
  if (!v) throw new PessoasError("NAO_ENCONTRADO", 404)
  const remuneracao = escopo.capacidades.includes("viewRemuneracao")
  return {
    pessoa: v.pessoa.versoes.map((p) => ({
      id: p.id, versao: p.versao, nome: p.nome,
      validFrom: dataCivilDto(p.validFrom), recordedAt: p.recordedAt.toISOString(),
      supersedesId: p.supersedesId, autorId: p.autorId, motivo: p.motivo,
    })),
    contratos: v.contratos.map((c) => ({
      id: c.id, versao: c.versao, cargo: c.cargo, cbo: c.cbo,
      salarioBase: remuneracao ? c.salarioBase?.toFixed(2) ?? null : null,
      remuneracaoOculta: !remuneracao,
      validFrom: dataCivilDto(c.validFrom), validTo: dataCivilDto(c.validTo),
      recordedAt: c.recordedAt.toISOString(), supersedesId: c.supersedesId,
      supersededAt: c.supersededAt?.toISOString() ?? null, autorId: c.autorId, motivo: c.motivo,
    })),
  }
}

export async function vincularIdentidade(input: {
  empregadorId: string; vinculoId: string; comandoId: string
  tipo: "USUARIO" | "TECNICO"; identidadeId: string; validFrom: string; motivo: string
}) {
  const escopo = await exigirEscopo(input.empregadorId, "editCadastro")
  const validFrom = dataCivil(input.validFrom, true)!
  const motivo = texto(input.motivo, 1000, true)!
  const id = await executarComando(escopo, "IDENTIDADE_VINCULAR", input.comandoId, input, async (tx) => {
    const v = await vinculoEscopado(tx, escopo, input.vinculoId)
    if (input.tipo === "USUARIO") {
      const [user, membership, existe] = await Promise.all([
        tx.adminUser.findUnique({ where: { id: input.identidadeId }, select: { active: true, lojaId: true } }),
        tx.adminUserStore.findUnique({ where: { adminUserId_storeId: { adminUserId: input.identidadeId, storeId: escopo.storeId } } }),
        tx.dpPessoaUsuario.findFirst({ where: { empregadorId: escopo.empregadorId, pessoaId: v.pessoaId, adminUserId: input.identidadeId, validTo: null } }),
      ])
      if (!user?.active || (user.lojaId !== escopo.storeId && !membership)) throw new PessoasError("ESCOPO_NEGADO", 403)
      if (existe) throw new PessoasError("DUPLICIDADE", 409)
      const link = await tx.dpPessoaUsuario.create({
        data: { empregadorId: escopo.empregadorId, pessoaId: v.pessoaId, adminUserId: input.identidadeId, validFrom, autorId: escopo.userId, motivo },
      })
      return { empregadorId: escopo.empregadorId, entidade: "pessoa_usuario", entidadeId: link.id, justificativa: motivo, campos: ["associacao"] }
    }
    if (input.tipo !== "TECNICO") throw new PessoasError("TIPO_IDENTIDADE_INVALIDO")
    const tecnico = await tx.tecnico.findFirst({ where: { id: input.identidadeId, storeId: escopo.storeId }, select: { id: true } })
    if (!tecnico) throw new PessoasError("ESCOPO_NEGADO", 403)
    const existe = await tx.dpPessoaTecnico.findFirst({
      where: { empregadorId: escopo.empregadorId, pessoaId: v.pessoaId, tecnicoId: tecnico.id, validTo: null },
    })
    if (existe) throw new PessoasError("DUPLICIDADE", 409)
    const link = await tx.dpPessoaTecnico.create({
      data: { empregadorId: escopo.empregadorId, pessoaId: v.pessoaId, tecnicoId: tecnico.id, storeId: escopo.storeId, validFrom, autorId: escopo.userId, motivo },
    })
    return { empregadorId: escopo.empregadorId, entidade: "pessoa_tecnico", entidadeId: link.id, justificativa: motivo, campos: ["associacao"] }
  }, escopo.empregadorId)
  return { id }
}
