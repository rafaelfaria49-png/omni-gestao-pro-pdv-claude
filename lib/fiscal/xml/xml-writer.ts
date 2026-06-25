/**
 * Serializador XML mínimo, PURO e DETERMINÍSTICO (BL-FISCAL-004 — XML NFC-e 4.00).
 *
 * Sem dependências externas, sem efeitos colaterais, sem estado global. Recebe uma árvore
 * de nós e devolve uma string. A ordem dos filhos é EXATAMENTE a ordem do array (o XSD da
 * NFC-e é ordenado por sequência), e a ordem dos atributos é a ordem de inserção do objeto.
 *
 * Por que um serializador próprio (e não uma lib): o builder fiscal precisa de controle total
 * sobre ordenação e escape, saída estável (determinística) e zero dependência de runtime —
 * requisitos da camada fiscal dormente (ADR-0008 P3/P4: documento serializado uma única vez).
 */

export type XmlAttrs = Record<string, string | number | null | undefined>

/**
 * Nó da árvore XML. Um nó é folha (`text`) OU contêiner (`children`), nunca os dois.
 * Filhos podem ser `null`/`undefined`/`false` para permitir grupos opcionais condicionais
 * (são filtrados na serialização).
 */
export type XmlNode = {
  tag: string
  attrs?: XmlAttrs
  children?: Array<XmlNode | null | undefined | false>
  text?: string | number | null
}

/** Escapa texto de elemento (&, <, >). */
export function escapeXmlText(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
}

/** Escapa valor de atributo (texto + aspas duplas). */
export function escapeXmlAttr(value: string): string {
  return escapeXmlText(value).replace(/"/g, "&quot;")
}

function serializeAttrs(attrs: XmlAttrs | undefined): string {
  if (!attrs) return ""
  const parts: string[] = []
  for (const key of Object.keys(attrs)) {
    const v = attrs[key]
    if (v === null || v === undefined) continue
    parts.push(` ${key}="${escapeXmlAttr(String(v))}"`)
  }
  return parts.join("")
}

function isPresentChild(c: XmlNode | null | undefined | false): c is XmlNode {
  return !!c
}

/**
 * Serializa um nó XML em string com indentação determinística (2 espaços por nível).
 * Folha sem `text` definido vira tag vazia `<tag/>`.
 */
export function serializeXml(
  node: XmlNode,
  opts: { indentUnit?: string; level?: number } = {},
): string {
  const indentUnit = opts.indentUnit ?? "  "
  const level = opts.level ?? 0
  const pad = indentUnit.repeat(level)
  const open = `<${node.tag}${serializeAttrs(node.attrs)}`

  const children = (node.children ?? []).filter(isPresentChild)

  // Folha (com texto) — inclusive texto vazio explícito ("") vira <tag></tag>.
  if (children.length === 0) {
    if (node.text === null || node.text === undefined) {
      return `${pad}${open}/>`
    }
    return `${pad}${open}>${escapeXmlText(String(node.text))}</${node.tag}>`
  }

  // Contêiner — filhos em linhas próprias, ordenados conforme o array.
  const inner = children
    .map((child) => serializeXml(child, { indentUnit, level: level + 1 }))
    .join("\n")
  return `${pad}${open}>\n${inner}\n${pad}</${node.tag}>`
}

/** Documento XML completo (com declaração opcional). */
export function serializeXmlDocument(
  root: XmlNode,
  opts: { declaration?: boolean; indentUnit?: string } = {},
): string {
  const body = serializeXml(root, { indentUnit: opts.indentUnit })
  if (opts.declaration === false) return body
  return `<?xml version="1.0" encoding="UTF-8"?>\n${body}`
}

/** Helper de folha: cria um nó-texto, ou `null` quando o valor é vazio/ausente. */
export function leaf(tag: string, value: string | number | null | undefined): XmlNode | null {
  if (value === null || value === undefined) return null
  const s = typeof value === "number" ? String(value) : value
  if (s === "") return null
  return { tag, text: s }
}

/** Helper de folha obrigatória: sempre emite a tag (mesmo com valor vazio). */
export function leafRequired(tag: string, value: string | number): XmlNode {
  return { tag, text: value }
}

/** Helper de contêiner: cria um nó com filhos (já filtra nulos na serialização). */
export function group(
  tag: string,
  children: Array<XmlNode | null | undefined | false>,
  attrs?: XmlAttrs,
): XmlNode {
  return { tag, attrs, children }
}
