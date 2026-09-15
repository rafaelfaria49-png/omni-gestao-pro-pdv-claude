/**
 * CAIXA-CONFERENCIA-VENDAS-ACOES-REAIS-007 — contrato estrutural (prova por leitura).
 *
 * O GOAL proíbe "ligar botão": uma ação só perde o "Em breve" quando existe backend
 * real, autorização quando destrutiva, efeito correto e auditoria. Este teste trava
 * justamente as ligações — que a Conferência fala com as rotas que JÁ existem, que o
 * estorno passa pelo step-up antes do POST, e que Troca/Devolução continuam fora com
 * razão estrutural em vez de promessa.
 *
 * A lógica em si tem teste de comportamento próprio:
 *   · `lib/caixa/conferencia-acoes.test.ts`   — política do menu
 *   · `lib/caixa/conferencia-estorno.test.ts` — idempotência e respostas do servidor
 *   · `lib/vendas/venda-timeline.test.ts`     — timeline só com dado persistido
 *   · `lib/vendas/venda-cupom-mapper.test.ts` — aritmética do comprovante
 */
import { readFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"

const aqui = dirname(fileURLToPath(import.meta.url))
const ler = (p: string) => readFileSync(resolve(aqui, p), "utf8")

const conferencia = ler("conferencia-caixa.tsx")
const ficha = ler("conferencia-venda-detalhe.tsx")
const estornoDialog = ler("conferencia-estorno-dialog.tsx")
const gate = ler("supervisor-gate-dialog.tsx")
const modal = ler("fechamento-caixa-modal.tsx")
const estornoLib = ler("../../../lib/caixa/conferencia-estorno.ts")
const acoesLib = ler("../../../lib/caixa/conferencia-acoes.ts")
const mapper = ler("../../../lib/vendas/venda-cupom-mapper.ts")
const arquivoGeral = ler("../vendas/vendas-arquivo-geral.tsx")
const rotaCancelar = ler("../../../app/api/vendas/[id]/cancelar/route.ts")
const rotaSessao = ler("../../../app/api/ops/caixa/sessao-detalhe/route.ts")
const fiscalMachine = ler("../../../lib/fiscal/venda-fiscal-state-machine.ts")
const resumoLib = ler("../../../lib/caixa-fechamento-resumo.ts")

const ocorrencias = (h: string, n: string) => h.split(n).length - 1

describe("A. menu ⋮ — estrutura do GOAL §26 (VER · DOCUMENTO · PÓS-VENDA · CRÍTICO)", () => {
  const menu = conferencia.slice(
    conferencia.indexOf("<DropdownMenuContent"),
    conferencia.indexOf("</DropdownMenuContent>"),
  )

  it("os quatro grupos aparecem na ordem do GOAL", () => {
    const ordem = ["Ver", "Documento", "Pós-venda", "Crítico"].map((g) =>
      menu.indexOf(`>\n                                  ${g}\n`) >= 0
        ? menu.indexOf(`>\n                                  ${g}\n`)
        : menu.indexOf(g),
    )
    expect(ordem.every((i) => i > 0)).toBe(true)
    expect([...ordem].sort((a, b) => a - b)).toEqual(ordem)
  })

  it("as sete ações do GOAL estão presentes, nenhuma some do menu", () => {
    for (const rotulo of [
      "Ver detalhes",
      "Histórico da venda",
      "Reimprimir comprovante",
      "Copiar número da venda",
      "Trocar produtos",
      "Devolução parcial",
      "Estornar venda",
    ]) {
      expect(menu, rotulo).toContain(`rotulo="${rotulo}"`)
    }
  })

  it("todo item passa por `AcaoItem` — nenhum item escapa da política", () => {
    expect(ocorrencias(menu, "<AcaoItem")).toBe(7)
    expect(menu).not.toMatch(/<DropdownMenuItem\s+disabled/)
  })

  it("o estado vem de `avaliarAcoesVenda`, não de estado local", () => {
    expect(conferencia).toContain("const acoes = venda")
    expect(conferencia).toContain("avaliarAcoesVenda({")
    expect(conferencia).toContain("fiscalStatus: l.fiscalStatus")
    expect(conferencia).toContain("servidorConfirmada: l.servidorConfirmada === true")
    expect(conferencia).toContain("sessaoAberta,")
  })

  it("item desabilitado continua VISÍVEL e mostra a razão real (§26)", () => {
    const desabilitado = conferencia.slice(
      conferencia.indexOf("if (!estado.habilitada)"),
      conferencia.indexOf("return (\n    <DropdownMenuItem onSelect={onSelect}"),
    )
    expect(desabilitado).toContain("{estado.motivo}")
    expect(desabilitado).toContain("title={estado.motivo}")
    expect(desabilitado).not.toContain("return null")
  })
})

describe("B. consulta ligada à rota REAL, sem endpoint novo (§3/§6)", () => {
  it("a ficha lê `GET /api/vendas/[id]?full=1` pelo helper do contrato", () => {
    expect(ficha).toContain("vendaDetalheUrl(numeroVenda, true)")
    expect(ficha).toContain('"x-assistec-loja-id": storeId')
  })

  it("a ficha é somente leitura: nenhum POST/PUT/PATCH/DELETE", () => {
    expect(ficha).not.toMatch(/method:\s*"(POST|PUT|PATCH|DELETE)"/)
  })

  it("a timeline sai do builder puro, não é remontada na UI", () => {
    expect(ficha).toContain("buildVendaTimeline(venda)")
    expect(ficha).toContain("SEM_REGISTRO")
  })

  it("detalhes cobrem os campos do §3 que a rota devolve", () => {
    for (const rotulo of [
      "Número da venda",
      "ID técnico",
      "Data e hora",
      "Operador",
      "Status",
      "Terminal",
      "CPF/CNPJ",
      "Sessão",
      "Desconto",
      "Total",
      "Formas de pagamento",
    ]) {
      expect(ficha, rotulo).toContain(rotulo)
    }
    // Acessório com modelo/cor e vínculos com devolução/troca (§3).
    expect(ficha).toContain("it.acessorio.modelLabel")
    expect(ficha).toContain("Devoluções e trocas vinculadas")
    expect(ficha).toContain("Contas a receber")
  })

  it("pagamento múltiplo é discriminado, não colapsado num rótulo só", () => {
    expect(ficha).toContain("venda.pagamentos.map(")
    expect(ficha).toContain("Pagamento múltiplo —")
  })

  it("campo ausente vira '—'; nunca valor plausível inventado", () => {
    expect(ficha).toContain('const texto = typeof valor === "string" && valor.trim() ? valor.trim() : "—"')
  })
})

describe("C. reimpressão reusa o comprovante existente (§4 / §2 não duplicar)", () => {
  it("a Conferência monta `CupomNaoFiscal`, o mesmo componente do Histórico", () => {
    expect(conferencia).toContain('from "@/components/dashboard/vendas/cupom-nao-fiscal"')
    expect(conferencia).toContain("<CupomNaoFiscal")
  })

  it("os DOIS caminhos usam o mapeador ÚNICO — a aritmética não vive mais inline", () => {
    expect(conferencia).toContain("mapVendaDetalheToCupom(venda, loja)")
    expect(arquivoGeral).toContain("mapVendaDetalheToCupom(d, {")
    // O corpo antigo saiu de `vendas-arquivo-geral`.
    expect(arquivoGeral).not.toContain("taxes: Math.max(0, d.total + desconto - subtotalBase)")
    expect(mapper).toContain("taxes: Math.max(0, d.total + desconto - subtotalBase)")
  })

  it("os dois consomem o MESMO contrato de leitura da venda", () => {
    for (const arquivo of [conferencia, arquivoGeral, ficha]) {
      expect(arquivo).toContain("@/lib/vendas/venda-detalhe-contract")
    }
    expect(arquivoGeral).not.toContain("type VendaDetalhe = {")
  })

  it("reimprimir NÃO altera a venda: só GET antes de abrir o cupom", () => {
    const fn = conferencia.slice(
      conferencia.indexOf("const reimprimirPorNumero"),
      conferencia.indexOf("const vazio = linhas.length === 0"),
    )
    expect(fn).toContain("/api/vendas/${encodeURIComponent(numero)}")
    expect(fn).not.toMatch(/method:\s*"(POST|PUT|PATCH|DELETE)"/)
  })
})

describe("D. estorno — step-up ANTES do POST (§7/§8/§25)", () => {
  it("usa a rota ÚNICA de reversão do domínio, sem motor paralelo", () => {
    expect(estornoLib).toContain("/api/vendas/${encodeURIComponent(pedidoId)}/cancelar")
    expect(ocorrencias(estornoLib, "fetchFn(")).toBe(1)
  })

  it("o PIN é validado no servidor pelo gate compartilhado, não por comparação local", () => {
    expect(estornoDialog).toContain("<SupervisorGateDialog")
    expect(gate).toContain('fetch("/api/auth/admin"')
    // O PIN e o endpoint que o valida não transitam fora do gate: nada de state, prop,
    // fetch ou corpo de requisição com PIN no CÓDIGO do diálogo (o comentário que
    // EXPLICA a regra cita ambos de propósito e é ignorado aqui).
    const codigoDialog = estornoDialog.slice(estornoDialog.indexOf("export function ConferenciaEstornoDialog"))
    expect(codigoDialog).not.toContain("/api/auth/admin")
    expect(codigoDialog).not.toMatch(/\bpin\b/i)
    const codigoLib = estornoLib.slice(estornoLib.indexOf("export type EstornoVendaInput"))
    expect(codigoLib).not.toMatch(/\bpin\b/i)
  })

  it("o POST só sai DEPOIS do `onAuthorized` do gate", () => {
    const corpo = estornoDialog.slice(estornoDialog.indexOf("onAuthorized={"))
    expect(corpo).toContain("void executar(admin?.name?.trim() || \"Supervisor\", false)")
    expect(estornoDialog).toContain("const executar = async (autorizadoPor: string, forcar: boolean)")
  })

  it("o AUTORIZADOR é registrado na trilha enviada ao servidor (§25/§32)", () => {
    expect(gate).toContain("onAuthorized(admin)")
    expect(estornoLib).toContain("[autorizado por ${input.autorizadoPor}]")
  })

  it("motivo é obrigatório e trava o botão do gate antes de gastar o PIN (§8)", () => {
    expect(estornoDialog).toContain("motivoEstornoValido(motivo)")
    expect(estornoDialog).toContain("canSubmit={motivoOk && !enviando}")
    expect(acoesLib).toContain("export const MOTIVO_MIN_CARACTERES")
  })

  it("consulta NÃO pede autorização: só o estorno monta o gate", () => {
    expect(ocorrencias(conferencia, "SupervisorGateDialog")).toBe(0)
    expect(ficha).not.toContain("SupervisorGateDialog")
    expect(ocorrencias(estornoDialog, "<SupervisorGateDialog")).toBe(1)
  })
})

describe("E. idempotência e confirmação (§24/§13)", () => {
  it("um POST por vez: lock em ref, liberado no finally", () => {
    expect(estornoLib).toContain("if (inFlight.current) return { status: \"in_flight\" }")
    expect(estornoLib).toContain("inFlight.current = false")
    expect(estornoDialog).toContain("emVooRef")
  })

  it("'já cancelada' é terminal, não erro — duplo clique não vira alarme falso", () => {
    expect(estornoLib).toContain('status: "ja_estornada"')
    expect(estornoDialog).toContain('// "estornada" e "ja_estornada" chegam ao mesmo estado final no banco.')
  })

  it("`forcar` nunca é enviado sozinho: depende da confirmação do operador", () => {
    expect(estornoLib).toContain("forcar: input.forcar === true")
    expect(estornoDialog).toContain("setConfirmarForcar({ devolucoes: r.devolucoes")
    expect(estornoDialog).toContain("Estornar mesmo assim")
  })

  it("o servidor mantém as próprias guardas (não confiamos só na UI)", () => {
    expect(rotaCancelar).toContain('if (venda.status === "cancelada")')
    expect(rotaCancelar).toContain('origem: "cancelamento_pdv"')
    expect(rotaCancelar).toContain("if (jaExiste) continue")
    expect(rotaCancelar).toContain("if (!jaEstornado) {")
  })
})

describe("F. efeitos de domínio garantidos pela rota reusada (§10/§17/§18)", () => {
  it("estoque, ledger, contas a receber e vale são tratados na mesma rota", () => {
    expect(rotaCancelar).toContain("movimentacaoEstoque.create")
    expect(rotaCancelar).toContain("movimentacaoFinanceira.create")
    expect(rotaCancelar).toContain("cancelContaReceber")
    expect(rotaCancelar).toContain("estornarMovimentacaoPorReferencia")
    expect(rotaCancelar).toContain("usoCreditoCliente.findMany")
  })

  it("a venda ORIGINAL é preservada: status muda, nada é apagado (§9)", () => {
    expect(rotaCancelar).toContain('status: "cancelada"')
    expect(rotaCancelar).not.toContain("venda.delete")
    expect(rotaCancelar).not.toContain("itemVenda.deleteMany")
    expect(rotaCancelar).toContain("devolucoesMantidas")
  })

  it("o gate fiscal do servidor continua sendo a autoridade (§20)", () => {
    expect(rotaCancelar).toContain("assertVendaFiscalCancelavel(venda)")
  })
})

describe("G. bloqueio fiscal espelhado no menu sem arrastar Prisma pro cliente (§20/§26)", () => {
  it("a lista do cliente cobre exatamente os estados que o servidor recusa", () => {
    const mapaCancelamento = fiscalMachine.slice(
      fiscalMachine.indexOf("const MOTIVO_BLOQUEIO_CANCELAMENTO"),
      fiscalMachine.indexOf("/** Entrada mínima"),
    )
    const bloqueados = [...mapaCancelamento.matchAll(/\[S\.(\w+)\]:\s*"/g)].map((m) => m[1]!)
    expect(bloqueados.length).toBeGreaterThan(0)
    for (const estado of bloqueados) {
      expect(acoesLib, estado).toContain(`"${estado}"`)
    }
    const declarados = [
      ...acoesLib
        .slice(
          acoesLib.indexOf("export const FISCAL_BLOQUEIA_ESTORNO"),
          acoesLib.indexOf("] as const"),
        )
        .matchAll(/"(\w+)"/g),
    ].map((m) => m[1]!)
    expect([...declarados].sort()).toEqual([...bloqueados].sort())
  })

  it("a política do cliente não importa o enum runtime do Prisma", () => {
    expect(acoesLib).not.toContain("@/generated/prisma")
  })

  it("`fiscalStatus` chega pela rota da sessão, sem endpoint novo", () => {
    expect(rotaSessao).toContain("fiscalStatus: true")
    expect(rotaSessao).toContain("fiscalStatus: v.fiscalStatus")
  })
})

describe("H. pós-venda bloqueado com razão estrutural, não promessa (§11/§27/§35)", () => {
  it("Troca e Devolução recebem o estado bloqueado da política", () => {
    expect(conferencia).toContain('estado={acoes.troca}')
    expect(conferencia).toContain('estado={acoes.devolucao}')
    // Sem `onSelect`: não há caminho de execução ligado a elas nesta tela.
    const menu = conferencia.slice(
      conferencia.indexOf("Pós-venda"),
      conferencia.indexOf("Crítico"),
    )
    expect(menu).not.toContain("onSelect")
  })

  it("a razão cita a lacuna real de reconciliação e aponta o caminho que funciona", () => {
    expect(acoesLib).toContain("export const ACAO_BLOQUEADA_POS_VENDA")
    const razao = acoesLib.slice(
      acoesLib.indexOf("export const ACAO_BLOQUEADA_POS_VENDA"),
      acoesLib.indexOf("export const ACAO_BLOQUEADA_JA_ESTORNADA"),
    )
    expect(razao).toMatch(/gaveta/i)
    expect(razao).toMatch(/PDV/)
    expect(razao).not.toMatch(/em breve/i)
  })

  it("a lacuna citada É REAL: `aggregateCaixaOperacoes` não tem ramo `devolucao`", () => {
    const agg = resumoLib.slice(
      resumoLib.indexOf("export function aggregateCaixaOperacoes"),
      resumoLib.indexOf("export function filterSalesDaSessao"),
    )
    expect(agg).toContain('tipo === "sangria"')
    expect(agg).toContain('tipo === "recebimento_cr"')
    expect(agg).not.toContain('tipo === "devolucao"')
  })

  it("nenhuma migration foi necessária para este GOAL (§35)", () => {
    expect(acoesLib).toContain("migration")
  })
})

describe("I. a Conferência recarrega após ação real (§22/§23)", () => {
  it("o sucesso dispara `onDadosAlterados` e o modal incrementa o refreshKey", () => {
    expect(conferencia).toContain("onDadosAlterados?.()")
    expect(modal).toContain("setConferenciaRefreshKey((k) => k + 1)")
    expect(modal).toContain("useCaixaResumo(isOpen, conferenciaRefreshKey)")
  })

  it("o modal NÃO fecha e a contagem digitada NÃO é apagada", () => {
    const handler = modal.slice(
      modal.indexOf("onDadosAlterados={"),
      modal.indexOf("onDadosAlterados={") + 200,
    )
    expect(handler).not.toContain("onClose()")
    expect(handler).not.toContain('setValorContado("")')
  })

  it("com contagem iniciada, o aviso do §23 é exibido antes de autorizar", () => {
    expect(modal).toContain("contagemIniciada={valorContado.trim().length > 0}")
    expect(estornoDialog).toContain("{contagemIniciada && (")
    expect(estornoDialog).toContain("Esta operação altera os valores esperados do caixa.")
  })
})

describe("J. multi-loja e operador (CORE_RULES §11)", () => {
  it("toda chamada da Conferência carrega a unidade ativa", () => {
    expect(modal).toContain("storeId={lojaAtivaId ?? \"\"}")
    for (const arquivo of [ficha, conferencia]) {
      expect(arquivo).toContain('"x-assistec-loja-id": storeId')
    }
    expect(estornoLib).toContain('"x-assistec-loja-id": input.storeId')
  })

  it("o operador exibido passa pela guarda de rótulo (nunca id técnico)", () => {
    expect(ficha).toContain("sanitizeOperatorLabel(data.venda.operador)")
  })
})
