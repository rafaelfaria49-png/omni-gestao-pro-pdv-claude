/**
 * Cenário sintético compartilhado pelos testes e pela demonstração (SIMULADO).
 * Pessoas, contas e valores são fictícios.
 */
import {
  AutorizacaoSimulada, CadastrosSimulados, ConsultaFixture, ExecucaoSimulada, RepositorioMemoria, TransporteSimulado,
  type CadastroPerfil,
} from "./simulacao"
import type { DependenciasMotor, PerfilAutorizado, Principal, ResumoConsulta } from "./tipos"

export const AGORA_INICIAL = new Date("2026-11-27T13:00:00.000Z") // 10:00 em São Paulo
export const USUARIO_A: Principal = { userId: "usr_a", origem: "TESTE" }
export const USUARIO_B: Principal = { userId: "usr_b", origem: "TESTE" }

export const PESSOAL_A: PerfilAutorizado = { ref: { tipo: "PESSOAL", perfilId: "pf_pessoal_a" }, rotulo: "Pessoal" }
export const LOJA_CENTRO: PerfilAutorizado = { ref: { tipo: "EMPRESA", perfilId: "pf_loja_centro", storeId: "store_centro" }, rotulo: "Loja Centro" }
export const PESSOAL_B: PerfilAutorizado = { ref: { tipo: "PESSOAL", perfilId: "pf_pessoal_b" }, rotulo: "Pessoal" }

/** Projeção sintética no formato do G005 `cartoes[]` (#405): limite 3.000,00; faturas de dez/26 e jan/27 em aberto. */
export const FATURAS_NUBANK_A = {
  id: "cartao_nu_a", nome: "Nubank Crédito", ativo: true, limiteCentavos: "300000", limiteUtilizadoCentavos: "65000",
  limiteDisponivelCentavos: "235000", limiteExcedidoCentavos: "0",
  ciclos: [
    { id: "ciclo_2026_11", identificador: "2026-11", competencia: "2026-11", vencimento: "2026-11-10", fechamentoEm: "2026-11-03", ativo: true,
      totalCentavos: "12000", pagoCentavos: "12000", restanteCentavos: "0", quantidadeTitulos: 1 },
    { id: "ciclo_2026_12", identificador: "2026-12", competencia: "2026-12", vencimento: "2026-12-10", fechamentoEm: "2026-12-03", ativo: true,
      totalCentavos: "45000", pagoCentavos: "0", restanteCentavos: "45000", quantidadeTitulos: 2 },
    { id: "ciclo_2027_01", identificador: "2027-01", competencia: "2027-01", vencimento: "2027-01-10", fechamentoEm: "2027-01-03", ativo: true,
      totalCentavos: "20000", pagoCentavos: "0", restanteCentavos: "20000", quantidadeTitulos: 1 },
  ],
}

export const CADASTROS: Record<string, CadastroPerfil> = {
  pf_pessoal_a: {
    contas: [
      { id: "ct_nubank_a", nome: "Nubank", tipo: "banco", ativo: true },
      { id: "ct_carteira_a", nome: "Carteira", tipo: "dinheiro", ativo: true },
      { id: "ct_cartao_a", nome: "Cartão Nubank", tipo: "credito", ativo: true },
    ],
    categorias: [{ id: "cat_mercado_a", nome: "Supermercado" }, { id: "cat_energia_a", nome: "Energia" }, { id: "cat_alim_a", nome: "Alimentação" }],
    cartoes: [{ id: "cartao_nu_a", nome: "Nubank Crédito" }],
    ciclos: { cartao_nu_a: ["ciclo_2026_12", "ciclo_2027_01", "ciclo_2027_02", "ciclo_2027_03"] },
    titulos: [{ id: "tit_fornecedor_a", descricao: "Compra de estoque", contraparte: "Fornecedor Alfa", restanteCentavos: "80000", vencimento: "2026-12-10" }],
    faturas: [FATURAS_NUBANK_A],
    titulosFatura: {
      ciclo_2026_12: [{ id: "tit_cc_1", restanteCentavos: "30000", vencimento: "2026-12-10" }, { id: "tit_cc_2", restanteCentavos: "15000", vencimento: "2026-12-10" }],
      ciclo_2027_01: [{ id: "tit_cc_3", restanteCentavos: "20000", vencimento: "2027-01-10" }],
    },
  },
  pf_loja_centro: {
    contas: [{ id: "ct_itau_centro", nome: "Itaú PJ", tipo: "banco", ativo: true }],
    categorias: [{ id: "cat_forn_centro", nome: "Fornecedores" }, { id: "cat_energia_centro", nome: "Energia" }],
    cartoes: [],
    ciclos: {},
    titulos: [
      { id: "tit_aluguel_centro", descricao: "Aluguel da loja", contraparte: "Imobiliária", restanteCentavos: "250000", vencimento: "2026-11-28" },
      { id: "tit_luz_centro", descricao: "Energia da loja", contraparte: "", restanteCentavos: "41290", vencimento: "2026-11-28" },
      { id: "tit_forn_centro", descricao: "Mercadorias", contraparte: "Fornecedor Beta", restanteCentavos: "120000", vencimento: "2026-12-05" },
    ],
  },
  pf_pessoal_b: {
    contas: [{ id: "ct_inter_b", nome: "Inter", tipo: "banco", ativo: true }],
    categorias: [], cartoes: [], ciclos: {}, titulos: [],
  },
}

/** Fixture G005 (base caixa). Todo número exibido pelo assistente precisa vir daqui. */
export function fixturePessoal(f: { dataInicio: string }): ResumoConsulta {
  const mesPassado = f.dataInicio.startsWith("2026-10")
  return {
    asOf: AGORA_INICIAL.toISOString(), versaoCalculo: "g005-caixa-1",
    despesaRealizadaCentavos: mesPassado ? "198000" : "234550", receitaRealizadaCentavos: mesPassado ? "500000" : "650000",
    resultadoCentavos: mesPassado ? "302000" : "415450", quantidadeRegistros: mesPassado ? 21 : 27,
    porCategoria: [
      { categoria: "Supermercado", despesaCentavos: "98720", receitaCentavos: "0", quantidade: 6 },
      { categoria: "Energia", despesaCentavos: "18000", receitaCentavos: "0", quantidade: 1 },
      { categoria: "Alimentação", despesaCentavos: "117830", receitaCentavos: "0", quantidade: 20 },
    ],
    saldoCentavos: "512340", pagarAbertoCentavos: "80000", receberAbertoCentavos: "0",
    cartoes: [FATURAS_NUBANK_A],
    contas: [
      { nome: "Nubank", tipo: "banco", ativo: true, saldoCentavos: "498340" },
      { nome: "Carteira", tipo: "dinheiro", ativo: true, saldoCentavos: "14000" },
      { nome: "Cartão Nubank", tipo: "credito", ativo: true, saldoCentavos: "-60000" },
    ],
    pagar: [{ descricao: "Compra de estoque", contraparte: "Fornecedor Alfa", restanteCentavos: "80000", vencimento: "2026-12-10", cancelado: false }],
  }
}

export function fixtureLoja(): ResumoConsulta {
  return {
    asOf: AGORA_INICIAL.toISOString(), versaoCalculo: "g005-caixa-1",
    despesaRealizadaCentavos: "1873400", receitaRealizadaCentavos: "4210050", resultadoCentavos: "2336650", quantidadeRegistros: 143,
    porCategoria: [{ categoria: "Fornecedores", despesaCentavos: "1500000", receitaCentavos: "0", quantidade: 12 }],
    saldoCentavos: "1250000", pagarAbertoCentavos: "411290", receberAbertoCentavos: "93000",
    cartoes: [],
    contas: [{ nome: "Itaú PJ", tipo: "banco", ativo: true, saldoCentavos: "1250000" }],
    pagar: [
      { descricao: "Aluguel da loja", contraparte: "Imobiliária", restanteCentavos: "250000", vencimento: "2026-11-28", cancelado: false },
      { descricao: "Energia da loja", contraparte: "", restanteCentavos: "41290", vencimento: "2026-11-28", cancelado: false },
      { descricao: "Mercadorias", contraparte: "Fornecedor Beta", restanteCentavos: "120000", vencimento: "2026-12-05", cancelado: false },
      { descricao: "Boleto quitado", contraparte: "", restanteCentavos: "0", vencimento: "2026-11-28", cancelado: false },
    ],
  }
}

export type Cenario = ReturnType<typeof montarCenario>

export function montarCenario(opcoes: { perfisA?: PerfilAutorizado[]; somenteLeitura?: string[] } = {}) {
  let agora = AGORA_INICIAL
  let seq = 0
  const autorizacao = new AutorizacaoSimulada(new Map([
    [USUARIO_A.userId, opcoes.perfisA ?? [PESSOAL_A]],
    [USUARIO_B.userId, [PESSOAL_B]],
  ]), new Set(opcoes.somenteLeitura ?? []))
  const execucao = new ExecucaoSimulada(autorizacao)
  const consulta = new ConsultaFixture(autorizacao, { pf_pessoal_a: fixturePessoal, pf_loja_centro: fixtureLoja, pf_pessoal_b: fixturePessoal })
  const repositorio = new RepositorioMemoria()
  const deps: DependenciasMotor = {
    autorizacao, cadastros: new CadastrosSimulados(autorizacao, CADASTROS), consulta, execucao, repositorio,
    agora: () => agora, novoId: () => `id${String(++seq).padStart(4, "0")}`,
  }
  return {
    deps, autorizacao, execucao, consulta, repositorio,
    avancar(ms: number) { agora = new Date(agora.getTime() + ms) },
    chat(principal = USUARIO_A, conversaId = "conversa-1") { return new TransporteSimulado(deps, principal, conversaId) },
  }
}
