import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"
import {
  buildAccessoryLineDescription,
  resolveAccessoryColorPresentation,
  resolveAccessoryModelPresentation,
} from "./line-description"
import { sanitizeAccessorySelection } from "./selection"

describe("buildAccessoryLineDescription", () => {
  it("combina modelo e cor com travessão", () => {
    expect(buildAccessoryLineDescription("Capinha silicone", {
      version: 1,
      deviceBrand: "Samsung",
      deviceModelName: "Samsung Galaxy A06",
      colorKey: "preto",
    })).toBe("Capinha silicone — Samsung Galaxy A06 — Preto")
  })

  it("combina somente modelo", () => {
    expect(buildAccessoryLineDescription("Capinha silicone", {
      version: 1,
      deviceBrand: "Samsung",
      deviceModelName: "Galaxy A06",
    })).toBe("Capinha silicone — Samsung Galaxy A06")
  })

  it("combina somente cor", () => {
    expect(buildAccessoryLineDescription("Capinha silicone", { version: 1, colorKey: "preto" }))
      .toBe("Capinha silicone — Preto")
  })

  it("sem seleção retorna o nome base trimado", () => {
    expect(buildAccessoryLineDescription("  Capinha silicone  ")).toBe("Capinha silicone")
  })

  it("outra usa customColorLabel", () => {
    expect(buildAccessoryLineDescription("Capinha silicone", {
      version: 1,
      colorKey: "outra",
      customColorLabel: " Vinho ",
    })).toBe("Capinha silicone — Vinho")
  })

  it("não duplica marca presente no nome canônico", () => {
    expect(buildAccessoryLineDescription("Capinha", {
      version: 1,
      deviceBrand: "Samsung",
      deviceModelName: "Samsung Galaxy A06",
    })).toBe("Capinha — Samsung Galaxy A06")
  })

  it("comparação de marca ignora caixa e acentos", () => {
    expect(buildAccessoryLineDescription("Capinha", {
      version: 1,
      deviceBrand: "SÁMSUNG",
      deviceModelName: "samsung Galaxy A06",
    })).toBe("Capinha — samsung Galaxy A06")
  })

  it("ignora strings vazias", () => {
    expect(buildAccessoryLineDescription("  Capinha  ", {
      version: 1,
      deviceBrand: " ",
      deviceModelName: " ",
      customColorLabel: " ",
    })).toBe("Capinha")
  })

  it("não muta nem altera a variável do nome base", () => {
    const base = "  Capinha silicone  "
    buildAccessoryLineDescription(base, { version: 1, colorKey: "azul" })
    expect(base).toBe("  Capinha silicone  ")
  })

  it("usa sempre label canônico e não o label recebido", () => {
    expect(buildAccessoryLineDescription("Capinha", {
      version: 1,
      colorKey: "azul_escuro",
      colorLabel: "Azul inventado",
    })).toBe("Capinha — Azul escuro")
  })

  it("resultado é determinístico", () => {
    const selection = { version: 1, deviceModelName: "Modelo X", colorKey: "branco" }
    expect(buildAccessoryLineDescription("Capa", selection)).toBe(buildAccessoryLineDescription("Capa", selection))
  })
})

describe("resolvers de apresentação", () => {
  it("modelo vazio não usa marca isolada", () => {
    const selection = sanitizeAccessorySelection({ version: 1, deviceBrand: "Samsung" })
    expect(resolveAccessoryModelPresentation(selection)).toBeNull()
  })

  it("outra vazia não produz label de apresentação", () => {
    const selection = sanitizeAccessorySelection({ version: 1, colorKey: "outra" })
    expect(resolveAccessoryColorPresentation(selection)).toBeNull()
  })

  it("cor padrão resolve label canônico", () => {
    const selection = sanitizeAccessorySelection({ version: 1, colorKey: "transparente" })
    expect(resolveAccessoryColorPresentation(selection)).toBe("Transparente")
  })
})

describe("guardrails estáticos do domínio", () => {
  const dir = dirname(fileURLToPath(import.meta.url))
  const productionFiles = ["types.ts", "cores.ts", "metadata.ts", "selection.ts", "line-description.ts", "index.ts"]
  const productionSource = productionFiles.map((file) => readFileSync(join(dir, file), "utf8")).join("\n")

  it("não importa React, Next, Prisma, API ou catálogo de aparelhos", () => {
    expect(productionSource).not.toMatch(/from ["'](?:react|next|@prisma|@\/app|@\/lib\/catalogo-aparelhos)/)
  })

  it("não usa fetch nem clientes de rede", () => {
    expect(productionSource).not.toMatch(/\bfetch\s*\(|axios|XMLHttpRequest/)
  })

  it("não cria SKU, produto filho ou saldo por combinação", () => {
    expect(productionSource).not.toMatch(/produtoFilho|skuDerivado|saldoPor|estoquePor/)
  })
})
