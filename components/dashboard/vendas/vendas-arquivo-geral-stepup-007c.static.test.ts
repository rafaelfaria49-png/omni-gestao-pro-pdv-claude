/**
 * GOAL 007C — o Histórico de Vendas voltou a cancelar com o contrato seguro.
 *
 * Contexto: o 007A passou a exigir step-up no servidor para
 * `POST /api/vendas/[id]/cancelar`. O Histórico (`/dashboard/vendas-arquivo-geral`)
 * chamava a rota sem autorização nenhuma e passou a tomar 403 — de forma
 * intermitente, porque o cookie podia existir por outro fluxo.
 *
 * A correção é na SUPERFÍCIE, não no endpoint: a tela abre o mesmo gate da
 * Conferência e emite autorização escopada para a venda. Nenhuma exceção, nenhum
 * enfraquecimento do servidor — o que este teste também trava.
 */
import { readFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"

const aqui = dirname(fileURLToPath(import.meta.url))
const ler = (p: string) => readFileSync(resolve(aqui, p), "utf8")

const arquivoGeral = ler("./vendas-arquivo-geral.tsx")
const rota = ler("../../../app/api/vendas/[id]/cancelar/route.ts")
const guard = ler("../../../lib/vendas/guard-estorno-venda.ts")
const historicoLib = ler("../../../lib/vendas/cancelar-venda-historico.ts")

describe("A. a tela passou a usar o step-up escopado", () => {
  it("monta o MESMO gate compartilhado da Conferência", () => {
    expect(arquivoGeral).toContain('from "@/components/dashboard/caixa/supervisor-gate-dialog"')
    expect(arquivoGeral).toContain("<SupervisorGateDialog")
  })

  it("a autorização é vinculada à AÇÃO e à VENDA que será cancelada", () => {
    expect(arquivoGeral).toContain("scope={{ action: ESTORNO_STEP_UP_ACTION, resource: cancelGate?.pedidoId }}")
    expect(arquivoGeral).toContain('from "@/lib/vendas/estorno-step-up-contract"')
  })

  it("o POST só sai DEPOIS de autorizar — o clique abre o gate, não a rota", () => {
    const abre = arquivoGeral.slice(
      arquivoGeral.indexOf("const handleCancelar = useCallback"),
      arquivoGeral.indexOf("const executarCancelamento = useCallback"),
    )
    expect(abre).toContain("setCancelGate({ pedidoId: cancelandoId, forcar })")
    expect(abre).not.toContain("confirmCancelarVendaHistorico")
    // e o envio real vive no callback disparado por onAuthorized
    expect(arquivoGeral).toContain("if (pendente) void executarCancelamento(pendente.forcar)")
  })

  it("a segunda confirmação (venda com devoluções) preserva o `forcar` pendente", () => {
    expect(arquivoGeral).toContain("cancelGate, setCancelGate] = useState<{ pedidoId: string; forcar: boolean } | null>")
  })
})

describe("B. o servidor NÃO foi enfraquecido para acomodar a tela", () => {
  it("a rota continua exigindo permissão normal E step-up escopado", () => {
    expect(rota).toContain("p.pdv.cancelarVenda")
    expect(rota).toContain("requireEstornoStepUp(sessionUserId, storeId, pedidoId)")
  })

  it("não existe exceção, bypass ou lista de isenção por origem/consumidor", () => {
    for (const bypass of [
      "skipStepUp", "bypass", "allowWithoutStepUp", "x-internal", "isHistorico",
      "fromArquivoGeral", "legacyCancel",
    ]) {
      expect(rota, bypass).not.toContain(bypass)
      expect(guard, bypass).not.toContain(bypass)
    }
  })

  it("o guard segue exigindo ação + alvo, sem modo permissivo", () => {
    expect(guard).toContain("action: ESTORNO_STEP_UP_ACTION, resource: alvo")
    expect(guard).not.toMatch(/if\s*\(\s*!?\s*process\.env\.\w*STEP_UP/)
  })

  it("o corpo enviado pelo Histórico continua sem PIN e sem autorizador", () => {
    const corpo = historicoLib.slice(historicoLib.indexOf("body: JSON.stringify({"))
    expect(corpo).not.toMatch(/\bpin\b/i)
    expect(corpo).not.toContain("autorizadoPor")
  })
})

describe("C. ações somente-leitura do Histórico não pedem autorização", () => {
  it("o gate é montado UMA vez e só para o cancelamento", () => {
    expect((arquivoGeral.match(/<SupervisorGateDialog/g) ?? []).length).toBe(1)
    const gate = arquivoGeral.slice(arquivoGeral.indexOf("<SupervisorGateDialog"))
    expect(gate).toContain("Autorização para cancelar venda")
  })

  it("abrir detalhe, cupom e troca não passam pelo gate", () => {
    // Delimita o corpo real de cada callback (até o `}, [deps])` que o fecha) em vez
    // de uma janela fixa, que invadiria a função seguinte.
    const corpoDe = (decl: string) => {
      const ini = arquivoGeral.indexOf(decl)
      expect(ini, decl).toBeGreaterThan(-1)
      const fim = arquivoGeral.indexOf("\n  }, [", ini)
      return arquivoGeral.slice(ini, fim > ini ? fim : ini + 400)
    }
    for (const fn of ["const openDetalhe", "const openCupomFromRow", "const openTroca"]) {
      expect(corpoDe(fn), fn).not.toContain("setCancelGate")
    }
  })
})
