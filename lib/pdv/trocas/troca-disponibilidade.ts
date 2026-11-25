/**
 * OMNI-PDV-TROCAS-DEVOLUCOES-INTEGRIDADE-HISTORICO-P1-001
 *
 * Núcleo PURO de trocas/devoluções — sem Prisma, sem rede. É a única regra de:
 *  - identidade da linha original (`lineIndex` = posição em `Venda.payload.lines`, com
 *    fallback para `ItemVenda` quando a venda legada não tem payload);
 *  - quantidade já devolvida por linha (devoluções PERSISTIDAS no servidor — nunca o
 *    `qtyReturned` do localStorage, que é só reflexo otimista de um terminal);
 *  - valor devolvido (proporcional ao total líquido da venda, centavo a centavo, sem
 *    nunca ultrapassar o valor efetivamente pago na linha somando devoluções parciais);
 *  - destino físico de cada linha (produto volta ao estoque; serviço, item avulso ou
 *    produto removido nunca geram movimento inventado).
 */
import { resolveSaleLineItemType, type SaleLineItemType } from "@/lib/sale-line-classification"
import { isVirtualSaleLine } from "@/lib/os-pdv-virtual-lines"

export const TROCA_PAYLOAD_SCHEMA = "pdv-troca-v1" as const

export function arredonda2(n: number): number {
  return Math.round((Number.isFinite(n) ? n : 0) * 100) / 100
}

function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null
}

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : ""
}

function num(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v)
  return Number.isFinite(n) ? n : 0
}

/** Linha da venda original, com identidade estável e códigos do snapshot quando existirem. */
export type LinhaVendaOriginal = {
  lineIndex: number
  inventoryId: string
  /** `Produto.id` capturado no carrinho (quando a venda o registrou). */
  produtoId: string
  name: string
  quantity: number
  unitPrice: number
  lineTotal: number
  itemType: SaleLineItemType
  isAvulso: boolean
  /** Linha de aparelho controlado por IMEI (reversão não integrada — F8). */
  isDevice: boolean
  /** Seleção modelo/cor de acessório (dado passivo, só exibição). */
  accessoryLabel: string
  /** Códigos gravados NA VENDA (snapshot histórico). Nunca preenchido a partir do cadastro atual. */
  snapshotSku: string
  snapshotBarcode: string
  /**
   * Código operacional gravado na linha no momento da venda (`inventoryId` quando ele é
   * SKU/EAN e não o id técnico do produto). É dado histórico real — vendas antigas não têm
   * campo próprio de código, mas o PDV gravava aqui o código bipado/selecionado.
   */
  codigoNaVenda: string
}

export type ItemVendaRow = {
  inventoryId: string | null
  nome: string
  quantidade: number
  precoUnitario: number
  lineTotal: number
}

/** `inventoryId` que é código de balcão (SKU/EAN), não id técnico (cuid) nem linha virtual. */
function codigoOperacional(inventoryId: string, produtoId: string): string {
  if (!inventoryId || inventoryId === produtoId || isVirtualSaleLine(inventoryId)) return ""
  if (/^c[a-z0-9]{20,}$/.test(inventoryId)) return ""
  return inventoryId
}

function accessoryLabelFrom(sel: unknown): string {
  const o = asRecord(sel)
  if (!o) return ""
  const modelo = [str(o.deviceBrand), str(o.deviceModelName)].filter(Boolean).join(" ")
  const cor = str(o.customColorLabel) || str(o.colorLabel)
  const partes = [modelo, cor].filter(Boolean)
  return partes.join(" · ")
}

/**
 * Deriva as linhas da venda. `payload.lines` é a fonte rica (itemType, produtoId, avulso,
 * acessório); `ItemVenda` é o fallback de vendas legadas sem snapshot de linhas.
 */
export function linhasDaVenda(payload: unknown, itens: ItemVendaRow[]): LinhaVendaOriginal[] {
  const p = asRecord(payload)
  const raw = p && Array.isArray(p.lines) ? (p.lines as unknown[]) : null
  if (raw && raw.length > 0) {
    return raw.map((rawLine, lineIndex) => {
      const l = asRecord(rawLine) ?? {}
      const inventoryId = str(l.inventoryId)
      const quantity = Math.max(0, Math.round(num(l.quantity)))
      const unitPrice = num(l.unitPrice)
      const lineTotal = l.lineTotal !== undefined ? num(l.lineTotal) : arredonda2(unitPrice * quantity)
      const itemType = resolveSaleLineItemType({
        inventoryId,
        itemType: (l.itemType as SaleLineItemType | undefined) ?? null,
        isAvulso: l.isAvulso === true,
      })
      return {
        lineIndex,
        inventoryId,
        produtoId: str(l.produtoId),
        name: str(l.name) || "Item",
        quantity,
        unitPrice,
        lineTotal,
        itemType,
        isAvulso: itemType === "avulso",
        isDevice: Boolean(asRecord(l.deviceSale)),
        accessoryLabel: accessoryLabelFrom(l.accessorySelection),
        snapshotSku: str(l.sku),
        snapshotBarcode: str(l.barcode) || str(l.codigoBarras),
        codigoNaVenda: itemType === "produto" ? codigoOperacional(inventoryId, str(l.produtoId)) : "",
      }
    })
  }
  return itens.map((it, lineIndex) => {
    const inventoryId = it.inventoryId ?? ""
    const itemType = resolveSaleLineItemType({ inventoryId })
    return {
      lineIndex,
      inventoryId,
      produtoId: "",
      name: it.nome || "Item",
      quantity: Math.max(0, Math.round(it.quantidade)),
      unitPrice: it.precoUnitario,
      lineTotal: it.lineTotal,
      itemType,
      isAvulso: itemType === "avulso",
      isDevice: false,
      accessoryLabel: "",
      snapshotSku: "",
      snapshotBarcode: "",
      codigoNaVenda: "",
    }
  })
}

/** Devolução persistida (qualquer origem: fluxo novo `pdv-troca-v1` ou rota legada). */
export type DevolucaoPersistida = {
  id: string
  localId: string
  tipo: string
  at: Date | string
  payload: unknown
  itens: Array<{ inventoryId: string | null; nome: string; quantidade: number }>
}

export type AlocacaoLinha = {
  lineIndex: number
  devolvido: number
  devolucoes: Array<{ localId: string; quantidade: number }>
}

/** Linhas explícitas (`lineIndex`) gravadas pelo fluxo novo. */
function linhasExplicitas(payload: unknown): Array<{ lineIndex: number; quantidade: number }> | null {
  const p = asRecord(payload)
  if (!p || p.schema !== TROCA_PAYLOAD_SCHEMA || !Array.isArray(p.linhas)) return null
  const out: Array<{ lineIndex: number; quantidade: number }> = []
  for (const raw of p.linhas as unknown[]) {
    const l = asRecord(raw)
    if (!l) continue
    const lineIndex = Math.trunc(num(l.lineIndex))
    const quantidade = Math.max(0, Math.round(num(l.quantidade)))
    if (lineIndex >= 0 && quantidade > 0) out.push({ lineIndex, quantidade })
  }
  return out
}

function chaveLegada(inventoryId: string, nome: string): string {
  return inventoryId ? `id:${inventoryId}` : `nome:${nome.trim().toLowerCase()}`
}

/**
 * Atribui devoluções persistidas às linhas da venda.
 *  - Fluxo novo: exato por `lineIndex`.
 *  - Legado (só `inventoryId`/`nome`): distribui em ordem pelas linhas com a mesma chave,
 *    limitado ao saldo de cada linha. Nada é contado duas vezes; o que não couber em
 *    nenhuma linha vai para `naoAlocado` (sinal de inconsistência, exibido à parte).
 */
export function alocarDevolucoes(
  linhas: LinhaVendaOriginal[],
  devolucoes: DevolucaoPersistida[],
): { porLinha: AlocacaoLinha[]; naoAlocado: Array<{ localId: string; nome: string; quantidade: number }> } {
  const porLinha: AlocacaoLinha[] = linhas.map((l) => ({ lineIndex: l.lineIndex, devolvido: 0, devolucoes: [] }))
  const naoAlocado: Array<{ localId: string; nome: string; quantidade: number }> = []
  const add = (idx: number, localId: string, q: number) => {
    const a = porLinha[idx]!
    a.devolvido += q
    const ex = a.devolucoes.find((d) => d.localId === localId)
    if (ex) ex.quantidade += q
    else a.devolucoes.push({ localId, quantidade: q })
  }

  const ordenadas = [...devolucoes].sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime())
  for (const dev of ordenadas) {
    const explicitas = linhasExplicitas(dev.payload)
    if (explicitas) {
      for (const e of explicitas) {
        if (e.lineIndex < linhas.length) add(e.lineIndex, dev.localId, e.quantidade)
        else naoAlocado.push({ localId: dev.localId, nome: `linha ${e.lineIndex}`, quantidade: e.quantidade })
      }
      continue
    }
    for (const it of dev.itens) {
      let restante = Math.max(0, Math.round(it.quantidade))
      const chave = chaveLegada((it.inventoryId ?? "").trim(), it.nome)
      for (const l of linhas) {
        if (restante <= 0) break
        const chaveLinha = chaveLegada(l.inventoryId, l.name)
        const casaPorProduto = !!(it.inventoryId && l.produtoId && it.inventoryId.trim() === l.produtoId)
        if (chaveLinha !== chave && !casaPorProduto) continue
        const livre = l.quantity - porLinha[l.lineIndex]!.devolvido
        if (livre <= 0) continue
        const q = Math.min(livre, restante)
        add(l.lineIndex, dev.localId, q)
        restante -= q
      }
      if (restante > 0) naoAlocado.push({ localId: dev.localId, nome: it.nome, quantidade: restante })
    }
  }
  return { porLinha, naoAlocado }
}

/**
 * Valor líquido de cada linha (indexado por `lineIndex`) com o desconto global rateado em
 * CENTAVOS pelo maior resto: a soma fecha exatamente em min(total da venda, soma das
 * linhas). Acréscimo nunca aumenta a devolução; rateio proporcional linha a linha podia
 * somar 1 centavo acima do pago (ex.: 20,00 em três linhas de 10,00 → 6,67 × 3 = 20,01).
 */
export function liquidosPorLinha(totalVenda: number, linhas: LinhaVendaOriginal[]): number[] {
  const brutos = linhas.map((l) => Math.max(0, Math.round(l.lineTotal * 100)))
  const soma = brutos.reduce((s, c) => s + c, 0)
  const alvo = Math.min(soma, Math.max(0, Math.round((Number.isFinite(totalVenda) ? totalVenda : soma / 100) * 100)))
  if (soma === 0 || alvo === soma) return brutos.map((c) => c / 100)
  const exatos = brutos.map((c) => (c * alvo) / soma)
  const base = exatos.map((x) => Math.floor(x))
  let resto = alvo - base.reduce((s, c) => s + c, 0)
  const ordem = exatos.map((x, i) => ({ i, f: x - Math.floor(x) })).sort((a, b) => b.f - a.f || a.i - b.i)
  for (const { i } of ordem) {
    if (resto <= 0) break
    base[i]! += 1
    resto -= 1
  }
  return base.map((c) => c / 100)
}

/**
 * Valor a devolver por `qtd` unidades de uma linha, dado o que já foi devolvido.
 * Calculado como diferença de acumulados arredondados → a soma das devoluções parciais
 * fecha EXATAMENTE no valor líquido da linha (sem centavo a mais ou a menos).
 */
export function valorDevolucaoLinha(linha: LinhaVendaOriginal, liquidoLinha: number, jaDevolvido: number, qtd: number): number {
  if (linha.quantity <= 0 || qtd <= 0) return 0
  const liquido = arredonda2(Math.max(0, liquidoLinha))
  const acumulado = (q: number) => arredonda2((liquido * Math.min(q, linha.quantity)) / linha.quantity)
  return arredonda2(acumulado(jaDevolvido + qtd) - acumulado(jaDevolvido))
}

export type DestinoFisico = "retorna_estoque" | "servico" | "sem_vinculo_estoque" | "aparelho_imei"

/** Destino físico pela identidade da LINHA histórica (não pelo cadastro atual). */
export function destinoFisicoDaLinha(l: LinhaVendaOriginal): DestinoFisico {
  if (l.isDevice) return "aparelho_imei"
  if (l.itemType === "servico" || l.itemType === "ordem_servico") return "servico"
  if (l.itemType === "avulso" || !l.inventoryId || isVirtualSaleLine(l.inventoryId)) return "sem_vinculo_estoque"
  return "retorna_estoque"
}

export type LinhaComDisponibilidade = LinhaVendaOriginal & {
  devolvido: number
  disponivel: number
  devolucoes: Array<{ localId: string; quantidade: number }>
  destino: DestinoFisico
}

export function linhasComDisponibilidade(
  linhas: LinhaVendaOriginal[],
  devolucoes: DevolucaoPersistida[],
): { linhas: LinhaComDisponibilidade[]; naoAlocado: Array<{ localId: string; nome: string; quantidade: number }> } {
  const { porLinha, naoAlocado } = alocarDevolucoes(linhas, devolucoes)
  return {
    linhas: linhas.map((l) => {
      const a = porLinha[l.lineIndex]!
      return {
        ...l,
        devolvido: a.devolvido,
        disponivel: Math.max(0, l.quantity - a.devolvido),
        devolucoes: a.devolucoes,
        destino: destinoFisicoDaLinha(l),
      }
    }),
    naoAlocado,
  }
}

export type PedidoLinhaDevolucao = { lineIndex: number; quantidade: number }

export type ValidacaoLinhas =
  | { ok: true; linhas: Array<{ linha: LinhaComDisponibilidade; quantidade: number; valor: number }>; valorTotal: number }
  | { ok: false; code: string; message: string }

/**
 * Valida o pedido contra a disponibilidade SERVIDOR. Fail-closed em: linha inexistente,
 * linha repetida, quantidade não inteira/≤0, acima do disponível, aparelho IMEI.
 */
export function validarLinhasDevolucao(
  disponiveis: LinhaComDisponibilidade[],
  pedido: PedidoLinhaDevolucao[],
  liquidos: number[],
): ValidacaoLinhas {
  if (!Array.isArray(pedido) || pedido.length === 0) {
    return { ok: false, code: "SEM_LINHAS", message: "Selecione ao menos um item e a quantidade a devolver." }
  }
  const vistos = new Set<number>()
  const out: Array<{ linha: LinhaComDisponibilidade; quantidade: number; valor: number }> = []
  for (const p of pedido) {
    if (!Number.isInteger(p.lineIndex) || vistos.has(p.lineIndex)) {
      return { ok: false, code: "LINHA_INVALIDA", message: "Linha da venda inválida ou repetida." }
    }
    vistos.add(p.lineIndex)
    const linha = disponiveis.find((l) => l.lineIndex === p.lineIndex)
    if (!linha) return { ok: false, code: "LINHA_INEXISTENTE", message: "O item não consta nesta venda." }
    if (!Number.isInteger(p.quantidade) || p.quantidade <= 0) {
      return { ok: false, code: "QUANTIDADE_INVALIDA", message: `Quantidade inválida para ${linha.name}.` }
    }
    if (linha.destino === "aparelho_imei") {
      return { ok: false, code: "APARELHO_REVERSAO_NAO_INTEGRADA", message: "Devolução de aparelho por IMEI ainda não é integrada." }
    }
    if (p.quantidade > linha.disponivel) {
      return {
        ok: false,
        code: "DEVOLUCAO_ACIMA_DO_DISPONIVEL",
        message: `${linha.name}: vendido ${linha.quantity}, já devolvido ${linha.devolvido}, disponível ${linha.disponivel}.`,
      }
    }
    out.push({ linha, quantidade: p.quantidade, valor: valorDevolucaoLinha(linha, liquidos[linha.lineIndex] ?? 0, linha.devolvido, p.quantidade) })
  }
  return { ok: true, linhas: out, valorTotal: arredonda2(out.reduce((s, l) => s + l.valor, 0)) }
}

/** Status agregado da venda após devoluções (mesma regra da rota legada). */
export function statusVendaAposDevolucoes(statusAtual: string, linhas: LinhaComDisponibilidade[]): string {
  if (statusAtual === "cancelada") return statusAtual
  const vendido = linhas.reduce((s, l) => s + l.quantity, 0)
  const devolvido = linhas.reduce((s, l) => s + l.devolvido, 0)
  if (vendido > 0 && devolvido >= vendido) return "devolvida"
  if (devolvido > 0) return "parcialmente_devolvida"
  return statusAtual
}

// ─── Plano financeiro da troca ───────────────────────────────────────────────

export type FormaDiferenca = "dinheiro" | "pix" | "debito" | "credito"

export type PlanoTroca = {
  valorDevolvido: number
  totalNovaCompra: number
  /** Parte do valor devolvido abatida na nova venda (crédito de troca consumido). */
  creditoAplicado: number
  /** Diferença paga pelo cliente (nova > devolvido). */
  diferenca: number
  /** Sobra a favor do cliente (devolvido > nova). */
  excedente: number
}

export function planoTroca(valorDevolvido: number, totalNovaCompra: number): PlanoTroca {
  const vd = arredonda2(valorDevolvido)
  const tn = arredonda2(totalNovaCompra)
  const creditoAplicado = arredonda2(Math.min(vd, tn))
  return {
    valorDevolvido: vd,
    totalNovaCompra: tn,
    creditoAplicado,
    diferenca: arredonda2(Math.max(0, tn - creditoAplicado)),
    excedente: arredonda2(Math.max(0, vd - creditoAplicado)),
  }
}

/** Breakdown da nova venda: crédito da troca + diferença na forma escolhida. */
export function paymentBreakdownDaTroca(plano: PlanoTroca, forma: FormaDiferenca) {
  const pb = { dinheiro: 0, pix: 0, cartaoDebito: 0, cartaoCredito: 0, carne: 0, aPrazo: 0, creditoVale: plano.creditoAplicado }
  if (plano.diferenca > 0) {
    if (forma === "dinheiro") pb.dinheiro = plano.diferenca
    else if (forma === "pix") pb.pix = plano.diferenca
    else if (forma === "debito") pb.cartaoDebito = plano.diferenca
    else pb.cartaoCredito = plano.diferenca
  }
  return pb
}
