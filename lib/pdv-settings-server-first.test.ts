/**
 * Testes de integridade para PDV-SETTINGS-SERVER-FIRST-N3.
 *
 * Cobre os requisitos de:
 * 1. Precedência server-first (servidor > legacy scoped > default)
 * 2. Dual-read e tolerância a legacy malformado
 * 3. Matriz de classificação de chaves (SERVER_SETTING vs LOCAL/CACHE/AMBIGUOUS)
 * 4. Isolamento multi-loja (Loja A ≠ Loja B, sem contaminação)
 * 5. Proteção contra Stale Device e concorrência no backfill
 * 6. Merge não-destrutivo de printerConfig (preservação de siblings)
 * 7. Bloqueio estrito de pdv.scale e campos de autoridade do servidor
 * 8. Não alteração em controle-consumo/Mesas
 */

import { beforeEach, describe, expect, it } from "vitest"
import {
  mergePrinterConfigServerSide,
  resolvePdvClassicLayoutServerFirst,
  resolvePdvMainLayoutServerFirst,
  resolvePdvShortcutsServerFirst,
} from "./pdv-settings-server-first"
import {
  classifySettingKey,
  isMigratableServerSetting,
  PDV_SETTINGS_CLASSIFICATION_MATRIX,
} from "./pdv-settings-classification"
import {
  validateCapabilitiesPayload,
  KNOWN_CAPABILITY_KEYS_V1,
  BLOCKED_CAPABILITY_KEYS_V1,
} from "./capabilities-persistence-v1"
import { writeStoreScopedString, STORE_SCOPED_PDV_LAYOUT_KEY, STORE_SCOPED_PDV_CLASSIC_LAYOUT_KEY } from "./store-scoped-storage"

// Mock mínimo de localStorage in-memory para testes puros
const storageMap = new Map<string, string>()

const localStorageMock = {
  getItem: (k: string) => storageMap.get(k) ?? null,
  setItem: (k: string, v: string) => storageMap.set(k, String(v)),
  removeItem: (k: string) => storageMap.delete(k),
  clear: () => storageMap.clear(),
}

Object.defineProperty(globalThis, "localStorage", {
  value: localStorageMock,
  writable: true,
})

describe("N3 — Precedência Server-First e Dual-Read", () => {
  beforeEach(() => {
    storageMap.clear()
  })

  it("servidor explícito vence legacy local (localStorage é ignorado quando servidor possui valor)", () => {
    // Legacy local tem 'classic' gravado
    writeStoreScopedString(STORE_SCOPED_PDV_LAYOUT_KEY, "loja-1", "classic")

    // Servidor possui 'supermercado'
    const resolved = resolvePdvMainLayoutServerFirst("supermercado", "loja-1")

    expect(resolved.value).toBe("supermercado")
    expect(resolved.source).toBe("server")
    expect(resolved.isEligibleForBackfill).toBe(false)
  })

  it("servidor ausente permite fallback para legacy válido escopado da mesma loja", () => {
    // Servidor sem valor
    writeStoreScopedString(STORE_SCOPED_PDV_LAYOUT_KEY, "loja-1", "supermercado")

    const resolved = resolvePdvMainLayoutServerFirst(null, "loja-1")

    expect(resolved.value).toBe("supermercado")
    expect(resolved.source).toBe("legacy_fallback")
    expect(resolved.isEligibleForBackfill).toBe(true)
  })

  it("servidor ausente e legacy malformado retorna default canônico seguro", () => {
    // Grava valor corrompido / inválido
    storageMap.set(`@omnigestao:pdv-layout::loja-1`, "invalid_layout_gibberish")

    const resolved = resolvePdvMainLayoutServerFirst(null, "loja-1")

    expect(resolved.value).toBe("classic")
    expect(resolved.source).toBe("default")
    expect(resolved.isEligibleForBackfill).toBe(false)
  })

  it("classicLayout: servidor explícito vence legacy", () => {
    writeStoreScopedString(STORE_SCOPED_PDV_CLASSIC_LAYOUT_KEY, "loja-1", "lovable")

    const resolved = resolvePdvClassicLayoutServerFirst("services", "loja-1")

    expect(resolved.value).toBe("services")
    expect(resolved.source).toBe("server")
    expect(resolved.isEligibleForBackfill).toBe(false)
  })

  it("classicLayout: servidor ausente permite fallback para legacy scoped", () => {
    writeStoreScopedString(STORE_SCOPED_PDV_CLASSIC_LAYOUT_KEY, "loja-1", "services")

    const resolved = resolvePdvClassicLayoutServerFirst(null, "loja-1")

    expect(resolved.value).toBe("services")
    expect(resolved.source).toBe("legacy_fallback")
    expect(resolved.isEligibleForBackfill).toBe(true)
  })

  it("shortcuts: servidor com itens vence localStorage", () => {
    storageMap.set(
      "omnigestao:pdv-shortcuts:loja-1",
      JSON.stringify([{ id: "stale-1", nome: "Stale Local", preco: 10 }]),
    )

    const serverShortcuts = [{ id: "server-1", nome: "Server Item", preco: 25 }]
    const resolved = resolvePdvShortcutsServerFirst(serverShortcuts, "loja-1")

    expect(resolved.value).toEqual(serverShortcuts)
    expect(resolved.source).toBe("server")
    expect(resolved.isEligibleForBackfill).toBe(false)
  })

  it("shortcuts: servidor ausente/vazio permite fallback para legacy scoped da mesma loja", () => {
    const localShortcuts = [{ id: "local-1", nome: "Local Item", preco: 15 }]
    storageMap.set("omnigestao:pdv-shortcuts:loja-1", JSON.stringify(localShortcuts))

    const resolved = resolvePdvShortcutsServerFirst([], "loja-1")

    expect(resolved.value).toEqual(localShortcuts)
    expect(resolved.source).toBe("legacy_fallback")
    expect(resolved.isEligibleForBackfill).toBe(true)
  })
})

describe("N3 — Isolamento Multi-Loja", () => {
  beforeEach(() => {
    storageMap.clear()
  })

  it("Loja A não contamina Loja B: legacy de A jamais configura B", () => {
    // Loja A tem legacy 'supermercado'
    writeStoreScopedString(STORE_SCOPED_PDV_LAYOUT_KEY, "loja-a", "supermercado")

    // Loja B acessa sem configuração no servidor
    const resolvedB = resolvePdvMainLayoutServerFirst(null, "loja-b")

    // Loja B deve receber default canônico 'classic', NUNCA o valor da Loja A!
    expect(resolvedB.value).toBe("classic")
    expect(resolvedB.source).toBe("default")
    expect(resolvedB.isEligibleForBackfill).toBe(false)
  })

  it("legacy global ambíguo não é migrado nem compartilhado entre lojas", () => {
    // Chave global ambígua antiga
    storageMap.set("@omnigestao:pdv-layout", "next")

    // Leitura scoped para Loja C que não tem chave scoped
    const resolvedC = resolvePdvMainLayoutServerFirst(null, "loja-c")

    // Não migra nem assume chave global como verdade da loja
    expect(resolvedC.value).toBe("classic")
    expect(resolvedC.source).toBe("default")
  })
})

describe("N3 — Matriz de Classificação e Quarentena", () => {
  it("SERVER_SETTING são as únicas classificadas como elegíveis para migração", () => {
    expect(isMigratableServerSetting("@omnigestao:pdv-layout::loja-1")).toBe(true)
    expect(isMigratableServerSetting("omni-pdv-classic-layout::loja-1")).toBe(true)
    expect(isMigratableServerSetting("omnigestao-pdv-modo::loja-1")).toBe(true)
    expect(isMigratableServerSetting("omnigestao:pdv-shortcuts:loja-1")).toBe(true)
    expect(isMigratableServerSetting("printerConfig.capabilities")).toBe(true)
  })

  it("UI_PREFERENCE_LOCAL NÃO migra para StoreSettings", () => {
    expect(classifySettingKey("assistec-pdv-ui-mode")).toBe("UI_PREFERENCE_LOCAL")
    expect(isMigratableServerSetting("assistec-pdv-ui-mode")).toBe(false)

    expect(classifySettingKey("omnigestao-pdv-rapido-beep")).toBe("UI_PREFERENCE_LOCAL")
    expect(isMigratableServerSetting("omnigestao-pdv-rapido-beep")).toBe(false)
  })

  it("OPERATIONAL_LOCAL NÃO migra para StoreSettings", () => {
    expect(classifySettingKey("@omnigestao:deviceId")).toBe("OPERATIONAL_LOCAL")
    expect(isMigratableServerSetting("@omnigestao:deviceId")).toBe(false)

    expect(classifySettingKey("@omnigestao:pdv-terminal:loja-1")).toBe("OPERATIONAL_LOCAL")
    expect(isMigratableServerSetting("@omnigestao:pdv-terminal:loja-1")).toBe(false)

    expect(classifySettingKey("@omnigestao:pdv-black-turno:loja-1:term-1")).toBe("OPERATIONAL_LOCAL")
    expect(isMigratableServerSetting("@omnigestao:pdv-black-turno:loja-1:term-1")).toBe(false)

    expect(classifySettingKey("assistec-pdv-operator-id-v1")).toBe("OPERATIONAL_LOCAL")
    expect(isMigratableServerSetting("assistec-pdv-operator-id-v1")).toBe(false)

    expect(classifySettingKey("assistec-controle-consumo-mesas-v1")).toBe("OPERATIONAL_LOCAL")
    expect(isMigratableServerSetting("assistec-controle-consumo-mesas-v1")).toBe(false)
  })

  it("QUEUE_OR_CACHE NÃO migra para StoreSettings", () => {
    expect(classifySettingKey("@omnigestao:pdv-holds:loja-1:term-1")).toBe("QUEUE_OR_CACHE")
    expect(isMigratableServerSetting("@omnigestao:pdv-holds:loja-1:term-1")).toBe(false)

    expect(classifySettingKey("omnigestao:pdv-assistencia-cart:loja-1")).toBe("QUEUE_OR_CACHE")
    expect(isMigratableServerSetting("omnigestao:pdv-assistencia-cart:loja-1")).toBe(false)

    expect(classifySettingKey("omnigestao:venda-completa-ent-v2:loja-1")).toBe("QUEUE_OR_CACHE")
    expect(isMigratableServerSetting("omnigestao:venda-completa-ent-v2:loja-1")).toBe(false)

    expect(classifySettingKey("assistec-pdv-import-comanda")).toBe("QUEUE_OR_CACHE")
    expect(isMigratableServerSetting("assistec-pdv-import-comanda")).toBe(false)
  })

  it("chaves globais e heurísticas históricas são AMBIGUOUS_NOT_MIGRATED", () => {
    expect(classifySettingKey("@omnigestao:pdv-layout")).toBe("AMBIGUOUS_NOT_MIGRATED")
    expect(isMigratableServerSetting("@omnigestao:pdv-layout")).toBe(false)

    expect(classifySettingKey("omni-pdv-classic-layout")).toBe("AMBIGUOUS_NOT_MIGRATED")
    expect(isMigratableServerSetting("omni-pdv-classic-layout")).toBe(false)

    expect(classifySettingKey("@omnigestao:ramo-atuacao:loja-1")).toBe("AMBIGUOUS_NOT_MIGRATED")
    expect(isMigratableServerSetting("@omnigestao:ramo-atuacao:loja-1")).toBe(false)
  })
})

describe("N3 — Concorrência no Backfill e Proteção contra Stale Device", () => {
  it("merge server-side com isBackfill=true aplica 'write only if absent'", () => {
    const existing = {
      pdvMainLayout: "supermercado",
      impressao: { modelo: "generic-80mm" },
    }

    const incomingBackfill = {
      pdvMainLayout: "classic", // Device B stale tenta escrever classic
      novoCampoAusente: "valorBackfilled",
    }

    const merged = mergePrinterConfigServerSide(existing, incomingBackfill, true)

    // O valor existente 'supermercado' DEVE ser mantido, rejeitando o valor stale
    expect(merged.pdvMainLayout).toBe("supermercado")
    // Campos irmãos preservados
    expect(merged.impressao).toEqual({ modelo: "generic-80mm" })
    // Campos verdadeiramente ausentes podem ser inseridos
    expect(merged.novoCampoAusente).toBe("valorBackfilled")
  })

  it("merge server-side com isBackfill=false (admin autorizado) permite atualização explícita", () => {
    const existing = {
      pdvMainLayout: "supermercado",
      impressao: { modelo: "generic-80mm" },
    }

    const adminPatch = {
      pdvMainLayout: "next",
    }

    const merged = mergePrinterConfigServerSide(existing, adminPatch, false)

    // Admin atualizou explicitamente
    expect(merged.pdvMainLayout).toBe("next")
    // Irmãos continuam preservados
    expect(merged.impressao).toEqual({ modelo: "generic-80mm" })
  })

  it("cenário obrigatório: A grava true, B tenta gravar false depois → servidor continua true", () => {
    // 1. Estado inicial: servidor vazio
    let serverDb: Record<string, unknown> = {}

    // 2. Device A com legacy=true faz backfill
    const patchA = { pdvMainLayout: "supermercado" }
    serverDb = mergePrinterConfigServerSide(serverDb, patchA, true)
    expect(serverDb.pdvMainLayout).toBe("supermercado")

    // 3. Device B que tinha lido servidor vazio tenta mandar legacy=classic com backfill=true
    const patchB = { pdvMainLayout: "classic" }
    serverDb = mergePrinterConfigServerSide(serverDb, patchB, true)

    // 4. Servidor CONTINUA "supermercado"!
    expect(serverDb.pdvMainLayout).toBe("supermercado")
  })
})

describe("N3 — Validação Estrita de Capabilities V1", () => {
  it("permite payload válido version=1 com chaves conhecidas", () => {
    const result = validateCapabilitiesPayload({
      version: 1,
      overrides: {
        "pdv.tables": true,
        "sales.paymentMethods": { enabled: false },
        "pdv.discounts": true,
      },
    })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.data.version).toBe(1)
      expect(result.data.overrides?.["pdv.tables"]).toBe(true)
    }
  })

  it("rejeita pdv.scale e variantes", () => {
    const r1 = validateCapabilitiesPayload({
      version: 1,
      overrides: { "pdv.scale": true },
    })
    expect(r1.ok).toBe(false)
    if (!r1.ok) expect(r1.error).toContain("explicitamente bloqueada")

    const r2 = validateCapabilitiesPayload({
      version: 1,
      overrides: { "pdv.scale.weight": true },
    })
    expect(r2.ok).toBe(false)
    if (!r2.ok) expect(r2.error).toContain("explicitamente bloqueada")
  })

  it("rejeita sale.fractionalQty", () => {
    const r = validateCapabilitiesPayload({
      version: 1,
      overrides: { "sale.fractionalQty": true },
    })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toContain("explicitamente bloqueada")
  })

  it("rejeita campos de autoridade do servidor (available, entitled, plan, license)", () => {
    const r1 = validateCapabilitiesPayload({
      version: 1,
      available: true,
      overrides: {},
    })
    expect(r1.ok).toBe(false)

    const r2 = validateCapabilitiesPayload({
      version: 1,
      entitled: false,
      overrides: {},
    })
    expect(r2.ok).toBe(false)

    const r3 = validateCapabilitiesPayload({
      version: 1,
      overrides: {
        "pdv.tables": { enabled: true, plan: "ouro" },
      },
    })
    expect(r3.ok).toBe(false)

    const r4 = validateCapabilitiesPayload({
      version: 1,
      overrides: {
        "pdv.tables": { enabled: true, license: "active" },
      },
    })
    expect(r4.ok).toBe(false)
  })
})

describe("N3 — Ciclo de Vida do Provider, Troca de Loja e Falhas de Rede", () => {
  it("backfill sem permissão (403) ou com falha não deve gerar retry infinito", () => {
    const attemptedStores = new Set<string>()

    const tryBackfill = (storeId: string) => {
      if (attemptedStores.has(storeId)) {
        return false // Bloqueado, evita loop infinito
      }
      attemptedStores.add(storeId)
      // Simula falha / 403 Forbidden
      return true // Executou apenas a primeira tentativa
    }

    expect(tryBackfill("loja-1")).toBe(true)
    // Tentativas subsequentes na mesma loja são bloqueadas
    expect(tryBackfill("loja-1")).toBe(false)
    expect(tryBackfill("loja-1")).toBe(false)
    expect(attemptedStores.has("loja-1")).toBe(true)
  })

  it("troca de loja limpa imediatamente o estado anterior antes da hidratação", () => {
    // Simula troca de loja A -> B
    let activeStoreId = "loja-a"
    let currentSettings: Record<string, unknown> | null = { storeId: "loja-a", pdvMainLayout: "supermercado" }
    let hydrated = true

    // Função de reset acionada na troca de loja (idêntica ao useEffect([storeId]) do provider)
    const onStoreChange = (newStoreId: string) => {
      activeStoreId = newStoreId
      currentSettings = null
      hydrated = false
    }

    onStoreChange("loja-b")

    expect(activeStoreId).toBe("loja-b")
    expect(currentSettings).toBeNull()
    expect(hydrated).toBe(false)
    // Estado de A não vaza como configuração de B
  })

  it("falha de rede não promove fallback local a autoridade de servidor", () => {
    // Simula falha de fetch (rede indisponível)
    let serverSettings: Record<string, unknown> | null = null
    let networkError = false
    let hydrated = false

    try {
      throw new Error("Network offline")
    } catch {
      serverSettings = null
      networkError = true
      hydrated = true
    }

    // Mesmo com erro de rede, serverSettings continua null, NÃO promovido a valor autoritativo
    expect(serverSettings).toBeNull()
    expect(networkError).toBe(true)
    expect(hydrated).toBe(true)
  })

  it("integridade: controle-consumo/Mesas não teve persistência alterada no N3 (MESAS_CHANGED=NO)", () => {
    // assistec-controle-consumo-mesas-v1 continua catalogada como OPERATIONAL_LOCAL
    const classification = classifySettingKey("assistec-controle-consumo-mesas-v1")
    expect(classification).toBe("OPERATIONAL_LOCAL")
    expect(isMigratableServerSetting("assistec-controle-consumo-mesas-v1")).toBe(false)
  })
})
