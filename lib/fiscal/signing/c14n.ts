/**
 * Parser XML seguro + Canonical XML 1.0 para o signer fiscal.
 *
 * A canonicalizacao e delegada ao algoritmo inclusivo C14N 1.0 de `xml-crypto`. O DOM e criado
 * por `@xmldom/xmldom`; DTD e declaracoes de entidade sao recusados antes do parser. O pequeno AST
 * publico preserva a API historica usada pelas validacoes estruturais, mas os bytes canonicos sao
 * sempre produzidos a partir do DOM namespace-aware original.
 */

import { DOMParser, XMLSerializer } from "@xmldom/xmldom"
import { C14nCanonicalization } from "xml-crypto"

export type C14nText = { type: "text"; value: string }
export type C14nElement = {
  type: "element"
  /** Nome local, sem prefixo. */
  name: string
  /** QName original, quando havia prefixo. */
  qualifiedName: string
  namespaceUri: string | null
  /** Atributos em ordem de origem (inclui `xmlns`/`xmlns:*`). */
  attrs: Array<{ name: string; value: string; namespaceUri: string | null; localName: string }>
  children: Array<C14nElement | C14nText>
}

export class XmlParseError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "XmlParseError"
  }
}

const DOM_NODE = Symbol("fiscal-c14n-dom-node")
type DomBackedElement = C14nElement & { [DOM_NODE]: Element }

function assertSafeXmlPolicy(xml: string): void {
  if (/<!DOCTYPE\b/i.test(xml)) {
    throw new XmlParseError("DOCTYPE/DTD nao e permitido no XML fiscal.")
  }
  if (/<!ENTITY\b/i.test(xml)) {
    throw new XmlParseError("Declaracoes ENTITY nao sao permitidas no XML fiscal.")
  }
}

function parseDocument(xml: string): Document {
  const issues: string[] = []
  const parser = new DOMParser({
    errorHandler: {
      warning: (message: string) => issues.push(message),
      error: (message: string) => issues.push(message),
      fatalError: (message: string) => issues.push(message),
    },
  })
  const document = parser.parseFromString(xml, "application/xml")
  if (!document.documentElement || issues.length > 0) {
    throw new XmlParseError(issues[0] ?? "Documento sem elemento raiz.")
  }
  return document
}

function toAst(node: Element): C14nElement {
  const attrs: C14nElement["attrs"] = []
  for (let index = 0; index < node.attributes.length; index += 1) {
    const attr = node.attributes.item(index)
    if (!attr) continue
    attrs.push({
      name: attr.name,
      value: attr.value,
      namespaceUri: attr.namespaceURI || null,
      localName: attr.localName || attr.name,
    })
  }

  const children: C14nElement["children"] = []
  for (let index = 0; index < node.childNodes.length; index += 1) {
    const child = node.childNodes.item(index)
    if (!child) continue
    if (child.nodeType === 1) {
      children.push(toAst(child as Element))
    } else if (child.nodeType === 3 || child.nodeType === 4) {
      children.push({ type: "text", value: child.nodeValue ?? "" })
    }
  }

  const ast: C14nElement = {
    type: "element",
    name: node.localName || node.tagName,
    qualifiedName: node.tagName,
    namespaceUri: node.namespaceURI || null,
    attrs,
    children,
  }
  Object.defineProperty(ast, DOM_NODE, { value: node, enumerable: false })
  return ast
}

/** Parser XML namespace-aware. DTD/ENTITY falham fechados antes do DOM. */
export function parseXml(xml: string): C14nElement {
  const source = String(xml ?? "").replace(/^\uFEFF/, "")
  if (!source.trim()) throw new XmlParseError("Documento sem elemento raiz.")
  assertSafeXmlPolicy(source)
  try {
    return toAst(parseDocument(source).documentElement)
  } catch (error) {
    if (error instanceof XmlParseError) throw error
    throw new XmlParseError("XML malformado ou recusado pela politica segura.")
  }
}

function domNodeOf(element: C14nElement): Element {
  const node = (element as Partial<DomBackedElement>)[DOM_NODE]
  if (!node) throw new XmlParseError("Elemento nao possui o DOM original para canonicalizacao.")
  return node
}

function escapeAttribute(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;")
}

function firstElementChild(node: Node): Element | null {
  for (let child = node.firstChild; child; child = child.nextSibling) {
    if (child.nodeType === 1) return child as Element
  }
  return null
}

function withInheritedDefaultNamespace(node: Element, namespaceUri: string): Element {
  if (node.namespaceURI) return node
  const serialized = new XMLSerializer().serializeToString(node)
  const wrapper = parseDocument(`<fiscal-c14n-wrapper xmlns="${escapeAttribute(namespaceUri)}">${serialized}</fiscal-c14n-wrapper>`)
  const child = firstElementChild(wrapper.documentElement)
  if (!child) throw new XmlParseError("Falha ao aplicar namespace herdado ao subset.")
  return child
}

/** Namespaces prefixados em vigor nos ancestrais, com a declaracao mais proxima vencendo. */
function collectAncestorNamespaces(node: Element): Array<{ prefix: string; namespaceURI: string }> {
  const declaredOnNode = new Set<string>()
  for (let index = 0; index < node.attributes.length; index += 1) {
    const attr = node.attributes.item(index)
    if (!attr) continue
    if (attr.name === "xmlns") declaredOnNode.add("")
    if (attr.prefix === "xmlns") declaredOnNode.add(attr.localName)
  }

  const seen = new Set<string>(declaredOnNode)
  const result: Array<{ prefix: string; namespaceURI: string }> = []
  let parent = node.parentNode
  while (parent?.nodeType === 1) {
    const element = parent as Element
    for (let index = 0; index < element.attributes.length; index += 1) {
      const attr = element.attributes.item(index)
      if (!attr) continue
      const prefix = attr.name === "xmlns" ? "" : attr.prefix === "xmlns" ? attr.localName : null
      if (prefix === null || seen.has(prefix)) continue
      seen.add(prefix)
      // O canonicalizador ja renderiza o default a partir de `node.namespaceURI`; inclui-lo aqui
      // produziria uma declaracao duplicada. Prefixos adicionais sao inclusivos no C14N 1.0.
      if (prefix !== "") result.push({ prefix, namespaceURI: attr.value })
    }
    parent = parent.parentNode
  }
  return result
}

/**
 * Canonicaliza o elemento com C14N 1.0 inclusivo, sem comentarios.
 *
 * `inheritedDefaultNs` existe por compatibilidade com a API anterior. Ele so e aplicado quando o
 * elemento foi parseado isoladamente e, portanto, ainda nao possui namespace no DOM.
 */
export function canonicalizeElement(element: C14nElement, inheritedDefaultNs: string | null = null): string {
  let node = domNodeOf(element)
  if (inheritedDefaultNs && !node.namespaceURI) {
    node = withInheritedDefaultNamespace(node, inheritedDefaultNs)
  }
  return new C14nCanonicalization().process(node, {
    ancestorNamespaces: collectAncestorNamespaces(node),
  })
}

/** Busca, em profundidade, todos os elementos com o nome local dado. */
export function findAll(element: C14nElement, name: string): C14nElement[] {
  const found: C14nElement[] = []
  if (element.name === name || element.qualifiedName === name) found.push(element)
  for (const child of element.children) {
    if (child.type === "element") found.push(...findAll(child, name))
  }
  return found
}

/** Busca, em profundidade, o primeiro elemento com o nome local dado. */
export function findFirst(element: C14nElement, name: string): C14nElement | null {
  return findAll(element, name)[0] ?? null
}

/** Filhos-elemento diretos, opcionalmente filtrados por nome local e namespace. */
export function childElements(
  element: C14nElement,
  name?: string,
  namespaceUri?: string,
): C14nElement[] {
  return element.children.filter((child): child is C14nElement => {
    if (child.type !== "element") return false
    if (name && child.name !== name && child.qualifiedName !== name) return false
    if (namespaceUri && child.namespaceUri !== namespaceUri) return false
    return true
  })
}

/** Busca todos os elementos cujo atributo nao-namespaced `Id` e igual ao valor dado. */
export function findAllById(element: C14nElement, id: string): C14nElement[] {
  const found: C14nElement[] = []
  if (element.attrs.some((attr) => attr.name === "Id" && attr.namespaceUri === null && attr.value === id)) {
    found.push(element)
  }
  for (const child of element.children) {
    if (child.type === "element") found.push(...findAllById(child, id))
  }
  return found
}

/** Busca o primeiro elemento cujo atributo `Id` e igual ao valor dado. */
export function findById(element: C14nElement, id: string): C14nElement | null {
  return findAllById(element, id)[0] ?? null
}

/** Texto concatenado dos filhos-texto diretos de um elemento (trim). */
export function textOf(element: C14nElement | null): string {
  if (!element) return ""
  return element.children
    .filter((child): child is C14nText => child.type === "text")
    .map((child) => child.value)
    .join("")
    .trim()
}

/** Valor de um atributo (ou string vazia). */
export function attrOf(element: C14nElement | null, name: string): string {
  if (!element) return ""
  return element.attrs.find((attr) => attr.name === name)?.value ?? ""
}
