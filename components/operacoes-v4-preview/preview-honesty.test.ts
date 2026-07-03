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
// PDV de Serviço (slice PDV-SERVICO-OS-RECEBIMENTO-REAL-001): mesma razão dos
// mocks acima — `use-pdv-servico-v3` (hook real, importado por `use-v4-preview`)
// importa esta action "use server" (→ @/auth) em tempo de carregamento do módulo.
vi.mock("@/lib/operacoes-v3/pdv-servico-actions", () => ({
  getCaixaSessaoAbertaV3: vi.fn(async () => ({ aberta: false })),
  lerPagamentoOSV3: vi.fn(async () => ({ total: 0, recebido: 0, saldo: 0, status: "sem_cobranca", sessao: { aberta: false } })),
  receberOSV3: vi.fn(async () => ({})),
  estornarRecebimentoOSV3: vi.fn(async () => ({})),
}))

import { buildVals, type V4DataCtx } from "./use-v4-preview"
import { adaptPag, adaptFinanceiro, adaptOrcamento, maskSenhaV4, NI } from "./os-adapter"
import { fmt } from "./tokens"
import type { V4State } from "./types"
import type { OrdemServico } from "@/types/os"
import type { PagamentoV3 } from "@/lib/operacoes-v3/payment-model"

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
  marcarAguardandoPeca: async () => false,
  marcarPronta: async () => false,
  confirmarEntrega: async () => false,
  pdvServico: {
    pagamento: null,
    sessao: null,
    loading: false,
    recebendo: false,
    estornando: false,
    error: null,
    ultimoRecibo: null,
    reload: () => {},
    receber: async () => false,
    estornar: async () => false,
    limparRecibo: () => {},
  },
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

  it("só dispara transições de status SEGURAS (diagnostico / em_execucao / aguardando_peca / pronta / entregue)", () => {
    const args = [...orquestrador.matchAll(/aplicarTransicaoStatusV3\([^,]+,[^,]+,\s*"([a-z_]+)"\)/g)].map((m) => m[1])
    expect(args.length).toBeGreaterThan(0)
    // OPS-V4-EXECUCAO-REAL-007 estendeu o conjunto seguro do slice 002 com as duas
    // transições da Execução (aguardando_peca / pronta). OPS-V4-ENTREGA-REAL-E-CTA-
    // QUITADO-008 soma "entregue": `aplicarTransicaoStatusV3` delega esse caso a
    // `registrarEntregaV3` (idempotente, guard de permissão próprio — Fase 0 do
    // GOAL), cujo único efeito colateral é estoque via adapter oficial
    // (`consumirEstoqueOSV3`, idempotente/best-effort) — sem caixa/financeiro
    // diretos. "cancelada" continua fora (restaura estoque + cancela CR — rota
    // maior, fora do escopo deste GOAL); "aguardando_aprovacao" não tem UI real
    // nesta Preview.
    expect(new Set(args)).toEqual(new Set(["diagnostico", "em_execucao", "aguardando_peca", "pronta", "entregue"]))
    for (const proibida of ["cancelada", "aguardando_aprovacao"]) {
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

  it("CTA 'Receber pagamento' navega ao Financeiro (recebimento real vive lá, nunca na Entrega)", () => {
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
    expect(msgs.some((m) => /financeiro/i.test(m))).toBe(true)
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

// ---------------------------------------------------------------------------
// OPS-V4-ENTREGA-REAL-E-CTA-QUITADO-008 — CTA global coerente com o pagamento:
// "Receber pagamento" só aparece com saldo pendente; quitada mostra "Entregar OS"
// e leva à Entrega (nunca confirma a entrega a partir do header); Entregue
// mantém "Fluxo concluído" (sem CTA de receber).
// ---------------------------------------------------------------------------
describe("OPS-V4-ENTREGA-REAL-E-CTA-QUITADO-008 — CTA global reflete o saldo real", () => {
  function ctxProntaComPagamento(pagamento: Pick<PagamentoV3, "total" | "recebido" | "saldo" | "status"> | null) {
    return {
      ...ctx,
      realOS: mkOS({ id: "os-x", status: "pronta" }),
      pdvServico: { ...ctx.pdvServico, pagamento },
    }
  }

  it("pronta + saldo > 0: CTA continua 'Receber pagamento' e navega ao Financeiro", () => {
    const patches: Array<Record<string, unknown>> = []
    const msgs: string[] = []
    const v = buildVals(
      makeState({ selectedOsId: "os-x", novaOS: false }),
      (p) => patches.push(p as Record<string, unknown>),
      (m) => msgs.push(m),
      ctxProntaComPagamento({ total: 320, recebido: 0, saldo: 320, status: "aberto" }),
    )
    expect(v.primaryLabel).toBe("Receber pagamento")
    v.onPrimary()
    expect(patches.at(-1)).toMatchObject({ stage: "financeiro" })
    expect(patches.every((p) => !("status" in p)), "nenhum patch pode conter status").toBe(true)
    expect(msgs.some((m) => /financeiro/i.test(m))).toBe(true)
  })

  it("pronta + saldo == 0 (quitada): CTA vira 'Entregar OS' e navega à Entrega — nunca confirma direto do header", () => {
    const patches: Array<Record<string, unknown>> = []
    const msgs: string[] = []
    const v = buildVals(
      makeState({ selectedOsId: "os-x", novaOS: false }),
      (p) => patches.push(p as Record<string, unknown>),
      (m) => msgs.push(m),
      ctxProntaComPagamento({ total: 320, recebido: 320, saldo: 0, status: "quitado" }),
    )
    expect(v.primaryLabel).toBe("Entregar OS")
    expect(v.hasPrimary).toBe(true)
    v.onPrimary()
    expect(patches.at(-1)).toMatchObject({ stage: "entrega" })
    expect(patches.every((p) => !("status" in p)), "nenhum patch pode conter status — a confirmação real fica no botão da Entrega").toBe(true)
    expect(msgs.some((m) => /entrega/i.test(m))).toBe(true)
  })

  it("pronta sem cobrança nenhuma (total=0): trata como sem saldo pendente — CTA 'Entregar OS'", () => {
    const v = buildVals(
      makeState({ selectedOsId: "os-x", novaOS: false }),
      () => {},
      () => {},
      ctxProntaComPagamento({ total: 0, recebido: 0, saldo: 0, status: "sem_cobranca" }),
    )
    expect(v.primaryLabel).toBe("Entregar OS")
  })

  it("pronta + pagamento ainda não carregado (null): mantém o default seguro 'Receber pagamento'", () => {
    const v = buildVals(
      makeState({ selectedOsId: "os-x", novaOS: false }),
      () => {},
      () => {},
      ctxProntaComPagamento(null),
    )
    expect(v.primaryLabel).toBe("Receber pagamento")
  })

  it("entregue: sem CTA de receber — mostra estado final honesto ('Fluxo concluído')", () => {
    const v = buildVals(
      makeState({ selectedOsId: "os-x", novaOS: false }),
      () => {},
      () => {},
      { ...ctx, realOS: mkOS({ id: "os-x", status: "entregue" }) },
    )
    expect(v.hasPrimary).toBe(false)
    expect(v.noPrimary).toBe(true)
  })
})

describe("OPS-V4-ENTREGA-REAL-E-CTA-QUITADO-008 — entregaAcoes só habilita com status pronta e saldo confirmado <= 0", () => {
  function ctxEntrega(status: string, pagamento: Pick<PagamentoV3, "total" | "recebido" | "saldo" | "status"> | null) {
    return {
      ...ctx,
      realOS: mkOS({ id: "os-ent", status }),
      pdvServico: { ...ctx.pdvServico, pagamento },
    }
  }

  it("pronta + saldo 0: podeConfirmar true, bloqueadaPorSaldo false", () => {
    const v = buildVals(makeState({ selectedOsId: "os-ent", novaOS: false }), () => {}, () => {}, ctxEntrega("pronta", { total: 320, recebido: 320, saldo: 0, status: "quitado" }))
    expect(v.entregaAcoes).toEqual({ podeConfirmar: true, bloqueadaPorSaldo: false })
  })

  it("pronta + saldo > 0: podeConfirmar false, bloqueadaPorSaldo true (mensagem de bloqueio, não botão)", () => {
    const v = buildVals(makeState({ selectedOsId: "os-ent", novaOS: false }), () => {}, () => {}, ctxEntrega("pronta", { total: 320, recebido: 0, saldo: 320, status: "aberto" }))
    expect(v.entregaAcoes).toEqual({ podeConfirmar: false, bloqueadaPorSaldo: true })
  })

  it("pronta + pagamento não carregado (null): nenhuma ação disponível ainda (nem confirmar nem bloqueio) — evita flicker", () => {
    const v = buildVals(makeState({ selectedOsId: "os-ent", novaOS: false }), () => {}, () => {}, ctxEntrega("pronta", null))
    expect(v.entregaAcoes).toEqual({ podeConfirmar: false, bloqueadaPorSaldo: false })
  })

  it("outros status (em_execucao, entregue, aberta): entregaAcoes sempre desabilitada", () => {
    for (const status of ["em_execucao", "aberta", "entregue", "diagnostico"]) {
      const v = buildVals(makeState({ selectedOsId: "os-ent", novaOS: false }), () => {}, () => {}, ctxEntrega(status, { total: 320, recebido: 320, saldo: 0, status: "quitado" }))
      expect(v.entregaAcoes, `status ${status}`).toEqual({ podeConfirmar: false, bloqueadaPorSaldo: false })
    }
  })

  it("sem OS selecionada, entregaAcoes fica desabilitada mesmo com snapshot local 'pronta'", () => {
    const v = buildVals(makeState({ status: "pronta", selectedOsId: null, novaOS: false }), () => {}, () => {}, ctx)
    expect(v.entregaAcoes).toEqual({ podeConfirmar: false, bloqueadaPorSaldo: false })
  })
})

describe("OPS-V4-ENTREGA-REAL-E-CTA-QUITADO-008 — confirmarEntrega reusa aplicarTransicaoStatusV3 via runWrite", () => {
  const orquestrador = readFileSync(join(DIR, "use-v4-preview.ts"), "utf8")
  const entregaStage = readFileSync(join(DIR, "parts", "stages", "EntregaStage.tsx"), "utf8")

  it("chama aplicarTransicaoStatusV3(sid, osId, \"entregue\") — mesmo contrato V3 usado pelas outras transições", () => {
    expect(orquestrador).toContain('aplicarTransicaoStatusV3(sid, osId, "entregue")')
  })

  it("passa pelo wrapper runWrite (fonte única de reload/patch-em-sucesso) — falha não muta status", () => {
    expect(orquestrador).toMatch(/const confirmarEntrega = useCallback\(\s*\(\)\s*=>\s*runWrite\(/)
    // runWrite continua definido uma única vez — confirmarEntrega reaproveita, não duplica.
    expect(orquestrador.match(/const runWrite = useCallback/g)?.length).toBe(1)
  })

  it("EntregaStage chama o handler real (v.confirmarEntrega) — não é toast de preview", () => {
    expect(entregaStage).toContain("v.confirmarEntrega")
    expect(entregaStage).not.toContain("PREVIEW_NOOP")
  })

  it("EntregaAcaoCard só renderiza quando há algo a decidir (podeConfirmar ou bloqueadaPorSaldo) — sem botão sempre ligado", () => {
    expect(entregaStage).toMatch(/if \(!ea\.podeConfirmar && !ea\.bloqueadaPorSaldo\) return null/)
  })

  it("botão de confirmar tem busy-lock (evita duplo clique)", () => {
    expect(entregaStage).toContain("useState")
    expect(entregaStage).toMatch(/disabled=\{busy\}/)
  })

  it("EntregaStage não chama PDV/Caixa/Financeiro/Estoque/WhatsApp/Fiscal nem recebimento (só a transição de status)", () => {
    // Escopo = só o arquivo novo (EntregaStage.tsx), mesmo padrão do guard já
    // existente para o ExecucaoStage — não `allSources`, que já tem menções
    // legítimas de `receberOSV3` em outros arquivos (slice de recebimento, já
    // sancionado e coberto pelos próprios guards daquele slice).
    for (const proibido of [
      'from "@/lib/caixa',
      'from "@/lib/financeiro',
      'from "@/lib/estoque',
      'from "@/lib/whatsapp',
      'from "@/lib/fiscal',
      'from "@/components/pdv',
      "updateOSPayload",
      "receberOSV3",
      "estornarRecebimentoOSV3",
      '"loja-1"',
      "openCaixaIfClosed",
    ]) {
      expect(entregaStage, `referência proibida encontrada: ${proibido}`).not.toContain(proibido)
    }
  })
})

describe("OPS-V4-ENTREGA-REAL-E-CTA-QUITADO-008 — Financeiro sinaliza 'falta entregar' quando quitada", () => {
  function ctxQuitada(entregue: boolean) {
    return {
      ...ctx,
      realOS: mkOS({
        id: "os-fin",
        status: entregue ? "entregue" : "pronta",
        ...(entregue ? { retirada: { confirmado: true, retiradoPor: "Cliente" }, entregueEm: "2026-07-01T10:00:00.000Z" } : {}),
      }),
      pdvServico: { ...ctx.pdvServico, pagamento: { total: 320, recebido: 320, saldo: 0, status: "quitado" as const } },
    }
  }

  it("quitada e ainda não entregue: v.entrega.entregue é false (a UI mostra a chamada para ir à Entrega)", () => {
    const v = buildVals(makeState({ selectedOsId: "os-fin", novaOS: false }), () => {}, () => {}, ctxQuitada(false))
    expect(v.recebimento.quitado).toBe(true)
    expect(v.entrega.entregue).toBe(false)
  })

  it("quitada e já entregue: v.entrega.entregue é true (a UI não repete a chamada para ir à Entrega)", () => {
    const v = buildVals(makeState({ selectedOsId: "os-fin", novaOS: false }), () => {}, () => {}, ctxQuitada(true))
    expect(v.recebimento.quitado).toBe(true)
    expect(v.entrega.entregue).toBe(true)
  })

  it("goEntrega navega à etapa Entrega (só navegação; a ação real fica no botão de lá)", () => {
    const patches: Array<Record<string, unknown>> = []
    const v = buildVals(makeState({ selectedOsId: "os-fin", novaOS: false }), (p) => patches.push(p as Record<string, unknown>), () => {}, ctxQuitada(false))
    v.goEntrega()
    expect(patches.at(-1)).toMatchObject({ stage: "entrega" })
  })

  it("ReceberPagamentoV4 mostra a chamada para Entrega só quando quitado e ainda não entregue", () => {
    const card = readFileSync(join(DIR, "parts", "ReceberPagamentoV4.tsx"), "utf8")
    expect(card).toContain("v.entrega.entregue")
    expect(card).toContain("v.goEntrega")
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

  it("a Preview não importa prisma, estorno, updateOSPayload nem app/api", () => {
    for (const proibido of [
      'from "@/lib/prisma',
      // PDV-SERVICO-OS-RECEBIMENTO-REAL-001: recebimento (receberOSV3/pdv-servico-actions)
      // passou a ser REAL e sancionado — só o ESTORNO continua fora deste slice.
      "estornarRecebimentoOSV3",
      "updateOSPayload",
      'from "@/app/api',
      "openCaixaIfClosed",
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

// ---------------------------------------------------------------------------
// OPS-V4-EXECUCAO-REAL-007 — Execução real mínima: transições de status
// (iniciar/retomar execução, marcar aguardando peça, marcar pronta) via reuso
// de `aplicarTransicaoStatusV3`; habilitadas SÓ quando a máquina única permite
// a partir do status real. Checklist técnico/peças/estoque/observação técnica
// seguem read-only (sem action V3 segura).
// ---------------------------------------------------------------------------
describe("OPS-V4-EXECUCAO-REAL-007 — execAcoes só habilita a transição que a máquina única permite", () => {
  function ctxComStatus(status: string) {
    return { ...ctx, realOS: mkOS({ id: "os-exec", status }) }
  }

  it("aprovado: pode iniciar execução E marcar aguardando peça; não pode marcar pronta", () => {
    const v = buildVals(
      makeState({ selectedOsId: "os-exec", novaOS: false }),
      () => {},
      () => {},
      ctxComStatus("aprovado"),
    )
    expect(v.execAcoes.podeIniciar).toBe(true)
    expect(v.execAcoes.iniciarLabel).toBe("Iniciar execução")
    expect(v.execAcoes.podeAguardarPeca).toBe(true)
    expect(v.execAcoes.podePronta).toBe(false)
  })

  it("aguardando_peca: só pode retomar (rótulo muda); não pode marcar aguardando peça de novo", () => {
    const v = buildVals(
      makeState({ selectedOsId: "os-exec", novaOS: false }),
      () => {},
      () => {},
      ctxComStatus("aguardando_peca"),
    )
    expect(v.execAcoes.podeIniciar).toBe(true)
    expect(v.execAcoes.iniciarLabel).toBe("Retomar execução")
    expect(v.execAcoes.podeAguardarPeca).toBe(false)
    expect(v.execAcoes.podePronta).toBe(false)
  })

  it("em_execucao: só pode marcar pronta; não pode iniciar nem aguardar peça", () => {
    const v = buildVals(
      makeState({ selectedOsId: "os-exec", novaOS: false }),
      () => {},
      () => {},
      ctxComStatus("em_execucao"),
    )
    expect(v.execAcoes.podeIniciar).toBe(false)
    expect(v.execAcoes.podeAguardarPeca).toBe(false)
    expect(v.execAcoes.podePronta).toBe(true)
  })

  it("pronta / diagnostico / aberta / entregue / cancelada: nenhuma ação de Execução disponível", () => {
    for (const status of ["pronta", "diagnostico", "aberta", "entregue", "cancelada"]) {
      const v = buildVals(
        makeState({ selectedOsId: "os-exec", novaOS: false }),
        () => {},
        () => {},
        ctxComStatus(status),
      )
      expect(v.execAcoes, `status ${status}`).toMatchObject({
        podeIniciar: false,
        podeAguardarPeca: false,
        podePronta: false,
      })
    }
  })

  it("sem OS selecionada, nenhuma ação fica disponível mesmo com o snapshot local 'em_execucao'", () => {
    const v = buildVals(makeState({ status: "em_execucao", selectedOsId: null, novaOS: false }), () => {}, () => {}, ctx)
    expect(v.execAcoes).toEqual({
      podeIniciar: false,
      iniciarLabel: "Iniciar execução",
      podeAguardarPeca: false,
      podePronta: false,
    })
  })
})

describe("OPS-V4-EXECUCAO-REAL-007 — handlers reais (runWrite) e wiring do ExecucaoStage", () => {
  const orquestrador = readFileSync(join(DIR, "use-v4-preview.ts"), "utf8")
  const execStage = readFileSync(join(DIR, "parts", "stages", "ExecucaoStage.tsx"), "utf8")

  it("marcarAguardandoPeca/marcarPronta chamam aplicarTransicaoStatusV3 (novas transições seguras)", () => {
    expect(orquestrador).toContain('aplicarTransicaoStatusV3(sid, osId, "aguardando_peca")')
    expect(orquestrador).toContain('aplicarTransicaoStatusV3(sid, osId, "pronta")')
  })

  it("os dois novos handlers passam pelo wrapper runWrite — reload/patch de status só ocorrem em sucesso, nunca direto na falha", () => {
    // Mesma garantia estrutural que salvarDiagnostico/iniciarServico já têm: o
    // handler é `() => runWrite(...)`, então reload+toast+after() só correm dentro
    // do try, após o `await fn()` resolver — a falha cai no catch (return false)
    // sem tocar patches/status. Ver `runWrite` (única definição, não duplicada).
    expect(orquestrador).toMatch(/const marcarAguardandoPeca = useCallback\(\s*\(\)\s*=>\s*runWrite\(/)
    expect(orquestrador).toMatch(/const marcarPronta = useCallback\(\s*\(\)\s*=>\s*runWrite\(/)
    // runWrite só existe uma vez (fonte única de reload/patch-em-sucesso) — os novos
    // handlers reaproveitam-na, não duplicam a lógica de guarda/patch.
    expect(orquestrador.match(/const runWrite = useCallback/g)?.length).toBe(1)
  })

  it("ExecucaoStage chama os handlers reais (iniciarServico/marcarAguardandoPeca/marcarPronta) — não um toast de preview", () => {
    expect(execStage).toContain("v.iniciarServico")
    expect(execStage).toContain("v.marcarAguardandoPeca")
    expect(execStage).toContain("v.marcarPronta")
    expect(execStage).not.toContain("PREVIEW_NOOP")
  })

  it("ExecAcoesCard só renderiza quando alguma transição de v.execAcoes é permitida (sem botão sempre ligado)", () => {
    expect(execStage).toMatch(/if \(!ex\.podeIniciar && !ex\.podeAguardarPeca && !ex\.podePronta\) return null/)
  })

  it("botões de Execução têm busy-lock (evita duplo clique) e não chamam PDV/Caixa/Financeiro/Estoque/WhatsApp/Fiscal", () => {
    expect(execStage).toContain("useState")
    expect(execStage).toMatch(/disabled=\{busy\}/)
    for (const proibido of [
      'from "@/lib/caixa',
      'from "@/lib/financeiro',
      'from "@/lib/estoque',
      'from "@/lib/whatsapp',
      'from "@/lib/fiscal',
      'from "@/components/pdv',
      "updateOSPayload",
      "receberOSV3",
      "estornarRecebimentoOSV3",
      '"loja-1"',
    ]) {
      expect(execStage, `referência proibida encontrada: ${proibido}`).not.toContain(proibido)
    }
  })

  it("checklist técnico e consumo de estoque continuam read-only (sem novo handler de escrita para eles)", () => {
    // Nenhuma action V3 segura existe para checklist técnico (só via updateOSPayload
    // legado, fora do escopo) nem para consumo de peças — por isso o stage não ganhou
    // nenhum botão de "salvar checklist" ou "consumir peça" neste slice.
    expect(execStage).not.toMatch(/salvarChecklistTecnico/i)
    expect(execStage).not.toMatch(/consumirPeca|baixarEstoque/i)
  })
})

// ---------------------------------------------------------------------------
// PDV-SERVICO-OS-RECEBIMENTO-REAL-001 — recebimento real da OS na V4, via o
// motor único da V3 (usePdvServicoV3 → receberOSV3). Caixa aberto obrigatório;
// parcial permitido (validarRecebimentoV3, sem parcelamento novo); sem
// estorno/venda/estoque neste slice.
// ---------------------------------------------------------------------------
describe("PDV-SERVICO-OS-RECEBIMENTO-REAL-001 — v.recebimento só habilita com total>0, saldo>0 e caixa aberto", () => {
  function ctxComPdv(pagamento: Pick<PagamentoV3, "total" | "recebido" | "saldo" | "status"> | null, sessaoAberta: boolean) {
    return {
      ...ctx,
      pdvServico: {
        ...ctx.pdvServico,
        pagamento,
        sessao: { aberta: sessaoAberta, sessaoId: sessaoAberta ? "sessao-1" : undefined },
      },
    }
  }

  it("total>0, saldo>0, caixa aberto: podeReceber true", () => {
    const v = buildVals(makeState({ novaOS: false }), () => {}, () => {}, ctxComPdv({ total: 200, recebido: 0, saldo: 200, status: "aberto" }, true))
    expect(v.recebimento).toEqual({ semTotal: false, previaNaoMaterializada: false, quitado: false, caixaAberto: true, podeReceber: true })
  })

  it("caixa fechado: podeReceber false mesmo com saldo aberto", () => {
    const v = buildVals(makeState({ novaOS: false }), () => {}, () => {}, ctxComPdv({ total: 200, recebido: 0, saldo: 200, status: "aberto" }, false))
    expect(v.recebimento.caixaAberto).toBe(false)
    expect(v.recebimento.podeReceber).toBe(false)
  })

  it("quitado (saldo <= 0): podeReceber false mesmo com caixa aberto", () => {
    const v = buildVals(makeState({ novaOS: false }), () => {}, () => {}, ctxComPdv({ total: 200, recebido: 200, saldo: 0, status: "quitado" }, true))
    expect(v.recebimento.quitado).toBe(true)
    expect(v.recebimento.podeReceber).toBe(false)
  })

  it("sem total (OS sem orçamento/valor): semTotal true, podeReceber false", () => {
    const v = buildVals(makeState({ novaOS: false }), () => {}, () => {}, ctxComPdv({ total: 0, recebido: 0, saldo: 0, status: "sem_cobranca" }, true))
    expect(v.recebimento.semTotal).toBe(true)
    expect(v.recebimento.podeReceber).toBe(false)
    // Sem `realOS` (ctx.realOS fica null neste helper) não há total visível em lugar
    // nenhum — não é o caso de "prévia não materializada", é ausência genuína.
    expect(v.recebimento.previaNaoMaterializada).toBe(false)
  })

  it("pagamento ainda não carregado (null): tudo honesto/false, sem crash", () => {
    const v = buildVals(makeState({ novaOS: false }), () => {}, () => {}, ctxComPdv(null, true))
    expect(v.recebimento).toEqual({ semTotal: false, previaNaoMaterializada: false, quitado: false, caixaAberto: true, podeReceber: false })
  })

  it("parcial (recebido parcial > 0, saldo > 0): continua podeReceber true", () => {
    const v = buildVals(makeState({ novaOS: false }), () => {}, () => {}, ctxComPdv({ total: 500, recebido: 100, saldo: 400, status: "parcial" }, true))
    expect(v.recebimento.podeReceber).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// OPS-V4-RECEBIMENTO-PREVIA-HONESTY-002 — a tela não pode contradizer a si mesma:
// "Total da OS" (osTotalNumero/adaptFinanceiro, aceita orçamento sintetizado pela
// hidratação) e o total cobrável do motor V3 (totalCobravelV3, rejeita sintetizado)
// podem divergir. O motor continua rejeitando prévia (nenhuma mudança de gate) —
// só a mensagem passa a explicar a causa real em vez de dizer "sem valor".
// ---------------------------------------------------------------------------
describe("OPS-V4-RECEBIMENTO-PREVIA-HONESTY-002 — total visível (prévia) vs total cobrável real (motor V3)", () => {
  const osPrevia = mkOS({
    id: "os-previa",
    status: "pronta",
    orcamento: {
      id: "orc-previa",
      status: "aprovado",
      servicos: [{ id: "svc_os-previa", descricao: "Serviços (valor registrado)", valor: 300, desconto: 0 }],
      pecas: [],
      desconto: 0,
      total: 300,
      criadoEm: "2026-01-01T00:00:00.000Z",
      atualizadoEm: "2026-01-01T00:00:00.000Z",
      // Marca de hidratação (`mergeOrcamentoFromPrismaRow`): prévia derivada dos itens
      // da OS, NUNCA um orçamento real aprovado pelo fluxo da V3.
      sintetizado: true,
    },
  })
  const osMaterializada = mkOS({
    id: "os-real",
    status: "pronta",
    orcamento: {
      id: "orc-real",
      status: "aprovado",
      servicos: [{ id: "s1", descricao: "Troca de tela", valor: 300, desconto: 0 }],
      pecas: [],
      desconto: 0,
      total: 300,
      criadoEm: "2026-01-01T00:00:00.000Z",
      atualizadoEm: "2026-01-01T00:00:00.000Z",
    },
  })
  const osVazia = mkOS({ id: "os-vazia", status: "aberta" })

  function ctxCom(realOS: OrdemServico | null, pagamento: Pick<PagamentoV3, "total" | "recebido" | "saldo" | "status"> | null, sessaoAberta: boolean): V4DataCtx {
    return {
      ...ctx,
      realOS,
      pdvServico: {
        ...ctx.pdvServico,
        pagamento,
        sessao: { aberta: sessaoAberta, sessaoId: sessaoAberta ? "sessao-1" : undefined },
      },
    }
  }

  it("prévia sintetizada (Total da OS > 0) + motor V3 em 0: previaNaoMaterializada true, sem habilitar recebimento", () => {
    const v = buildVals(
      makeState({ novaOS: false }),
      () => {},
      () => {},
      ctxCom(osPrevia, { total: 0, recebido: 0, saldo: 0, status: "sem_cobranca" }, true),
    )
    expect(v.financeiro.temTotal).toBe(true) // "Total da OS" aparece na tela
    expect(v.orcamentoMaterializado).toBe(false)
    expect(v.recebimento.semTotal).toBe(true)
    expect(v.recebimento.previaNaoMaterializada).toBe(true)
    expect(v.recebimento.podeReceber).toBe(false)
  })

  it("orçamento materializado (não sintetizado) com total cobrável real: previaNaoMaterializada false, recebimento habilita normalmente", () => {
    const v = buildVals(
      makeState({ novaOS: false }),
      () => {},
      () => {},
      ctxCom(osMaterializada, { total: 300, recebido: 0, saldo: 300, status: "aberto" }, true),
    )
    expect(v.orcamentoMaterializado).toBe(true)
    expect(v.recebimento.semTotal).toBe(false)
    expect(v.recebimento.previaNaoMaterializada).toBe(false)
    expect(v.recebimento.podeReceber).toBe(true)
  })

  it("OS genuinamente sem valor (sem orçamento, sem total em lugar nenhum): não rotula como prévia", () => {
    const v = buildVals(
      makeState({ novaOS: false }),
      () => {},
      () => {},
      ctxCom(osVazia, { total: 0, recebido: 0, saldo: 0, status: "sem_cobranca" }, true),
    )
    expect(v.financeiro.temTotal).toBe(false)
    expect(v.recebimento.semTotal).toBe(true)
    expect(v.recebimento.previaNaoMaterializada).toBe(false)
  })

  it("ReceberPagamentoV4: mensagem de prévia substitui a genérica só quando previaNaoMaterializada; motor V3 intocado", () => {
    const card = readFileSync(join(DIR, "parts", "ReceberPagamentoV4.tsx"), "utf8")
    expect(card).toContain("previaNaoMaterializada")
    expect(card).toMatch(/prévia/i)
    // A copy genérica continua existindo para o caso de ausência real (sem orçamento nenhum).
    expect(card).toContain("Esta OS não tem valor a cobrar")
    // Nenhuma chamada nova ao motor: `pdv.receber(` continua existindo uma única vez,
    // dentro de `onConfirmar` (mesma garantia do slice 001 — ver describe acima).
    expect((card.match(/\.receber\(/g) ?? []).length).toBe(1)
    // A prévia é decidida por `v.recebimento` (pré-computado); o card não reimplementa
    // nem importa o cálculo autoritativo do servidor (`totalCobravelV3`).
    expect(card).not.toContain("totalCobravelV3")
  })

  it("FinanceiroStage sinaliza 'Total da OS' como prévia reaproveitando orcamentoMaterializado (sem lógica nova de sintetizado)", () => {
    const financeiroStage = readFileSync(join(DIR, "parts", "stages", "FinanceiroStage.tsx"), "utf8")
    expect(financeiroStage).toContain("v.orcamentoMaterializado")
    expect(financeiroStage).not.toContain(".sintetizado")
  })

  it("previaNaoMaterializada é derivada só de valores já existentes (orcamentoMaterializado + financeiroReal), sem recalcular o motor V3 no cliente", () => {
    const orquestrador = readFileSync(join(DIR, "use-v4-preview.ts"), "utf8")
    expect(orquestrador).toContain("previaNaoMaterializada")
    expect(orquestrador).toMatch(/previaNaoMaterializada\s*=\s*semTotal\s*&&\s*!orcamentoMaterializado\s*&&\s*financeiroReal\.temTotal/)
    // `totalCobravelV3` é o cálculo AUTORITATIVO do motor V3 (servidor) — a V4 nunca
    // o reimplementa/importa no cliente para decidir a prévia.
    expect(orquestrador).not.toContain("totalCobravelV3")
  })
})

describe("PDV-SERVICO-OS-RECEBIMENTO-REAL-001 — receberPagamentoV4 só recarrega a V4 depois do sucesso", () => {
  const orquestrador = readFileSync(join(DIR, "use-v4-preview.ts"), "utf8")

  it("reaproveita o hook e o motor de recebimento real da V3 (usePdvServicoV3 → receberOSV3), sem motor novo", () => {
    expect(orquestrador).toContain("usePdvServicoV3")
    expect(orquestrador).toContain('from "@/components/operacoes-v3/hooks/use-pdv-servico-v3"')
    expect(orquestrador).toContain("receberOSV3")
  })

  it("o wrapper só chama reloadOrdens/reloadDetail dentro do if (ok) — nunca incondicional", () => {
    expect(orquestrador).toMatch(/const receberPagamentoV4 = useCallback\(/)
    expect(orquestrador).toMatch(/if \(ok\) \{\s*reloadOrdens\(\);\s*reloadDetail\(\);\s*\}/)
  })
})

describe("PDV-SERVICO-OS-RECEBIMENTO-REAL-001 — ReceberPagamentoV4 (UI fina sobre o motor V3)", () => {
  const card = readFileSync(join(DIR, "parts", "ReceberPagamentoV4.tsx"), "utf8")
  const financeiroStage = readFileSync(join(DIR, "parts", "stages", "FinanceiroStage.tsx"), "utf8")
  const reciboModal = readFileSync(join(DIR, "parts", "ReciboModal.tsx"), "utf8")
  const allSources = collectSourceFiles(DIR).map((f) => readFileSync(f, "utf8")).join("\n")

  it("só chama pdv.receber(...) uma vez no arquivo, dentro do onConfirmar (nunca fora de um clique)", () => {
    expect(card).toMatch(/const onConfirmar = async \(\) => \{[\s\S]*?pdv\.receber\(/)
    expect((card.match(/\.receber\(/g) ?? []).length).toBe(1)
  })

  it("bloqueia ANTES do formulário quando sem total, quitado ou caixa fechado (early return, nesta ordem)", () => {
    const idxSemTotal = card.indexOf("if (semTotal)")
    const idxQuitado = card.indexOf("if (quitado)")
    const idxCaixaFechado = card.indexOf("if (!caixaAberto)")
    const idxConfirmar = card.indexOf("const onConfirmar")
    for (const idx of [idxSemTotal, idxQuitado, idxCaixaFechado, idxConfirmar]) expect(idx).toBeGreaterThan(-1)
    expect(idxQuitado).toBeGreaterThan(idxSemTotal)
    expect(idxCaixaFechado).toBeGreaterThan(idxQuitado)
    expect(idxConfirmar).toBeGreaterThan(idxCaixaFechado)
  })

  it("valida o valor com o mesmo validador da V3 (validarRecebimentoV3) — sem regra nova de parcial", () => {
    expect(card).toContain("validarRecebimentoV3")
    expect(card).toContain('from "@/lib/operacoes-v3/payment-model"')
  })

  it("só oferece formas já suportadas pelo contrato real (FORMAS_RECEBIMENTO_V3, sem enum novo)", () => {
    expect(card).toMatch(/FORMAS_RECEBIMENTO_V3\.filter\(\(f\) => f\.suportada\)/)
    expect(card).not.toMatch(/type FormaRecebimentoV3\s*=\s*"/)
  })

  it("busy-lock: botão de confirmar desabilita durante o recebimento (evita duplo clique)", () => {
    expect(card).toMatch(/disabled=\{!podeConfirmar\}/)
    expect(card).toContain("pdv.recebendo")
  })

  it("no sucesso abre o recibo real (v.openRecibo) — não inventa modal próprio", () => {
    expect(card).toMatch(/if \(ok\) \{[\s\S]*?v\.openRecibo\(\)/)
  })

  it("FinanceiroStage usa o card real; não sobrou botão preview de 'em breve' nem v.act.pdv", () => {
    expect(financeiroStage).toContain("<ReceberPagamentoV4")
    expect(financeiroStage).not.toContain("em breve")
    expect(financeiroStage).not.toContain("v.act.pdv")
  })

  it("ReciboModal mostra o comprovante real quando existir, sem recalcular o recibo (só exibe o que a V3 montou)", () => {
    expect(reciboModal).toContain("v.pdvServico.ultimoRecibo")
    expect(reciboModal).not.toContain("montarComprovanteReciboV3")
  })

  it("não cria Venda, não toca estoque/inventário/services financeiros/caixa diretos, sem openCaixaIfClosed/loja-1", () => {
    for (const proibido of [
      "criarVenda",
      "SaleRecord",
      "finalizeSale",
      'from "@/lib/estoque',
      'from "@/lib/financeiro/services',
      'from "@/lib/caixa',
      "openCaixaIfClosed",
      '"loja-1"',
      "updateOSPayload",
      'from "@/lib/prisma',
      'from "@/app/api',
    ]) {
      expect(allSources, `referência proibida: ${proibido}`).not.toContain(proibido)
    }
  })
})
