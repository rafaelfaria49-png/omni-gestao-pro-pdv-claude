/**
 * Canonicalização XML para XMLDSig da NFC-e (BL-FISCAL-005 · TAREFA 1).
 *
 * Parser XML mínimo + serializador CANÔNICO determinístico, PURO (sem libs, sem I/O). Produz
 * uma forma estável de um elemento (e seus descendentes) para cálculo de digest/assinatura,
 * de modo que `sign` e `verify` cheguem aos MESMOS bytes.
 *
 * Aderência ao C14N 1.0 (http://www.w3.org/TR/2001/REC-xml-c14n-20010315):
 *  - Declarações de namespace antes dos atributos; atributos ordenados por nome (Unicode).
 *  - Namespace default herdado é renderizado no ÁPICE do subconjunto (comportamento de subset C14N).
 *  - Elementos vazios expandidos (`<a></a>`).
 * Desvios CONSCIENTES (documentados — endurecer antes da homologação/F-SEFAZ):
 *  - Nós de texto compostos só por espaço em branco entre elementos são descartados (independe de
 *    indentação); texto significativo é preservado VERBATIM (entidades mantidas como vieram).
 *  - Não há normalização de fim de linha nem de referências de caractere.
 * Como `sign` e `verify` usam exatamente este canonicalizador, a assinatura é autoconsistente e
 * detecta adulteração (qualquer mudança em valor/atributo altera o digest).
 */

export type C14nText = { type: "text"; value: string }
export type C14nElement = {
  type: "element"
  name: string
  /** Atributos em ordem de origem (inclui `xmlns`/`xmlns:*`). */
  attrs: Array<{ name: string; value: string }>
  children: Array<C14nElement | C14nText>
}

export class XmlParseError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "XmlParseError"
  }
}

const WS_ONLY = /^[\s﻿\xA0]*$/

function isWhitespaceOnly(s: string): boolean {
  return WS_ONLY.test(s)
}

/** Parser recursivo simples para XML bem-formado (sem CDATA/comentários/PI internos). */
export function parseXml(xml: string): C14nElement {
  const src = String(xml ?? "")
  let i = 0
  const n = src.length

  const skipDeclAndProlog = () => {
    while (i < n) {
      // pula espaços
      while (i < n && /\s/.test(src[i]!)) i++
      if (src.startsWith("<?", i)) {
        const end = src.indexOf("?>", i)
        if (end < 0) throw new XmlParseError("Declaração XML não terminada.")
        i = end + 2
        continue
      }
      if (src.startsWith("<!--", i)) {
        const end = src.indexOf("-->", i)
        if (end < 0) throw new XmlParseError("Comentário não terminado.")
        i = end + 3
        continue
      }
      if (src.startsWith("<!", i)) {
        const end = src.indexOf(">", i)
        if (end < 0) throw new XmlParseError("Declaração DOCTYPE não terminada.")
        i = end + 1
        continue
      }
      break
    }
  }

  const parseName = (): string => {
    const start = i
    while (i < n && !/[\s/>=]/.test(src[i]!)) i++
    if (i === start) throw new XmlParseError(`Nome de tag/atributo vazio na posição ${i}.`)
    return src.slice(start, i)
  }

  const parseAttrs = (): Array<{ name: string; value: string }> => {
    const attrs: Array<{ name: string; value: string }> = []
    for (;;) {
      while (i < n && /\s/.test(src[i]!)) i++
      if (i >= n) throw new XmlParseError("Atributos não terminados.")
      const c = src[i]!
      if (c === ">" || c === "/") break
      const name = parseName()
      while (i < n && /\s/.test(src[i]!)) i++
      let value = ""
      if (src[i] === "=") {
        i++ // '='
        while (i < n && /\s/.test(src[i]!)) i++
        const quote = src[i]
        if (quote !== '"' && quote !== "'") throw new XmlParseError(`Valor de atributo "${name}" sem aspas.`)
        i++ // abre aspas
        const start = i
        while (i < n && src[i] !== quote) i++
        if (i >= n) throw new XmlParseError(`Valor de atributo "${name}" não terminado.`)
        value = src.slice(start, i)
        i++ // fecha aspas
      }
      attrs.push({ name, value })
    }
    return attrs
  }

  const parseElement = (): C14nElement => {
    if (src[i] !== "<") throw new XmlParseError(`Esperado '<' na posição ${i}.`)
    i++ // '<'
    const name = parseName()
    const attrs = parseAttrs()
    while (i < n && /\s/.test(src[i]!)) i++
    const el: C14nElement = { type: "element", name, attrs, children: [] }
    if (src[i] === "/") {
      i++ // '/'
      if (src[i] !== ">") throw new XmlParseError("Self-closing malformado.")
      i++ // '>'
      return el
    }
    if (src[i] !== ">") throw new XmlParseError(`Tag <${name}> malformada.`)
    i++ // '>'
    // conteúdo
    for (;;) {
      if (i >= n) throw new XmlParseError(`Tag <${name}> não fechada.`)
      if (src.startsWith("</", i)) {
        i += 2
        const closeName = parseName()
        while (i < n && /\s/.test(src[i]!)) i++
        if (src[i] !== ">") throw new XmlParseError(`Fechamento </${closeName}> malformado.`)
        i++ // '>'
        if (closeName !== name) throw new XmlParseError(`Fechamento </${closeName}> não casa com <${name}>.`)
        return el
      }
      if (src.startsWith("<!--", i)) {
        const end = src.indexOf("-->", i)
        if (end < 0) throw new XmlParseError("Comentário não terminado.")
        i = end + 3
        continue
      }
      if (src[i] === "<") {
        el.children.push(parseElement())
        continue
      }
      // texto até o próximo '<'
      const start = i
      while (i < n && src[i] !== "<") i++
      el.children.push({ type: "text", value: src.slice(start, i) })
    }
  }

  skipDeclAndProlog()
  if (i >= n || src[i] !== "<") throw new XmlParseError("Documento sem elemento raiz.")
  const root = parseElement()
  return root
}

/** xmlns default declarado diretamente no elemento (ou null). */
function ownDefaultNs(el: C14nElement): string | null {
  for (const a of el.attrs) if (a.name === "xmlns") return a.value
  return null
}

/** Atributos não-namespace (excluí xmlns e xmlns:*), ordenados por nome (codepoint). */
function regularAttrsSorted(el: C14nElement): Array<{ name: string; value: string }> {
  return el.attrs
    .filter((a) => a.name !== "xmlns" && !a.name.startsWith("xmlns:"))
    .slice()
    .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
}

function renderElement(el: C14nElement, renderedDefaultNs: string | null, isApex: boolean): string {
  const own = ownDefaultNs(el)
  const effective = own !== null ? own : renderedDefaultNs

  // Decide se emite xmlns="...": no ápice, emite o default herdado/efetivo (se houver);
  // em descendentes, só quando o default muda em relação ao já renderizado.
  let nsDecl = ""
  if (isApex) {
    if (effective !== null && effective !== "") nsDecl = ` xmlns="${effective}"`
  } else if (own !== null && own !== renderedDefaultNs) {
    nsDecl = ` xmlns="${own}"`
  }

  let attrsStr = ""
  for (const a of regularAttrsSorted(el)) attrsStr += ` ${a.name}="${a.value}"`

  // filhos: descarta texto só-whitespace; preserva texto significativo verbatim.
  const parts: string[] = []
  for (const child of el.children) {
    if (child.type === "text") {
      if (!isWhitespaceOnly(child.value)) parts.push(child.value)
    } else {
      parts.push(renderElement(child, effective, false))
    }
  }

  const open = `<${el.name}${nsDecl}${attrsStr}>`
  return `${open}${parts.join("")}</${el.name}>`
}

/**
 * Canonicaliza um elemento (subconjunto), renderizando no ápice o namespace default herdado.
 * `inheritedDefaultNs` = o xmlns default em vigor no PAI do elemento (o que o C14N de subset
 * renderiza no topo). Para `infNFe`, é o `xmlns` do `<NFe>`; para `SignedInfo`, o da `<Signature>`.
 */
export function canonicalizeElement(el: C14nElement, inheritedDefaultNs: string | null = null): string {
  return renderElement(el, inheritedDefaultNs, true)
}

/** Busca, em profundidade, o primeiro elemento com o nome (tag) dado. */
export function findFirst(el: C14nElement, name: string): C14nElement | null {
  if (el.name === name) return el
  for (const c of el.children) {
    if (c.type === "element") {
      const found = findFirst(c, name)
      if (found) return found
    }
  }
  return null
}

/** Busca o primeiro elemento cujo atributo `Id` é igual ao valor dado. */
export function findById(el: C14nElement, id: string): C14nElement | null {
  if (el.attrs.some((a) => a.name === "Id" && a.value === id)) return el
  for (const c of el.children) {
    if (c.type === "element") {
      const found = findById(c, id)
      if (found) return found
    }
  }
  return null
}

/** Texto concatenado dos filhos-texto diretos de um elemento (trim). */
export function textOf(el: C14nElement | null): string {
  if (!el) return ""
  let out = ""
  for (const c of el.children) if (c.type === "text") out += c.value
  return out.trim()
}

/** Valor de um atributo (ou ""). */
export function attrOf(el: C14nElement | null, name: string): string {
  if (!el) return ""
  for (const a of el.attrs) if (a.name === name) return a.value
  return ""
}
