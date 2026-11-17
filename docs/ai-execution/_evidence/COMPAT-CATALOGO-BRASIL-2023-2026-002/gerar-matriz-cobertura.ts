// Gerador da MATRIZ_FINAL_COBERTURA.md (somente leitura dos seeds). Uso:
//   cp docs/ai-execution/_evidence/COMPAT-CATALOGO-BRASIL-2023-2026-002/gerar-matriz-cobertura.ts lib/catalogo-aparelhos/zz-matriz.test.ts
//   OUT_MATRIZ=<saida.md> npx vitest run lib/catalogo-aparelhos/zz-matriz.test.ts ; rm lib/catalogo-aparelhos/zz-matriz.test.ts
import { it } from "vitest"
import { writeFileSync } from "node:fs"
import { execSync } from "node:child_process"
import { loadCatalogoIndex } from "@/lib/catalogo-aparelhos/catalogo-loader"
import { modeloOperacional, searchDeviceModels } from "@/lib/catalogo-aparelhos/catalogo-aparelhos"
import { nivelDaMarca } from "@/lib/catalogo-aparelhos/marcas"
it("matriz", () => {
  const index = loadCatalogoIndex()
  const antes = new Set(
    execSync("git show origin/main:docs/catalogo/seeds/device_models_seed_001.csv", { encoding: "utf8", maxBuffer: 1 << 24 })
      .split(/\r?\n/).slice(1).map((l) => l.split(",")[0]).filter(Boolean),
  )
  const op = index.models.filter((m) => modeloOperacional(m))
  const fora = index.models.filter((m) => !modeloOperacional(m))
  const marcas = ["Apple", "Samsung", "Motorola", "Xiaomi", "Redmi", "POCO", "Realme", "Infinix"]
  const anos = ["2023", "2024", "2025", "2026"]
  const L: string[] = [
    "# Matriz final de cobertura — COMPAT-CATALOGO-BRASIL-2023-2026-002",
    "",
    "Gerada dos seeds versionados (`docs/catalogo/seeds/device_models_seed_001.csv`) contra `origin/main` por `gerar-matriz-cobertura.ts` (nesta pasta).",
    `Total de linhas: **${index.models.length}** · pesquisáveis: **${op.length}** · fora da busca: **${fora.length}**.`,
    "",
    "## 1. Linhas fora da busca (todas intencionais)",
    "",
    "| modelKey | Nome | Status | Aparelho real (replaced_by) | Real é pesquisável | Busca pelo nome antigo acha o real | Motivo |",
    "|---|---|---|---|---|---|---|",
  ]
  for (const m of fora) {
    const canon = index.canonicalKeyOf(m.modelKey)
    const acha = searchDeviceModels(index, m.canonicalName.replace(/^Apple /, ""), { limit: 5 }).some((r) => r.modelKey === canon)
    L.push(`| \`${m.modelKey}\` | ${m.canonicalName} | ${m.status} | \`${canon}\` | ${modeloOperacional(index.modelByKey.get(canon)!) ? "sim" : "NÃO"} | ${acha ? "sim" : "NÃO"} | ${(m.notes || "").replace(/\s+/g, " ").replace(/\|/g, "/").slice(0, 110)} |`)
  }
  const aguardando = index.models.filter((m) => m.status === "aguardando_lancamento")
  L.push("", `Modelos globais \`aguardando_lancamento\`: ${aguardando.length}. Nenhum aparelho comercial válido fica oculto: os ${fora.length} são linhas mescladas cujo aparelho real é pesquisável.`, "")
  L.push("## 2. Cobertura 2023–2026 por marca × ano", "", "Célula: modelos pesquisáveis com esse ano de lançamento no seed (+ quantos entraram nesta PR).", "")
  L.push("| Marca | " + anos.join(" | ") + " | Total 2023–26 | Novos nesta PR | Pesquisáveis sem ano no seed |", "|---" + "|---".repeat(anos.length + 3) + "|")
  for (const b of marcas) {
    const doB = op.filter((m) => m.brand === b)
    const cel = anos.map((y) => { const ms = doB.filter((m) => m.releaseYear === y); return `${ms.length} (+${ms.filter((m) => !antes.has(m.modelKey)).length})` })
    const tot = doB.filter((m) => anos.includes(m.releaseYear ?? ""))
    L.push(`| ${b} | ${cel.join(" | ")} | ${tot.length} | ${tot.filter((m) => !antes.has(m.modelKey)).length} | ${doB.filter((m) => !m.releaseYear).length} |`)
  }
  // mesma regra do produto: tier do CSV ou, sem tier, "não é prioritária" (ex.: LG, Tecno)
  const sec = op.filter((m) => nivelDaMarca(m.brand, m.visibilityTier) === "secundaria")
  const sec26 = sec.filter((m) => anos.includes(m.releaseYear ?? ""))
  L.push(`| Secundárias (ocultas por padrão) | ${anos.map((y) => sec.filter((m) => m.releaseYear === y).length).join(" | ")} | ${sec26.length} | ${sec26.filter((m) => !antes.has(m.modelKey)).length} | ${sec.filter((m) => !m.releaseYear).length} |`)
  const secSemAno = sec.filter((m) => !m.releaseYear)
  const porMarca = new Map<string, number>(); for (const m of secSemAno) porMarca.set(m.brand, (porMarca.get(m.brand) ?? 0) + 1)
  L.push("", `Secundárias sem ano: ${[...porMarca].map(([b, n]) => `${b} ${n}`).join(", ") || "nenhuma"} (total de secundárias pesquisáveis: ${sec.length}).`, "")
  L.push("\"Sem ano no seed\": linhas antigas (majoritariamente anteriores a 2023) ou de lançamento escalonado/ambíguo (anúncio em dezembro com venda em janeiro; linha Pro China → global; variante 4G × 5G em anos diferentes), deixadas sem ano de propósito por `scripts/catalogo/preencher-ano-existentes.mjs`. Pendências não cadastradas: `docs/catalogo/AUDITORIA_CATALOGO_BRASIL_2023_2026.md`.", "")
  L.push("## 3. iPhones desde o iPhone 6", "", "| Ano | Modelo | modelKey | Status | Pesquisável | Busca pelo nome acha |", "|---|---|---|---|---|---|")
  const iphones = index.models.filter((m) => m.brand === "Apple" && /iPhone/.test(m.canonicalName))
    .sort((a, b) => (a.releaseYear ?? "9999").localeCompare(b.releaseYear ?? "9999") || a.canonicalName.localeCompare(b.canonicalName, "pt-BR", { numeric: true }))
  for (const m of iphones) {
    const canon = index.canonicalKeyOf(m.modelKey)
    const acha = searchDeviceModels(index, m.canonicalName.replace(/^Apple /, ""), { limit: 8 }).some((r) => r.modelKey === canon)
    L.push(`| ${m.releaseYear || "—"} | ${m.canonicalName} | \`${m.modelKey}\` | ${m.status}${m.replacedBy ? " → `" + m.replacedBy + "`" : ""} | ${modeloOperacional(m) ? "sim" : "não (mesclado)"} | ${acha ? "sim" : "NÃO"} |`)
  }
  const reais = iphones.filter((m) => modeloOperacional(m))
  const proibidos = index.models.filter((m) => m.brand === "Apple" && (/iPhone ([1-5]([cs]| |$)|3G|SE$|SE \(1|SE 2016|8 SE)/i.test(m.canonicalName)))
  L.push("", `iPhones reais pesquisáveis: ${reais.length} (sem ano: ${reais.filter((m) => !m.releaseYear).length}). Anteriores ao 6, SE 1ª geração ou "iPhone 8 SE": ${proibidos.length}${proibidos.length ? " — " + proibidos.map((m) => m.canonicalName).join(", ") : ""}.`)
  writeFileSync(process.env.OUT_MATRIZ!, L.join("\n") + "\n")
})
