/**
 * GOAL CONTADOR-HUB-HONESTY-ROUTE-SAFETY-002 — garantias de honestidade visual do
 * Contador HUB (preview interno) e do portal legado `/contador`.
 *
 * `vitest.config.ts` roda em `environment: "node"` (sem jsdom) e só coleta
 * `*.test.ts`/`*.spec.ts` — por isso este teste é 100% baseado em leitura do
 * código-fonte real (mesma convenção de `components/operacoes-v4-preview/
 * preview-honesty.test.ts`), sem renderizar componentes React.
 */
import { describe, it, expect } from "vitest"
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { dirname, join } from "node:path"

const DIR = dirname(fileURLToPath(import.meta.url))

const hubSrc = readFileSync(join(DIR, "contador-hub-preview.tsx"), "utf8")
const dataSrc = readFileSync(join(DIR, "contador-preview-data.ts"), "utf8")
const legacySrc = readFileSync(join(DIR, "area-contador-pro.tsx"), "utf8")

/** Colapsa qualquer sequência de espaços/quebras de linha em um único espaço — o
 * JSX é quebrado em várias linhas por legibilidade, mas o texto renderizado (e o
 * HTML) colapsa esses espaços do mesmo jeito, então a comparação deve fazer o mesmo. */
const norm = (s: string) => s.replace(/\s+/g, " ").trim()

/** Extrai `<Btn ...>`/`<Switch ...>` sem parar no "=>" de `onClick={() => ...}`
 * (um "=>" contém um ">" que não é o fim da tag). */
const JSX_TAG = /<(?:Btn|Switch)\b[\s\S]*?(?<!=)>/g

describe("Contador HUB — banner global e persistente (Passo 1)", () => {
  it("existe um GlobalPreviewNotice com o contrato híbrido explícito", () => {
    expect(hubSrc).toContain("function GlobalPreviewNotice()")
    expect(hubSrc).toContain("Experiência híbrida — blocos reais identificados + preview.")
  })

  it("GlobalPreviewNotice é renderizado fora da troca de seção (fora de SECTION_RENDERERS/active)", () => {
    const renderIdx = hubSrc.indexOf("<GlobalPreviewNotice")
    const switchIdx = hubSrc.indexOf("SECTION_RENDERERS[active]()")
    expect(renderIdx, "GlobalPreviewNotice deve ser renderizado no JSX principal").toBeGreaterThan(-1)
    expect(switchIdx).toBeGreaterThan(-1)
    // Precisa vir ANTES do bloco que troca de seção, e fora de qualquer render* de seção
    // individual — por isso é o único <GlobalPreviewNotice em todo o arquivo.
    expect(renderIdx).toBeLessThan(switchIdx)
    const occurrences = hubSrc.split("<GlobalPreviewNotice").length - 1
    expect(occurrences, "deve haver exatamente 1 ponto de renderização (fora do switch por seção)").toBe(1)
  })

  it("não depende de hover/tooltip/clique: é um <div> estático, sem onMouseEnter/onClick", () => {
    const fnStart = hubSrc.indexOf("function GlobalPreviewNotice()")
    const fnBody = hubSrc.slice(fnStart, fnStart + 800)
    expect(fnBody).not.toContain("onMouseEnter")
    expect(fnBody).not.toContain("onClick")
    expect(fnBody).not.toContain("hidden ")
  })
})

describe("Contador HUB — competência em experiência híbrida (GOAL 006B)", () => {
  it("o aviso limita o efeito da competência aos blocos reais", () => {
    expect(norm(hubSrc)).toContain("a competência selecionada altera somente os blocos reais.")
  })
})

describe("Contador HUB — CTAs sem efeito real não podem parecer operacionais (Passo 2)", () => {
  const ctaIndisponivelDecl = /const CTA_INDISPONIVEL_TITLE = ".+"/
  it("existe um texto único reaproveitado para os CTAs indisponíveis nesta fase", () => {
    expect(hubSrc).toMatch(ctaIndisponivelDecl)
    expect(hubSrc).toContain("Disponível na fase de dados reais")
  })

  it("todo <Btn>/<Switch> cujo onClick chama noop(...)/onNoop(...) está genuinamente disabled", () => {
    const tags = hubSrc.match(JSX_TAG) ?? []
    const acaoTags = tags.filter((t) => /\bnoop\(|\bonNoop\(/.test(t))
    // Confirma que a varredura encontrou algo (evita passar "por vazio").
    expect(acaoTags.length).toBeGreaterThanOrEqual(16)
    const semDisabled = acaoTags.filter((t) => !/\bdisabled\b/.test(t))
    expect(semDisabled, `CTA(s) sem "disabled": ${semDisabled.join(" | ")}`).toEqual([])
  })

  it("o botão 'Baixar pacote' do PacoteCard (Visão + Relatórios) também está disabled", () => {
    const fnStart = hubSrc.indexOf("function PacoteCard(")
    const fnEnd = hubSrc.indexOf("\nfunction ", fnStart + 1)
    expect(fnStart).toBeGreaterThan(-1)
    expect(fnEnd).toBeGreaterThan(fnStart)
    const fnBody = hubSrc.slice(fnStart, fnEnd)
    const btnTag = fnBody.match(JSX_TAG)?.[0] ?? ""
    expect(btnTag).toContain("disabled")
    expect(btnTag).toContain("onClick={onDownload}")
  })

  it("nenhum CTA sem efeito real depende só do toast pós-clique: todos têm title/aux text acessível", () => {
    const tags = hubSrc.match(JSX_TAG) ?? []
    const acaoTags = tags.filter((t) => /\bnoop\(|\bonNoop\(/.test(t))
    const semTitle = acaoTags.filter((t) => !t.includes("CTA_INDISPONIVEL_TITLE"))
    expect(semTitle, `CTA(s) sem title acessível: ${semTitle.join(" | ")}`).toEqual([])
  })

  it("'Ver' que abre o drawer ilustrativo foi rotulado como demonstração ('Ver exemplo')", () => {
    const occurrences = hubSrc.split("Ver exemplo").length - 1
    expect(occurrences).toBeGreaterThanOrEqual(2)
  })
})

describe("Contador HUB — valores sensíveis do preview seguem marcados como ilustrativos (Passo 4)", () => {
  it("as notas fiscais de exemplo em Documentos usam o pill de preview", () => {
    expect(dataSrc).toMatch(/name: "NF-e de venda 001234"[\s\S]*?preview: true/)
    expect(dataSrc).toMatch(/name: "NF-e de compra 5678"[\s\S]*?preview: true/)
  })

  it("o honorário do contador em Obrigações usa o pill de preview", () => {
    expect(dataSrc).toMatch(/name: "Honorários do contador"[\s\S]*?preview: true/)
  })

  it("Visão geral, Fechamento e Documentos têm PreviewBanner próprio (antes não tinham nenhum)", () => {
    const renderVisaoIdx = hubSrc.indexOf("const renderVisao = ()")
    const renderFechamentoIdx = hubSrc.indexOf("const renderFechamento = ()")
    const renderDocumentosIdx = hubSrc.indexOf("const docsFiltered =")
    const renderObrigacoesIdx = hubSrc.indexOf("const renderObrigacoes = ()")
    expect(hubSrc.slice(renderVisaoIdx, renderFechamentoIdx)).toContain("<PreviewBanner")
    expect(hubSrc.slice(renderFechamentoIdx, renderDocumentosIdx)).toContain("<PreviewBanner")
    expect(hubSrc.slice(renderDocumentosIdx, renderObrigacoesIdx)).toContain("<PreviewBanner")
  })
})

describe("Portal legado /contador (area-contador-pro.tsx) — rótulos honestos (Passo 5)", () => {
  it("CSV é rotulado como agregados operacionais, não como CSV fiscal", () => {
    expect(legacySrc).toContain("CSV de agregados operacionais")
  })

  it("XML deixa claro que é formato próprio, não XML fiscal", () => {
    expect(legacySrc).toContain("XML de movimentos — formato próprio, não é XML fiscal")
  })

  it("alíquota é rotulada como estimativa manual, não apuração tributária", () => {
    expect(legacySrc).toContain("Estimativa manual — não é apuração tributária")
  })

  it("não alterou funções de exportação nem cálculo (mesmas assinaturas/handlers)", () => {
    expect(legacySrc).toContain("onClick={exportarCsv}")
    expect(legacySrc).toContain("onClick={exportarXml}")
    expect(legacySrc).toContain("estimativaImposto(faturamento, aliquotaPct)")
  })
})

describe("Contador HUB — navegação não afirma ações reais sobre dados estáticos (Passo 6)", () => {
  it("mantém o badge 'Preview' no header (HStatus)", () => {
    const fnStart = hubSrc.indexOf("function HStatus()")
    const fnEnd = hubSrc.indexOf("\nfunction ", fnStart + 1)
    expect(fnStart).toBeGreaterThan(-1)
    expect(fnEnd).toBeGreaterThan(fnStart)
    expect(hubSrc.slice(fnStart, fnEnd)).toContain("Preview")
  })

  it("o header principal usa badge híbrido sem reclassificar seções puramente preview", () => {
    expect(hubSrc).toContain("<HybridStatus />")
    const fnStart = hubSrc.indexOf("function HybridStatus()")
    const fnEnd = hubSrc.indexOf("\nfunction ", fnStart + 1)
    expect(fnStart).toBeGreaterThan(-1)
    expect(hubSrc.slice(fnStart, fnEnd)).toContain("Híbrido")
  })

  it("'3 de 9 itens concluídos' (Visão/Fechamento) agora vem sempre acompanhado de um PreviewBanner local", () => {
    const occurrences = [...hubSrc.matchAll(/itens concluídos/g)]
    expect(occurrences.length).toBeGreaterThanOrEqual(1)
    // Ambas as seções que exibem essa contagem (Visão geral e Fechamento) precisam
    // ter um PreviewBanner antes dela — checado de forma mais direta no describe do Passo 4.
  })
})
