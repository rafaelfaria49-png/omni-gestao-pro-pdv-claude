import { describe, expect, it } from "vitest"
import {
  isOmniAgentMemoryType,
  sanitizeMemoryTags,
  OMNI_AGENT_MEMORY_MAX_TAGS,
  OMNI_AGENT_MEMORY_MAX_TAG_LENGTH,
} from "./memory"

describe("isOmniAgentMemoryType", () => {
  it("aceita apenas os tipos conhecidos", () => {
    expect(isOmniAgentMemoryType("nota")).toBe(true)
    expect(isOmniAgentMemoryType("incidente")).toBe(true)
    expect(isOmniAgentMemoryType("bogus")).toBe(false)
  })
})

describe("sanitizeMemoryTags", () => {
  it("remove vazias, duplicadas (case-insensitive) e aplica trim", () => {
    expect(sanitizeMemoryTags(["  VIP ", "vip", "Fiel", ""])).toEqual(["VIP", "Fiel"])
  })

  it("limita quantidade e tamanho de cada tag", () => {
    const many = Array.from({ length: OMNI_AGENT_MEMORY_MAX_TAGS + 5 }, (_, i) => `tag${i}`)
    expect(sanitizeMemoryTags(many)).toHaveLength(OMNI_AGENT_MEMORY_MAX_TAGS)

    const long = "x".repeat(OMNI_AGENT_MEMORY_MAX_TAG_LENGTH + 20)
    expect(sanitizeMemoryTags([long])[0]).toHaveLength(OMNI_AGENT_MEMORY_MAX_TAG_LENGTH)
  })

  it("undefined/null vira lista vazia", () => {
    expect(sanitizeMemoryTags(undefined)).toEqual([])
    expect(sanitizeMemoryTags(null)).toEqual([])
  })
})
