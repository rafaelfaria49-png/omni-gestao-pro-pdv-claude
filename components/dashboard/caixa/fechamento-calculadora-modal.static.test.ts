/**
 * CAIXA-FECHAMENTO-CALCULADORA-MODAL-PREMIUM-005 — contrato estrutural (prova por leitura).
 *
 * A contagem por cédulas e moedas saiu da expansão inline do painel "Contagem da gaveta" e
 * virou um diálogo próprio, com rascunho por loja + sessão de caixa. Este teste trava:
 * 1. a calculadora abre por gatilho num Dialog próprio e não expande mais dentro do painel;
 * 2. X/Esc/clique fora só escondem o diálogo — nada ali zera quantidades ou apaga o rascunho;
 * 3. "Aplicar" preenche o dinheiro contado pelo MESMO contrato e fecha só a calculadora;
 * 4. "Limpar contagem" zera e apaga o rascunho; o fechamento confirmado pelo servidor também;
 * 5. as ações "Em breve" da Conferência seguem desabilitadas;
 * 6. a regra financeira do fechamento (diferença, payload) não mudou.
 *
 * Aritmética e isolamento do rascunho: `lib/caixa/contagem-cedulas.test.ts`. O comportamento
 * renderizado (abrir, X, Esc, reabrir, aplicar, limpar, sessão diferente, fechamento confirmado)
 * fica na prova de navegador da revisão visual do GOAL.
 */
import { readFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"

const ler = (arquivo: string) => readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), arquivo), "utf8")

const calculadora = ler("calculadora-dinheiro-caixa.tsx")
const modal = ler("fechamento-caixa-modal.tsx")
const conferencia = ler("conferencia-caixa.tsx")

const ocorrencias = (haystack: string, needle: string) => haystack.split(needle).length - 1

/** Corpo de `const nome = (…) => { … }` declarado no componente (recuo de 2 espaços). */
function corpo(source: string, nome: string): string {
  const inicio = source.indexOf(`  const ${nome} = `)
  if (inicio < 0) throw new Error(`${nome} não encontrado`)
  const fim = source.indexOf("\n  }\n", inicio)
  if (fim < 0) throw new Error(`fim de ${nome} não encontrado`)
  return source.slice(inicio, fim)
}

describe("Calculadora de cédulas e moedas · diálogo próprio (005)", () => {
  it("A. abre por botão (DialogTrigger) num Dialog próprio, com título e subtítulo", () => {
    expect(calculadora).toContain("<Dialog open={aberta} onOpenChange={handleOpenChange}>")
    expect(calculadora).toContain("<DialogTrigger asChild>")
    expect(calculadora).toContain("Contar por cédulas e moedas")
    expect(calculadora).toMatch(/<DialogTitle[^>]*>\s*Contagem por cédulas e moedas\s*<\/DialogTitle>/)
    expect(calculadora).toContain("Informe as quantidades para calcular o dinheiro físico da gaveta.")
  })

  it("B. não expande inline: denominações só dentro do DialogContent; o painel recebe só o gatilho", () => {
    expect(calculadora).not.toContain('aria-controls="calculadora-denominacoes"')
    expect(calculadora).not.toContain('id="calculadora-denominacoes"')
    expect(calculadora).not.toMatch(/\{aberta && \(/)
    const conteudo = calculadora.indexOf("<DialogContent")
    expect(conteudo).toBeGreaterThan(calculadora.indexOf("</DialogTrigger>"))
    expect(calculadora.indexOf("id={`denom-${d.centavos}`}")).toBeGreaterThan(conteudo)
    expect(ocorrencias(modal, "<CalculadoraDinheiroCaixa")).toBe(1)
    expect(modal).not.toContain("denom-")
  })

  it("C/D. usa a lista única de denominações e a soma em centavos do helper (sem cópia local)", () => {
    expect(calculadora).toContain("DENOMINACOES_CONTAGEM.map(")
    expect(calculadora).toContain("totalContagemCentavos(quantidades)")
    expect(calculadora).not.toMatch(/centavos:\s*20000/)
  })

  it("E/F. Aplicar preenche o dinheiro contado e fecha só a calculadora, sem apagar o rascunho", () => {
    const aplicar = corpo(calculadora, "handleAplicar")
    expect(aplicar).toContain("onAplicar(total, detalheContagem(quantidades))")
    expect(aplicar).toContain("setAberta(false)")
    expect(aplicar).not.toMatch(/limparDraftContagem|setQuantidades/)
    // Mesmo contrato de antes no campo "Dinheiro contado na gaveta".
    expect(modal).toMatch(
      /onAplicar=\{\(t, detalhe\) => \{\s*setValorContado\(t\.toFixed\(2\)\)\s*setDinheiroContadoDetalhado\(detalhe\)\s*\}\}/,
    )
  })

  it("G/I. X, Esc, clique fora e 'Fechar' só escondem o diálogo: contagem e rascunho intactos", () => {
    const fechar = corpo(calculadora, "handleOpenChange")
    expect(fechar).toContain("setAberta(open)")
    expect(fechar).not.toMatch(/setQuantidades|limparDraftContagem|salvarDraftContagem/)
    expect(calculadora).toContain("onClick={() => handleOpenChange(false)}")
    // O dismiss padrão do Radix não ganhou lógica própria de descarte.
    expect(calculadora).not.toMatch(/onEscapeKeyDown|onPointerDownOutside|onInteractOutside/)
  })

  it("H. reabrir restaura: estado inicial e troca de sessão leem o rascunho; edição grava", () => {
    expect(calculadora).toMatch(
      /useState<QuantidadesContagem>\(\(\) =>\s*lerDraftContagem\(sessionStorageContagem\(\), chaveDraft\),?\s*\)/,
    )
    expect(calculadora).toContain("if (chaveCarregada !== chaveDraft)")
    expect(corpo(calculadora, "atualizarQuantidades")).toContain(
      "salvarDraftContagem(sessionStorageContagem(), chaveDraft, proximas)",
    )
    expect(corpo(calculadora, "setQtd")).toContain("atualizarQuantidades(")
  })

  it("J/K. Limpar zera as quantidades e apaga o rascunho (confirmação só com valor contado)", () => {
    const limpar = corpo(calculadora, "handleLimpar")
    expect(limpar).toContain("if (temContagem && !confirmandoLimpeza)")
    expect(limpar).toContain("setQuantidades({})")
    expect(limpar).toContain("limparDraftContagem(sessionStorageContagem(), chaveDraft)")
  })

  it("L/M. o modal escopa o rascunho por loja + sessão de caixa", () => {
    expect(modal).toMatch(
      /chaveDraftContagem\(\{\s*storeId: lojaAtivaId,\s*sessaoId,\s*dataAbertura: caixa\.dataAbertura,\s*\}\)/,
    )
    expect(modal).toContain("chaveDraft={chaveDraftContagemSessao}")
  })

  it("N. o rascunho só é apagado pelo modal depois do fechamento confirmado pelo servidor", () => {
    const limpeza = "limparDraftContagem(sessionStorageContagem(), chaveDraftContagemSessao)"
    expect(ocorrencias(modal, limpeza)).toBe(1)
    const at = modal.indexOf(limpeza)
    expect(at).toBeGreaterThan(modal.indexOf("if (!persisted) {"))
    expect(at).toBeLessThan(modal.indexOf("    fecharCaixa()"))
  })
})

describe("Conferência · ações de venda seguem 'Em breve' (005)", () => {
  const EM_BREVE = [
    "Reimprimir comprovante",
    "Histórico da venda",
    "Trocar produtos",
    "Devolução parcial",
    "Estornar venda",
  ]

  it("O. nenhuma ação 'Em breve' foi ativada", () => {
    const menu = conferencia.slice(conferencia.indexOf("<DropdownMenuContent"))
    expect(ocorrencias(menu, ">Em breve<")).toBe(EM_BREVE.length)
    for (const rotulo of EM_BREVE) {
      const at = menu.indexOf(rotulo)
      expect(at, rotulo).toBeGreaterThan(0)
      const abertura = menu.slice(menu.lastIndexOf("<DropdownMenuItem", at), at)
      expect(abertura, rotulo).toMatch(/\sdisabled>/)
      expect(abertura, rotulo).not.toContain("onSelect")
    }
  })
})

describe("Conferência · rodapé fora da área rolável (005-microfix)", () => {
  it("só a lista rola: o rodapé de soma fica depois da área rolável e não é sticky sobre as linhas", () => {
    expect(conferencia).toContain('<div className="flex min-w-0 flex-1 flex-col xl:min-h-0 xl:overflow-y-auto">')
    // Cabeçalho de colunas e lista dentro da área rolável; rodapé logo após fechá-la.
    expect(conferencia).toMatch(
      /xl:overflow-y-auto">\s*<div\s+aria-hidden[\s\S]*?<\/ul>\s*<\/div>\s*<div className="flex shrink-0 [^"]*">\s*<span[^>]*>\s*\{filtradas\.length\} lançamento\(s\)/,
    )
    const rodape = conferencia.indexOf("{filtradas.length} lançamento(s)")
    const abertura = conferencia.slice(conferencia.lastIndexOf("<div", rodape), rodape)
    expect(abertura).not.toMatch(/(?:^|\s|")sticky(?=\s|")/)
    expect(modal).toMatch(/<TabsContent value="conferencia" className="[^"]*xl:flex-col[^"]*xl:overflow-hidden/)
  })
})

describe("Fechamento · copy de consulta restrita às abas (005-microfix)", () => {
  it("não sugere que a contagem da gaveta seja somente leitura", () => {
    expect(modal).toContain("Resumo e conferência são somente consulta.")
    expect(modal).not.toContain("nada aqui altera valores")
  })
})

describe("Fechamento · lógica financeira preservada (005)", () => {
  it("P. diferença, esperado e payload do fechamento inalterados", () => {
    for (const trecho of [
      "const saldoDinheiroEsperado = resumo.saldoDinheiroEsperado",
      "const valorContadoNum = parseFloat(valorContado) || 0",
      "const diferenca = valorContadoNum - saldoDinheiroEsperado",
      'const temDiferenca = valorContado !== "" && Math.abs(diferenca) > 0.01',
      "saldoFinal: saldoEsperado,",
      'saldoContado: valorContado !== "" ? valorContadoNum : undefined,',
      "resumoFechamento: resumo,",
      '...(dinheiroContadoDetalhado && valorContado !== ""',
    ]) {
      expect(modal, trecho).toContain(trecho)
    }
  })
})
