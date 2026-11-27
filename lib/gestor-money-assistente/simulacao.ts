/**
 * ⚠️ SIMULAÇÃO — somente testes e demonstração do motor conversacional.
 *
 * Nada aqui persiste dados nem fala com banco, WhatsApp, STT ou OCR.
 * - RepositorioMemoria: estado de conversa em memória do processo (some ao reiniciar).
 * - ExecucaoSimulada: NÃO é motor financeiro. Só valida a proposta com o schema G004
 *   real (`normalizarPropostaGasto`) e reproduz a semântica de idempotência da chave
 *   (mesma chave → mesmo resultado; mesmo grupo com conteúdo diferente → recusa),
 *   registrando chamadas para asserção. Permite injetar falhas DEFINITIVO/INCERTO.
 * - ConsultaFixture: devolve um ResumoConsulta fixo fornecido pelo teste — prova que o
 *   motor só repete números vindos da porta.
 * - TransporteSimulado: caixa de saída em memória; `simulado: true` em toda mensagem.
 *
 * Nenhum módulo de produto deve importar este arquivo.
 */
import { hashOperacaoGasto, normalizarPropostaGasto, type PropostaGasto } from "@/lib/gastos/operacao-schema"
import { processarMensagem } from "./motor"
import type {
  CartaoResumo, CategoriaResumo, ContaResumo, DependenciasMotor, EstadoConversa, PerfilAutorizado, PerfilRef,
  PortaAutorizacao, PortaCadastros, PortaConsulta, PortaExecucao, Principal, RepositorioConversa, RespostaAssistente,
  ResultadoExecucao, ResumoConsulta, TituloResumo, FiltroConsulta, CartaoComFaturas,
} from "./tipos"

export class RepositorioMemoria implements RepositorioConversa {
  private estados = new Map<string, EstadoConversa>()
  private respostas = new Map<string, RespostaAssistente>()
  async carregar(chave: string) { const e = this.estados.get(chave); return e ? structuredClone(e) : null }
  async salvar(chave: string, estado: EstadoConversa, versaoAnterior: number) {
    const atual = this.estados.get(chave)?.versaoEstado ?? 0
    if (atual !== versaoAnterior) return false
    this.estados.set(chave, structuredClone(estado))
    return true
  }
  async respostaRegistrada(chave: string, mensagemId: string) { return this.respostas.get(`${chave}#${mensagemId}`) ?? null }
  async registrarResposta(chave: string, mensagemId: string, r: RespostaAssistente) { this.respostas.set(`${chave}#${mensagemId}`, r) }
  /** Somente teste: inspeção do estado. */
  espiar(chave: string) { return this.estados.get(chave) }
}

/** Contexto opaco simulado: identidade de objeto, como o WeakSet do G001. */
export class AutorizacaoSimulada implements PortaAutorizacao {
  private emitidos = new WeakSet<object>()
  readonly emissoes: Array<{ userId: string; perfilId: string; acao: string; contexto: object }> = []
  constructor(private concessoes: Map<string, PerfilAutorizado[]>, private somenteLeitura = new Set<string>()) {}
  async listarPerfis(p: Principal) { return structuredClone(this.concessoes.get(p.userId) ?? []) }
  async contexto(p: Principal, ref: PerfilRef, acao: "view" | "edit") {
    const ok = (this.concessoes.get(p.userId) ?? []).some(x => x.ref.perfilId === ref.perfilId && x.ref.tipo === ref.tipo
      && (x.ref.tipo === "PESSOAL" || x.ref.storeId === ref.storeId))
    if (!ok || (acao === "edit" && this.somenteLeitura.has(`${p.userId}:${ref.perfilId}`))) return { ok: false as const }
    const contexto = Object.freeze({ userId: p.userId, perfilId: ref.perfilId, acao })
    this.emitidos.add(contexto)
    this.emissoes.push({ userId: p.userId, perfilId: ref.perfilId, acao, contexto })
    return { ok: true as const, contexto }
  }
  reconhece(ctx: unknown): ctx is { userId: string; perfilId: string; acao: string } {
    return typeof ctx === "object" && ctx !== null && this.emitidos.has(ctx)
  }
  revogar(userId: string, perfilId: string) {
    this.concessoes.set(userId, (this.concessoes.get(userId) ?? []).filter(x => x.ref.perfilId !== perfilId))
  }
}

export type CadastroPerfil = { contas: ContaResumo[]; categorias: CategoriaResumo[]; cartoes: CartaoResumo[];
  ciclos: Record<string, string[]>; titulos: TituloResumo[]
  /** Projeção sintética de cartões com faturas por ciclo e títulos de cada fatura. */
  faturas?: CartaoComFaturas[]; titulosFatura?: Record<string, Array<{ id: string; restanteCentavos: string; vencimento: string }>> }

export class CadastrosSimulados implements PortaCadastros {
  constructor(private auth: AutorizacaoSimulada, private porPerfil: Record<string, CadastroPerfil>) {}
  private de(ctx: unknown) {
    if (!this.auth.reconhece(ctx)) throw new Error("contexto_nao_emitido")
    return this.porPerfil[ctx.perfilId] ?? { contas: [], categorias: [], cartoes: [], ciclos: {}, titulos: [] }
  }
  async listarContas(ctx: unknown) { return this.de(ctx).contas }
  async listarCategorias(ctx: unknown) { return this.de(ctx).categorias }
  async listarCartoes(ctx: unknown) { return this.de(ctx).cartoes }
  async listarTitulosAbertos(ctx: unknown) { return this.de(ctx).titulos }
  async listarFaturas(ctx: unknown) { return this.de(ctx).faturas ?? [] }
  async titulosDaFatura(ctx: unknown, cicloId: string) { return this.de(ctx).titulosFatura?.[cicloId] ?? [] }
  async resolverCiclos(ctx: unknown, i: { cartaoId: string; parcelas: number }) {
    const c = this.de(ctx).ciclos[i.cartaoId] ?? []
    return c.length >= i.parcelas ? c.slice(0, i.parcelas) : null
  }
}

export class ConsultaFixture implements PortaConsulta {
  readonly chamadas: Array<{ perfilId: string; filtro: FiltroConsulta }> = []
  /** Simula um G005 sem a projeção de cartões (versão anterior da fundação). */
  semCartoes = false
  constructor(private auth: AutorizacaoSimulada, private porPerfil: Record<string, ResumoConsulta | ((f: FiltroConsulta) => ResumoConsulta)>) {}
  async consultar(ctx: unknown, filtro: FiltroConsulta) {
    if (!this.auth.reconhece(ctx)) throw new Error("contexto_nao_emitido")
    this.chamadas.push({ perfilId: ctx.perfilId, filtro })
    const f = this.porPerfil[ctx.perfilId]
    if (!f) throw new Error("sem_fixture")
    const r = typeof f === "function" ? f(filtro) : f
    return this.semCartoes ? { ...r, cartoes: undefined } : r
  }
}

type Falha = "DEFINITIVO" | "INCERTO_ANTES" | "INCERTO_DEPOIS" | "EXCECAO_DEPOIS"

export class ExecucaoSimulada implements PortaExecucao {
  readonly chamadas: Array<{ perfilId: string; userId: string; acao: string; grupoChave: string; chave: string; proposta: PropostaGasto }> = []
  /** Operações "aplicadas" pela simulação (apenas registro para asserção, sem saldo/ledger). */
  readonly aplicadas = new Map<string, { operacaoId: string; hash: string; grupoChave: string; valorCentavos: string; perfilId: string }>()
  private grupos = new Map<string, string>()
  private falhas: Array<{ falha: Falha; codigo?: string }> = []
  private seq = 0
  constructor(private auth: AutorizacaoSimulada) {}
  falharProxima(falha: Falha, codigo = "falha_simulada") { this.falhas.push({ falha, codigo }) }

  async executar(ctx: unknown, input: { grupoChave: string; chave: string; proposta: PropostaGasto }): Promise<ResultadoExecucao> {
    if (!this.auth.reconhece(ctx) || ctx.acao !== "edit") return { ok: false, tipo: "DEFINITIVO", codigo: "acesso_negado" }
    this.chamadas.push({ perfilId: ctx.perfilId, userId: ctx.userId, acao: ctx.acao, ...input })
    let proposta: PropostaGasto
    try { proposta = normalizarPropostaGasto(input.proposta) } // schema G004 real
    catch { return { ok: false, tipo: "DEFINITIVO", codigo: "proposta_invalida" } }
    const hash = hashOperacaoGasto(proposta)
    const falha = this.falhas.shift()
    if (falha?.falha === "DEFINITIVO") return { ok: false, tipo: "DEFINITIVO", codigo: falha.codigo! }
    if (falha?.falha === "INCERTO_ANTES") return { ok: false, tipo: "INCERTO", codigo: "timeout" }
    const k = `${ctx.perfilId}:${input.chave}`
    const existente = this.aplicadas.get(k)
    if (existente) {
      if (existente.hash !== hash || existente.grupoChave !== input.grupoChave) return { ok: false, tipo: "DEFINITIVO", codigo: "operacao_conteudo_divergente" }
    } else {
      const g = `${ctx.perfilId}:${input.grupoChave}`
      if (this.grupos.has(g) && this.grupos.get(g) !== hash) return { ok: false, tipo: "DEFINITIVO", codigo: "grupo_conteudo_divergente" }
      this.grupos.set(g, hash)
      const valor = proposta.tipo === "PAGAR_FATURA" ? proposta.alocacoes.reduce((s, a) => s + BigInt(a.valorCentavos), BigInt(0)).toString() : (proposta as { valorCentavos?: string }).valorCentavos ?? "0"
      this.aplicadas.set(k, { operacaoId: `op_sim_${++this.seq}`, hash, grupoChave: input.grupoChave, valorCentavos: valor, perfilId: ctx.perfilId })
    }
    if (falha?.falha === "INCERTO_DEPOIS") return { ok: false, tipo: "INCERTO", codigo: "resposta_perdida" }
    if (falha?.falha === "EXCECAO_DEPOIS") throw new Error("rede_caiu")
    const a = this.aplicadas.get(k)!
    return { ok: true, operacaoId: a.operacaoId, valorCentavos: a.valorCentavos }
  }
}

export type MensagemSaida = { simulado: true; conversaId: string; respostaId: string; texto: string; codigo: string }

/** Transporte SIMULADO: nenhuma mensagem sai do processo. */
export class TransporteSimulado {
  readonly saida: MensagemSaida[] = []
  private seq = 0
  constructor(private deps: DependenciasMotor, private principal: Principal, readonly conversaId = "conversa-sim-1") {}
  entrada(conteudo: Record<string, unknown>, extra: { mensagemId?: string; respondendoA?: string; confirmacaoToken?: string } = {}) {
    return { mensagemId: extra.mensagemId ?? `msg-${++this.seq}`, conversaId: this.conversaId, canal: "SIMULADO",
      recebidaEm: this.deps.agora().toISOString(), conteudo,
      ...(extra.respondendoA ? { respondendoA: extra.respondendoA } : {}),
      ...(extra.confirmacaoToken ? { confirmacaoToken: extra.confirmacaoToken } : {}) }
  }
  async texto(texto: string, extra: { mensagemId?: string; respondendoA?: string; confirmacaoToken?: string } = {}) {
    return this.enviar(this.entrada({ tipo: "TEXTO", texto }, extra))
  }
  async enviar(entrada: unknown) {
    const r = await processarMensagem(this.principal, entrada, this.deps)
    if (!r.duplicada) this.saida.push({ simulado: true, conversaId: this.conversaId, respostaId: r.respostaId, texto: r.mensagens.join("\n"), codigo: r.codigo })
    return r
  }
}

export function resumoVazio(asOf: string): ResumoConsulta {
  return { asOf, versaoCalculo: "g005-caixa-1", despesaRealizadaCentavos: "0", receitaRealizadaCentavos: "0", resultadoCentavos: "0",
    quantidadeRegistros: 0, porCategoria: [], saldoCentavos: "0", pagarAbertoCentavos: "0", receberAbertoCentavos: "0", contas: [], pagar: [] }
}
