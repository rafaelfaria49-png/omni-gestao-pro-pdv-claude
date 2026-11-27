/**
 * Motor conversacional do Gestor Money — orquestração de turnos.
 *
 * Invariantes (testadas em motor.*.test.ts):
 * 1. Escrita financeira SOMENTE em `confirmar()`, após confirmação da versão exata
 *    do rascunho, com contexto "edit" emitido pela PortaAutorizacao no momento da escrita.
 * 2. Identidade vem do Principal; a mensagem nunca informa usuário, perfil ou loja.
 * 3. Mesma mensagem (mensagemId) nunca é processada duas vezes.
 * 4. Estado EM_EXECUCAO é gravado (CAS) ANTES da chamada ao G004; a chave G004 é
 *    estável por versão, então reenvio após falha incerta é idempotente.
 * 5. Valores de consulta vêm somente da PortaConsulta (G005).
 */
import { createHash } from "node:crypto"
import { mesmaCategoria } from "./categorias"
import { executarConsulta } from "./consultas"
import { diaCivil } from "./datas"
import { entradaSchema, normalizarEntrada, type EntradaNormalizada } from "./entradas"
import { extrairCampos, interpretar } from "./interpretacao"
import { propostaDoRascunho, rotuloIntencao, dividirParcelas } from "./mapeamento-g004"
import { formatarCentavos, formatarDataCivil, normalizarTexto } from "./texto"
import {
  INTENCOES_COM_CONTRATO_G004, INTENCOES_ESCRITA,
  type Campo, type DadosRascunho, type DependenciasMotor, type EstadoConversa, type Extracao, type IntencaoEscrita,
  type Interpretacao, type PerfilAutorizado, type PerfilRef, type Principal, type Rascunho, type RespostaAssistente,
} from "./tipos"

const TTL_PADRAO_MS = 15 * 60_000
const JANELA_DUPLICIDADE_MS = 10 * 60_000
const ORDEM_PERGUNTAS: Campo[] = ["perfil", "valor", "titulo", "formaPagamento", "conta", "cartao", "parcelas", "vencimento"]

type Turno = {
  principal: Principal
  deps: DependenciasMotor
  chave: string
  estado: EstadoConversa
  agora: Date
  hoje: string
  mensagens: string[]
  codigo: string
  respostaId: string
  confirmacao?: RespostaAssistente["confirmacao"]
  escrita?: RespostaAssistente["escritaFinanceira"]
  consulta?: RespostaAssistente["consulta"]
  entrada: { mensagemId: string; respondendoA?: string; confirmacaoToken?: string }
}

class ConflitoConcorrente extends Error {}

const FORMA_ROTULO: Record<string, string> = { pix: "Pix", dinheiro: "dinheiro", debito: "débito",
  transferencia: "transferência", boleto: "boleto", credito: "cartão de crédito" }

export function chaveConversa(principal: Principal, conversaId: string) {
  return `${principal.userId}::${conversaId}`
}

// ─── Entrada pública ───────────────────────────────────────────────────────

export async function processarMensagem(principal: Principal, bruta: unknown, deps: DependenciasMotor): Promise<RespostaAssistente> {
  const parsed = entradaSchema.safeParse(bruta)
  if (!parsed.success) {
    return { mensagens: ["Não consegui ler essa mensagem. Nada foi registrado."], codigo: "entrada_invalida", respostaId: deps.novoId() }
  }
  const entrada = parsed.data
  const chave = chaveConversa(principal, entrada.conversaId)
  const anterior = await deps.repositorio.respostaRegistrada(chave, entrada.mensagemId)
  if (anterior) return { ...anterior, duplicada: true }

  const estado = (await deps.repositorio.carregar(chave)) ?? { versaoEstado: 0, aplicadosRecentes: [] }
  const agora = deps.agora()
  const t: Turno = { principal, deps, chave, estado: structuredClone(estado), agora, hoje: diaCivil(agora),
    mensagens: [], codigo: "ok", respostaId: deps.novoId(),
    entrada: { mensagemId: entrada.mensagemId, respondendoA: entrada.respondendoA, confirmacaoToken: entrada.confirmacaoToken } }
  try {
    expirarSeVencido(t)
    const norm = normalizarEntrada(entrada)
    await despachar(t, norm)
    await persistir(t)
  } catch (e) {
    if (e instanceof ConflitoConcorrente) {
      // Não registra a resposta: o reenvio da mesma mensagem será reprocessado sobre o estado novo.
      return { mensagens: ["Recebi outra mensagem ao mesmo tempo. Envie novamente, por favor."], codigo: "conflito_concorrente", respostaId: t.respostaId }
    }
    throw e
  }
  const resposta = montarResposta(t)
  await deps.repositorio.registrarResposta(chave, entrada.mensagemId, resposta)
  return resposta
}

/**
 * Reconciliação de falha incerta sem mensagem do usuário (worker/G006 futuro).
 * Reenvia a MESMA chave G004 — se o primeiro envio já tinha sido gravado, o G004
 * devolve o resultado existente; nunca grava duas vezes.
 */
export async function reconciliarPendencia(principal: Principal, conversaId: string, deps: DependenciasMotor): Promise<RespostaAssistente | null> {
  const chave = chaveConversa(principal, conversaId)
  const estado = await deps.repositorio.carregar(chave)
  const r = estado?.rascunho
  if (!estado || !r || (r.estado !== "INCERTO" && r.estado !== "EM_EXECUCAO") || !r.envio) return null
  const agora = deps.agora()
  const t: Turno = { principal, deps, chave, estado: structuredClone(estado), agora, hoje: diaCivil(agora),
    mensagens: [], codigo: "ok", respostaId: deps.novoId(), entrada: { mensagemId: `reconciliacao:${deps.novoId()}` } }
  try {
    await executar(t, t.estado.rascunho!)
    await persistir(t)
  } catch (e) {
    if (e instanceof ConflitoConcorrente) return null
    throw e
  }
  return montarResposta(t)
}

// ─── Despacho ──────────────────────────────────────────────────────────────

async function despachar(t: Turno, norm: EntradaNormalizada) {
  t.mensagens.push(...norm.avisos)
  const interp = interpretar(norm.texto, t.hoje)
  combinarCampos(interp, norm)
  if (interp.sinaisSuspeitos.length) {
    t.codigo = "comando_recusado"
    t.mensagens.push("Não executo esse tipo de pedido. Posso registrar gastos, contas a pagar, compras no cartão e pagamentos, e responder consultas sobre os seus dados.")
    if (t.estado.rascunho) t.mensagens.push("A operação pendente continua aguardando, sem alterações.")
    return
  }
  const r = t.estado.rascunho

  if (r && (r.estado === "EM_EXECUCAO" || r.estado === "INCERTO")) {
    if (interp.intencao === "CONFIRMACAO") return executar(t, r)
    if (interp.intencao === "CONSULTA" && interp.consulta) return responderConsulta(t, interp, norm.texto)
    t.codigo = "aguardando_reconciliacao"
    t.mensagens.push("Ainda estou verificando se a última operação foi concluída. Ela não será registrada duas vezes.",
      "Responda “sim” para eu verificar agora. Correções e cancelamento ficam bloqueados até a verificação.")
    return
  }

  switch (interp.intencao) {
    case "CANCELAMENTO":
      if (!r) { t.codigo = "nada_pendente"; t.mensagens.push("Não há operação pendente para cancelar."); return }
      t.estado.rascunho = undefined
      t.codigo = "cancelado"
      t.mensagens.push("Operação cancelada. Nada foi registrado.")
      return
    case "CONFIRMACAO":
      if (!r) { t.codigo = "nada_pendente"; t.mensagens.push("Não há nenhuma operação aguardando confirmação."); return }
      if (r.estado !== "AGUARDANDO_CONFIRMACAO") {
        t.codigo = "faltam_dados"
        t.mensagens.push("Ainda faltam dados para concluir.")
        return perguntarOuResumir(t, r)
      }
      return confirmar(t, r)
    case "NEGACAO":
      if (!r) { t.codigo = "nada_pendente"; t.mensagens.push("Tudo bem. Não há operação pendente."); return }
      t.codigo = "aguardando_correcao"
      t.mensagens.push("Certo, o que devo corrigir? Pode dizer, por exemplo, “o valor é 300”, “foi no débito” ou “cancelar”.")
      return
    case "CONSULTA":
      return responderConsulta(t, interp, norm.texto)
    default:
      break
  }

  if (r) return complementar(t, r, interp, norm)

  if (interp.intencao === "CORRECAO") {
    t.codigo = "correcao_sem_rascunho"
    t.mensagens.push("Não há operação pendente para corrigir. Lançamentos já registrados são corrigidos por estorno no HUB Financeiro — nada foi alterado.")
    return
  }
  const intencao = intencaoEscrita(interp)
  if (!intencao) {
    t.codigo = "nao_entendi"
    t.mensagens.push("Não entendi. Posso registrar, por exemplo: “gastei 250 no mercado no Pix”, “estou devendo 800 para o fornecedor, vence dia 10”, “comprei 600 em 3 vezes no cartão” — ou responder “quanto gastei este mês?”.")
    return
  }
  return iniciarRascunho(t, intencao, interp.extracao, norm)
}

function combinarCampos(interp: Interpretacao, norm: EntradaNormalizada) {
  if (norm.proveniencia === "TEXTO" || interp.intencao === "CONSULTA") return
  const prov: DadosRascunho["proveniencia"] = {}
  for (const [k, v] of Object.entries(norm.campos)) {
    if (v === undefined) continue
    ;(interp.extracao as Record<string, unknown>)[k] = v
    prov[k as keyof Extracao] = norm.proveniencia
  }
  if (norm.campos.valorCentavos) delete interp.extracao.valoresAmbiguos
  ;(interp.extracao as DadosRascunho).proveniencia = prov
  if (interp.intencao === "DESCONHECIDO" && interp.extracao.valorCentavos) interp.intencao = "DESPESA"
}

function intencaoEscrita(interp: Interpretacao): IntencaoEscrita | null {
  const i = interp.intencao
  if (!(INTENCOES_ESCRITA as readonly string[]).includes(i)) return null
  const e = interp.extracao
  if (i === "DESPESA" && e.formaPagamento === "credito") return (e.parcelas ?? 1) > 1 ? "PARCELAMENTO" : "COMPRA_CREDITO"
  return i as IntencaoEscrita
}

// ─── Rascunho ──────────────────────────────────────────────────────────────

async function iniciarRascunho(t: Turno, intencao: IntencaoEscrita, extracao: Extracao, norm: EntradaNormalizada) {
  if (!(INTENCOES_COM_CONTRATO_G004 as readonly string[]).includes(intencao)) {
    t.codigo = "sem_contrato_financeiro"
    const valor = extracao.valorCentavos ? ` de ${formatarCentavos(extracao.valorCentavos)}` : ""
    const quem = extracao.contraparte ? ` (${extracao.contraparte})` : ""
    t.mensagens.push(`Entendi: ${rotuloIntencao({ intencao })}${valor}${quem}.`,
      "O registro desse tipo de operação pelo assistente ainda não está disponível — nada foi gravado. Use o HUB Financeiro para registrar.")
    return
  }
  const perfis = await t.deps.autorizacao.listarPerfis(t.principal)
  if (!perfis.length) {
    t.codigo = "sem_perfil"
    t.mensagens.push("Você não tem um perfil financeiro autorizado para registrar operações.")
    return
  }
  const r: Rascunho = {
    id: t.deps.novoId(), versao: 1, intencao, estado: "COLETANDO", dados: { ...extracao }, pendencias: [],
    criadoEm: t.agora.toISOString(), atualizadoEm: t.agora.toISOString(),
    expiraEm: new Date(t.agora.getTime() + (t.deps.ttlRascunhoMs ?? TTL_PADRAO_MS)).toISOString(),
    mensagemOrigemId: t.entrada.mensagemId,
  }
  const escolhido = escolherPerfil(perfis, extracao, t.estado.ultimoPerfil)
  if (escolhido === "INDISPONIVEL") {
    t.codigo = "perfil_indisponivel"
    t.mensagens.push("Não encontrei esse perfil entre os que você pode usar. Nada foi registrado.")
    return
  }
  if (escolhido) { r.perfil = escolhido.ref; r.perfilRotulo = escolhido.rotulo }
  t.estado.rascunho = r
  await resolverDados(t, r)
  if (t.estado.rascunho) await perguntarOuResumir(t, t.estado.rascunho)
}

function escolherPerfil(perfis: PerfilAutorizado[], e: Extracao, ultimo?: PerfilRef): PerfilAutorizado | null | "INDISPONIVEL" {
  if (e.perfil === "PESSOAL") return perfis.find(p => p.ref.tipo === "PESSOAL") ?? "INDISPONIVEL"
  const empresas = perfis.filter(p => p.ref.tipo === "EMPRESA")
  if (e.perfil === "EMPRESA") {
    if (e.perfilTexto) {
      const alvo = normalizarTexto(e.perfilTexto)
      const achados = empresas.filter(p => [p.rotulo, ...(p.apelidos ?? [])].some(n => normalizarTexto(n).includes(alvo.replace(/^loja /, "")) || normalizarTexto(n) === alvo))
      return achados.length === 1 ? achados[0] : achados.length ? null : "INDISPONIVEL"
    }
    if (!empresas.length) return "INDISPONIVEL"
    return empresas.length === 1 ? empresas[0] : null
  }
  if (perfis.length === 1) return perfis[0]
  // Perfil escolhido antes nesta conversa: aparece no resumo e pode ser trocado antes de confirmar.
  return ultimo ? perfis.find(p => p.ref.perfilId === ultimo.perfilId) ?? null : null
}

function perfisOrdenados(perfis: PerfilAutorizado[]) {
  return [...perfis].sort((a, b) => (a.ref.tipo === b.ref.tipo ? a.rotulo.localeCompare(b.rotulo) : a.ref.tipo === "PESSOAL" ? -1 : 1))
}

/** Limpa tudo que pertence ao perfil anterior — nada é copiado entre perfis. */
function limparResolvidos(d: DadosRascunho) {
  delete d.carteiraId; delete d.carteiraNome; delete d.categoriaId; delete d.cartaoId; delete d.cartaoNome
  delete d.cicloIds; delete d.tituloId; delete d.tituloDescricao; delete d.tituloRestanteCentavos; delete d.opcoes
}

async function contextoLeitura(t: Turno, r: Rascunho): Promise<unknown | null> {
  if (!r.perfil) return null
  const acesso = await t.deps.autorizacao.contexto(t.principal, r.perfil, "view")
  if (!acesso.ok) {
    t.estado.rascunho = undefined
    t.codigo = "acesso_revogado"
    t.mensagens.push("Seu acesso a esse perfil não está mais autorizado. A operação foi descartada e nada foi registrado.")
    return null
  }
  return acesso.contexto
}

/** Resolve IDs dentro do perfil do rascunho, sempre por leitura autorizada (nunca do texto). */
async function resolverDados(t: Turno, r: Rascunho) {
  const d = r.dados
  if (d.formaPagamento === "credito" && r.intencao === "DESPESA") r.intencao = (d.parcelas ?? 1) > 1 ? "PARCELAMENTO" : "COMPRA_CREDITO"
  if ((r.intencao === "COMPRA_CREDITO" || r.intencao === "PARCELAMENTO") && d.formaPagamento && d.formaPagamento !== "credito") {
    r.intencao = "DESPESA"; delete d.cartaoId; delete d.cicloIds
  }
  if (r.intencao === "COMPRA_CREDITO" && (d.parcelas ?? 1) > 1) r.intencao = "PARCELAMENTO"
  const ctx = await contextoLeitura(t, r)
  if (!ctx) return
  if (d.categoria && !d.categoriaId) {
    const cats = await t.deps.cadastros.listarCategorias(ctx)
    const cat = cats.find(c => mesmaCategoria(c.nome, d.categoria!))
    if (cat) d.categoriaId = cat.id
  }
  if (r.intencao === "DESPESA" || r.intencao === "PAGAMENTO") {
    if (!d.carteiraId) {
      const contas = (await t.deps.cadastros.listarContas(ctx)).filter(c => c.ativo && c.tipo !== "credito")
      const alvo = d.conta ? normalizarTexto(d.conta) : null
      const candidatas = alvo ? contas.filter(c => normalizarTexto(c.nome).includes(alvo))
        : d.formaPagamento === "dinheiro" ? contas.filter(c => ["dinheiro", "caixa"].includes(c.tipo)) : contas
      const escolha = candidatas.length === 1 ? candidatas[0] : !alvo && contas.length === 1 ? contas[0] : null
      if (escolha) { d.carteiraId = escolha.id; d.carteiraNome = escolha.nome }
      else if (alvo && !candidatas.length) {
        t.mensagens.push(`Não encontrei a conta “${d.conta}” neste perfil.`)
        delete d.conta
      }
    }
  }
  if (r.intencao === "COMPRA_CREDITO" || r.intencao === "PARCELAMENTO") {
    if (!d.cartaoId) {
      const cartoes = await t.deps.cadastros.listarCartoes(ctx)
      const alvo = d.conta ? normalizarTexto(d.conta) : null
      const candidatos = alvo ? cartoes.filter(c => normalizarTexto(c.nome).includes(alvo)) : cartoes
      if (candidatos.length === 1) { d.cartaoId = candidatos[0].id; d.cartaoNome = candidatos[0].nome }
      else if (!cartoes.length) {
        t.estado.rascunho = undefined
        t.codigo = "sem_cartao"
        t.mensagens.push("Não há cartão de crédito cadastrado neste perfil. Cadastre o cartão no HUB Financeiro. Nada foi registrado.")
        return
      }
    }
    if (d.cartaoId && !d.cicloIds && d.valorCentavos) {
      const n = d.parcelas ?? 1
      const ciclos = await t.deps.cadastros.resolverCiclos(ctx, { cartaoId: d.cartaoId, dataCompra: d.dataEconomica ?? t.hoje, parcelas: n })
      if (!ciclos || ciclos.length !== n) {
        t.estado.rascunho = undefined
        t.codigo = "ciclos_insuficientes"
        t.mensagens.push(`O cartão ${d.cartaoNome ?? ""} não tem faturas cadastradas para ${n} parcela${n === 1 ? "" : "s"}. Cadastre os ciclos da fatura no HUB Financeiro. Nada foi registrado.`.replace("  ", " "))
        return
      }
      d.cicloIds = ciclos
    }
  }
  if (r.intencao === "PAGAMENTO" && !d.tituloId) {
    const abertos = (await t.deps.cadastros.listarTitulosAbertos(ctx)).filter(x => BigInt(x.restanteCentavos) > BigInt(0))
    const alvo = d.contraparte ? normalizarTexto(d.contraparte) : null
    const candidatos = alvo ? abertos.filter(x => normalizarTexto(`${x.descricao} ${x.contraparte}`).includes(alvo)) : abertos
    if (!abertos.length) {
      t.estado.rascunho = undefined
      t.codigo = "sem_titulo_aberto"
      t.mensagens.push("Não encontrei contas a pagar em aberto neste perfil. Nada foi registrado.")
      return
    }
    if (candidatos.length === 1) selecionarTitulo(d, candidatos[0])
    else d.opcoes = (candidatos.length ? candidatos : abertos).slice(0, 5).map(x => ({ id: x.id,
      rotulo: `${x.descricao}${x.contraparte ? ` (${x.contraparte})` : ""} — ${formatarCentavos(x.restanteCentavos)}, vence ${formatarDataCivil(x.vencimento)}` }))
  }
  if (r.intencao === "PAGAMENTO" && d.tituloRestanteCentavos && d.valorCentavos
    && BigInt(d.valorCentavos) > BigInt(d.tituloRestanteCentavos)) {
    t.mensagens.push(`O valor informado é maior que o saldo em aberto (${formatarCentavos(d.tituloRestanteCentavos)}).`)
    delete d.valorCentavos
  }
}

function selecionarTitulo(d: DadosRascunho, x: { id: string; descricao: string; restanteCentavos: string }) {
  d.tituloId = x.id; d.tituloDescricao = x.descricao; d.tituloRestanteCentavos = x.restanteCentavos; delete d.opcoes
  if (d.quitar) d.valorCentavos = x.restanteCentavos
}

function pendencias(r: Rascunho): Campo[] {
  const d = r.dados, p: Campo[] = []
  if (!r.perfil) p.push("perfil")
  if (!d.valorCentavos) p.push("valor")
  if (r.intencao === "DESPESA" || r.intencao === "PAGAMENTO") {
    if (!d.formaPagamento || d.formaPagamento === "credito") p.push("formaPagamento")
    if (!d.carteiraId) p.push("conta")
  }
  if (r.intencao === "PAGAMENTO" && !d.tituloId) p.push("titulo")
  if (r.intencao === "DIVIDA" && !d.vencimento) p.push("vencimento")
  if ((r.intencao === "COMPRA_CREDITO" || r.intencao === "PARCELAMENTO") && (!d.cartaoId || !d.cicloIds)) p.push("cartao")
  return ORDEM_PERGUNTAS.filter(c => p.includes(c))
}

async function perguntarOuResumir(t: Turno, r: Rascunho) {
  r.pendencias = pendencias(r)
  if (r.pendencias.length) {
    r.estado = "COLETANDO"
    r.confirmacaoToken = undefined
    r.confirmacaoMensagemId = undefined
    await perguntar(t, r, r.pendencias[0])
    if (t.codigo === "ok") t.codigo = "pergunta"
    return
  }
  const mapeado = propostaDoRascunho(r, t.agora, t.hoje)
  if (!mapeado.ok) {
    // Pendência sem pergunta possível: não confirmar algo que o G004 recusaria.
    t.estado.rascunho = undefined
    t.codigo = "proposta_incompleta"
    t.mensagens.push("Não consegui montar a operação com segurança. Nada foi registrado; pode enviar de novo?")
    return
  }
  r.estado = "AGUARDANDO_CONFIRMACAO"
  r.perguntaAtual = undefined
  r.confirmacaoToken = createHash("sha256").update(JSON.stringify([r.id, r.versao, mapeado.proposta, r.perfil])).digest("hex").slice(0, 32)
  r.confirmacaoMensagemId = t.respostaId
  const assinatura = assinaturaRascunho(r, t.hoje)
  const igual = t.estado.aplicadosRecentes.find(a => a.assinatura === assinatura
    && t.agora.getTime() - new Date(a.em).getTime() < JANELA_DUPLICIDADE_MS)
  r.avisoDuplicidade = igual
    ? `Atenção: você registrou uma operação igual há ${Math.max(1, Math.round((t.agora.getTime() - new Date(igual.em).getTime()) / 60_000))} min. Se for outra, confirme; se for repetição, cancele.`
    : undefined
  t.mensagens.push(...resumo(r, t.hoje))
  if (r.avisoDuplicidade) t.mensagens.push(r.avisoDuplicidade)
  t.mensagens.push("Confirma?")
  t.confirmacao = { rascunhoId: r.id, versao: r.versao, token: r.confirmacaoToken }
  if (t.codigo === "ok") t.codigo = "aguardando_confirmacao"
}

async function perguntar(t: Turno, r: Rascunho, campo: Campo) {
  r.perguntaAtual = campo
  const d = r.dados
  const opcoes = (ops: Array<{ id: string; rotulo: string }>) => { d.opcoes = ops; return ops.map((o, i) => `${i + 1}) ${o.rotulo}`).join("\n") }
  switch (campo) {
    case "perfil": {
      const perfis = perfisOrdenados(await t.deps.autorizacao.listarPerfis(t.principal))
      t.mensagens.push(`Em qual perfil devo registrar?\n${opcoes(perfis.map(p => ({ id: p.ref.perfilId, rotulo: p.rotulo })))}`)
      return
    }
    case "valor":
      if (d.valoresAmbiguos?.length) {
        t.mensagens.push(`Encontrei mais de um valor na mensagem. Qual é o valor da operação?\n${opcoes(d.valoresAmbiguos.map(v => ({ id: v, rotulo: formatarCentavos(v) })))}`)
      } else { delete d.opcoes; t.mensagens.push(r.intencao === "PAGAMENTO" && d.tituloRestanteCentavos
        ? `Quanto você pagou? O saldo em aberto é ${formatarCentavos(d.tituloRestanteCentavos)}.` : "Qual foi o valor?") }
      return
    case "titulo":
      t.mensagens.push(`Qual conta você pagou?\n${opcoes(d.opcoes ?? [])}`)
      return
    case "formaPagamento":
      delete d.opcoes
      t.mensagens.push("Como foi pago? Pix, dinheiro, débito, transferência ou boleto?")
      return
    case "conta": {
      const ctx = await contextoLeitura(t, r)
      if (!ctx) return
      const contas = (await t.deps.cadastros.listarContas(ctx)).filter(c => c.ativo && c.tipo !== "credito")
      if (!contas.length) {
        t.estado.rascunho = undefined
        t.codigo = "sem_conta"
        t.mensagens.push("Não há conta ativa cadastrada neste perfil para registrar o pagamento. Nada foi registrado.")
        return
      }
      t.mensagens.push(`De qual conta saiu o dinheiro?\n${opcoes(contas.map(c => ({ id: c.id, rotulo: c.nome })))}`)
      return
    }
    case "cartao": {
      const ctx = await contextoLeitura(t, r)
      if (!ctx) return
      const cartoes = await t.deps.cadastros.listarCartoes(ctx)
      t.mensagens.push(`Em qual cartão foi a compra?\n${opcoes(cartoes.map(c => ({ id: c.id, rotulo: c.nome })))}`)
      return
    }
    case "vencimento":
      delete d.opcoes
      t.mensagens.push("Qual é o vencimento? (ex.: “dia 10” ou “15/12”)")
      return
    case "parcelas":
      t.mensagens.push("Em quantas parcelas?")
      return
  }
}

function resumo(r: Rascunho, hoje: string): string[] {
  const d = r.dados
  const valor = formatarCentavos(d.valorCentavos!)
  const data = d.dataEconomica && d.dataEconomica !== hoje ? formatarDataCivil(d.dataEconomica) : `hoje (${formatarDataCivil(hoje)})`
  const cat = d.categoria ? ` em ${d.categoria}` : ""
  const quem = d.contraparte ? ` — ${d.contraparte}` : ""
  const perfil = `Perfil: ${r.perfilRotulo ?? "—"}`
  const semCategoria = d.categoria && !d.categoriaId ? ` · Categoria “${d.categoria}” não cadastrada: ficará sem categoria` : ""
  switch (r.intencao) {
    case "DESPESA":
      return [`Despesa de ${valor}${cat}${quem}.`, `Pagamento via ${FORMA_ROTULO[d.formaPagamento!]}.`,
        `Conta: ${d.carteiraNome} · Data: ${data} · ${perfil}${semCategoria}`]
    case "DIVIDA":
      return [`Conta a pagar de ${valor}${cat}${quem}.`, `Vencimento: ${formatarDataCivil(d.vencimento!)}.`, `${perfil}${semCategoria}`]
    case "COMPRA_CREDITO":
    case "PARCELAMENTO": {
      const n = d.parcelas ?? 1, partes = dividirParcelas(d.valorCentavos!, n)
      const parc = n === 1 ? "à vista" : partes[0] === partes[n - 1]
        ? `em ${n}x de ${formatarCentavos(partes[0])}` : `em ${n}x (1ª de ${formatarCentavos(partes[0])}, demais de ${formatarCentavos(partes[n - 1])})`
      return [`Compra no crédito de ${valor}${cat}${quem}, ${parc}.`, `Cartão: ${d.cartaoNome} · Data: ${data} · ${perfil}${semCategoria}`]
    }
    case "PAGAMENTO":
      return [`Pagamento de ${valor} da conta “${d.tituloDescricao}”${d.quitar ? " (quitação)" : ""}.`,
        `Via ${FORMA_ROTULO[d.formaPagamento!]} · Conta: ${d.carteiraNome} · Data: ${data} · ${perfil}`]
    default:
      return [`${rotuloIntencao(r)} de ${valor}.`]
  }
}

function assinaturaRascunho(r: Rascunho, hoje: string) {
  const d = r.dados
  return [r.perfil?.perfilId, r.intencao, d.valorCentavos, d.categoria ?? "", d.tituloId ?? "", d.dataEconomica ?? hoje].join("|")
}

/** Resposta complementar, correção ou nova intenção enquanto há rascunho aberto. */
async function complementar(t: Turno, r: Rascunho, interp: Interpretacao, norm: EntradaNormalizada) {
  const texto = normalizarTexto(norm.texto)
  // Em conta a pagar, data solta na conversa é vencimento (futuro); nos demais, data do fato (passado).
  const futuro = r.perguntaAtual === "vencimento" || (r.intencao === "DIVIDA" && !/\b(ontem|anteontem)\b/.test(texto))
  const campos: Extracao = { ...extrairCampos(norm.texto, t.hoje, { sentidoData: futuro ? "FUTURO" : "PASSADO" }), ...norm.campos }
  if (futuro && !campos.vencimento && campos.dataEconomica) { campos.vencimento = campos.dataEconomica; delete campos.dataEconomica }
  // Número solto respondendo outra pergunta (ex.: opção "1") nunca altera o valor.
  if (r.perguntaAtual && r.perguntaAtual !== "valor" && /^\d+([.,]\d{1,2})?$/.test(texto)) {
    delete campos.valorCentavos; delete campos.valoresAmbiguos
  }

  // Nova operação completa enquanto outra está aberta: não misturar.
  const nova = intencaoEscrita(interp)
  if (nova && interp.intencao !== "CORRECAO" && campos.valorCentavos && r.dados.valorCentavos
    && campos.valorCentavos !== r.dados.valorCentavos && r.perguntaAtual !== "valor") {
    t.codigo = "rascunho_pendente"
    t.mensagens.push(`Você tem uma operação aberta: ${rotuloIntencao(r)} de ${formatarCentavos(r.dados.valorCentavos)}. Confirme ou cancele antes de iniciar outra.`)
    if (r.estado === "AGUARDANDO_CONFIRMACAO") t.confirmacao = { rascunhoId: r.id, versao: r.versao, token: r.confirmacaoToken! }
    return
  }

  const opcao = /^\d{1,2}$/.test(texto) && r.dados.opcoes?.length ? r.dados.opcoes[Number(texto) - 1] : undefined
  let mudou = false
  if (opcao && r.perguntaAtual) {
    mudou = await aplicarOpcao(t, r, r.perguntaAtual, opcao)
    if (t.estado.rascunho !== r) return
  } else if (r.perguntaAtual === "perfil" || campos.perfil) {
    const perfis = await t.deps.autorizacao.listarPerfis(t.principal)
    const e: Extracao = campos.perfil ? campos : { ...campos, perfil: "EMPRESA", perfilTexto: texto }
    const p = escolherPerfil(perfis, /pessoal|particular|casa/.test(texto) ? { perfil: "PESSOAL" } : e, undefined)
    if (p && p !== "INDISPONIVEL") {
      if (p.ref.perfilId !== r.perfil?.perfilId) { limparResolvidos(r.dados); r.perfil = p.ref; r.perfilRotulo = p.rotulo; mudou = true }
    } else if (r.perguntaAtual === "perfil") {
      t.mensagens.push("Não identifiquei esse perfil.")
    }
  }
  if (!opcao) mudou = mesclar(r, campos) || mudou
  if (!mudou) {
    t.codigo = "nao_entendi_complemento"
    t.mensagens.push("Não entendi a resposta.")
    return perguntarOuResumir(t, r)
  }
  r.versao += 1
  r.atualizadoEm = t.agora.toISOString()
  r.expiraEm = new Date(t.agora.getTime() + (t.deps.ttlRascunhoMs ?? TTL_PADRAO_MS)).toISOString()
  t.codigo = interp.intencao === "CORRECAO" ? "corrigido" : "ok"
  await resolverDados(t, r)
  if (t.estado.rascunho === r) await perguntarOuResumir(t, r)
}

async function aplicarOpcao(t: Turno, r: Rascunho, campo: Campo, opcao: { id: string; rotulo: string }): Promise<boolean> {
  const d = r.dados
  switch (campo) {
    case "perfil": {
      const p = (await t.deps.autorizacao.listarPerfis(t.principal)).find(x => x.ref.perfilId === opcao.id)
      if (!p) { t.mensagens.push("Esse perfil não está mais disponível."); return false }
      if (p.ref.perfilId !== r.perfil?.perfilId) limparResolvidos(d)
      r.perfil = p.ref; r.perfilRotulo = p.rotulo; delete d.opcoes
      return true
    }
    case "valor": d.valorCentavos = opcao.id; delete d.valoresAmbiguos; delete d.opcoes; return true
    case "conta": d.carteiraId = opcao.id; d.carteiraNome = opcao.rotulo; delete d.opcoes; return true
    case "cartao": d.cartaoId = opcao.id; d.cartaoNome = opcao.rotulo; delete d.cicloIds; delete d.opcoes; return true
    case "titulo": {
      const ctx = await contextoLeitura(t, r)
      if (!ctx) return false
      const x = (await t.deps.cadastros.listarTitulosAbertos(ctx)).find(y => y.id === opcao.id)
      if (!x) { t.mensagens.push("Essa conta não está mais em aberto."); return false }
      selecionarTitulo(d, x)
      return true
    }
    default: return false
  }
}

const CAMPOS_MESCLAVEIS: Array<keyof Extracao> = ["valorCentavos", "categoria", "descricao", "dataEconomica", "vencimento",
  "formaPagamento", "conta", "parcelas", "contraparte", "quitar", "documentoId"]

function mesclar(r: Rascunho, campos: Extracao): boolean {
  const d = r.dados
  let mudou = false
  for (const k of CAMPOS_MESCLAVEIS) {
    const v = campos[k]
    if (v === undefined || d[k] === v) continue
    ;(d as Record<string, unknown>)[k] = v
    mudou = true
    if (k === "valorCentavos") { delete d.valoresAmbiguos; delete d.cicloIds }
    if (k === "conta") { delete d.carteiraId; delete d.carteiraNome; delete d.cartaoId; delete d.cartaoNome; delete d.cicloIds }
    if (k === "categoria") delete d.categoriaId
    if (k === "parcelas" || k === "dataEconomica") delete d.cicloIds
    if (k === "contraparte" && r.intencao === "PAGAMENTO") { delete d.tituloId; delete d.tituloDescricao; delete d.tituloRestanteCentavos }
  }
  if (campos.valoresAmbiguos && !campos.valorCentavos && !d.valorCentavos) { d.valoresAmbiguos = campos.valoresAmbiguos; mudou = true }
  return mudou
}

// ─── Confirmação e execução ────────────────────────────────────────────────

async function confirmar(t: Turno, r: Rascunho) {
  const { confirmacaoToken, respondendoA } = t.entrada
  if ((confirmacaoToken && confirmacaoToken !== r.confirmacaoToken)
    || (respondendoA && respondendoA !== r.confirmacaoMensagemId)) {
    t.codigo = "confirmacao_desatualizada"
    t.mensagens.push("Essa confirmação é de uma versão anterior da operação. Confira o resumo atual:")
    return perguntarOuResumir(t, r)
  }
  r.estado = "EM_EXECUCAO"
  r.envio = { grupoChave: `gm-conv:${r.id}:v${r.versao}`, chave: `gm-conv-op:${r.id}:v${r.versao}`, versao: r.versao }
  // Grava a intenção de executar ANTES de tocar o G004: um segundo processo perde o CAS.
  await persistir(t)
  return executar(t, r)
}

async function executar(t: Turno, r: Rascunho) {
  const envio = r.envio
  const mapeado = propostaDoRascunho(r, new Date(r.atualizadoEm), diaCivil(new Date(r.atualizadoEm)))
  if (!envio || !mapeado.ok) {
    t.estado.rascunho = undefined
    t.codigo = "proposta_incompleta"
    t.mensagens.push("Não consegui montar a operação com segurança. Nada foi registrado.")
    return
  }
  if (r.perfil === undefined) throw new Error("rascunho_sem_perfil")
  let acesso: Awaited<ReturnType<DependenciasMotor["autorizacao"]["contexto"]>>
  try {
    acesso = await t.deps.autorizacao.contexto(t.principal, r.perfil, "edit")
  } catch {
    // Autorização indisponível: nada foi enviado, mas o estado fica seguro para reenvio com a mesma chave.
    r.estado = "INCERTO"
    t.codigo = "resultado_incerto"
    t.mensagens.push("Não consegui validar seu acesso agora. A operação não será registrada duas vezes.",
      "Responda “sim” para tentar de novo com segurança.")
    return
  }
  if (!acesso.ok) {
    if (r.estado === "INCERTO") {
      t.codigo = "aguardando_reconciliacao"
      t.mensagens.push("Não foi possível verificar a operação agora porque o acesso ao perfil não foi confirmado.")
      return
    }
    t.estado.rascunho = undefined
    t.codigo = "acesso_revogado"
    t.mensagens.push("Seu acesso para registrar nesse perfil não está autorizado. Nada foi registrado.")
    return
  }
  let res
  try {
    res = await t.deps.execucao.executar(acesso.contexto, { grupoChave: envio.grupoChave, chave: envio.chave, proposta: mapeado.proposta })
  } catch {
    res = { ok: false as const, tipo: "INCERTO" as const, codigo: "excecao" }
  }
  if (res.ok) {
    t.estado.rascunho = undefined
    t.estado.ultimoPerfil = r.perfil
    t.estado.aplicadosRecentes = [...t.estado.aplicadosRecentes
      .filter(a => t.agora.getTime() - new Date(a.em).getTime() < JANELA_DUPLICIDADE_MS),
      { assinatura: assinaturaRascunho(r, diaCivil(new Date(r.criadoEm))), em: t.agora.toISOString(), operacaoId: res.operacaoId }].slice(-20)
    t.codigo = "registrado"
    t.escrita = { operacaoId: res.operacaoId, valorCentavos: res.valorCentavos }
    t.mensagens.push(`Registrado ✅ ${resumo(r, diaCivil(new Date(r.atualizadoEm)))[0]}`)
    return
  }
  if (res.tipo === "INCERTO") {
    r.estado = "INCERTO"
    t.codigo = "resultado_incerto"
    t.mensagens.push("Não consegui confirmar se a operação foi concluída. Ela NÃO será registrada duas vezes.",
      "Responda “sim” para eu verificar com segurança.")
    return
  }
  // DEFINITIVO: o servidor recusou antes do COMMIT. Nova versão → novas chaves G004.
  r.envio = undefined
  r.versao += 1
  const definitivo = MOTIVOS_DEFINITIVOS[res.codigo]
  if (definitivo?.encerra) {
    t.estado.rascunho = undefined
    t.codigo = "recusado"
    t.mensagens.push(`${definitivo.texto} Nada foi registrado.`)
    return
  }
  t.codigo = "recusado_corrigivel"
  t.mensagens.push(`${definitivo?.texto ?? "O servidor não aceitou a operação."} Nada foi registrado. Corrija os dados ou diga “cancelar”.`)
  return perguntarOuResumir(t, r)
}

const MOTIVOS_DEFINITIVOS: Record<string, { texto: string; encerra?: boolean }> = {
  acesso_negado: { texto: "Você não tem permissão para registrar nesse perfil.", encerra: true },
  periodo_fechado: { texto: "O período dessa data está fechado.", encerra: false },
  saldo_insuficiente: { texto: "A conta não tem saldo suficiente." },
  titulo_indisponivel: { texto: "Essa conta a pagar não está mais disponível.", encerra: true },
  pagamento_acima_saldo: { texto: "O valor é maior que o saldo em aberto da conta." },
  categoria_indisponivel: { texto: "A categoria não está disponível neste perfil." },
  carteira_indisponivel: { texto: "A conta escolhida não está disponível." },
  ciclo_indisponivel: { texto: "A fatura do cartão não está disponível.", encerra: true },
  revisao_expirada: { texto: "A operação expirou antes de ser concluída." },
}

// ─── Consulta ──────────────────────────────────────────────────────────────

async function responderConsulta(t: Turno, interp: Interpretacao, texto: string) {
  const perfis = await t.deps.autorizacao.listarPerfis(t.principal)
  if (!perfis.length) { t.codigo = "sem_perfil"; t.mensagens.push("Você não tem um perfil financeiro autorizado para consultar."); return }
  const e = extrairCampos(texto, t.hoje)
  const escolhido = escolherPerfil(perfis, e, t.estado.ultimoPerfil)
  if (escolhido === "INDISPONIVEL") { t.codigo = "perfil_indisponivel"; t.mensagens.push("Não encontrei esse perfil entre os que você pode consultar."); return }
  if (!escolhido) {
    t.codigo = "consulta_perfil_ambiguo"
    t.mensagens.push(`Sobre qual perfil? ${perfisOrdenados(perfis).map(p => p.rotulo).join(", ")}. Repita a pergunta indicando o perfil (ex.: “quanto gastei este mês no pessoal?”).`)
    return
  }
  const acesso = await t.deps.autorizacao.contexto(t.principal, escolhido.ref, "view")
  if (!acesso.ok) { t.codigo = "acesso_revogado"; t.mensagens.push("Seu acesso a esse perfil não está autorizado."); return }
  try {
    const res = await executarConsulta(interp.consulta!, acesso.contexto, t.deps.consulta, t.hoje, escolhido.rotulo)
    t.mensagens.push(...res.mensagens)
    t.codigo = "consulta"
    t.consulta = { tipo: interp.consulta!.tipo, fonte: "G005_CONSULTA_CANONICA", asOf: res.asOf, versaoCalculo: res.versaoCalculo }
    t.estado.ultimoPerfil = escolhido.ref
  } catch {
    t.codigo = "consulta_indisponivel"
    t.mensagens.push("Não consegui consultar os dados financeiros com segurança agora. Tente de novo em instantes.")
  }
  if (t.estado.rascunho?.estado === "AGUARDANDO_CONFIRMACAO") t.mensagens.push("Lembrete: há uma operação aguardando sua confirmação.")
  else if (t.estado.rascunho?.estado === "COLETANDO") t.mensagens.push("Lembrete: ainda há uma operação em andamento.")
}

// ─── Estado ────────────────────────────────────────────────────────────────

function expirarSeVencido(t: Turno) {
  const r = t.estado.rascunho
  if (!r || (r.estado !== "COLETANDO" && r.estado !== "AGUARDANDO_CONFIRMACAO")) return
  if (t.agora.getTime() < new Date(r.expiraEm).getTime()) return
  t.estado.rascunho = undefined
  t.mensagens.push("A operação pendente expirou por segurança e não foi registrada.")
}

async function persistir(t: Turno) {
  const anterior = t.estado.versaoEstado
  const proximo = { ...t.estado, versaoEstado: anterior + 1 }
  if (!await t.deps.repositorio.salvar(t.chave, proximo, anterior)) throw new ConflitoConcorrente()
  t.estado.versaoEstado = anterior + 1
}

function montarResposta(t: Turno): RespostaAssistente {
  const r = t.estado.rascunho
  return {
    mensagens: t.mensagens, codigo: t.codigo, respostaId: t.respostaId,
    ...(r ? { rascunho: { id: r.id, versao: r.versao, estado: r.estado, intencao: r.intencao, pendencias: r.pendencias } } : {}),
    ...(t.confirmacao && r?.estado === "AGUARDANDO_CONFIRMACAO" ? { confirmacao: t.confirmacao } : {}),
    ...(t.escrita ? { escritaFinanceira: t.escrita } : {}),
    ...(t.consulta ? { consulta: t.consulta } : {}),
  }
}
