/**
 * PADARIA-KG-F8-TROCAS-CONFIGURAVEIS-FINAL-001 — testes de política/configuração (sem banco).
 *
 * Regra do proprietário: trocas KG permitidas POR PADRÃO (F8_KG_EXCHANGE_DEFAULT=ENABLED),
 * configuráveis por loja (F8_KG_EXCHANGE_SCOPE=PER_STORE). Ausência da chave = padrão
 * aprovado (ATIVADO); chave presente com valor inválido = fail-closed (DESATIVADO) —
 * ausência de schema/erro de leitura nunca vira autorização implícita.
 */
import { describe, expect, it } from "vitest"
import {
  DEFAULT_TROCAS_PESO,
  TROCAS_PESO_KEY,
  normalizeTrocasPesoValue,
  trocasPesoPermitidas,
} from "@/lib/pdv/devolucao/trocas-peso-policy"
import { devolucaoFingerprint } from "@/lib/pdv/devolucao/registrar-devolucao"
import { getEnterprisePermissions } from "@/lib/auth/enterprise-permissions"
import { classificarRespostaDevolucao } from "@/lib/operations-store"

describe("política de trocas por peso — printerConfig.pdvTrocasPeso", () => {
  it("chave ausente = padrão APROVADO ativado; null/undefined não bloqueiam", () => {
    expect(trocasPesoPermitidas(undefined)).toBe(true)
    expect(trocasPesoPermitidas({})).toBe(true)
    expect(trocasPesoPermitidas({ printerConfig: null })).toBe(true)
    expect(trocasPesoPermitidas({ printerConfig: { outraCoisa: 1 } })).toBe(true)
  })

  it("enabled libera e disabled bloqueia; valor presente inválido = fail-closed", () => {
    expect(trocasPesoPermitidas({ printerConfig: { [TROCAS_PESO_KEY]: "enabled" } })).toBe(true)
    expect(trocasPesoPermitidas({ printerConfig: { [TROCAS_PESO_KEY]: "disabled" } })).toBe(false)
    expect(trocasPesoPermitidas({ printerConfig: { [TROCAS_PESO_KEY]: "maybe" } })).toBe(false)
    expect(trocasPesoPermitidas({ printerConfig: { [TROCAS_PESO_KEY]: true } })).toBe(false)
  })

  it("normalização: só enabled/disabled; default documentado", () => {
    expect(DEFAULT_TROCAS_PESO).toBe("enabled")
    expect(normalizeTrocasPesoValue("enabled")).toBe("enabled")
    expect(normalizeTrocasPesoValue("disabled")).toBe("disabled")
    expect(normalizeTrocasPesoValue("x")).toBeNull()
  })
})

describe("fingerprint de devolução com quantidade fracionária KG", () => {
  const base = { vendaLocalId: "VDA-1", tipo: "vale_credito", clienteDoc: "529.982.247-25" }

  it("0,500 e 0.5 são o MESMO replay (gramas exatas, sem Math.round)", () => {
    const a = devolucaoFingerprint({ ...base, itens: [{ inventoryId: "p1", quantidadeKg: "0.500" }] })
    const b = devolucaoFingerprint({ ...base, itens: [{ inventoryId: "p1", quantidadeKg: "0.5" }] })
    expect(a).toBe(b)
  })

  it("milésimos distintos são devoluções diferentes (0,123 ≠ 0,124 ≠ 0,350)", () => {
    const f = (kg: string) => devolucaoFingerprint({ ...base, itens: [{ inventoryId: "p1", quantidadeKg: kg }] })
    expect(f("0.123")).not.toBe(f("0.124"))
    expect(f("0.350")).not.toBe(f("0.351"))
    // Regressão: o Math.round antigo colapsava 0,4 kg em zero e igualava devoluções distintas.
    expect(f("0.4")).not.toBe(f("0.5"))
  })

  it("unidade discrimina: 500 UN ≠ 0,500 KG do mesmo produto", () => {
    const un = devolucaoFingerprint({ ...base, itens: [{ inventoryId: "p1", quantidade: 500 }] })
    const kg = devolucaoFingerprint({ ...base, itens: [{ inventoryId: "p1", quantidadeKg: "0.500" }] })
    expect(un).not.toBe(kg)
  })
})

describe("RBAC — permissão específica para alterar a configuração de trocas por peso", () => {
  it("proprietário (admin) e gerente podem; caixa, vendedor e técnico não", () => {
    expect(getEnterprisePermissions("ADMIN").pdv.configTrocasPeso).toBe(true)
    expect(getEnterprisePermissions("GERENTE").pdv.configTrocasPeso).toBe(true)
    expect(getEnterprisePermissions("CAIXA").pdv.configTrocasPeso).toBe(false)
    expect(getEnterprisePermissions("VENDEDOR").pdv.configTrocasPeso).toBe(false)
    expect(getEnterprisePermissions("TECNICO").pdv.configTrocasPeso).toBe(false)
  })
})

describe("fila offline — erros de política KG são recusa definitiva, não retry", () => {
  it("códigos novos saem da fila com motivo preservado (política ≠ transitório)", () => {
    for (const code of ["TROCA_KG_DESATIVADA_LOJA", "TROCA_KG_SCHEMA_INDISPONIVEL", "QUANTIDADE_KG_INVALIDA", "CONDICAO_MERCADORIA_OBRIGATORIA_KG", "JUSTIFICATIVA_CONDICAO_OBRIGATORIA", "LINHA_VENDA_QUANTIDADE_INVALIDA"]) {
      expect(classificarRespostaDevolucao(409, code)).toBe("recusada")
      expect(classificarRespostaDevolucao(422, code)).toBe("recusada")
    }
  })

  it("erros transitórios continuam aguardando (rede, venda ainda não sincronizada)", () => {
    expect(classificarRespostaDevolucao(503, undefined)).toBe("aguardar")
    expect(classificarRespostaDevolucao(409, "VENDA_ORIGEM_NAO_ENCONTRADA")).toBe("aguardar")
  })
})
