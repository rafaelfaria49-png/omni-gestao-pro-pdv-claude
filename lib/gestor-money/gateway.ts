import {
  CONTA_PARA_TIPO_G002,
  GESTOR_MONEY_BASE,
  GESTOR_MONEY_CURRENCY,
  GESTOR_MONEY_TIMEZONE,
  criarCartaoInputSchema,
  criarCategoriaInputSchema,
  criarContaInputSchema,
  pagarDividaInputSchema,
  pagarFaturaInputSchema,
  registrarCompraCartaoInputSchema,
  registrarDespesaInputSchema,
  registrarDividaInputSchema,
  registrarReceitaInputSchema,
  transferirInputSchema,
  type AssistenteWhatsAppConfig,
  type ConsultaFinanceiraSnapshot,
  type CriarCartaoInput,
  type CriarCategoriaInput,
  type CriarContaInput,
  type DocumentoComprovante,
  type EvolucaoMensalPonto,
  type FinanceiroPerfilSeletor,
  type GastoPorCategoriaResumo,
  type IntegrationContractStatus,
  type IntegrationReadiness,
  type OperacaoFeedback,
  type PagarDividaInput,
  type PagarFaturaInput,
  type PerfilResumo,
  type ProximoVencimentoItem,
  type RegistrarCompraCartaoInput,
  type RegistrarDespesaInput,
  type RegistrarDividaInput,
  type RegistrarReceitaInput,
  type TipoPerfilFinanceiro,
  type TransferirInput,
} from "./contracts"
import {
  diasEntreDatasCivil,
  hojeSaoPaulo,
  normalizarNomeCategoria,
  parseBigIntCentavos,
  percentualCentavos,
  somarCentavos,
  subtrairCentavos,
} from "./money"
import {
  createSyntheticCompanyState,
  createSyntheticPersonalState,
  type PerfilSyntheticState,
} from "./synthetic-dataset"

export interface GestorMoneyGateway {
  readonly mode: "real" | "synthetic"
  obterReadiness(): Promise<IntegrationReadiness>
  listarPerfis(): Promise<PerfilResumo[]>
  obterSnapshot(
    seletor: FinanceiroPerfilSeletor,
    periodo?: { dataInicio?: string; dataFim?: string }
  ): Promise<ConsultaFinanceiraSnapshot | null>
  obterAssistenteConfig(seletor: FinanceiroPerfilSeletor): Promise<AssistenteWhatsAppConfig>
  salvarPreferenciasAssistente(
    seletor: FinanceiroPerfilSeletor,
    prefs: Pick<AssistenteWhatsAppConfig, "preferenciasConfirmacao" | "notificacoes">
  ): Promise<OperacaoFeedback>
  registrarDespesa(seletor: FinanceiroPerfilSeletor, input: RegistrarDespesaInput): Promise<OperacaoFeedback>
  registrarReceita(seletor: FinanceiroPerfilSeletor, input: RegistrarReceitaInput): Promise<OperacaoFeedback>
  registrarDivida(seletor: FinanceiroPerfilSeletor, input: RegistrarDividaInput): Promise<OperacaoFeedback>
  pagarDivida(seletor: FinanceiroPerfilSeletor, input: PagarDividaInput): Promise<OperacaoFeedback>
  transferir(seletor: FinanceiroPerfilSeletor, input: TransferirInput): Promise<OperacaoFeedback>
  criarConta(seletor: FinanceiroPerfilSeletor, input: CriarContaInput): Promise<OperacaoFeedback>
  alternarContaAtiva(
    seletor: FinanceiroPerfilSeletor,
    contaId: string,
    ativo: boolean
  ): Promise<OperacaoFeedback>
  criarCategoria(seletor: FinanceiroPerfilSeletor, input: CriarCategoriaInput): Promise<OperacaoFeedback>
  alternarCategoriaAtiva(
    seletor: FinanceiroPerfilSeletor,
    categoriaId: string,
    ativo: boolean
  ): Promise<OperacaoFeedback>
  criarCartao(seletor: FinanceiroPerfilSeletor, input: CriarCartaoInput): Promise<OperacaoFeedback>
  registrarCompraCartao(
    seletor: FinanceiroPerfilSeletor,
    input: RegistrarCompraCartaoInput
  ): Promise<OperacaoFeedback>
  pagarFatura(seletor: FinanceiroPerfilSeletor, input: PagarFaturaInput): Promise<OperacaoFeedback>
}

export class GestorMoneyBoundaryError extends Error {
  constructor(
    public readonly code: string,
    message: string
  ) {
    super(message)
    this.name = "GestorMoneyBoundaryError"
  }
}

export const CONTRATOS_FUNDACAO_PADRAO: IntegrationContractStatus[] = [
  {
    id: "G001",
    nome: "Perfis & Autorização (PESSOAL sem storeId / EMPRESA com storeId)",
    disponivelNoRuntime: false,
    origem: "PR #405 · lib/gastos/access.ts + types.ts",
    detalhe: "Aguardando merge da PR #405 para emissão de contexto opaco no servidor.",
  },
  {
    id: "G002",
    nome: "Writers de Contas, Categorias e Fornecedores",
    disponivelNoRuntime: false,
    origem: "PR #405 · lib/gastos/contas.ts + categorias.ts",
    detalhe: "Persistência isolada por perfilId; sem loja fictícia para PESSOAL.",
  },
  {
    id: "G003",
    nome: "Readers & Comprovantes Privados",
    disponivelNoRuntime: false,
    origem: "PR #405 · lib/gastos/documentos.ts + read-scope.ts",
    detalhe: "Validação MIME/bytes e bucket privado por perfil.",
  },
  {
    id: "G004",
    nome: "Operações Atômicas (Gastos, Títulos, Cartões e Faturas)",
    disponivelNoRuntime: false,
    origem: "PR #405 · app/api/financeiro/pagar/operacoes/route.ts",
    detalhe: "Rota HTTP responde 404 enquanto GESTOR_MONEY_ENABLED !== 'true'.",
  },
  {
    id: "G005",
    nome: "Consultas Consolidadas (CAIXA_REALIZADO / Centavos)",
    disponivelNoRuntime: false,
    origem: "PR #405 · lib/gastos/query.ts",
    detalhe: "Snapshot Read-Only RepeatableRead com totais por categoria, conta e comparativos.",
  },
  {
    id: "G006",
    nome: "Canais, Fila e Outbox WhatsApp GESTAO",
    disponivelNoRuntime: false,
    origem: "PR #405 · lib/gastos/channels.ts + worker.ts",
    detalhe: "Fundação de fila pronta na #405; sem rota pública de ingresso.",
  },
  {
    id: "G007",
    nome: "Vínculo de Telefone WhatsApp & Webhook Oficial",
    disponivelNoRuntime: false,
    origem: "Próximo milestone após PR #405",
    detalhe: "Necessário para ativar pareamento real do assistente WhatsApp.",
  },
]

function buildSnapshotFromState(
  state: PerfilSyntheticState,
  periodo?: { dataInicio?: string; dataFim?: string }
): ConsultaFinanceiraSnapshot {
  const hoje = hojeSaoPaulo()
  const mesAtual = hoje.slice(0, 7)
  const dataInicio = periodo?.dataInicio || `${mesAtual}-01`
  const dataFim = periodo?.dataFim || hoje

  // G005: saldo consolidado considera contas ativas excluindo tipo crédito
  const saldoDisponivelCentavos = somarCentavos(
    state.contas.filter((c) => c.ativo && c.tipoG002 !== "credito").map((c) => c.saldoCentavos)
  )

  const eventosPeriodo = state.eventos.filter(
    (ev) => !ev.transferencia && ev.dia >= dataInicio && ev.dia <= dataFim
  )
  const receitasCentavos = somarCentavos(eventosPeriodo.map((e) => e.receitaCentavos))
  const despesasCentavos = somarCentavos(eventosPeriodo.map((e) => e.despesaCentavos))
  const resultadoCentavos = subtrairCentavos(receitasCentavos, despesasCentavos)

  const dividasAbertasCentavos = somarCentavos(
    state.dividas.filter((d) => d.status !== "quitada").map((d) => d.saldoRestanteCentavos)
  )
  const contasPagarCentavos = somarCentavos(
    state.pagar.filter((t) => t.status !== "pago" && t.status !== "cancelado").map((t) => t.restanteCentavos)
  )
  const contasReceberCentavos = somarCentavos(
    state.receber.filter((t) => t.status !== "pago" && t.status !== "cancelado").map((t) => t.restanteCentavos)
  )

  // Atualiza totais por categoria no período
  const categoriasAtualizadas = state.categorias.map((cat) => {
    const movs = eventosPeriodo.filter((e) => e.categoriaId === cat.id)
    const total =
      cat.natureza === "DESPESA"
        ? somarCentavos(movs.map((m) => m.despesaCentavos))
        : somarCentavos(movs.map((m) => m.receitaCentavos))
    return {
      ...cat,
      totalPeriodoCentavos: total,
      quantidadeRegistros: movs.length,
    }
  })

  // Gastos por categoria para gráfico e ranking
  const gastosPorCategoria: GastoPorCategoriaResumo[] = categoriasAtualizadas
    .filter((c) => c.natureza === "DESPESA" && parseBigIntCentavos(c.totalPeriodoCentavos) > BigInt(0))
    .map((c) => ({
      categoriaId: c.id,
      categoria: c.nome,
      cor: c.cor,
      despesaCentavos: c.totalPeriodoCentavos,
      receitaCentavos: "0",
      quantidade: c.quantidadeRegistros,
      participacaoPercentual: percentualCentavos(c.totalPeriodoCentavos, despesasCentavos),
    }))
    .sort((a, b) => Number(parseBigIntCentavos(b.despesaCentavos) - parseBigIntCentavos(a.despesaCentavos)))

  // Evolução mensal (5 meses históricos + mês atual dinâmico)
  const mesAtualLabel = `${["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"][Number(mesAtual.slice(5, 7)) - 1] ?? mesAtual.slice(5, 7)}/${mesAtual.slice(2, 4)}`
  const eventosMesAtual = state.eventos.filter((e) => !e.transferencia && e.dia.startsWith(mesAtual))
  const recMesAtual = somarCentavos(eventosMesAtual.map((e) => e.receitaCentavos))
  const despMesAtual = somarCentavos(eventosMesAtual.map((e) => e.despesaCentavos))
  const pontoAtual: EvolucaoMensalPonto = {
    mes: mesAtual,
    label: mesAtualLabel,
    receitaCentavos: recMesAtual,
    despesaCentavos: despMesAtual,
    resultadoCentavos: subtrairCentavos(recMesAtual, despMesAtual),
  }
  const evolucaoMensal = [...state.evolucaoHistorica.filter((p) => p.mes !== mesAtual), pontoAtual]
  const ultimoHistorico = state.evolucaoHistorica[state.evolucaoHistorica.length - 1]

  // Próximos vencimentos consolidando contas a pagar, dívidas ativas e faturas abertas
  const proximosVencimentos: ProximoVencimentoItem[] = []
  for (const t of state.pagar) {
    if (t.status === "pago" || t.status === "cancelado") continue
    const dias = diasEntreDatasCivil(hoje, t.vencimento)
    proximosVencimentos.push({
      id: t.id,
      origem: "PAGAR",
      titulo: t.descricao,
      contraparte: t.contraparte,
      vencimento: t.vencimento,
      valorCentavos: t.restanteCentavos,
      diasRestantes: dias,
      vencido: dias < 0,
      status: dias < 0 ? "vencido" : t.status,
    })
  }
  for (const d of state.dividas) {
    if (d.status === "quitada") continue
    const dias = diasEntreDatasCivil(hoje, d.vencimento)
    proximosVencimentos.push({
      id: d.id,
      origem: "DIVIDA",
      titulo: `${d.descricao} (${d.parcelasPagas}/${d.parcelasTotal})`,
      contraparte: d.credor,
      vencimento: d.vencimento,
      valorCentavos: d.saldoRestanteCentavos,
      diasRestantes: dias,
      vencido: dias < 0,
      status: d.status,
    })
  }
  for (const c of state.cartoes) {
    const faturaAberta = c.ciclos.find((ci) => ci.status === "aberta" || ci.status === "fechada")
    if (faturaAberta && parseBigIntCentavos(faturaAberta.restanteCentavos) > BigInt(0)) {
      const dias = diasEntreDatasCivil(hoje, faturaAberta.vencimento)
      proximosVencimentos.push({
        id: faturaAberta.id,
        origem: "FATURA",
        titulo: `Fatura ${c.nome} •••• ${c.ultimos4}`,
        contraparte: c.bandeira,
        vencimento: faturaAberta.vencimento,
        valorCentavos: faturaAberta.restanteCentavos,
        diasRestantes: dias,
        vencido: dias < 0,
        status: faturaAberta.status,
      })
    }
  }
  proximosVencimentos.sort((a, b) => a.diasRestantes - b.diasRestantes)

  return {
    proveniencia: "SINTETICO_ISOLADO",
    base: GESTOR_MONEY_BASE,
    moeda: GESTOR_MONEY_CURRENCY,
    timezone: GESTOR_MONEY_TIMEZONE,
    asOf: new Date().toISOString(),
    perfil: state.perfil,
    periodo: { dataInicio, dataFim },
    saldoDisponivelCentavos,
    receitasCentavos,
    despesasCentavos,
    resultadoCentavos,
    dividasAbertasCentavos,
    contasPagarCentavos,
    contasReceberCentavos,
    quantidadeRegistros: eventosPeriodo.length,
    proximosVencimentos,
    evolucaoMensal,
    gastosPorCategoria,
    comparativos: {
      criterio: "CALENDARIO_ATUAL_VS_ANTERIOR_COMPLETO",
      receitaMesAtualCentavos: recMesAtual,
      receitaMesAnteriorCentavos: ultimoHistorico?.receitaCentavos ?? "0",
      despesaMesAtualCentavos: despMesAtual,
      despesaMesAnteriorCentavos: ultimoHistorico?.despesaCentavos ?? "0",
      receitaAnoAtualCentavos: somarCentavos(evolucaoMensal.map((m) => m.receitaCentavos)),
      receitaAnoAnteriorCentavos: "0",
    },
    contas: state.contas.map((c) => ({ ...c })),
    pagar: state.pagar.map((t) => ({ ...t })),
    receber: state.receber.map((t) => ({ ...t })),
    dividas: state.dividas.map((d) => ({ ...d, historico: [...d.historico] })),
    cartoes: state.cartoes.map((c) => ({
      ...c,
      ciclos: [...c.ciclos],
      comprasParceladas: [...c.comprasParceladas],
      historico: [...c.historico],
    })),
    categorias: categoriasAtualizadas,
    eventos: [...state.eventos].sort((a, b) => (a.ocorridoEm < b.ocorridoEm ? 1 : -1)),
    documentos: [...state.documentos],
  }
}

/**
 * Fronteira isolada para ambiente de validação UI com dados sintéticos.
 * Mantém isolamento absoluto entre PESSOAL e EMPRESA (G001).
 */
export function createSyntheticGestorMoneyGateway(): GestorMoneyGateway {
  const states: Record<TipoPerfilFinanceiro, PerfilSyntheticState> = {
    PESSOAL: createSyntheticPersonalState(),
    EMPRESA: createSyntheticCompanyState(),
  }
  let seq = 100
  const nextId = (prefix: string) => `${prefix}-${++seq}`

  function resolveState(seletor: FinanceiroPerfilSeletor): PerfilSyntheticState {
    if (seletor.tipo === "PESSOAL") {
      if ("storeId" in seletor && seletor.storeId !== undefined) {
        throw new GestorMoneyBoundaryError(
          "escopo_invalido_g001",
          "Perfil PESSOAL não pode receber storeId."
        )
      }
      const st = states.PESSOAL
      if (st.perfil.perfilId !== seletor.perfilId) {
        throw new GestorMoneyBoundaryError("perfil_nao_autorizado", "Perfil pessoal inválido.")
      }
      return st
    }
    const st = states.EMPRESA
    if (
      st.perfil.tipo !== "EMPRESA" ||
      st.perfil.perfilId !== seletor.perfilId ||
      st.perfil.storeId !== seletor.storeId
    ) {
      throw new GestorMoneyBoundaryError(
        "perfil_empresa_nao_autorizado",
        "Perfil empresarial exige storeId real correspondente."
      )
    }
    return st
  }

  function anexarDocumentoSePresente(
    st: PerfilSyntheticState,
    comprovante: { nomeArquivo: string; mime: DocumentoComprovante["mime"]; bytes: number } | undefined,
    alvoTipo: DocumentoComprovante["alvoTipo"],
    alvoId: string
  ): string | undefined {
    if (!comprovante) return undefined
    const docId = nextId("doc-sint")
    st.documentos.unshift({
      id: docId,
      perfilId: st.perfil.perfilId,
      nomeArquivo: comprovante.nomeArquivo,
      mime: comprovante.mime,
      bytes: comprovante.bytes,
      estado: "RETIDO",
      criadoEm: new Date().toISOString(),
      alvoTipo,
      alvoId,
    })
    return docId
  }

  return {
    mode: "synthetic",

    async obterReadiness(): Promise<IntegrationReadiness> {
      return {
        mode: "synthetic",
        state: "FOUNDATION_PENDING_PR405",
        moduleEnabled: false,
        foundationMerged: false,
        mensagem:
          "Ambiente isolado de validação (dados sintéticos). A fundação real G001–G006 está em reconciliação na PR #405.",
        contratos: CONTRATOS_FUNDACAO_PADRAO,
      }
    },

    async listarPerfis(): Promise<PerfilResumo[]> {
      return [states.PESSOAL.perfil, states.EMPRESA.perfil]
    },

    async obterSnapshot(seletor, periodo) {
      const st = resolveState(seletor)
      return buildSnapshotFromState(st, periodo)
    },

    async obterAssistenteConfig(seletor) {
      const st = resolveState(seletor)
      return {
        ...st.assistente,
        preferenciasConfirmacao: { ...st.assistente.preferenciasConfirmacao },
        notificacoes: { ...st.assistente.notificacoes },
        dependenciasPendentes: [...st.assistente.dependenciasPendentes],
      }
    },

    async salvarPreferenciasAssistente(seletor, prefs) {
      const st = resolveState(seletor)
      st.assistente = {
        ...st.assistente,
        preferenciasConfirmacao: { ...prefs.preferenciasConfirmacao },
        notificacoes: { ...prefs.notificacoes },
      }
      return {
        ok: true,
        operacaoId: nextId("op-assist"),
        contratoG004: "PREFERENCIAS_ASSISTENTE_SANDBOX",
        mensagem: "Preferências salvas no ambiente isolado (persistência real aguarda G007).",
      }
    },

    async registrarDespesa(seletor, raw) {
      const st = resolveState(seletor)
      const parsed = registrarDespesaInputSchema.safeParse(raw)
      if (!parsed.success) {
        throw new GestorMoneyBoundaryError("validacao_despesa", parsed.error.issues[0]?.message ?? "Dados inválidos.")
      }
      const p = parsed.data
      const conta = st.contas.find((c) => c.id === p.carteiraId && c.ativo)
      if (!conta) throw new GestorMoneyBoundaryError("conta_indisponivel", "Conta selecionada não encontrada ou inativa.")
      const categoria = st.categorias.find((c) => c.id === p.categoriaId && c.ativo)
      if (!categoria) throw new GestorMoneyBoundaryError("categoria_indisponivel", "Categoria não encontrada.")

      const opId = nextId("op-desp")
      if (p.pagoAgora) {
        const movId = nextId("mov")
        const docId = anexarDocumentoSePresente(st, p.comprovante, "MOVIMENTACAO", movId)
        conta.saldoCentavos = subtrairCentavos(conta.saldoCentavos, p.valorCentavos)
        conta.saidasCentavos = somarCentavos([conta.saidasCentavos, p.valorCentavos])
        conta.quantidadeMovimentos += 1
        conta.updatedAt = new Date().toISOString()

        st.eventos.unshift({
          id: nextId("ev"),
          movimentoId: movId,
          carteiraId: conta.id,
          carteiraNome: conta.nome,
          categoriaId: categoria.id,
          categoria: categoria.nome,
          descricao: p.descricao,
          contraparte: p.contraparte || "",
          origem: "GASTO_PAGO",
          dia: p.dataGasto,
          ocorridoEm: `${p.dataGasto}T12:00:00.000Z`,
          tipo: "saida",
          valorCentavos: p.valorCentavos,
          transferencia: false,
          despesaCentavos: p.valorCentavos,
          receitaCentavos: "0",
          formaPagamento: p.formaPagamento,
          documentoId: docId,
        })
        return {
          ok: true,
          operacaoId: opId,
          contratoG004: "GASTO_PAGO",
          mensagem: "Despesa registrada e debitada da conta selecionada.",
        }
      }

      const tituloId = nextId("pag")
      const docId = anexarDocumentoSePresente(st, p.comprovante, "PAGAR", tituloId)
      st.pagar.unshift({
        id: tituloId,
        natureza: "PAGAR",
        descricao: p.descricao,
        contraparte: p.contraparte || "Não informado",
        categoriaId: categoria.id,
        categoriaNome: categoria.nome,
        carteiraId: conta.id,
        valorCentavos: p.valorCentavos,
        pagoCentavos: "0",
        restanteCentavos: p.valorCentavos,
        vencimento: p.vencimento || p.dataGasto,
        status: "aberto",
        documentoIds: docId ? [docId] : [],
        createdAt: new Date().toISOString(),
      })
      return {
        ok: true,
        operacaoId: opId,
        contratoG004: "CONTA_PAGAR",
        mensagem: "Despesa agendada em Contas a Pagar.",
      }
    },

    async registrarReceita(seletor, raw) {
      const st = resolveState(seletor)
      const parsed = registrarReceitaInputSchema.safeParse(raw)
      if (!parsed.success) {
        throw new GestorMoneyBoundaryError("validacao_receita", parsed.error.issues[0]?.message ?? "Dados inválidos.")
      }
      const p = parsed.data
      const conta = st.contas.find((c) => c.id === p.carteiraId && c.ativo)
      if (!conta) throw new GestorMoneyBoundaryError("conta_indisponivel", "Conta selecionada não encontrada.")
      const categoria = st.categorias.find((c) => c.id === p.categoriaId && c.ativo)
      if (!categoria) throw new GestorMoneyBoundaryError("categoria_indisponivel", "Categoria não encontrada.")

      const opId = nextId("op-rec")
      if (p.recebidoAgora) {
        const movId = nextId("mov")
        const docId = anexarDocumentoSePresente(st, p.comprovante, "MOVIMENTACAO", movId)
        conta.saldoCentavos = somarCentavos([conta.saldoCentavos, p.valorCentavos])
        conta.entradasCentavos = somarCentavos([conta.entradasCentavos, p.valorCentavos])
        conta.quantidadeMovimentos += 1
        conta.updatedAt = new Date().toISOString()

        st.eventos.unshift({
          id: nextId("ev"),
          movimentoId: movId,
          carteiraId: conta.id,
          carteiraNome: conta.nome,
          categoriaId: categoria.id,
          categoria: categoria.nome,
          descricao: p.descricao,
          contraparte: p.contraparte || "",
          origem: "RECEITA_RECEBIDA",
          dia: p.dataRecebimento,
          ocorridoEm: `${p.dataRecebimento}T12:00:00.000Z`,
          tipo: "entrada",
          valorCentavos: p.valorCentavos,
          transferencia: false,
          despesaCentavos: "0",
          receitaCentavos: p.valorCentavos,
          formaPagamento: p.formaPagamento,
          documentoId: docId,
        })
        return {
          ok: true,
          operacaoId: opId,
          contratoG004: "RECEITA_RECEBIDA",
          mensagem: "Receita registrada e creditada na conta selecionada.",
        }
      }

      const tituloId = nextId("rec")
      const docId = anexarDocumentoSePresente(st, p.comprovante, "RECEBER", tituloId)
      st.receber.unshift({
        id: tituloId,
        natureza: "RECEBER",
        descricao: p.descricao,
        contraparte: p.contraparte || "Não informado",
        categoriaId: categoria.id,
        categoriaNome: categoria.nome,
        carteiraId: conta.id,
        valorCentavos: p.valorCentavos,
        pagoCentavos: "0",
        restanteCentavos: p.valorCentavos,
        vencimento: p.vencimento || p.dataRecebimento,
        status: "aberto",
        documentoIds: docId ? [docId] : [],
        createdAt: new Date().toISOString(),
      })
      return {
        ok: true,
        operacaoId: opId,
        contratoG004: "CONTA_RECEBER",
        mensagem: "Receita prevista adicionada em Contas a Receber.",
      }
    },

    async registrarDivida(seletor, raw) {
      const st = resolveState(seletor)
      const parsed = registrarDividaInputSchema.safeParse(raw)
      if (!parsed.success) {
        throw new GestorMoneyBoundaryError("validacao_divida", parsed.error.issues[0]?.message ?? "Dados inválidos.")
      }
      const p = parsed.data
      const categoria = st.categorias.find((c) => c.id === p.categoriaId)
      const divId = nextId("div")
      const docId = anexarDocumentoSePresente(st, p.comprovante, "PAGAR", divId)
      const hoje = hojeSaoPaulo()
      const vencida = diasEntreDatasCivil(hoje, p.vencimento) < 0

      st.dividas.unshift({
        id: divId,
        perfilId: st.perfil.perfilId,
        credor: p.credor,
        descricao: p.descricao,
        categoriaId: categoria?.id ?? null,
        categoriaNome: categoria?.nome ?? "Sem categoria",
        valorOriginalCentavos: p.valorOriginalCentavos,
        valorPagoCentavos: "0",
        saldoRestanteCentavos: p.valorOriginalCentavos,
        vencimento: p.vencimento,
        parcelasPagas: 0,
        parcelasTotal: p.parcelasTotal,
        status: vencida ? "vencida" : "aberta",
        observacao: p.observacao,
        createdAt: new Date().toISOString(),
        historico: [
          {
            id: nextId("hd"),
            tipo: "CRIACAO",
            valorCentavos: p.valorOriginalCentavos,
            dataPagamento: hoje,
            observacao: p.observacao || `Dívida registrada em ${p.parcelasTotal}x`,
            documentoId: docId,
          },
        ],
      })
      return {
        ok: true,
        operacaoId: nextId("op-div"),
        contratoG004: "CONTA_PAGAR",
        mensagem: "Dívida cadastrada com acompanhamento de parcelas e histórico.",
      }
    },

    async pagarDivida(seletor, raw) {
      const st = resolveState(seletor)
      const parsed = pagarDividaInputSchema.safeParse(raw)
      if (!parsed.success) {
        throw new GestorMoneyBoundaryError("validacao_pagamento", parsed.error.issues[0]?.message ?? "Dados inválidos.")
      }
      const p = parsed.data
      const divida = st.dividas.find((d) => d.id === p.dividaId)
      if (!divida || divida.status === "quitada") {
        throw new GestorMoneyBoundaryError("divida_indisponivel", "Dívida não encontrada ou já quitada.")
      }
      const conta = st.contas.find((c) => c.id === p.carteiraId && c.ativo)
      if (!conta) throw new GestorMoneyBoundaryError("conta_indisponivel", "Conta de saída não encontrada.")

      const restante = parseBigIntCentavos(divida.saldoRestanteCentavos)
      const valorPagar = p.quitar ? restante : parseBigIntCentavos(p.valorCentavos)
      if (valorPagar <= BigInt(0) || valorPagar > restante) {
        throw new GestorMoneyBoundaryError(
          "valor_pagamento_invalido",
          "O valor do pagamento deve ser positivo e não pode ultrapassar o saldo restante."
        )
      }

      const movId = nextId("mov")
      const docId = anexarDocumentoSePresente(st, p.comprovante, "PAGAR", divida.id)

      const novoRestante = restante - valorPagar
      divida.valorPagoCentavos = (parseBigIntCentavos(divida.valorPagoCentavos) + valorPagar).toString()
      divida.saldoRestanteCentavos = novoRestante.toString()
      if (novoRestante === BigInt(0)) {
        divida.status = "quitada"
        divida.parcelasPagas = divida.parcelasTotal
      } else {
        divida.status = "parcial"
        divida.parcelasPagas = Math.min(divida.parcelasTotal - 1, divida.parcelasPagas + 1)
      }

      divida.historico.push({
        id: nextId("hd"),
        tipo: novoRestante === BigInt(0) ? "QUITACAO" : "PAGAMENTO_PARCIAL",
        valorCentavos: valorPagar.toString(),
        dataPagamento: p.dataPagamento,
        formaPagamento: p.formaPagamento,
        carteiraId: conta.id,
        carteiraNome: conta.nome,
        observacao: p.observacao || (novoRestante === BigInt(0) ? "Quitação integral" : "Pagamento parcial"),
        documentoId: docId,
      })

      conta.saldoCentavos = subtrairCentavos(conta.saldoCentavos, valorPagar)
      conta.saidasCentavos = somarCentavos([conta.saidasCentavos, valorPagar])
      conta.quantidadeMovimentos += 1
      conta.updatedAt = new Date().toISOString()

      st.eventos.unshift({
        id: nextId("ev"),
        movimentoId: movId,
        carteiraId: conta.id,
        carteiraNome: conta.nome,
        categoriaId: divida.categoriaId,
        categoria: divida.categoriaNome,
        descricao: `${novoRestante === BigInt(0) ? "Quitação" : "Pagamento parcial"} · ${divida.descricao}`,
        contraparte: divida.credor,
        origem: "PAGAR_TITULO",
        dia: p.dataPagamento,
        ocorridoEm: `${p.dataPagamento}T12:00:00.000Z`,
        tipo: "saida",
        valorCentavos: valorPagar.toString(),
        transferencia: false,
        despesaCentavos: valorPagar.toString(),
        receitaCentavos: "0",
        formaPagamento: p.formaPagamento,
        documentoId: docId,
      })

      return {
        ok: true,
        operacaoId: nextId("op-pag"),
        contratoG004: "PAGAR_TITULO",
        mensagem:
          novoRestante === BigInt(0)
            ? `Dívida com ${divida.credor} quitada integralmente.`
            : "Pagamento parcial registrado no histórico da dívida.",
      }
    },

    async transferir(seletor, raw) {
      const st = resolveState(seletor)
      const parsed = transferirInputSchema.safeParse(raw)
      if (!parsed.success) {
        throw new GestorMoneyBoundaryError("validacao_transferencia", parsed.error.issues[0]?.message ?? "Dados inválidos.")
      }
      const p = parsed.data
      const origem = st.contas.find((c) => c.id === p.carteiraOrigemId && c.ativo)
      const destino = st.contas.find((c) => c.id === p.carteiraDestinoId && c.ativo)
      if (!origem || !destino) {
        throw new GestorMoneyBoundaryError("conta_indisponivel", "Contas de origem e destino devem pertencer ao mesmo perfil ativo.")
      }

      const movOut = nextId("mov")
      const movIn = nextId("mov")
      const docId = anexarDocumentoSePresente(st, p.comprovante, "MOVIMENTACAO", movOut)

      origem.saldoCentavos = subtrairCentavos(origem.saldoCentavos, p.valorCentavos)
      origem.saidasCentavos = somarCentavos([origem.saidasCentavos, p.valorCentavos])
      origem.quantidadeMovimentos += 1
      destino.saldoCentavos = somarCentavos([destino.saldoCentavos, p.valorCentavos])
      destino.entradasCentavos = somarCentavos([destino.entradasCentavos, p.valorCentavos])
      destino.quantidadeMovimentos += 1

      // G005: transferência interna NÃO infla receita nem despesa
      st.eventos.unshift(
        {
          id: nextId("ev"),
          movimentoId: movOut,
          carteiraId: origem.id,
          carteiraNome: origem.nome,
          categoriaId: null,
          categoria: "Transferência interna",
          descricao: `${p.descricao} → ${destino.nome}`,
          contraparte: destino.nome,
          origem: "TRANSFERENCIA_INTERNA",
          dia: p.dataTransferencia,
          ocorridoEm: `${p.dataTransferencia}T12:00:00.000Z`,
          tipo: "saida",
          valorCentavos: p.valorCentavos,
          transferencia: true,
          despesaCentavos: "0",
          receitaCentavos: "0",
          formaPagamento: "transferencia",
          documentoId: docId,
        },
        {
          id: nextId("ev"),
          movimentoId: movIn,
          carteiraId: destino.id,
          carteiraNome: destino.nome,
          categoriaId: null,
          categoria: "Transferência interna",
          descricao: `${p.descricao} ← ${origem.nome}`,
          contraparte: origem.nome,
          origem: "TRANSFERENCIA_INTERNA",
          dia: p.dataTransferencia,
          ocorridoEm: `${p.dataTransferencia}T12:00:01.000Z`,
          tipo: "entrada",
          valorCentavos: p.valorCentavos,
          transferencia: true,
          despesaCentavos: "0",
          receitaCentavos: "0",
          formaPagamento: "transferencia",
          documentoId: docId,
        }
      )

      return {
        ok: true,
        operacaoId: nextId("op-transf"),
        contratoG004: "TRANSFERENCIA_INTERNA",
        mensagem: `Transferência realizada de ${origem.nome} para ${destino.nome} sem duplicar despesas.`,
      }
    },

    async criarConta(seletor, raw) {
      const st = resolveState(seletor)
      const parsed = criarContaInputSchema.safeParse(raw)
      if (!parsed.success) {
        throw new GestorMoneyBoundaryError("validacao_conta", parsed.error.issues[0]?.message ?? "Dados inválidos.")
      }
      const p = parsed.data
      const colors: Record<string, string> = {
        dinheiro: "#10b981",
        banco: "#3b82f6",
        pix: "#8b5cf6",
        carteira_digital: "#0ea5e9",
        caixa: "#f59e0b",
        investimento: "#6366f1",
      }
      const now = new Date().toISOString()
      st.contas.push({
        id: nextId("conta"),
        perfilId: st.perfil.perfilId,
        tipoPerfil: st.perfil.tipo,
        storeId: st.perfil.tipo === "EMPRESA" ? st.perfil.storeId : null,
        nome: p.nome,
        tipo: p.tipo,
        tipoG002: CONTA_PARA_TIPO_G002[p.tipo],
        instituicao: p.instituicao || null,
        identificadorInstrumento: p.identificadorInstrumento || null,
        cor: colors[p.tipo] ?? "#6366f1",
        ativo: true,
        saldoInicialCentavos: p.saldoInicialCentavos,
        saldoCentavos: p.saldoInicialCentavos,
        entradasCentavos: "0",
        saidasCentavos: "0",
        quantidadeMovimentos: 0,
        createdAt: now,
        updatedAt: now,
      })
      return {
        ok: true,
        operacaoId: nextId("op-conta"),
        contratoG004: "G002_CONTA_CRIAR",
        mensagem: `Conta "${p.nome}" adicionada ao perfil ${st.perfil.tipo}.`,
      }
    },

    async alternarContaAtiva(seletor, contaId, ativo) {
      const st = resolveState(seletor)
      const conta = st.contas.find((c) => c.id === contaId)
      if (!conta) throw new GestorMoneyBoundaryError("conta_nao_encontrada", "Conta não encontrada.")
      conta.ativo = ativo
      conta.updatedAt = new Date().toISOString()
      return {
        ok: true,
        operacaoId: nextId("op-conta-status"),
        contratoG004: "G002_CONTA_ATIVAR",
        mensagem: ativo ? `Conta "${conta.nome}" reativada.` : `Conta "${conta.nome}" arquivada.`,
      }
    },

    async criarCategoria(seletor, raw) {
      const st = resolveState(seletor)
      const parsed = criarCategoriaInputSchema.safeParse(raw)
      if (!parsed.success) {
        throw new GestorMoneyBoundaryError("validacao_categoria", parsed.error.issues[0]?.message ?? "Dados inválidos.")
      }
      const p = parsed.data
      const norm = normalizarNomeCategoria(p.nome)
      const existente = st.categorias.find(
        (c) => c.nomeNormalizado === norm && c.natureza === p.natureza
      )
      if (existente) {
        throw new GestorMoneyBoundaryError(
          "categoria_duplicada",
          `Já existe uma categoria "${existente.nome}" para ${p.natureza.toLowerCase()} neste perfil.`
        )
      }
      st.categorias.push({
        id: nextId("cat-custom"),
        perfilId: st.perfil.perfilId,
        tipoPerfil: st.perfil.tipo,
        nome: p.nome,
        nomeNormalizado: norm,
        natureza: p.natureza,
        icone: p.icone,
        cor: p.cor,
        padrao: false,
        ativo: true,
        totalPeriodoCentavos: "0",
        quantidadeRegistros: 0,
      })
      return {
        ok: true,
        operacaoId: nextId("op-cat"),
        contratoG004: "G002_CATEGORIA_CRIAR",
        mensagem: `Categoria personalizada "${p.nome}" criada.`,
      }
    },

    async alternarCategoriaAtiva(seletor, categoriaId, ativo) {
      const st = resolveState(seletor)
      const cat = st.categorias.find((c) => c.id === categoriaId)
      if (!cat) throw new GestorMoneyBoundaryError("categoria_nao_encontrada", "Categoria não encontrada.")
      cat.ativo = ativo
      return {
        ok: true,
        operacaoId: nextId("op-cat-status"),
        contratoG004: "G002_CATEGORIA_ATIVAR",
        mensagem: ativo ? `Categoria "${cat.nome}" ativada.` : `Categoria "${cat.nome}" pausada.`,
      }
    },

    async criarCartao(seletor, raw) {
      const st = resolveState(seletor)
      const parsed = criarCartaoInputSchema.safeParse(raw)
      if (!parsed.success) {
        throw new GestorMoneyBoundaryError("validacao_cartao", parsed.error.issues[0]?.message ?? "Dados inválidos.")
      }
      const p = parsed.data
      const cardId = nextId("card")
      const mes = hojeSaoPaulo().slice(0, 7)
      const pad = (n: number) => String(n).padStart(2, "0")
      st.cartoes.push({
        id: cardId,
        perfilId: st.perfil.perfilId,
        nome: p.nome,
        bandeira: p.bandeira,
        ultimos4: p.ultimos4,
        corGradiente: "from-slate-800 via-zinc-800 to-emerald-900",
        limiteCentavos: p.limiteCentavos,
        usadoCentavos: "0",
        disponivelCentavos: p.limiteCentavos,
        fechamentoDia: p.fechamentoDia,
        vencimentoDia: p.vencimentoDia,
        ativo: true,
        ciclos: [
          {
            id: nextId("ciclo"),
            cartaoId: cardId,
            identificador: mes,
            competencia: mes,
            fechamentoEm: `${mes}-${pad(p.fechamentoDia)}`,
            vencimento: `${mes}-${pad(p.vencimentoDia)}`,
            totalCentavos: "0",
            pagoCentavos: "0",
            restanteCentavos: "0",
            status: "aberta",
          },
        ],
        comprasParceladas: [],
        historico: [],
      })
      return {
        ok: true,
        operacaoId: nextId("op-card"),
        contratoG004: "G004_CARTAO_CADASTRAR",
        mensagem: `Cartão ${p.nome} •••• ${p.ultimos4} cadastrado.`,
      }
    },

    async registrarCompraCartao(seletor, raw) {
      const st = resolveState(seletor)
      const parsed = registrarCompraCartaoInputSchema.safeParse(raw)
      if (!parsed.success) {
        throw new GestorMoneyBoundaryError("validacao_compra_cartao", parsed.error.issues[0]?.message ?? "Dados inválidos.")
      }
      const p = parsed.data
      const cartao = st.cartoes.find((c) => c.id === p.cartaoId && c.ativo)
      if (!cartao) throw new GestorMoneyBoundaryError("cartao_indisponivel", "Cartão não encontrado.")
      const total = parseBigIntCentavos(p.valorTotalCentavos)
      const disponivel = parseBigIntCentavos(cartao.disponivelCentavos)
      if (total > disponivel) {
        throw new GestorMoneyBoundaryError("limite_insuficiente", "Valor excede o limite disponível do cartão.")
      }
      const cicloAberta = cartao.ciclos.find((ci) => ci.status === "aberta") ?? cartao.ciclos[cartao.ciclos.length - 1]
      if (!cicloAberta) throw new GestorMoneyBoundaryError("ciclo_indisponivel", "Nenhum ciclo aberto para o cartão.")
      const cat = st.categorias.find((c) => c.id === p.categoriaId)

      const valorParcela = total / BigInt(p.parcelasTotal)
      const resto = total - valorParcela * BigInt(p.parcelasTotal)
      const primeiraParcela = valorParcela + resto

      cartao.usadoCentavos = (parseBigIntCentavos(cartao.usadoCentavos) + total).toString()
      cartao.disponivelCentavos = (disponivel - total).toString()
      cicloAberta.totalCentavos = (parseBigIntCentavos(cicloAberta.totalCentavos) + primeiraParcela).toString()
      cicloAberta.restanteCentavos = (parseBigIntCentavos(cicloAberta.restanteCentavos) + primeiraParcela).toString()

      if (p.parcelasTotal > 1) {
        cartao.comprasParceladas.unshift({
          id: nextId("cp"),
          cartaoId: cartao.id,
          cicloId: cicloAberta.id,
          descricao: p.descricao,
          estabelecimento: p.estabelecimento,
          categoriaId: cat?.id ?? null,
          categoriaNome: cat?.nome ?? "Sem categoria",
          dataCompra: p.dataCompra,
          valorTotalCentavos: total.toString(),
          valorParcelaCentavos: valorParcela.toString(),
          parcelaAtual: 1,
          parcelasTotal: p.parcelasTotal,
          ativa: true,
        })
      }

      cartao.historico.unshift({
        id: nextId("hc"),
        cartaoId: cartao.id,
        tipo: "COMPRA",
        descricao: `${p.descricao} (${p.estabelecimento})`,
        valorCentavos: primeiraParcela.toString(),
        data: p.dataCompra,
        competencia: cicloAberta.competencia,
        parcelaTexto: p.parcelasTotal > 1 ? `1/${p.parcelasTotal}` : "À vista",
        categoriaNome: cat?.nome,
      })

      return {
        ok: true,
        operacaoId: nextId("op-compra"),
        contratoG004: "COMPRA_CREDITO",
        mensagem:
          p.parcelasTotal > 1
            ? `Compra parcelada em ${p.parcelasTotal}x lançada na fatura ${cicloAberta.competencia}.`
            : `Compra lançada na fatura ${cicloAberta.competencia}.`,
      }
    },

    async pagarFatura(seletor, raw) {
      const st = resolveState(seletor)
      const parsed = pagarFaturaInputSchema.safeParse(raw)
      if (!parsed.success) {
        throw new GestorMoneyBoundaryError("validacao_fatura", parsed.error.issues[0]?.message ?? "Dados inválidos.")
      }
      const p = parsed.data
      const cartao = st.cartoes.find((c) => c.id === p.cartaoId)
      const ciclo = cartao?.ciclos.find((ci) => ci.id === p.cicloId)
      if (!cartao || !ciclo || parseBigIntCentavos(ciclo.restanteCentavos) <= BigInt(0)) {
        throw new GestorMoneyBoundaryError("fatura_indisponivel", "Fatura não encontrada ou já paga.")
      }
      const conta = st.contas.find((c) => c.id === p.carteiraId && c.ativo)
      if (!conta) throw new GestorMoneyBoundaryError("conta_indisponivel", "Conta de pagamento não encontrada.")

      const valor = parseBigIntCentavos(ciclo.restanteCentavos)
      ciclo.pagoCentavos = (parseBigIntCentavos(ciclo.pagoCentavos) + valor).toString()
      ciclo.restanteCentavos = "0"
      ciclo.status = "paga"

      const usadoAtual = parseBigIntCentavos(cartao.usadoCentavos)
      const novoUsado = usadoAtual > valor ? usadoAtual - valor : BigInt(0)
      cartao.usadoCentavos = novoUsado.toString()
      cartao.disponivelCentavos = subtrairCentavos(cartao.limiteCentavos, novoUsado)

      conta.saldoCentavos = subtrairCentavos(conta.saldoCentavos, valor)
      conta.saidasCentavos = somarCentavos([conta.saidasCentavos, valor])
      conta.quantidadeMovimentos += 1

      cartao.historico.unshift({
        id: nextId("hc"),
        cartaoId: cartao.id,
        tipo: "PAGAMENTO_FATURA",
        descricao: `Pagamento Fatura ${ciclo.competencia} (${conta.nome})`,
        valorCentavos: valor.toString(),
        data: p.dataPagamento,
        competencia: ciclo.competencia,
      })

      st.eventos.unshift({
        id: nextId("ev"),
        movimentoId: nextId("mov"),
        carteiraId: conta.id,
        carteiraNome: conta.nome,
        categoriaId: null,
        categoria: "Fatura de Cartão",
        descricao: `Pagamento Fatura ${cartao.nome} (${ciclo.competencia})`,
        contraparte: cartao.nome,
        origem: "PAGAR_FATURA",
        dia: p.dataPagamento,
        ocorridoEm: `${p.dataPagamento}T12:00:00.000Z`,
        tipo: "saida",
        valorCentavos: valor.toString(),
        transferencia: false,
        despesaCentavos: valor.toString(),
        receitaCentavos: "0",
        formaPagamento: p.formaPagamento,
      })

      return {
        ok: true,
        operacaoId: nextId("op-fatura"),
        contratoG004: "PAGAR_FATURA",
        mensagem: `Fatura ${ciclo.competencia} do ${cartao.nome} paga com sucesso.`,
      }
    },
  }
}

function queryParamsFromSeletor(
  seletor: FinanceiroPerfilSeletor,
  periodo?: { dataInicio?: string; dataFim?: string }
): string {
  const qs = new URLSearchParams()
  qs.set("tipo", seletor.tipo)
  qs.set("perfilId", seletor.perfilId)
  if (seletor.tipo === "EMPRESA") {
    qs.set("storeId", seletor.storeId)
  }
  if (periodo?.dataInicio) qs.set("dataInicio", periodo.dataInicio)
  if (periodo?.dataFim) qs.set("dataFim", periodo.dataFim)
  return qs.toString()
}

function novaChaveIdempotencia(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID()
  }
  return `gm-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

async function parseRealApiResponse<T>(res: Response): Promise<T> {
  let body: { ok?: boolean; code?: string; error?: string } & Record<string, unknown>
  try {
    body = (await res.json()) as { ok?: boolean; code?: string; error?: string } & Record<string, unknown>
  } catch {
    throw new GestorMoneyBoundaryError("resposta_invalida", "Resposta inválida do servidor financeiro.")
  }
  if (!res.ok || body.ok === false) {
    throw new GestorMoneyBoundaryError(
      body.code ?? `http_${res.status}`,
      body.error ?? "Operação financeira recusada pelo servidor."
    )
  }
  return body as T
}

/**
 * Fronteira de runtime real conectada aos endpoints autenticados `/api/gestor-money/*`
 * que reutilizam os serviços canônicos `lib/gastos/*` (G001–G006).
 *
 * - Jamais fabrica dados reais quando `GESTOR_MONEY_ENABLED !== "true"` ou sem perfil autorizado.
 * - Jamais expõe ações pendentes (G007 WhatsApp, transferência pessoal G004, storage G003) como funcionais.
 */
export function createRealBoundaryGateway(fetchImpl: typeof fetch = fetch): GestorMoneyGateway {
  async function postOperacao(
    seletor: FinanceiroPerfilSeletor,
    operacao: string,
    payload: unknown
  ): Promise<OperacaoFeedback> {
    const res = await fetchImpl("/api/gestor-money/operacoes", {
      method: "POST",
      headers: { "content-type": "application/json" },
      cache: "no-store",
      body: JSON.stringify({
        seletor,
        chave: novaChaveIdempotencia(),
        operacao,
        payload,
      }),
    })
    const data = await parseRealApiResponse<{ ok: true; feedback: OperacaoFeedback }>(res)
    return data.feedback
  }

  return {
    mode: "real",

    async obterReadiness(): Promise<IntegrationReadiness> {
      try {
        const res = await fetchImpl("/api/gestor-money/status", { cache: "no-store" })
        if (!res.ok) {
          return {
            mode: "real",
            state: "UNAVAILABLE",
            moduleEnabled: false,
            foundationMerged: false,
            mensagem: "Não foi possível consultar o status da fundação Gestor Money no servidor.",
            contratos: CONTRATOS_FUNDACAO_PADRAO,
          }
        }
        const data = (await res.json()) as {
          moduleEnabled?: boolean
          foundationMerged?: boolean
          state?: IntegrationReadiness["state"]
          mensagem?: string
          contratos?: IntegrationContractStatus[]
        }
        return {
          mode: "real",
          state: data.state ?? "MODULE_DISABLED",
          moduleEnabled: Boolean(data.moduleEnabled),
          foundationMerged: Boolean(data.foundationMerged),
          mensagem:
            data.mensagem ??
            "Fundação G001–G006 dormente (GESTOR_MONEY_ENABLED !== 'true'). Nenhum dado simulado é exibido no modo real.",
          contratos: data.contratos ?? CONTRATOS_FUNDACAO_PADRAO,
        }
      } catch {
        return {
          mode: "real",
          state: "UNAVAILABLE",
          moduleEnabled: false,
          foundationMerged: false,
          mensagem: "Falha ao contatar a fronteira de integração `/api/gestor-money/status`.",
          contratos: CONTRATOS_FUNDACAO_PADRAO,
        }
      }
    },

    async listarPerfis() {
      try {
        const res = await fetchImpl("/api/gestor-money/perfis", { cache: "no-store" })
        if (!res.ok) return []
        const data = (await res.json()) as { ok?: boolean; perfis?: PerfilResumo[] }
        return data.ok && Array.isArray(data.perfis) ? data.perfis : []
      } catch {
        return []
      }
    },

    async obterSnapshot(seletor, periodo) {
      try {
        const res = await fetchImpl(
          `/api/gestor-money/snapshot?${queryParamsFromSeletor(seletor, periodo)}`,
          { cache: "no-store" }
        )
        if (!res.ok) return null
        const data = (await res.json()) as { ok?: boolean; snapshot?: ConsultaFinanceiraSnapshot }
        return data.ok && data.snapshot ? data.snapshot : null
      } catch {
        return null
      }
    },

    async obterAssistenteConfig(seletor) {
      try {
        const res = await fetchImpl(
          `/api/gestor-money/assistente?${queryParamsFromSeletor(seletor)}`,
          { cache: "no-store" }
        )
        if (res.ok) {
          const data = (await res.json()) as { ok?: boolean; config?: AssistenteWhatsAppConfig }
          if (data.ok && data.config) return data.config
        }
      } catch {
        /* fallback seguro para estado desconectado honesto */
      }
      return createSyntheticPersonalState().assistente
    },

    async salvarPreferenciasAssistente() {
      throw new GestorMoneyBoundaryError(
        "assistente_preferencias_pendente_g007",
        "Persistência real das preferências do assistente WhatsApp aguarda etapa G007."
      )
    },

    async registrarDespesa(seletor, input) {
      return postOperacao(seletor, "despesa", input)
    },

    async registrarReceita(seletor, input) {
      return postOperacao(seletor, "receita", input)
    },

    async registrarDivida(seletor, input) {
      return postOperacao(seletor, "divida", input)
    },

    async pagarDivida(seletor, input) {
      return postOperacao(seletor, "pagar_divida", input)
    },

    async transferir(seletor, input) {
      return postOperacao(seletor, "transferir", input)
    },

    async criarConta(seletor, input) {
      const res = await fetchImpl("/api/gestor-money/contas", {
        method: "POST",
        headers: { "content-type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({ seletor, payload: input }),
      })
      const data = await parseRealApiResponse<{ ok: true; feedback: OperacaoFeedback }>(res)
      return data.feedback
    },

    async alternarContaAtiva(seletor, contaId, ativo) {
      const res = await fetchImpl("/api/gestor-money/contas", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({ seletor, contaId, ativo }),
      })
      const data = await parseRealApiResponse<{ ok: true; feedback: OperacaoFeedback }>(res)
      return data.feedback
    },

    async criarCategoria(seletor, input) {
      const res = await fetchImpl("/api/gestor-money/categorias", {
        method: "POST",
        headers: { "content-type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({ seletor, payload: input }),
      })
      const data = await parseRealApiResponse<{ ok: true; feedback: OperacaoFeedback }>(res)
      return data.feedback
    },

    async alternarCategoriaAtiva(seletor, categoriaId, ativo) {
      const res = await fetchImpl("/api/gestor-money/categorias", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({ seletor, categoriaId, ativo }),
      })
      const data = await parseRealApiResponse<{ ok: true; feedback: OperacaoFeedback }>(res)
      return data.feedback
    },

    async criarCartao(seletor, input) {
      const res = await fetchImpl("/api/gestor-money/cartoes", {
        method: "POST",
        headers: { "content-type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({ seletor, payload: input }),
      })
      const data = await parseRealApiResponse<{ ok: true; feedback: OperacaoFeedback }>(res)
      return data.feedback
    },

    async registrarCompraCartao(seletor, input) {
      return postOperacao(seletor, "compra_cartao", input)
    },

    async pagarFatura(seletor, input) {
      return postOperacao(seletor, "pagar_fatura", input)
    },
  }
}
