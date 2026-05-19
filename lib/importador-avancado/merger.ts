// ============================================================
// lib/importador-avancado/merger.ts
// Motor de cruzamento e merge de planilhas por chave de join
// ============================================================

import type { PlanilhaParseada, RegistroMergeado, DominioImport } from "./types"
import { resolverCampoSemantico, mapearHeaders } from "./detector"

// ── Utilitários ───────────────────────────────────────────────

function norm(s: unknown): string {
  return String(s ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
    .trim()
}

function normChave(s: unknown): string {
  return String(s ?? "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, " ")
}

function toNumberBr(raw: unknown): number | null {
  const s = String(raw ?? "").trim().replace(/\s/g, "")
  if (!s) return null
  // Remove R$, símbolo de moeda
  const cleaned = s.replace(/^r\$\s*/i, "").replace(/[^0-9,.\-]/g, "")
  if (!cleaned) return null
  const hasComma = cleaned.includes(",")
  const hasDot = cleaned.includes(".")
  let normalized = cleaned
  if (hasComma && hasDot) {
    // 1.234,56 → 1234.56
    if (cleaned.lastIndexOf(",") > cleaned.lastIndexOf(".")) {
      normalized = cleaned.replace(/\./g, "").replace(",", ".")
    } else {
      // 1,234.56 → 1234.56
      normalized = cleaned.replace(/,/g, "")
    }
  } else if (hasComma) {
    normalized = cleaned.replace(",", ".")
  }
  const n = parseFloat(normalized)
  return isNaN(n) ? null : n
}

function parseDataBr(raw: unknown): string | null {
  const s = String(raw ?? "").trim()
  if (!s) return null
  // dd/mm/yyyy ou dd/mm/yyyy hh:mm:ss
  const match = s.match(/^(\d{2})\/(\d{2})\/(\d{4})/)
  if (match) return `${match[3]}-${match[2]}-${match[1]}`
  // yyyy-mm-dd já ok
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10)
  return s
}

// ── Grupos de domínios que se cruzam ────────────────────────

type GrupoCruzamento = {
  dominios: DominioImport[]
  principal: DominioImport
  chaveSemantica: string // campo semântico da chave de join
}

const GRUPOS_CRUZAMENTO: GrupoCruzamento[] = [
  {
    dominios: ["ordens_servicos", "os_equipamentos", "os_pagamentos", "os_servicos", "os_situacoes"],
    principal: "ordens_servicos",
    chaveSemantica: "os.numero",
  },
  {
    dominios: ["vendas", "vendas_historicos", "vendas_pagamentos", "vendas_produtos"],
    principal: "vendas",
    chaveSemantica: "venda.numero",
  },
  {
    dominios: ["clientes", "clientes_enderecos"],
    principal: "clientes",
    chaveSemantica: "cliente.codigo",
  },
  {
    dominios: ["fornecedores", "fornecedores_enderecos"],
    principal: "fornecedores",
    chaveSemantica: "fornecedor.codigo",
  },
]

// Domínios independentes (sem cruzamento)
const DOMINIOS_INDEPENDENTES: DominioImport[] = [
  "produtos",
  "servicos_catalogo",
  "contas_pagar",
  "contas_receber",
]

// ── Extração de valor de uma linha pelo campo semântico ──────

function extrairValorPorSemantica(
  linha: Record<string, unknown>,
  headers: string[],
  campoSemantico: string
): unknown {
  for (const h of headers) {
    if (resolverCampoSemantico(h) === campoSemantico) {
      return linha[h]
    }
  }
  return undefined
}

// ── Normalização de linha em campos semânticos ───────────────

export function normalizarLinha(
  linha: Record<string, unknown>,
  headers: string[]
): Record<string, unknown> {
  const resultado: Record<string, unknown> = {}
  const mapaHeaders = mapearHeaders(headers)

  for (const [headerOriginal, campoSemantico] of Object.entries(mapaHeaders)) {
    const valor = linha[headerOriginal]
    if (valor === null || valor === undefined || String(valor).trim() === "") continue

    // Aplica conversão por tipo de campo
    if (
      campoSemantico.startsWith("financeiro.") ||
      campoSemantico.includes("Valor") ||
      campoSemantico.includes("preco") ||
      campoSemantico.includes("custo")
    ) {
      const n = toNumberBr(valor)
      resultado[campoSemantico] = n !== null ? n : String(valor).trim()
    } else if (campoSemantico.startsWith("data.") || campoSemantico.includes("data")) {
      resultado[campoSemantico] = parseDataBr(valor) ?? String(valor).trim()
    } else if (campoSemantico === "item.quantidade") {
      const n = toNumberBr(valor)
      resultado[campoSemantico] = n !== null ? Math.max(0, n) : 1
    } else {
      resultado[campoSemantico] = String(valor).trim()
    }
  }

  // Também preserva os valores originais com chave do header para debug
  for (const [h, v] of Object.entries(linha)) {
    if (v !== null && v !== undefined && String(v).trim() !== "") {
      resultado[`_raw.${h}`] = v
    }
  }

  return resultado
}

// ── Merge de múltiplas planilhas ─────────────────────────────

export type GrupoMergeInput = {
  planilhas: PlanilhaParseada[]
  grupo: GrupoCruzamento
}

/**
 * Merge principal: cruza todas as planilhas de um grupo pela chave semântica.
 * Ex: OS principal + equipamentos + pagamentos + serviços + situações → 1 registro por OS
 */
export function mergePlanilhasGrupo(planilhas: PlanilhaParseada[]): RegistroMergeado[] {
  // Identifica o grupo de cruzamento para esse conjunto de planilhas
  const dominiosPresentes = new Set(planilhas.map((p) => p.dominio))

  let grupoCruz: GrupoCruzamento | null = null
  for (const g of GRUPOS_CRUZAMENTO) {
    const intersecao = g.dominios.filter((d) => dominiosPresentes.has(d))
    if (intersecao.length >= 1) {
      grupoCruz = g
      break
    }
  }

  // Se não tem grupo de cruzamento, trata cada planilha individualmente
  if (!grupoCruz) {
    return planilhas.flatMap((p) => mergePlanilhaIndependente(p))
  }

  // Planilha principal do grupo
  const principal = planilhas.find((p) => p.dominio === grupoCruz!.principal)

  // Mapa: chave → registro mergeado
  const registros = new Map<string, RegistroMergeado>()

  // Primeiro passa pela planilha principal para criar os registros base
  const todasPlanilhas = principal
    ? [principal, ...planilhas.filter((p) => p !== principal)]
    : planilhas

  for (const planilha of todasPlanilhas) {
    const isPrincipal = planilha.dominio === grupoCruz.principal

    for (const linha of planilha.linhas) {
      // Encontra o valor da chave de join nessa linha
      const chaveValor = planilha.chaveJoin ? linha[planilha.chaveJoin] : null
      if (!chaveValor) continue

      const chaveNorm = normChave(chaveValor)
      if (!chaveNorm) continue

      const campos = normalizarLinha(linha, planilha.headers)

      if (!registros.has(chaveNorm)) {
        // Cria registro base
        registros.set(chaveNorm, {
          chave: chaveNorm,
          dominioPrincipal: grupoCruz.principal,
          campos: {},
          fontes: [],
        })
      }

      const reg = registros.get(chaveNorm)!

      // Merge dos campos — campos do principal têm precedência
      // Campos de sub-planilhas são agrupados por domínio
      if (isPrincipal) {
        // Campos do principal sobrescrevem
        Object.assign(reg.campos, campos)
      } else {
        // Campos de sub-planilhas são agrupados em arrays quando múltiplos
        mergeCamposSubPlanilha(reg.campos, campos, planilha.dominio)
      }

      if (!reg.fontes.includes(planilha.nomeArquivo)) {
        reg.fontes.push(planilha.nomeArquivo)
      }
    }
  }

  return Array.from(registros.values())
}

/** Merge de campos de sub-planilha no registro principal */
function mergeCamposSubPlanilha(
  destino: Record<string, unknown>,
  campos: Record<string, unknown>,
  dominio: DominioImport
): void {
  // Campos que geram arrays (múltiplas linhas por chave)
  const dominiosArray: DominioImport[] = [
    "os_pagamentos",
    "os_servicos",
    "os_situacoes",
    "vendas_produtos",
    "vendas_pagamentos",
    "vendas_historicos",
  ]

  if (dominiosArray.includes(dominio)) {
    // Acumula em array
    const chaveArray = `_array.${dominio}`
    const existente = (destino[chaveArray] as Record<string, unknown>[]) ?? []
    // Remove campos _raw para não poluir o array
    const camposLimpos: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(campos)) {
      if (!k.startsWith("_raw.")) camposLimpos[k] = v
    }
    destino[chaveArray] = [...existente, camposLimpos]
  } else {
    // Enriquece diretamente (ex: equipamentos, endereços)
    for (const [k, v] of Object.entries(campos)) {
      // Não sobrescreve campo já preenchido pelo principal, a não ser que esteja vazio
      if (!destino[k] || String(destino[k]).trim() === "") {
        destino[k] = v
      }
    }
  }
}

/** Planilhas independentes (produtos, financeiro, etc.) */
function mergePlanilhaIndependente(planilha: PlanilhaParseada): RegistroMergeado[] {
  return planilha.linhas.map((linha, idx) => {
    const chaveValor = planilha.chaveJoin ? linha[planilha.chaveJoin] : null
    const chave = chaveValor ? normChave(chaveValor) : `linha-${idx + 1}`
    return {
      chave,
      dominioPrincipal: planilha.dominio,
      campos: normalizarLinha(linha, planilha.headers),
      fontes: [planilha.nomeArquivo],
    }
  })
}

// ── Agrupador principal ──────────────────────────────────────

/**
 * Recebe todas as planilhas parseadas e retorna grupos de registros mergeados
 * organizados por domínio principal.
 */
export function agruparEMerge(
  planilhas: PlanilhaParseada[]
): Map<DominioImport, RegistroMergeado[]> {
  const resultado = new Map<DominioImport, RegistroMergeado[]>()

  // Separa planilhas por grupo de cruzamento
  const planilhasUsadas = new Set<string>()

  for (const grupo of GRUPOS_CRUZAMENTO) {
    const planilhasDoGrupo = planilhas.filter(
      (p) => grupo.dominios.includes(p.dominio) && !planilhasUsadas.has(p.nomeArquivo)
    )
    if (planilhasDoGrupo.length === 0) continue

    planilhasDoGrupo.forEach((p) => planilhasUsadas.add(p.nomeArquivo))

    const registros = mergePlanilhasGrupo(planilhasDoGrupo)
    if (registros.length > 0) {
      resultado.set(grupo.principal, registros)
    }
  }

  // Processa planilhas independentes que não foram usadas
  for (const planilha of planilhas) {
    if (planilhasUsadas.has(planilha.nomeArquivo)) continue
    if (DOMINIOS_INDEPENDENTES.includes(planilha.dominio) || planilha.dominio === "desconhecido") {
      const registros = mergePlanilhaIndependente(planilha)
      const existente = resultado.get(planilha.dominio) ?? []
      resultado.set(planilha.dominio, [...existente, ...registros])
      planilhasUsadas.add(planilha.nomeArquivo)
    }
  }

  return resultado
}

// ── Extratores de campos específicos por domínio ─────────────
// Converte RegistroMergeado em payload pronto para Prisma

export function extrairCamposOS(reg: RegistroMergeado): {
  numero: string
  clienteNome: string
  valorTotal: number
  valorBase: number
  equipamento: string
  defeito: string
  laudoTecnico: string
  status: string
  payload: Record<string, unknown>
} {
  const c = reg.campos

  const clienteNome = String(c["cliente.nome"] ?? c["_raw.Cliente"] ?? "").trim()
  const valorTotal =
    (c["financeiro.valorTotal"] as number | null) ??
    toNumberBr(c["_raw.Total do pedido"]) ??
    toNumberBr(c["_raw.Valor total"]) ??
    0

  // Equipamento: marca + modelo
  const marca = String(c["equipamento.marca"] ?? c["_raw.Marca"] ?? "").trim()
  const modelo = String(c["equipamento.modelo"] ?? c["_raw.Modelo"] ?? "").trim()
  const tipoEquip = String(c["equipamento.tipo"] ?? c["_raw.Equipamento"] ?? "CELULAR").trim()
  const equipamento = [marca, modelo].filter(Boolean).join(" ") || tipoEquip

  const defeito = String(
    c["equipamento.defeito"] ?? c["_raw.Defeitos"] ?? c["_raw.Defeito"] ?? ""
  ).trim()

  const laudoTecnico = String(c["equipamento.laudoTecnico"] ?? c["_raw.Laudo técnico"] ?? "").trim()

  // Status: pega última situação do histórico
  const historico = (c["_array.os_situacoes"] as Record<string, unknown>[] | undefined) ?? []
  const ultimaSituacao = historico.length > 0 ? historico[historico.length - 1] : null
  const statusRaw = String(
    ultimaSituacao?.["status.situacao"] ?? c["status.situacao"] ?? c["_raw.Situação"] ?? "Em aberto"
  ).trim()
  const status = mapearStatusOS(statusRaw)

  // Serviços do array
  const servicosArr = (c["_array.os_servicos"] as Record<string, unknown>[] | undefined) ?? []
  const pagamentosArr = (c["_array.os_pagamentos"] as Record<string, unknown>[] | undefined) ?? []

  const formaPagamento =
    pagamentosArr.length > 0
      ? String(pagamentosArr[0]!["pagamento.forma"] ?? pagamentosArr[0]!["_raw.Forma de pagamento"] ?? "")
      : String(c["pagamento.forma"] ?? "")

  const payload: Record<string, unknown> = {
    numero: reg.chave,
    cliente: {
      nome: clienteNome,
      cpf: String(c["cliente.cpf"] ?? c["cliente.documento"] ?? "").trim(),
      telefone: String(c["cliente.celular"] ?? c["cliente.telefone"] ?? "").trim(),
    },
    aparelho: {
      tipo: tipoEquip,
      marca,
      modelo,
      serie: String(c["equipamento.serie"] ?? c["_raw.Série"] ?? "").trim() || null,
      imei: String(c["equipamento.imei"] ?? "").trim() || null,
      condicoes: String(c["equipamento.condicoes"] ?? c["_raw.Condições"] ?? "").trim() || null,
    },
    acessorios: String(c["equipamento.acessorios"] ?? c["_raw.Acessórios"] ?? "").trim() || null,
    solucao: String(c["equipamento.solucao"] ?? c["_raw.Solução"] ?? "").trim() || null,
    termoGarantia: String(c["equipamento.termoGarantia"] ?? c["_raw.Termos de garantia"] ?? "").trim() || null,
    financeiro: {
      valorTotal,
      valorParcela: pagamentosArr.length > 0
        ? (pagamentosArr[0]!["financeiro.valorParcela"] as number | undefined) ?? valorTotal
        : valorTotal,
      formaPagamento: formaPagamento || null,
      vencimento: pagamentosArr.length > 0
        ? String(pagamentosArr[0]!["pagamento.vencimento"] ?? "")
        : null,
      parcelas: pagamentosArr.map((p) => ({
        valor: p["financeiro.valorParcela"] ?? p["_raw.Valor da parcela"],
        forma: p["pagamento.forma"] ?? p["_raw.Forma de pagamento"],
        vencimento: p["pagamento.vencimento"] ?? p["_raw.Vencimento"],
      })),
    },
    servicos: servicosArr.map((s) => ({
      nome: s["servico.nome"] ?? s["_raw.Serviço"],
      quantidade: s["item.quantidade"] ?? 1,
      valorUnitario: s["financeiro.valorUnitario"] ?? s["_raw.Valor unitário"],
      valorTotal: s["financeiro.valorTotal"] ?? s["_raw.Valor total"],
    })),
    historico: historico.map((h) => ({
      data: h["data.data"] ?? h["_raw.Data"],
      situacao: h["status.situacao"] ?? h["_raw.Situação"],
      observacao: h["financeiro.observacao"] ?? h["_raw.Observação"],
      funcionario: h["meta.funcionario"] ?? h["_raw.Funcionário"],
    })),
    observacoes: String(c["financeiro.observacao"] ?? c["_raw.Observações"] ?? "").trim() || null,
    vendedor: String(c["meta.vendedor"] ?? c["_raw.Vendedor"] ?? "").trim() || null,
    prazoEntrega: String(c["data.prazoEntrega"] ?? c["_raw.Prazo de entrega"] ?? "").trim() || null,
    dataAbertura: String(c["data.abertura"] ?? c["data.data"] ?? c["_raw.Data"] ?? "").trim() || null,
    fontes: reg.fontes,
    importadoEm: new Date().toISOString(),
  }

  return {
    numero: reg.chave,
    clienteNome,
    valorTotal: typeof valorTotal === "number" ? valorTotal : 0,
    valorBase: typeof valorTotal === "number" ? valorTotal : 0,
    equipamento,
    defeito,
    laudoTecnico,
    status,
    payload,
  }
}

function mapearStatusOS(raw: string): string {
  const n = norm(raw)
  if (n.includes("aberto") || n.includes("aberta") || n.includes("em aberto")) return "Aberto"
  if (n.includes("andamento") || n.includes("reparo") || n.includes("analise")) return "EmAnalise"
  if (n.includes("pronto") || n.includes("aguardando retirada") || n.includes("concluido")) return "Pronto"
  if (n.includes("entregue") || n.includes("fechado") || n.includes("finalizado")) return "Entregue"
  return "Aberto"
}

export function extrairCamposCliente(reg: RegistroMergeado): {
  name: string
  document: string
  phone: string | null
  email: string | null
  kind: "PF" | "PJ"
  city: string
  active: boolean
  payload: Record<string, unknown>
} {
  const c = reg.campos
  const tipoPessoa = String(c["cliente.tipoPessoa"] ?? "PF").trim().toUpperCase()
  const cpf = String(c["cliente.cpf"] ?? "").trim()
  const cnpj = String(c["cliente.cnpj"] ?? "").trim()
  const document = String(c["cliente.documento"] ?? (cnpj || cpf) ?? "").trim()
  const ativoRaw = String(c["produto.ativo"] ?? c["_raw.Ativo"] ?? "Sim").trim().toLowerCase()

  return {
    name: String(c["cliente.nome"] ?? c["cliente.razaoSocial"] ?? "").trim(),
    document,
    phone: String(c["cliente.celular"] ?? c["cliente.telefone"] ?? "").trim() || null,
    email: String(c["cliente.email"] ?? "").trim() || null,
    kind: tipoPessoa === "PJ" ? "PJ" : "PF",
    city: String(c["endereco.cidade"] ?? "").trim(),
    active: !["nao", "não", "false", "0", "inativo"].includes(ativoRaw),
    payload: {
      cep: c["endereco.cep"] ?? null,
      logradouro: c["endereco.logradouro"] ?? null,
      numero: c["endereco.numero"] ?? null,
      complemento: c["endereco.complemento"] ?? null,
      bairro: c["endereco.bairro"] ?? null,
      uf: c["endereco.uf"] ?? null,
      rg: c["cliente.rg"] ?? null,
      inscricaoEstadual: c["cliente.inscricaoEstadual"] ?? null,
      nomeFantasia: c["cliente.nomeFantasia"] ?? null,
      nomeSocial: c["cliente.nomeSocial"] ?? null,
      gcCodigo: c["_raw.Codigo"] ?? c["_raw.Código"] ?? null,
    },
  }
}

export function extrairCamposProduto(reg: RegistroMergeado): {
  name: string
  sku: string
  barcode: string | null
  category: string
  cost: number
  price: number
  stock: number
  payload: Record<string, unknown>
} {
  const c = reg.campos
  const custo = (c["financeiro.custo"] as number | null) ?? toNumberBr(c["_raw.Valor de custo"]) ?? 0
  const preco = (c["financeiro.precoVenda"] as number | null) ?? toNumberBr(c["_raw.Valor Varejo"]) ?? 0
  const estoque = (c["produto.estoque"] as number | null) ?? toNumberBr(c["_raw.Estoque atual"]) ?? 0

  return {
    name: String(c["produto.nome"] ?? c["_raw.Produto"] ?? "").trim(),
    sku: String(c["produto.sku"] ?? c["_raw.Codigo"] ?? reg.chave).trim(),
    barcode: String(c["produto.barcode"] ?? c["_raw.Codigo de barra"] ?? "").trim() || null,
    category: String(c["produto.categoria"] ?? c["_raw.Grupo"] ?? "").trim(),
    cost: typeof custo === "number" ? custo : 0,
    price: typeof preco === "number" ? preco : 0,
    stock: typeof estoque === "number" ? Math.max(0, estoque) : 0,
    payload: {
      estoqueMinimo: c["produto.estoqueMinimo"] ?? c["_raw.Estoque minimo"] ?? null,
      estoqueMaximo: c["produto.estoqueMaximo"] ?? c["_raw.Estoque maximo"] ?? null,
      ncm: c["produto.ncm"] ?? c["_raw.Código NCM"] ?? null,
      unidade: c["produto.unidade"] ?? null,
      peso: c["produto.peso"] ?? null,
      observacoes: c["financeiro.observacao"] ?? null,
      ativo: c["produto.ativo"] ?? null,
    },
  }
}

export function extrairCamposContaReceber(reg: RegistroMergeado): {
  descricao: string
  cliente: string
  valor: number
  vencimento: string
  status: string
  numeroDocumento: string
  payload: Record<string, unknown>
} {
  const c = reg.campos
  return {
    descricao: String(c["financeiro.descricao"] ?? c["_raw.Descrição do recebimento"] ?? c["_raw.Histórico"] ?? "").trim(),
    cliente: String(c["financeiro.entidadeNome"] ?? c["_raw.Entidade Nome"] ?? "").trim(),
    valor: Number(c["financeiro.valorTotal"] ?? c["financeiro.valor"] ?? 0) || 0,
    vencimento: String(c["pagamento.vencimento"] ?? c["_raw.Data do vencimento"] ?? "").trim(),
    status: String(c["status.situacao"] ?? c["_raw.Situação"] ?? "").trim(),
    numeroDocumento: String(c["_raw.Número do documento"] ?? "").trim(),
    payload: {
      planoContas: c["financeiro.categoria"] ?? c["_raw.Plano de contas"] ?? null,
      formaPagamento: c["pagamento.forma"] ?? c["_raw.Forma de pagamento"] ?? null,
      observacoes: c["financeiro.observacao"] ?? c["_raw.Observações"] ?? null,
      centroCusto: c["financeiro.centroCusto"] ?? c["_raw.Centro de custo"] ?? null,
      dataConfirmacao: c["pagamento.dataConfirmacao"] ?? c["_raw.Data de confirmação"] ?? null,
      contaBancaria: c["_raw.Conta bancária"] ?? null,
      desconto: c["_raw.Desconto"] ?? null,
      juros: c["_raw.Juros"] ?? null,
      taxaBanco: c["_raw.Taxa do banco"] ?? null,
      taxaOperadora: c["_raw.Taxa da operadora"] ?? null,
      cadastradoPor: c["_raw.Cadastrado por"] ?? null,
      cadastradoEm: c["_raw.Cadastrado em"] ?? null,
      fontes: reg.fontes,
      importadoEm: new Date().toISOString(),
    },
  }
}

export function extrairCamposContaPagar(reg: RegistroMergeado): {
  descricao: string
  fornecedorNome: string
  valor: number
  vencimento: string
  status: string
  numeroDocumento: string
  payload: Record<string, unknown>
} {
  const c = reg.campos
  return {
    descricao: String(c["financeiro.descricao"] ?? c["_raw.Descrição do pagamento"] ?? c["_raw.Descrição do recebimento"] ?? c["_raw.Histórico"] ?? "").trim(),
    fornecedorNome: String(c["financeiro.entidadeNome"] ?? c["_raw.Entidade Nome"] ?? "").trim(),
    valor: Number(c["financeiro.valorTotal"] ?? c["financeiro.valor"] ?? 0) || 0,
    vencimento: String(c["pagamento.vencimento"] ?? c["_raw.Data do vencimento"] ?? "").trim(),
    status: String(c["status.situacao"] ?? c["_raw.Situação"] ?? "").trim(),
    numeroDocumento: String(c["_raw.Número do documento"] ?? "").trim(),
    payload: {
      planoContas: c["financeiro.categoria"] ?? c["_raw.Plano de contas"] ?? null,
      formaPagamento: c["pagamento.forma"] ?? c["_raw.Forma de pagamento"] ?? null,
      observacoes: c["financeiro.observacao"] ?? c["_raw.Observações"] ?? null,
      centroCusto: c["financeiro.centroCusto"] ?? c["_raw.Centro de custo"] ?? null,
      dataConfirmacao: c["pagamento.dataConfirmacao"] ?? c["_raw.Data de confirmação"] ?? null,
      contaBancaria: c["_raw.Conta bancária"] ?? null,
      desconto: c["_raw.Desconto"] ?? null,
      juros: c["_raw.Juros"] ?? null,
      taxaBanco: c["_raw.Taxa do banco"] ?? null,
      taxaOperadora: c["_raw.Taxa da operadora"] ?? null,
      cadastradoPor: c["_raw.Cadastrado por"] ?? null,
      cadastradoEm: c["_raw.Cadastrado em"] ?? null,
      fontes: reg.fontes,
      importadoEm: new Date().toISOString(),
    },
  }
}

// Suprime warning de unused — extrairValorPorSemantica é utilitário interno disponível
void extrairValorPorSemantica
