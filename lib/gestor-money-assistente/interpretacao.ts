/**
 * Interpretação determinística de linguagem natural pt-BR → intenção + campos estruturados.
 *
 * Determinística de propósito: nenhum modelo generativo decide valor, conta ou perfil.
 * Tudo que não está explícito na mensagem fica AUSENTE e vira pergunta. Mais de um
 * valor plausível vira ambiguidade — nunca uma escolha silenciosa.
 */
import { categoriaPorTexto } from "./categorias"
import { extrairData, inicioMes, inicioSemana, mesAnterior, somarDias } from "./datas"
import { contemPalavra, extensoParaDigitos, literalParaCentavos, normalizarTexto } from "./texto"
import type { Extracao, FormaPagamento, Intencao, Interpretacao, PlanoConsulta } from "./tipos"

export const LIMITE_TEXTO = 1000

const SUSPEITOS: Array<[RegExp, string]> = [
  [/\bignor\w* (as |todas |suas |)?(instruc|regra|ordem|anterior)/, "instrucao_sobrescrita"],
  [/\b(instrucoes|prompt) (anteriores|do sistema)\b|\bsystem prompt\b|\bmodo (desenvolvedor|admin)\b|\bdeveloper mode\b|\bjailbreak\b/, "instrucao_sobrescrita"],
  [/\bvoce (agora )?e (o |um |uma )?(admin|administrador|sistema|root)\b|\bsudo\b/, "elevacao"],
  [/\b(drop|truncate|alter) table\b|\bdelete from\b|\binsert into\b|\bselect \S+ from\b|<script|\$\{|\bunion select\b/, "injecao_tecnica"],
  [/\b(perfilid|storeid|userid|owneradminuserid|adminuserid|tituloid|carteiraid)\b/, "identificador_interno"],
  [/\b(de|do|da) outro usuario\b|\btodos os usuarios\b|\boutra loja que nao\b|\bconta de outra pessoa\b/, "escopo_alheio"],
  [/\b(api key|token de acesso|senha do|access token)\b/, "credencial"],
]

const BANCOS: Array<[RegExp, string]> = [
  [/\bnubank|\bnu\b|\broxinho\b/, "Nubank"], [/\bitau\b/, "Itaú"], [/\bbradesco\b/, "Bradesco"],
  [/\bsantander\b/, "Santander"], [/\bbanco do brasil\b|\bbb\b/, "Banco do Brasil"],
  [/\bcaixa economica\b|\bcef\b/, "Caixa Econômica"], [/\binter\b/, "Inter"], [/\bc6\b/, "C6"],
  [/\bsicoob\b/, "Sicoob"], [/\bsicredi\b/, "Sicredi"], [/\bmercado pago\b/, "Mercado Pago"],
  [/\bpicpay\b/, "PicPay"], [/\bpagbank\b|\bpagseguro\b/, "PagBank"], [/\bpoupanca\b/, "Poupança"],
  [/\bcarteira\b/, "Carteira"],
]

const CONFIRMACOES = new Set(["sim", "s", "ss", "confirmo", "confirma", "confirmar", "confirmado", "pode", "pode sim",
  "pode registrar", "pode lancar", "pode salvar", "ok", "okay", "certo", "correto", "isso", "isso mesmo", "exato",
  "beleza", "blz", "positivo", "manda", "pode mandar", "👍", "✅", "sim confirmo", "sim pode"])
const NEGACOES = new Set(["nao", "n", "nao e isso", "errado", "esta errado", "ta errado", "nao esta certo", "negativo"])
const CANCELAMENTO = /^(cancela|cancelar|cancele|cancelado|esquece|esqueca|deixa pra la|deixa para la|desisto|nao quero mais|aborta|abortar|descarta|descartar)\b/
const CORRECAO = /^(na verdade|corrig\w*|altera\w*|muda\w*|troca\w*|era |foi |nao foi|nao era|o valor (e|era|foi)|valor certo|errei|o certo e|sim,? mas|sim mas|ops)/

/** Extrai literais monetários restantes; devolve todos os candidatos distintos. */
function valores(texto: string): { valor?: string; ambiguos?: string[] } {
  const re = /(r\$\s*)?(\d[\d.,]*\d|\d)(\s*(?:mil|k)\b)?(\s*(?:reais|real|conto|contos|pila|pilas)\b)?(?:\s*e\s*(\d{1,2})\s*centavos)?/g
  const achados: Array<{ c: string; forte: boolean }> = []
  for (const m of texto.matchAll(re)) {
    let c = literalParaCentavos(m[2], m[3])
    if (!c) continue
    if (m[5]) c = (BigInt(c) + BigInt(m[5])).toString()
    achados.push({ c, forte: Boolean(m[1] || m[4] || m[3]) })
  }
  const fortes = [...new Set(achados.filter(a => a.forte).map(a => a.c))]
  const todos = [...new Set(achados.map(a => a.c))]
  const base = fortes.length ? fortes : todos
  if (base.length === 1) return { valor: base[0] }
  if (base.length > 1) return { ambiguos: base }
  return {}
}

function forma(texto: string): FormaPagamento | undefined {
  if (/\bcartao de debito\b|\bno debito\b|\bdebito\b/.test(texto)) return "debito"
  if (/\bpix\b/.test(texto)) return "pix"
  if (/\bdinheiro\b|\bespecie\b|\bem maos\b|\bcash\b/.test(texto)) return "dinheiro"
  if (/\bboleto\b/.test(texto)) return "boleto"
  if (/\bcredito\b|\bcartao\b|\bparcelad\w*\b/.test(texto)) return "credito"
  if (/\btransferencia\b|\bted\b|\btransferi\b/.test(texto)) return "transferencia"
  return undefined
}

function bancos(texto: string): string[] {
  const achados: Array<{ nome: string; pos: number }> = []
  for (const [re, nome] of BANCOS) {
    const m = texto.match(re)
    if (m && m.index !== undefined) achados.push({ nome, pos: m.index })
  }
  return achados.sort((a, b) => a.pos - b.pos).map(a => a.nome)
}

function perfil(texto: string): { perfil?: "PESSOAL" | "EMPRESA"; perfilTexto?: string } {
  const pessoal = /\b(pessoal|particular|minha casa|pra casa|para casa|da casa|pessoa fisica|meu bolso|vida pessoal)\b/.test(texto)
  const lojaNomeada = texto.match(/\b(?:loja|filial|unidade)\s+(?!de\b|do\b|da\b)([a-z0-9]+)\b/)
  // "loja" sozinho é ambíguo ("na loja de roupas"): só conta como perfil quando nomeada ou possessiva.
  const empresa = Boolean(lojaNomeada) || /\b(empresa|firma|negocio|cnpj|pj|minha loja|nossa loja|da loja|pra loja|para a loja)\b/.test(texto)
  if (pessoal && empresa) return {}
  if (pessoal) return { perfil: "PESSOAL" }
  if (empresa) return { perfil: "EMPRESA", perfilTexto: lojaNomeada ? `loja ${lojaNomeada[1]}` : undefined }
  return {}
}

const NAO_NOMES = new Set(["Pix", "Nubank", "Itaú", "Itau", "Bradesco", "Santander", "Inter", "Caixa", "Sicoob", "Sicredi",
  "PicPay", "Mercado", "Gastei", "Paguei", "Recebi", "Comprei", "Estou", "Devo", "Quanto", "Quais", "Reais", "Real", "Hoje",
  "Ontem", "Amanhã", "Banco", "Brasil", "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto",
  "Setembro", "Outubro", "Novembro", "Dezembro", "Na", "No", "Em", "Eu", "Era", "Foi"])

function contraparte(original: string, texto: string): string | undefined {
  const papel = texto.match(/\b(?:para|pra|pro|ao|do|da|de|a)\s+(?:o |a |um |uma |meu |minha |seu |sua |nosso |nossa )?(fornecedora?|cliente|dentista|medico|pedreiro|eletricista|contador|advogado|mecanico|banco|agiota|vizinho|vizinha|irmao|irma|mae|pai|primo|prima|amigo|amiga|tio|tia|sogro|sogra)\b/)
  const nome = original.match(/(?:para|pra|pro|ao|à|do|da|de)\s+(?:o |a |seu |sua |dona |seu )?((?:[A-ZÀ-Ú][a-zà-ú]+)(?:\s+[A-ZÀ-Ú][a-zà-ú]+)?)/)
  if (nome && !NAO_NOMES.has(nome[1].split(" ")[0])) {
    return papel ? `${papel[1]} ${nome[1]}`.replace(/^(\w)/, c => c.toUpperCase()) : nome[1]
  }
  if (papel) return papel[1].replace(/^(\w)/, c => c.toUpperCase())
  return undefined
}

function periodoConsulta(texto: string, hoje: string): { dataInicio: string; dataFim: string; rotulo: string } {
  if (/\bhoje\b|\bdo dia\b|\bno dia\b/.test(texto)) return { dataInicio: hoje, dataFim: hoje, rotulo: "hoje" }
  if (/\bontem\b/.test(texto)) { const d = somarDias(hoje, -1); return { dataInicio: d, dataFim: d, rotulo: "ontem" } }
  if (/\bsemana passada\b/.test(texto)) {
    const ini = somarDias(inicioSemana(hoje), -7)
    return { dataInicio: ini, dataFim: somarDias(ini, 6), rotulo: "na semana passada" }
  }
  if (/\b(esta|essa|nesta|nessa|da|na) semana\b|\bsemanal\b/.test(texto)) return { dataInicio: inicioSemana(hoje), dataFim: hoje, rotulo: "nesta semana" }
  if (/\bmes passado\b|\bmes anterior\b|\bultimo mes\b/.test(texto)) {
    const m = mesAnterior(hoje); return { dataInicio: m.inicio, dataFim: m.fim, rotulo: "no mês passado" }
  }
  if (/\b(este|esse|neste|nesse|no) ano\b/.test(texto)) return { dataInicio: hoje.slice(0, 4) + "-01-01", dataFim: hoje, rotulo: "neste ano" }
  return { dataInicio: inicioMes(hoje), dataFim: hoje, rotulo: "neste mês" }
}

function periodoVencimento(texto: string, hoje: string): { dataInicio: string; dataFim: string; rotulo: string } {
  if (/\bdepois de amanha\b/.test(texto)) { const d = somarDias(hoje, 2); return { dataInicio: d, dataFim: d, rotulo: "depois de amanhã" } }
  if (/\bamanha\b/.test(texto)) { const d = somarDias(hoje, 1); return { dataInicio: d, dataFim: d, rotulo: "amanhã" } }
  if (/\bhoje\b/.test(texto)) return { dataInicio: hoje, dataFim: hoje, rotulo: "hoje" }
  const dias = texto.match(/\bproximos (\d{1,2}) dias\b/)
  if (dias) return { dataInicio: hoje, dataFim: somarDias(hoje, Number(dias[1])), rotulo: `nos próximos ${dias[1]} dias` }
  if (/\b(este|esse|neste|nesse|no) mes\b/.test(texto)) {
    const [a, m] = hoje.split("-").map(Number)
    return { dataInicio: hoje, dataFim: new Date(Date.UTC(a, m, 0)).toISOString().slice(0, 10), rotulo: "até o fim do mês" }
  }
  return { dataInicio: hoje, dataFim: somarDias(hoje, 7), rotulo: "nos próximos 7 dias" }
}

function consulta(texto: string, original: string, hoje: string): PlanoConsulta | null {
  const pergunta = /^(quanto|quantos|quantas|quais|qual|quando|como (esta|estao|anda|andam)|mostra|mostre|me mostra|me diz|me fala|lista|liste|listar|resumo|extrato|tenho|ver |veja|compara|compare|comparar)\b/.test(texto)
    || /\?\s*$/.test(original.trim())
  if (!pergunta) return null
  const cat = categoriaPorTexto(texto)
  if (/\bvenc\w*\b/.test(texto)) return { tipo: "VENCIMENTOS", ...periodoVencimento(texto, hoje) }
  if (/\bfatura/.test(texto)) return { tipo: "FATURAS", ...periodoConsulta(texto, hoje) }
  if (/\b(compar\w*|em relacao ao|versus|vs)\b/.test(texto)) return { tipo: "COMPARATIVO", dataInicio: inicioMes(hoje), dataFim: hoje, rotulo: "neste mês vs. mês passado" }
  if (/\b(a receber|me devem|para receber|pra receber|estao me devendo)\b/.test(texto)) return { tipo: "A_RECEBER", ...periodoConsulta(texto, hoje) }
  if (/\b(devendo|devo|dividas?|a pagar|em aberto|contas abertas)\b/.test(texto)) return { tipo: "DIVIDAS", ...periodoConsulta(texto, hoje) }
  if (/\bsaldo\b|\bquanto (eu )?tenho\b|\bdinheiro em conta\b/.test(texto)) return { tipo: "SALDO", ...periodoConsulta(texto, hoje) }
  if (/\bpor categoria\b|\bcategorias\b|\bonde (eu )?(mais )?gastei\b|\bcom o que (eu )?(mais )?gastei\b/.test(texto)) return { tipo: "POR_CATEGORIA", ...periodoConsulta(texto, hoje) }
  if (/\breceitas? e despesas?\b|\bentradas e saidas\b|\bresultado\b|\blucro\b|\bbalanco\b/.test(texto)) return { tipo: "RECEITAS_DESPESAS", ...periodoConsulta(texto, hoje) }
  if (/\b(recebi|receitas?|faturei|faturamento|entrou|entradas|ganhei)\b/.test(texto)) return { tipo: "RECEITAS", ...periodoConsulta(texto, hoje) }
  if (/\b(gastei|gastos?|despesas?|paguei|saiu|saidas)\b/.test(texto)) {
    return { tipo: "GASTOS", ...periodoConsulta(texto, hoje), ...(cat ? { categoria: cat.categoria } : {}) }
  }
  return null
}

function classificar(texto: string, e: Extracao): Intencao {
  if (/\btransferi\b|\bpassei\b.*\bpara\b|\bmovi\b/.test(texto)
    && (e.contaDestino || /\bpara (a |o )?(minha |outra )?(conta|poupanca|carteira)\b/.test(texto))) return "TRANSFERENCIA"
  if (/\b(estou devendo|to devendo|tou devendo|devo|fiquei devendo|tenho que pagar|preciso pagar|vou pagar|a pagar|comprei fiado|pendurei|vai vencer|vence|vencendo)\b/.test(texto)
    && !/\b(paguei|quitei)\b/.test(texto)) return "DIVIDA"
  if (/\b(paguei|quitei|abati|amortizei)\b/.test(texto)
    && (e.referenciaTitulo || /\b(divida|parcela d[oa]|o que (eu )?devia|que eu devia)\b/.test(texto))) return "PAGAMENTO"
  if (/\b(recebi|me pagou|me pagaram)\b/.test(texto) && (e.referenciaTitulo || /\b(me devia|que me deviam|da parcela)\b/.test(texto))) return "RECEBIMENTO"
  if (/\b(recebi|ganhei|entrou|entraram|vendi|faturei|me pagou|me pagaram|caiu na conta)\b/.test(texto)) return "RECEITA"
  const compra = /\b(gastei|paguei|comprei|passei|torrei|parcelei)\b/.test(texto)
  if (compra && (e.formaPagamento === "credito" || (e.parcelas ?? 1) > 1)) return (e.parcelas ?? 1) > 1 ? "PARCELAMENTO" : "COMPRA_CREDITO"
  if (/\b(gastei|paguei|comprei|torrei|saiu|abasteci|almocei|jantei|despesa de|gasto de|transferi)\b/.test(texto)) return "DESPESA"
  return "DESCONHECIDO"
}

/**
 * Extração de campos isolada — também usada para respostas complementares
 * ("pix", "nubank", "dia 10", "250", "3 vezes", "pessoal").
 */
export function extrairCampos(original: string, hoje: string, opcoes: { sentidoData?: "PASSADO" | "FUTURO" } = {}): Extracao {
  let texto = extensoParaDigitos(normalizarTexto(original))
  const e: Extracao = {}
  const parcelas = texto.match(/\b(?:em\s+)?(\d{1,3})\s*(?:x|vezes|parcelas|prestacoes)\b/)
  if (parcelas) {
    const n = Number(parcelas[1])
    if (n >= 1 && n <= 120) e.parcelas = n
    texto = texto.replace(parcelas[0], " ")
  } else if (/\ba vista\b/.test(texto)) e.parcelas = 1
  const contextoVencimento = /\b(vence|vencimento|vencendo|vai vencer|para (o )?dia|pra (o )?dia|ate (o )?dia|pagar (no )?dia)\b/.test(texto)
  const data = extrairData(texto, hoje, opcoes.sentidoData ?? (contextoVencimento ? "FUTURO" : "PASSADO"))
  if (data) {
    if (contextoVencimento || opcoes.sentidoData === "FUTURO") e.vencimento = data.dia
    else e.dataEconomica = data.dia
    texto = texto.replace(data.trecho, " ")
  }
  const p = perfil(texto)
  if (p.perfil) e.perfil = p.perfil
  if (p.perfilTexto) { e.perfilTexto = p.perfilTexto; texto = texto.replace(/\b(loja|filial|unidade)\s+(?!de\b|do\b|da\b)[a-z0-9]+\b/, " ") }
  const v = valores(texto.replace(/\bc6\b/g, " ").replace(/\b\d{1,2}h\b/g, " "))
  if (v.valor) e.valorCentavos = v.valor
  if (v.ambiguos) e.valoresAmbiguos = v.ambiguos
  const f = forma(texto)
  if (f) e.formaPagamento = f
  const b = bancos(texto)
  // "passei 300 para a poupança": numa transferência, a única conta citada depois de "para" é o DESTINO.
  const soDestino = b.length === 1 && /\b(transferi|passei|movi|mandei|joguei)\b/.test(texto)
    && new RegExp(`\\b(?:para|pra|pro)\\s+(?:a |o )?(?:minha |meu )?${normalizarTexto(b[0])}`).test(texto)
  if (soDestino) e.contaDestino = b[0]
  else {
    if (b[0]) e.conta = b[0]
    if (b[1]) e.contaDestino = b[1]
  }
  const cat = categoriaPorTexto(texto)
  if (cat) { e.categoria = cat.categoria; e.descricao = cat.categoria }
  if (/\b(daquela|dessa|desta|aquela|da) (divida|conta|boleto|parcela)\b|\bque (eu )?devia\b|\bdo que devo\b/.test(texto)) e.referenciaTitulo = true
  if (/\b(quitei|quitar|paguei tudo|paguei o total|tudo que devia|o restante)\b/.test(texto)) e.quitar = true
  const c = contraparte(original, texto)
  if (c) e.contraparte = c
  return e
}

export function interpretar(original: string, hoje: string): Interpretacao {
  const bruto = original.slice(0, LIMITE_TEXTO * 2)
  const texto = normalizarTexto(bruto)
  const sinaisSuspeitos = original.length > LIMITE_TEXTO ? ["texto_longo"] : []
  for (const [re, sinal] of SUSPEITOS) if (re.test(texto) && !sinaisSuspeitos.includes(sinal)) sinaisSuspeitos.push(sinal)
  const base = { extracao: {}, sinaisSuspeitos }
  if (!texto) return { intencao: "DESCONHECIDO", ...base }
  const curto = texto.replace(/[.,]+/g, " ").replace(/\s+/g, " ").trim()
  if (CANCELAMENTO.test(curto)) return { intencao: "CANCELAMENTO", ...base }
  if (CONFIRMACOES.has(curto)) return { intencao: "CONFIRMACAO", ...base }
  if (NEGACOES.has(curto)) return { intencao: "NEGACAO", ...base }
  const plano = consulta(texto, bruto, hoje)
  if (plano) return { intencao: "CONSULTA", consulta: plano, ...base }
  const extracao = extrairCampos(bruto, hoje)
  if (CORRECAO.test(curto) || contemPalavra(curto, ["na verdade"])) return { intencao: "CORRECAO", extracao, sinaisSuspeitos }
  return { intencao: classificar(extensoParaDigitos(texto), extracao), extracao, sinaisSuspeitos }
}
