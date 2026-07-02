/**
 * OPS-V4-REMOVE-DEMO-DATA — garantias de honestidade da Operações V4 Preview.
 *
 * 1) Nenhum dado fabricado (clientes, OS, técnicos, "Unidade Centro", "dados
 *    demonstrativos") permanece no código-fonte da Preview — varre os arquivos
 *    reais do diretório (exceto os próprios testes).
 * 2) "Abrir OS" na Preview NÃO cria OS e NUNCA abre/seleciona uma OS existente por
 *    fallback: limpa a seleção, fecha o modal e avisa de forma honesta — prevenindo
 *    o bug em que cadastrar um cliente e clicar "Abrir OS" revelava a OS aberta atrás
 *    do modal (ex.: a OS real de outro cliente).
 *
 * O encadeamento de server actions (→ Prisma) é cortado por mock: `buildVals` é uma
 * função pura e não exercita os hooks de leitura — só precisamos do comportamento local.
 */
import { describe, it, expect, vi } from "vitest"
import { readdirSync, readFileSync, statSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { dirname, join, extname } from "node:path"

vi.mock("@/app/actions/ordens", () => ({
  listOrdens: vi.fn(async () => []),
  getOrdem: vi.fn(async () => null),
}))

// As actions reais da V3 importam `@/auth` (next-auth) → não carregam no ambiente
// node do vitest. Mockamos só os símbolos consumidos por `use-v4-preview` para que
// `buildVals` possa ser importado. Os GUARDS estáticos leem o SOURCE real via fs,
// então os mocks não afetam a verificação de reuso/segurança.
vi.mock("@/lib/operacoes-v3/workspace-actions", () => ({
  salvarDiagnosticoV3: vi.fn(async () => ({})),
  salvarChecklistEntradaV3: vi.fn(async () => ({})),
}))
vi.mock("@/lib/operacoes-v3/orcamento-actions", () => ({
  gerarOrcamentoDaOS: vi.fn(async () => ({})),
  salvarOrcamentoV3: vi.fn(async () => ({})),
  aprovarOrcamentoV3: vi.fn(async () => ({})),
  recusarOrcamentoV3: vi.fn(async () => ({})),
}))
vi.mock("@/lib/operacoes-v3/status-actions", () => ({
  aplicarTransicaoStatusV3: vi.fn(async () => ({})),
}))
vi.mock("@/lib/operacoes-v3/prova-entrada-actions", () => ({
  salvarIdentificacaoV3: vi.fn(async () => ({})),
  salvarProvaEntradaV3: vi.fn(async () => ({})),
  salvarAcessoriosEntradaV3: vi.fn(async () => ({})),
}))
vi.mock("@/lib/operacoes-v3/dados-basicos-actions", () => ({
  salvarDadosBasicosOSV3: vi.fn(async () => ({})),
}))

import { buildVals, type V4DataCtx } from "./use-v4-preview"
import { adaptPag, adaptFinanceiro, adaptOrcamento, maskSenhaV4, NI } from "./os-adapter"
import { fmt } from "./tokens"
import type { V4State } from "./types"
import type { OrdemServico } from "@/types/os"

const DIR = dirname(fileURLToPath(import.meta.url))

/** Coleta recursivamente os .ts/.tsx de origem da Preview, ignorando os próprios testes. */
function collectSourceFiles(dir: string): string[] {
  const out: string[] = []
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) {
      out.push(...collectSourceFiles(full))
      continue
    }
    const ext = extname(name)
    if (ext !== ".ts" && ext !== ".tsx") continue
    if (/\.test\.tsx?$/.test(name)) continue
    out.push(full)
  }
  return out
}

/** Dados fabricados que NÃO podem aparecer na UI operacional da Preview. */
const FAKE_TERMS = [
  // clientes / técnicos demonstrativos
  "Pedro Lima",
  "Sofia Dias",
  "Caio Moraes",
  "Marcos Teles",
  "Mariana Lima",
  "Tiago Reis",
  "Bruno Alves",
  "Carla Menezes",
  "Rafael Pinto",
  "Mariana Costa Lima",
  "Carlos Eduardo Souza",
  "Beatriz Almeida",
  // OS fabricadas
  "OS-0473",
  "OS-0469",
  "OS-0480",
  "OS-0485",
  "OS-0481",
  "OS-0478",
  // unidade / rótulos fabricados
  "Unidade Centro",
  "dados demonstrativos",
]

describe("Operações V4 Preview — sem dados fabricados no código-fonte", () => {
  const files = collectSourceFiles(DIR)

  it("encontra os arquivos de origem da Preview", () => {
    expect(files.length).toBeGreaterThan(5)
  })

  for (const term of FAKE_TERMS) {
    it(`não contém o dado fake "${term}"`, () => {
      const offenders = files.filter((f) => readFileSync(f, "utf8").includes(term))
      expect(offenders, `"${term}" encontrado em: ${offenders.join(", ")}`).toEqual([])
    })
  }
})

function makeState(over: Partial<V4State> = {}): V4State {
  return {
    view: "cockpit",
    module: "workspace",
    stage: "execucao",
    status: "em_execucao",
    left: true,
    right: true,
    menu: null,
    toast: "",
    prioridade: "alta",
    histFilter: "todos",
    novaOS: true,
    recibo: false,
    selectedOsId: null,
    focus: false,
    authState: "autorizado",
    pin4: 3,
    pin6: 3,
    pattern: [0, 3, 4, 7],
    senha: "",
    motivo: "",
    ...over,
  }
}

const ctx: V4DataCtx = {
  ordens: [],
  ordensLoading: false,
  ordensPrimeiraCarga: false,
  ordensError: null,
  reloadOrdens: () => {},
  reloadDetail: () => {},
  realOS: null,
  detailLoading: false,
  salvarDiagnostico: async () => false,
  gerarOrcamento: async () => false,
  salvarOrcamento: async () => false,
  aprovarOrcamento: async () => false,
  recusarOrcamento: async () => false,
  iniciarDiagnostico: async () => false,
  iniciarServico: async () => false,
  salvarIdentificacao: async () => false,
  salvarProvaEntrada: async () => false,
  salvarAcessorios: async () => false,
  salvarChecklist: async () => false,
  salvarDadosBasicos: async () => false,
}

describe("Operações V4 — Nova OS real (cria OS e abre no workspace)", () => {
  it("onOSCriada fecha o modal, abre a OS criada no workspace e recarrega a lista", () => {
    const patches: Array<Record<string, unknown>> = []
    const msgs: string[] = []
    let reloaded = 0
    const ctxLocal: V4DataCtx = { ...ctx, reloadOrdens: () => { reloaded += 1 } }
    const st = makeState({ selectedOsId: null, novaOS: true })
    const v = buildVals(
      st,
      (p) => patches.push(p as Record<string, unknown>),
      (m) => msgs.push(m),
      ctxLocal,
    )

    v.onOSCriada("os-nova-123")

    // Fecha o modal, seleciona a OS recém-criada e leva ao workspace.
    expect(patches).toContainEqual(
      expect.objectContaining({ novaOS: false, selectedOsId: "os-nova-123", module: "workspace" }),
    )
    // Recarrega a lista real para refletir a nova OS.
    expect(reloaded).toBe(1)
    // Toast honesto de sucesso.
    expect(msgs.some((m) => /criada/i.test(m))).toBe(true)
  })

  it("osSelected só é verdadeiro com uma OS explicitamente selecionada", () => {
    const semOs = buildVals(makeState({ selectedOsId: null }), () => {}, () => {}, ctx)
    expect(semOs.osSelected).toBe(false)

    const comOs = buildVals(makeState({ selectedOsId: "os-1" }), () => {}, () => {}, ctx)
    expect(comOs.osSelected).toBe(true)
  })
})

function mkOS(p: Record<string, unknown> & { id: string }): OrdemServico {
  return p as unknown as OrdemServico
}

describe("Operações V4 Preview — telas de rail com identidade real (read-only)", () => {
  const ordens = [
    mkOS({ id: "a", status: "aberta", codigo: "OS-A", cliente: { nome: "Cliente A" } }),
    mkOS({ id: "b", status: "em_execucao", codigo: "OS-B", tecnico: { nome: "Ana" } }),
    mkOS({ id: "c", status: "entregue", codigo: "OS-C" }),
  ]
  const ctxReal: V4DataCtx = { ...ctx, ordens }

  it("expõe moduleId espelhando o módulo do estado", () => {
    const v = buildVals(makeState({ module: "fila", novaOS: false }), () => {}, () => {}, ctxReal)
    expect(v.moduleId).toBe("fila")
  })

  it("dashboard/fila derivam da lista real; fila exclui finalizadas", () => {
    const v = buildVals(makeState({ novaOS: false }), () => {}, () => {}, ctxReal)
    expect(v.dashboardResumo.temDados).toBe(true)
    expect(v.dashboardResumo.total).toBe(3)
    expect(v.filaItens.map((r) => r.id)).toEqual(["a", "b"]) // "c" (entregue) fora
  })

  it("rails ficam com temDados=false quando não há base real (empty honesto)", () => {
    const v = buildVals(makeState({ novaOS: false }), () => {}, () => {}, ctx) // ctx.ordens = []
    expect(v.dashboardResumo.temDados).toBe(false)
    expect(v.filaItens).toEqual([])
    expect(v.bancadaView.temDados).toBe(false)
    expect(v.slaView.temDados).toBe(false)
    expect(v.pdvView.temDados).toBe(false)
  })

  it("openOSFromRail seleciona a OS por id explícito; id inexistente é no-op", () => {
    const patches: Array<Record<string, unknown>> = []
    const v = buildVals(makeState({ novaOS: false }), (p) => patches.push(p as Record<string, unknown>), () => {}, ctxReal)

    v.openOSFromRail("b")
    expect(patches.at(-1)).toMatchObject({ selectedOsId: "b", module: "workspace" })

    const antes = patches.length
    v.openOSFromRail("inexistente")
    expect(patches.length).toBe(antes) // nada selecionado por fallback
  })

  it("goToOSSearch limpa a seleção (leva ao seletor de OS, sem auto-abrir)", () => {
    const patches: Array<Record<string, unknown>> = []
    const v = buildVals(makeState({ selectedOsId: "x", novaOS: false }), (p) => patches.push(p as Record<string, unknown>), () => {}, ctxReal)
    v.goToOSSearch()
    expect(patches.at(-1)).toMatchObject({ selectedOsId: null, module: "workspace" })
  })
})

describe("Operações V4 Preview — Modo foco e Segurança (preview/no-op)", () => {
  it("onFoco recolhe rail + as duas gavetas de uma vez", () => {
    const patches: Array<Record<string, unknown>> = []
    let st = makeState({ focus: false, left: true, right: true, novaOS: false })
    const v = buildVals(st, (p) => patches.push(typeof p === "function" ? p(st) : (p as Record<string, unknown>)), () => {}, ctx)
    v.onFoco()
    // ativar foco fecha as duas laterais (o rail é ocultado no componente raiz por focusActive)
    expect(patches.at(-1)).toMatchObject({ focus: true, left: false, right: false })
  })

  it("goSeguranca leva à superfície seguranca; backFromSeguranca volta à Execução", () => {
    const patches: Array<Record<string, unknown>> = []
    const v = buildVals(makeState({ novaOS: false }), (p) => patches.push(p as Record<string, unknown>), () => {}, ctx)
    v.goSeguranca()
    expect(patches.at(-1)).toMatchObject({ stage: "seguranca" })
    v.backFromSeguranca()
    expect(patches.at(-1)).toMatchObject({ stage: "execucao" })
  })

  it("Autorizar é no-op honesto: avisa que nada é autenticado nem salvo", () => {
    const msgs: string[] = []
    const v = buildVals(makeState({ stage: "seguranca", novaOS: false }), () => {}, (m) => msgs.push(m), ctx)
    v.seg.onAutorizar()
    expect(msgs.some((m) => /demonstra|preview/i.test(m))).toBe(true)
    // isSeg reflete a superfície ativa
    expect(v.isSeg).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// OPS-V4-UX-PARITY-E-PDV-SERVICO-AUDIT-005 — ações de preview não fingem status.
// ---------------------------------------------------------------------------
describe("Operações V4 Preview — ações sem escrita real NUNCA mutam o status exibido", () => {
  it("onPrimary em status sem transição segura navega à etapa, avisa e não muda status", () => {
    const patches: Array<Record<string, unknown>> = []
    const msgs: string[] = []
    const v = buildVals(
      makeState({ status: "em_execucao", novaOS: false }),
      (p) => patches.push(p as Record<string, unknown>),
      (m) => msgs.push(m),
      ctx,
    )
    v.onPrimary() // "Marcar pronta" — sem escrita real neste slice
    expect(patches.every((p) => !("status" in p)), "nenhum patch pode conter status").toBe(true)
    expect(msgs.some((m) => /nenhuma alteração/i.test(m))).toBe(true)
  })

  it("Cancelar OS / Aguardando peça no menu são no-op honesto (toast, sem status)", () => {
    const patches: Array<Record<string, unknown>> = []
    const msgs: string[] = []
    const v = buildVals(
      makeState({ status: "em_execucao", novaOS: false }),
      (p) => patches.push(p as Record<string, unknown>),
      (m) => msgs.push(m),
      ctx,
    )
    for (const item of v.moreItems.filter((m) => /Cancelar OS|Aguardando peça/.test(m.label))) {
      item.onClick()
    }
    expect(patches.every((p) => !("status" in p))).toBe(true)
    expect(msgs.length).toBeGreaterThan(0)
    expect(msgs.every((m) => /nenhuma alteração/i.test(m))).toBe(true)
  })

  it("Receber no PDV (act.pdv) avisa que a integração não está conectada e não patcheia nada", () => {
    const patches: Array<Record<string, unknown>> = []
    const msgs: string[] = []
    const v = buildVals(
      makeState({ novaOS: false }),
      (p) => patches.push(p as Record<string, unknown>),
      (m) => msgs.push(m),
      ctx,
    )
    v.act.pdv()
    expect(patches).toEqual([])
    expect(msgs.some((m) => /não está conectado|nenhuma cobrança/i.test(m))).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// OPS-V4-ORCAMENTO-REAL-002 — Diagnóstico/Orçamento reais (reuso seguro da V3).
// ---------------------------------------------------------------------------
describe("Operações V4 — Diagnóstico/Orçamento reais reaproveitam só actions seguras da V3", () => {
  const orquestrador = readFileSync(join(DIR, "use-v4-preview.ts"), "utf8")
  const allSources = collectSourceFiles(DIR).map((f) => readFileSync(f, "utf8")).join("\n")

  it("usa as actions reais da V3 de diagnóstico/orçamento (sem backend novo)", () => {
    for (const action of [
      "salvarDiagnosticoV3",
      "gerarOrcamentoDaOS",
      "salvarOrcamentoV3",
      "aprovarOrcamentoV3",
      "recusarOrcamentoV3",
      "aplicarTransicaoStatusV3",
      // Entrada/Recepção (slice 003)
      "salvarIdentificacaoV3",
      "salvarProvaEntradaV3",
      "salvarAcessoriosEntradaV3",
      "salvarChecklistEntradaV3",
      // Dados básicos da OS (slice 003B)
      "salvarDadosBasicosOSV3",
    ]) {
      expect(orquestrador, `esperava reuso de ${action}`).toContain(action)
    }
  })

  it("só dispara transições de status SEGURAS (diagnostico / em_execucao)", () => {
    const args = [...orquestrador.matchAll(/aplicarTransicaoStatusV3\([^,]+,[^,]+,\s*"([a-z_]+)"\)/g)].map((m) => m[1])
    expect(args.length).toBeGreaterThan(0)
    expect(new Set(args)).toEqual(new Set(["diagnostico", "em_execucao"]))
    // Nunca rota proibida neste slice (entrega/cancelamento/pronta tocam estoque/caixa/garantia).
    for (const proibida of ["entregue", "cancelada", "pronta", "aguardando_peca", "aguardando_aprovacao"]) {
      expect(args).not.toContain(proibida)
    }
  })

  it("o código-fonte da V4 não importa caixa/estoque/financeiro/PDV/WhatsApp/Fiscal", () => {
    for (const proibido of [
      'from "@/lib/caixa',
      'from "@/lib/financeiro',
      'from "@/lib/estoque',
      'from "@/lib/whatsapp',
      'from "@/lib/fiscal',
      'from "@/components/pdv',
      'from "@/app/actions/caixa',
    ]) {
      expect(allSources, `import proibido encontrado: ${proibido}`).not.toContain(proibido)
    }
  })

  it("a V4 nunca usa fallback de loja (loja-1 como valor literal)", () => {
    // Só rejeita o literal entre aspas (um fallback de verdade); menções em comentário
    // ("sem fallback loja-1") são permitidas.
    for (const lit of ['"loja-1"', "'loja-1'", "`loja-1`"]) {
      expect(allSources, `fallback literal encontrado: ${lit}`).not.toContain(lit)
    }
  })
})

// ---------------------------------------------------------------------------
// OPS-V4-SEGURANCA-ACESSO-PARITY-004A — Padrão 3×3 V4-nativo na Entrada.
// ---------------------------------------------------------------------------
describe("Operações V4 — Padrão 3×3 (PatternPadV4) na Entrada, sem tocar autorização de gerente", () => {
  const entradaStage = readFileSync(join(DIR, "parts", "stages", "EntradaStage.tsx"), "utf8")
  const patternPad = readFileSync(join(DIR, "parts", "PatternPadV4.tsx"), "utf8")
  const segurancaStage = readFileSync(join(DIR, "parts", "stages", "SegurancaStage.tsx"), "utf8")

  it("EntradaStage renderiza PatternPadV4 quando senhaTipo === \"padrao\"", () => {
    expect(entradaStage).toContain("PatternPadV4")
    expect(entradaStage).toMatch(/senhaTipo\s*===\s*"padrao"/)
  })

  it("PatternPadV4 não importa o PatternPadV3 nem o sistema de estilo do V3 (Tailwind/cn/ButtonV3)", () => {
    // Rejeita a IMPORTAÇÃO real (menção ao nome em comentário explicando a decisão é permitida).
    for (const proibido of [
      'from "@/components/operacoes-v3/components/PatternPadV3"',
      'from "@/components/operacoes-v3/components/UiV3"',
      'from "@/lib/utils"',
    ]) {
      expect(patternPad, `import proibido: ${proibido}`).not.toContain(proibido)
    }
    expect(patternPad, "não deve usar className (V3 usa Tailwind; V4 usa style inline)").not.toContain("className")
  })

  it("PatternPadV4 é puramente apresentacional: delega a lógica de sequência ao helper puro de lib/operacoes-v4", () => {
    expect(patternPad).toContain("togglePadraoPonto")
    expect(patternPad).toContain("@/lib/operacoes-v4/entrada-form")
  })

  it("SegurancaStage (autorização de gerente) não foi tocado por este slice: não referencia PatternPadV4", () => {
    expect(segurancaStage).not.toContain("PatternPadV4")
  })
})

// ---------------------------------------------------------------------------
// OPS-V4-FINANCEIRO-READONLY-HIGIENE-006 — leitura pura do espelho de pagamento,
// status sem drift, CTA honesta, senha mascarada, kind do orçamento e guards.
// Nenhum recebimento real: só leitura de payload já persistido pela V3.
// ---------------------------------------------------------------------------
describe("OPS-V4-006 — Financeiro read-only lê o espelho real payload.pagamentoV3", () => {
  const osComPagamento = mkOS({
    id: "os-pag",
    status: "pronta",
    pagamentoV3: { total: 890, recebido: 300, saldo: 590, status: "parcial", ultimaForma: "PIX" },
  })

  it("adaptPag lê total/recebido/saldo/status do espelho (sem inventar nada)", () => {
    const pag = adaptPag(osComPagamento)
    expect(pag.temPagamento).toBe(true)
    expect(pag.total).toBe(fmt(890))
    expect(pag.recebido).toBe(fmt(300))
    expect(pag.saldo).toBe(fmt(590))
    expect(pag.pagamentoStatusLabel).toBe("Parcial")
  })

  it("sem espelho, recebido/saldo continuam NI (vazio honesto — nada de saldo fabricado)", () => {
    const pag = adaptPag(mkOS({ id: "os-sem", status: "aberta" }))
    expect(pag.temPagamento).toBe(false)
    expect(pag.recebido).toBe(NI)
    expect(pag.saldo).toBe(NI)
    expect(pag.pagamentoStatusLabel).toBe("")
  })

  it("adaptFinanceiro expõe recebido/saldo/temSaldo; quitado zera o saldo e vira success", () => {
    const parcial = adaptFinanceiro(osComPagamento)
    expect(parcial.temPagamento).toBe(true)
    expect(parcial.temSaldo).toBe(true)
    expect(parcial.recebido).toBe(fmt(300))

    const quitado = adaptFinanceiro(
      mkOS({ id: "os-q", status: "pronta", pagamentoV3: { total: 890, recebido: 890, saldo: 0, status: "quitado" } }),
    )
    expect(quitado.temPagamento).toBe(true)
    expect(quitado.temSaldo).toBe(false)
    expect(quitado.pagamentoStatusLabel).toBe("Quitado")
    expect(quitado.pagamentoStatusTone).toBe("success")
  })

  it("FinanceiroStage só diz 'Nenhum pagamento registrado' no ramo SEM pagamento real", () => {
    const src = readFileSync(join(DIR, "parts", "stages", "FinanceiroStage.tsx"), "utf8")
    expect(src, "bloco de pagamento deve ser condicional em temPagamento").toMatch(/f\.temPagamento\s*\?/)
    expect((src.match(/Nenhum pagamento registrado/g) ?? []).length, "copy de vazio deve existir apenas no ramo sem pagamento").toBe(1)
  })
})

describe("OPS-V4-006 — status exibido prioriza o da OS real carregada (sem drift)", () => {
  it("realOS.status vence o snapshot local st.status", () => {
    const v = buildVals(
      makeState({ status: "em_execucao", selectedOsId: "os-x", novaOS: false }),
      () => {},
      () => {},
      { ...ctx, realOS: mkOS({ id: "os-x", status: "pronta" }) },
    )
    expect(v.statusLabel).toBe("Pronta")
    expect(v.primaryLabel).toBe("Receber pagamento")
  })

  it("sem OS carregada, cai no fallback do estado local", () => {
    const v = buildVals(makeState({ status: "em_execucao", novaOS: false }), () => {}, () => {}, ctx)
    expect(v.statusLabel).toBe("Em execução")
  })

  it("CTA 'Receber pagamento' navega ao Financeiro com aviso honesto (nunca à Entrega, sem PDV real)", () => {
    const patches: Array<Record<string, unknown>> = []
    const msgs: string[] = []
    const v = buildVals(
      makeState({ status: "em_execucao", selectedOsId: "os-x", novaOS: false }),
      (p) => patches.push(p as Record<string, unknown>),
      (m) => msgs.push(m),
      { ...ctx, realOS: mkOS({ id: "os-x", status: "pronta" }) },
    )
    v.onPrimary()
    expect(patches.at(-1)).toMatchObject({ stage: "financeiro" })
    expect(patches.every((p) => !("status" in p)), "nenhum patch pode conter status").toBe(true)
    expect(msgs.some((m) => /não está conectado|nenhuma cobrança/i.test(m))).toBe(true)
  })

  it("'Trocar OS' usa o fluxo real de busca (limpa a seleção; sem no-op)", () => {
    const patches: Array<Record<string, unknown>> = []
    const msgs: string[] = []
    const v = buildVals(
      makeState({ selectedOsId: "os-x", novaOS: false }),
      (p) => patches.push(p as Record<string, unknown>),
      (m) => msgs.push(m),
      ctx,
    )
    const trocar = v.moreItems.find((m) => m.label === "Trocar OS")
    expect(trocar).toBeDefined()
    trocar!.onClick()
    expect(patches.at(-1)).toMatchObject({ selectedOsId: null, module: "workspace" })
    expect(msgs).toEqual([]) // não é mais toast de indisponível
  })
})

describe("OPS-V4-006 — senha do aparelho mascarada por padrão", () => {
  it("maskSenhaV4 nunca devolve a senha: PIN/texto viram máscara fixa; padrão vira rótulo", () => {
    expect(maskSenhaV4("1234 (PIN)", "numerica")).toBe("••••••")
    expect(maskSenhaV4("hunter2", "texto")).toBe("••••••")
    expect(maskSenhaV4("1 → 2 → 3", "padrao")).toBe("Padrão cadastrado")
    expect(maskSenhaV4("", "")).toBe(NI)
    expect(maskSenhaV4(NI, "numerica")).toBe(NI)
  })

  it("ContextColumn usa SenhaRow com máscara e revelação local (sem persistir nada)", () => {
    const src = readFileSync(join(DIR, "parts", "ContextColumn.tsx"), "utf8")
    expect(src).toContain("maskSenhaV4")
    expect(src).toContain("SenhaRow")
    expect(src).toMatch(/Revelar senha/)
  })
})

describe("OPS-V4-006 — classificação (kindV3) visível no orçamento, read-only", () => {
  it("adaptOrcamento expõe kind/kindLabel por linha quando kindV3 existir", () => {
    const o = adaptOrcamento(
      mkOS({
        id: "os-orc",
        status: "aguardando_aprovacao",
        orcamento: {
          status: "enviado",
          total: 100,
          servicos: [
            { id: "s1", descricao: "Troca de tela", valor: 100, kindV3: "cobrado" },
            { id: "s2", descricao: "Película", valor: 30, kindV3: "brinde" },
          ],
          pecas: [{ id: "p1", nome: "Cabo flex", quantidade: 1, valorUnitario: 20, kindV3: "interno" }],
        },
      }),
    )
    expect(o.servicos.map((s) => s.kindLabel)).toEqual(["Cobrado", "Brinde"])
    expect(o.pecas[0]!.kind).toBe("interno")
    expect(o.pecas[0]!.kindLabel).toBe("Interno")
  })

  it("linha sem kindV3 fica sem badge (kind null, label vazio)", () => {
    const o = adaptOrcamento(
      mkOS({ id: "os-o2", orcamento: { status: "rascunho", total: 50, servicos: [{ id: "s1", descricao: "Limpeza", valor: 50 }], pecas: [] } }),
    )
    expect(o.servicos[0]!.kind).toBeNull()
    expect(o.servicos[0]!.kindLabel).toBe("")
  })

  it("OrcamentoStage renderiza o KindBadge e explica que serviço manual novo é Cobrado", () => {
    const src = readFileSync(join(DIR, "parts", "stages", "OrcamentoStage.tsx"), "utf8")
    expect(src).toContain("KindBadge")
    expect(src).toMatch(/entra como/i)
  })
})

describe("OPS-V4-006 — guards: nada de recebimento real / imports proibidos", () => {
  const allSources = collectSourceFiles(DIR).map((f) => readFileSync(f, "utf8")).join("\n")

  it("a Preview não importa prisma, actions de recebimento, updateOSPayload nem app/api", () => {
    for (const proibido of [
      'from "@/lib/prisma',
      "pdv-servico-actions", // recebimento real fica FORA deste slice
      "receberOSV3",
      "estornarRecebimentoOSV3",
      "updateOSPayload",
      'from "@/app/api',
    ]) {
      expect(allSources, `proibido encontrado: ${proibido}`).not.toContain(proibido)
    }
  })

  it("a leitura do pagamento vem do reader PURO da V3 (payment-model), não de service", () => {
    const adapter = readFileSync(join(DIR, "os-adapter.ts"), "utf8")
    expect(adapter).toContain('from "@/lib/operacoes-v3/payment-model"')
    expect(adapter).toContain("lerPagamentoV3")
  })
})
