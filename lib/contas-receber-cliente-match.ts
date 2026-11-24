/**
 * Correspondência cliente × título de Contas a Receber — determinística e positiva.
 *
 * Substitui o casamento por substring bidirecional que existia no PDV
 * (`titulo.includes(cliente) || cliente.includes(titulo)`, achado H da auditoria
 * `AUDITORIA_PDV_RECEBIMENTO_MULTITITULO_DESIGN_001.md`), no qual "Ana" casava com
 * "Mariana" e "Joana" — e um operador podia receber a conta de outro cliente.
 *
 * Regras:
 *  - **Escada de prioridade** (identificador estável → documento → telefone → nome):
 *    o primeiro degrau em que AMBOS os lados têm valor é **decisivo**. Não bate ali,
 *    não bate em degrau nenhum — cair para o nome depois de um id divergente
 *    reabriria a porta do homônimo.
 *  - **Nunca por aproximação.** Igualdade exata sobre a forma normalizada; sem
 *    `includes`, sem prefixo, sem distância de edição.
 *  - **Falso-negativo é preferível.** Sem identificação segura o título não é
 *    atribuído ao cliente — deixar de cobrar é recuperável, receber a conta de
 *    outra pessoa não é.
 *
 * Módulo puro (sem React, sem Prisma): roda no harness `node` do Vitest.
 */

/** Nome: sem acento, sem caixa, com espaços internos colapsados. */
export function normalizeNomeCliente(s: string | null | undefined): string {
  return String(s ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
}

/** CPF/CNPJ: só dígitos. Máscara não muda a identidade do documento. */
export function normalizeDocumento(s: string | null | undefined): string {
  return String(s ?? "").replace(/\D/g, "")
}

/**
 * Telefone: só dígitos, sem o prefixo internacional do Brasil. `+55 (11) 98888-7777`
 * e `11988887777` são o mesmo assinante e precisam normalizar igual.
 */
export function normalizeTelefone(s: string | null | undefined): string {
  const d = String(s ?? "").replace(/\D/g, "")
  return d.length > 11 && d.startsWith("55") ? d.slice(2) : d
}

/** Identificador estável: só é chave se não for vazio depois do trim. */
function idKey(s: string | null | undefined): string {
  return String(s ?? "").trim()
}

/** Cliente selecionado na busca do PDV (`/api/clientes` → `Cliente.id`). */
export type ClienteIdentidade = {
  id?: string | null
  name?: string | null
  document?: string | null
  phone?: string | null
}

/**
 * Identidade do título. Hoje `ContaReceberTitulo` só tem a coluna `cliente` (nome) e,
 * quando a origem preencheu, `payload.clienteId` — que aponta para o MESMO
 * `Cliente.id` devolvido por `/api/clientes`. `clienteDocumento`/`clienteTelefone`
 * ficam previstos pela escada e são lidos quando a origem os fornecer.
 */
export type TituloClienteIdentidade = {
  clienteId?: string | null
  cliente?: string | null
  clienteDocumento?: string | null
  clienteTelefone?: string | null
}

export type NomeUnicoResolver = (nomeNormalizado: string) => boolean | null | undefined

export type MatchTituloOptions = {
  /**
   * Predicado para verificar unicidade do nome na loja ativa.
   * Só é consultado se o matching depender exclusivamente do degrau 4 (nome exato).
   */
  isNomeUnico?: NomeUnicoResolver
  /**
   * Conjunto de nomes normalizados ambíguos (que pertencem a 2+ clientes distintos na loja).
   * Se o nome do título constar aqui, o vínculo é bloqueado imediatamente.
   */
  nomesAmbiguos?: ReadonlySet<string> | string[]
  /**
   * Conjunto de nomes normalizados comprovadamente únicos na loja ativa.
   */
  nomesUnicos?: ReadonlySet<string> | string[]
}

/**
 * Mapeia todos os nomes normalizados que pertencem a 2 ou mais clientes com IDs distintos
 * dentro da mesma loja.
 */
export function mapearNomesAmbiguos(
  clientes: Iterable<{ id?: string | null; name?: string | null }>,
): Set<string> {
  const idsPorNome = new Map<string, Set<string>>()
  for (const c of clientes) {
    const nomeNorm = normalizeNomeCliente(c.name)
    const id = idKey(c.id)
    if (!nomeNorm || !id) continue
    let ids = idsPorNome.get(nomeNorm)
    if (!ids) {
      ids = new Set<string>()
      idsPorNome.set(nomeNorm, ids)
    }
    ids.add(id)
  }

  const ambiguos = new Set<string>()
  for (const [nomeNorm, ids] of idsPorNome.entries()) {
    if (ids.size > 1) {
      ambiguos.add(nomeNorm)
    }
  }
  return ambiguos
}

/**
 * Cria um resolvedor de nome único a partir da lista de clientes da loja.
 * - Nomes com 2+ clientes com IDs diferentes => false (ambíguo)
 * - Nomes com 1 cliente conhecido na loja => true (único)
 * - Nomes sem nenhum cliente conhecido => false (fail-closed)
 */
export function criarResolvedorNomeUnico(
  clientes: Iterable<{ id?: string | null; name?: string | null }>,
): NomeUnicoResolver {
  const ambiguos = mapearNomesAmbiguos(clientes)
  const conhecidos = new Set<string>()
  for (const c of clientes) {
    const n = normalizeNomeCliente(c.name)
    if (n) conhecidos.add(n)
  }
  return (nomeNorm: string) => {
    if (!nomeNorm) return false
    if (!conhecidos.has(nomeNorm)) return false
    return !ambiguos.has(nomeNorm)
  }
}

/**
 * Verifica se o nome pode ser usado como fallback segundo as opções fornecidas.
 * Fail-closed: se não houver prova de unicidade, ou se a checagem falhar/lançar erro, devolve false.
 */
export function verificarNomeUnico(
  nomeNorm: string,
  opts?: MatchTituloOptions | NomeUnicoResolver,
): boolean {
  if (!nomeNorm || !opts) return false

  // Se passou resolvedor direto como função:
  if (typeof opts === "function") {
    try {
      return opts(nomeNorm) === true
    } catch {
      return false
    }
  }

  // Se passou nomesAmbiguos explícitos:
  if (opts.nomesAmbiguos) {
    const ambSet =
      opts.nomesAmbiguos instanceof Set
        ? opts.nomesAmbiguos
        : new Set(opts.nomesAmbiguos)
    if (ambSet.has(nomeNorm)) return false
  }

  // Se passou nomesUnicos explícitos:
  if (opts.nomesUnicos) {
    const uniSet =
      opts.nomesUnicos instanceof Set
        ? opts.nomesUnicos
        : new Set(opts.nomesUnicos)
    return uniSet.has(nomeNorm)
  }

  // Se passou isNomeUnico (função):
  if (typeof opts.isNomeUnico === "function") {
    try {
      return opts.isNomeUnico(nomeNorm) === true
    } catch {
      return false
    }
  }

  // Se passou nomesAmbiguos e NÃO constava no conjunto: é único na loja
  if (opts.nomesAmbiguos) {
    return true
  }

  return false
}

export type ClienteMatchVia = "clienteId" | "documento" | "telefone" | "nome"

/**
 * Degrau em que o título foi atribuído ao cliente, ou `null` quando não há
 * identificação segura. `null` também é a resposta quando um degrau decisivo
 * DIVERGE — o resultado nunca "melhora" descendo a escada.
 *
 * Para o degrau 4 (`nome`), exige prova de unicidade na loja ativa via `opts`.
 * Na ausência de prova, erro ou homônimo => fail-closed (`null`).
 */
export function matchTituloCliente(
  titulo: TituloClienteIdentidade,
  cliente: ClienteIdentidade,
  opts?: MatchTituloOptions | NomeUnicoResolver,
): ClienteMatchVia | null {
  const tId = idKey(titulo.clienteId)
  const cId = idKey(cliente.id)
  if (tId && cId) return tId === cId ? "clienteId" : null

  const tDoc = normalizeDocumento(titulo.clienteDocumento)
  const cDoc = normalizeDocumento(cliente.document)
  if (tDoc && cDoc) return tDoc === cDoc ? "documento" : null

  const tTel = normalizeTelefone(titulo.clienteTelefone)
  const cTel = normalizeTelefone(cliente.phone)
  if (tTel && cTel) return tTel === cTel ? "telefone" : null

  const tNome = normalizeNomeCliente(titulo.cliente)
  const cNome = normalizeNomeCliente(cliente.name)
  if (tNome && cNome && tNome === cNome) {
    // Para usar SOMENTE nome como fallback, prove antes que o nome exato
    // normalizado identifica um único Cliente dentro da loja ativa.
    if (!verificarNomeUnico(tNome, opts)) {
      return null
    }
    return "nome"
  }

  return null
}

/** Açúcar booleano sobre `matchTituloCliente`. */
export function tituloPertenceAoCliente(
  titulo: TituloClienteIdentidade,
  cliente: ClienteIdentidade,
  opts?: MatchTituloOptions | NomeUnicoResolver,
): boolean {
  return matchTituloCliente(titulo, cliente, opts) !== null
}

// ─── clientes com títulos em aberto (lista inicial do recebimento F5/F9) ─────────────

/** "11977776666" → "•••6666"; vazio → null. */
export function mascararFinal(v: string | null | undefined, n: number): string | null {
  const d = String(v ?? "").replace(/\D/g, "")
  return d.length > n ? `•••${d.slice(-n)}` : d ? `•••${d}` : null
}

export type ClienteComAberto = {
  id: string
  name: string
  phone: string | null
  document: string | null
  qtdAbertos: number
  totalAberto: number
}

/**
 * Clientes da loja que têm títulos com saldo em aberto, maiores devedores primeiro.
 *
 * Usa o MESMO `tituloPertenceAoCliente` do modal (escada id → documento → telefone →
 * nome único), então a lista inicial nunca oferece um cliente cujos títulos o modal
 * esconderia — nem atribui a dívida de um homônimo. Título sem identificação segura
 * simplesmente não entra (falso-negativo é preferível).
 *
 * Os candidatos de cada título vêm de índices por id e por nome normalizado; o
 * veredito final é sempre do matcher.
 */
export function resumirClientesComAberto(
  clientes: Iterable<{ id?: string | null; name?: string | null; phone?: string | null; document?: string | null }>,
  titulos: Iterable<TituloClienteIdentidade & { saldoAberto: number }>,
  opts: MatchTituloOptions,
  limite = 50,
): ClienteComAberto[] {
  const porId = new Map<string, { id: string; name: string; phone: string | null; document: string | null }>()
  const porNome = new Map<string, string[]>()
  for (const c of clientes) {
    const id = idKey(c.id)
    const name = String(c.name ?? "").trim()
    if (!id || !name) continue
    // Lista enviada sem pedido a qualquer operador do caixa: só o mínimo para distinguir
    // pessoas — final do telefone/documento, nunca o dado completo (minimização de PII).
    porId.set(id, { id, name, phone: mascararFinal(c.phone, 4), document: mascararFinal(c.document, 3) })
    const n = normalizeNomeCliente(name)
    const lista = porNome.get(n)
    if (lista) lista.push(id)
    else porNome.set(n, [id])
  }

  const acc = new Map<string, ClienteComAberto>()
  for (const t of titulos) {
    const saldo = Number(t.saldoAberto)
    if (!Number.isFinite(saldo) || saldo <= 0.009) continue
    const candidatos = new Set<string>()
    const tId = idKey(t.clienteId)
    if (tId && porId.has(tId)) candidatos.add(tId)
    for (const id of porNome.get(normalizeNomeCliente(t.cliente)) ?? []) candidatos.add(id)
    for (const id of candidatos) {
      const c = porId.get(id)!
      if (!tituloPertenceAoCliente(t, c, opts)) continue
      const cur = acc.get(id) ?? { ...c, qtdAbertos: 0, totalAberto: 0 }
      cur.qtdAbertos += 1
      cur.totalAberto = Math.round((cur.totalAberto + saldo) * 100) / 100
      acc.set(id, cur)
    }
  }
  return [...acc.values()]
    .sort((a, b) => b.totalAberto - a.totalAberto || a.name.localeCompare(b.name, "pt-BR"))
    .slice(0, Math.max(0, limite))
}
