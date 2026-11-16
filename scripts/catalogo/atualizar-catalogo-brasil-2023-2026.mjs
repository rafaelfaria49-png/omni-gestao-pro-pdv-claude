// COMPAT-CATALOGO-BRASIL-2023-2026-002 — atualização dos seeds (idempotente).
// Uso: node gerar.mjs <dir dos seeds>
// - Acrescenta colunas manufacturer,release_year,visibility_tier,replaced_by,sources ao models.
// - Reconcilia linhas existentes SEM apagar (mesclado/replaced_by, renomeações com alias do nome antigo).
// - Acrescenta modelos oficiais 2023–2026 + aliases + compatibilidades documentadas de acessório.
import { readFileSync, writeFileSync } from "node:fs"
import path from "node:path"

const DIR = process.argv[2]
const F = {
  models: path.join(DIR, "device_models_seed_001.csv"),
  aliases: path.join(DIR, "device_aliases_seed_001.csv"),
  compat: path.join(DIR, "device_compatibilities_seed_001.csv"),
}
const EXTRA_COLS = ["manufacturer", "release_year", "visibility_tier", "replaced_by", "sources"]

// ── CSV ────────────────────────────────────────────────────────────────────
function parseLine(line) {
  const out = []
  let cur = ""
  let q = false
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (q) {
      if (c === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++ } else q = false
      } else cur += c
    } else if (c === '"') q = true
    else if (c === ",") { out.push(cur); cur = "" }
    else cur += c
  }
  out.push(cur)
  return out
}
const esc = (v) => (/[",\n]/.test(v) ? `"${String(v).replace(/"/g, '""')}"` : String(v))
const toLine = (arr) => arr.map((v) => esc(v ?? "")).join(",")
const norm = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/\s+/g, " ").trim()
const keyOf = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\+/g, "_plus").replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "")

function load(file) {
  const text = readFileSync(file, "utf8").replace(/\r\n/g, "\n").replace(/\n+$/, "")
  const lines = text.split("\n")
  const header = parseLine(lines[0])
  const rows = lines.slice(1).map((l) => {
    const cells = parseLine(l)
    return Object.fromEntries(header.map((h, i) => [h, cells[i] ?? ""]))
  })
  return { header, rows }
}
const models = load(F.models)
const aliases = load(F.aliases)
const compat = load(F.compat)
if (models.rows.length !== 429 && !models.header.includes("sources")) throw new Error(`esperava 429 modelos, achei ${models.rows.length}`)
for (const c of EXTRA_COLS) if (!models.header.includes(c)) models.header.push(c)

const byKey = new Map(models.rows.map((r) => [r.model_key, r]))
const byName = new Map(models.rows.map((r) => [norm(r.canonical_name), r]))
const aliasKeys = new Set(aliases.rows.map((a) => a.alias_key))
const aliasesPorMarca = new Map() // norm alias → Set(brand)
for (const a of aliases.rows) {
  const m = byKey.get(a.model_key)
  if (!m) continue
  const k = `${norm(m.brand)}|${norm(a.normalized_alias || a.alias)}`
  aliasesPorMarca.set(k, a.model_key)
}
const relatorio = { reconciliados: [], novos: [], existentes: [], aliasesNovos: 0, aliasesPulados: [] }

// ── Fontes ─────────────────────────────────────────────────────────────────
const S = {
  apple: "Apple — Identificar o modelo do iPhone https://support.apple.com/pt-br/108044 (consulta 2026-11-14)",
  samA: "Wikipedia — Samsung Galaxy A series https://en.wikipedia.org/wiki/Samsung_Galaxy_A_series (2026-11-14)",
  samS: "Wikipedia — Samsung Galaxy S series https://en.wikipedia.org/wiki/Samsung_Galaxy_S_series (2026-11-14)",
  samS26fe: "Samsung Newsroom US — Galaxy S26 FE https://news.samsung.com/us/samsung-galaxy-s26-fe (anúncio 2026-08-27)",
  samZ: "Wikipedia — Samsung Galaxy Z series https://en.wikipedia.org/wiki/Samsung_Galaxy_Z_series (2026-11-14)",
  samM: "Wikipedia — Samsung Galaxy M series https://en.wikipedia.org/wiki/Samsung_Galaxy_M_series (2026-11-14)",
  motoG: "Wikipedia — Moto G https://en.wikipedia.org/wiki/Moto_G (2026-11-14)",
  motoBR26: "TechTudo — lançamentos Motorola no Brasil em 2026 https://www.techtudo.com.br/listas/2026/06/lancamentos-da-motorola-em-2026-veja-lista-completa-de-celulares-edmobile.ghtml",
  motoG47: "Oficina da Net — Motorola lança Moto G47, G37 e G37 Power https://www.oficinadanet.com.br/smartphones/69201-motorola-moto-g47-g37-g37-power-lancamento",
  motoEdge: "Wikipedia — Motorola Edge https://en.wikipedia.org/wiki/Motorola_Edge (2026-11-14)",
  motoRazr: "Wikipedia — Motorola Razr https://en.wikipedia.org/wiki/Motorola_Razr (2026-11-14)",
  xiaomi: "Wikipedia — List of Xiaomi products https://en.wikipedia.org/wiki/List_of_Xiaomi_products (2026-11-14)",
  xiaomi17: "91mobiles — Xiaomi 17 / 17 Ultra lançados globalmente (MWC 2026) https://www.91mobiles.com/hub/xiaomi-17-ultra-launched-global-india-price-specifications/",
  note15: "GSMArena — Redmi Note 15 and 5G make their global debut https://m.gsmarena.com/redmi_note_15_and_5g_make_their_global_debut-news-70763.php",
  redmi15: "91mobiles — Redmi 15 5G lançado (2025-08-19) https://www.91mobiles.com/hub/redmi-15-5g-launched-india-price-specifications/",
  a7pro: "Beebom — Redmi A7 Pro × POCO C81 Pro (lançamentos abr/2026) https://gadgets.beebom.com/compare/redmi-a7-pro-vs-poco-c81-pro",
  pocoM8: "GSMArena — Poco M8 Pro 5G and Poco M8 5G announced https://m.gsmarena.com/poco_m8_pro_5g_and_poco_m8_5g_announced-news-71009.php",
  pocoX8: "Xiaomi Global — POCO X8 Pro Series Launch https://www.mi.com/global/event/2026/poco-x8-pro-series-preheat/",
  pocoF8: "GSMArena — Poco F8 Ultra and F8 Pro announced https://m.gsmarena.com/poco_f8_ultra_and_f8_pro_announced-news-70448.php",
  pocoC85: "GSMArena — Poco C85 4G https://www.gsmarena.com/xiaomi_poco_c85-14110.php",
  realme16: "Croma — Realme 16 Pro, 16 Pro+ lançados (2026-01-06) https://www.croma.com/unboxed/realme-16-pro-series-launch-price-specifications",
  infinixNote60: "Malay Mail — Infinix NOTE 60 Series (2026-02-18) https://www.malaymail.com/news/money/mediaoutreach/2026/02/18/infinix-note-60-series-brings-innovation-with-interactive-design-and-snapdragon-processor/450542",
  infinixHot70: "BrandSpur — Infinix HOT 70 Series (2026-06) https://brandspurng.com/2026/06/12/infinix-unveils-hot-70-series-with-industry-first-12-color-dynamic-shine-design-and-ai-driven-features-in-2026-launch/",
  conhecimento:
    "Anúncio do fabricante (nome/ano conforme lançamento público até 2026-06; não reconsultado item a item nesta sessão — confiança media)",
}

// ── Reconciliações (sem apagar linhas) ─────────────────────────────────────
function reconcilia(key, patch, motivo) {
  const r = byKey.get(key)
  if (!r) throw new Error(`reconciliação: chave ausente ${key}`)
  Object.assign(r, patch)
  relatorio.reconciliados.push(`${key}: ${motivo}`)
}
const COR_BORDA = "Cor da BORDA da película 3D (grupo da base de películas), não é modelo de aparelho. Linha mantida por histórico; busca devolve o modelo real."
for (const [k, alvo] of [
  ["apple_iphone_7_branco", "apple_iphone_7"], ["apple_iphone_7_preto", "apple_iphone_7"],
  ["apple_iphone_7_plus_branco", "apple_iphone_7_plus"], ["apple_iphone_7_plus_preto", "apple_iphone_7_plus"],
  ["apple_iphone_8_branco", "apple_iphone_8"], ["apple_iphone_8_preto", "apple_iphone_8"],
  ["apple_iphone_8_plus_branco", "apple_iphone_8_plus"], ["apple_iphone_8_plus_preto", "apple_iphone_8_plus"],
]) reconcilia(k, { status: "mesclado", replaced_by: alvo, notes: COR_BORDA }, `mesclado em ${alvo} (cor da borda da película)`)
reconcilia("apple_iphone_17_air", { status: "mesclado", replaced_by: "apple_iphone_air", notes: "Nome não oficial: a Apple lançou \"iPhone Air\" (2025). Linha mantida por histórico." }, "mesclado em apple_iphone_air (nome oficial iPhone Air)")
reconcilia("apple_iphone_air", { status: "ativo", confidence: "alta", release_year: "2025", sources: S.apple, notes: "" }, "confirmado: iPhone Air (2025)")
for (const [k, ano] of [["apple_iphone_17e", "2026"], ["apple_iphone_16e", "2025"], ["apple_iphone_se_2020", "2020"], ["apple_iphone_se_2022", "2022"], ["apple_iphone_12_mini", "2020"], ["apple_iphone_13_mini", "2021"]]) {
  reconcilia(k, { release_year: ano, sources: S.apple, confidence: "alta" }, `confirmado na página oficial da Apple (${ano})`)
}
for (const [k, nome, curto, linha] of [
  ["xiaomi_mi_12_lite", "Xiaomi 12 Lite", "12 Lite", "Xiaomi"],
  ["xiaomi_mi_13t", "Xiaomi 13T", "13T", "Xiaomi T"],
  ["xiaomi_mi_13t_pro", "Xiaomi 13T Pro", "13T Pro", "Xiaomi T"],
]) {
  const antigo = byKey.get(k).canonical_name
  reconcilia(k, { canonical_name: nome, short_name: curto, commercial_line: linha, manufacturer: "Xiaomi" }, `renomeado "${antigo}" → "${nome}" (a Xiaomi abandonou o prefixo "Mi" a partir da série 12); nome antigo mantido como alias`)
  addAlias(k, antigo, "legacy_name", false, false, "Nome antigo do catálogo (prefixo Mi).")
}
for (const k of ["xiaomi_mi_10_lite", "xiaomi_mi_11_lite"]) reconcilia(k, { manufacturer: "Xiaomi", commercial_line: "Mi" }, "mantido: nome oficial usa \"Mi\"")
reconcilia("motorola_moto_g87", { release_year: "2026", network_variant: "5G", sources: `${S.motoG47} | ${S.motoBR26}`, notes: "Existência confirmada (anúncio abr/2026). O Moto G Max (Brasil) é descrito pela imprensa como derivado do G87; compatibilidade NÃO presumida." }, "verificado: Moto G87 lançado em 2026")
reconcilia("samsung_galaxy_a37", { release_year: "2026", sources: S.samA, status: "ativo" }, "confirmado (2026)")
reconcilia("samsung_galaxy_a57", { release_year: "2026", sources: S.samA, status: "ativo" }, "confirmado (2026)")
reconcilia("samsung_galaxy_s26", { release_year: "2026", sources: S.samS }, "confirmado (2026)")
reconcilia("samsung_galaxy_s25_fe", { release_year: "2025", sources: S.samS, status: "ativo" }, "confirmado (2025)")
reconcilia("samsung_galaxy_s24_fe", { release_year: "2024", sources: S.samS, status: "ativo" }, "confirmado (2024)")

// Aliases extras de busca para SE/mini (pedido: localizáveis em película e capinha).
addAlias("apple_iphone_se_2020", "iPhone SE 2ª geração", "official_name", false, false, "Nome oficial Apple.")
addAlias("apple_iphone_se_2020", "iPhone SE 2", "commercial_variant", false, false, "")
addAlias("apple_iphone_se_2022", "iPhone SE 3ª geração", "official_name", false, false, "Nome oficial Apple.")
addAlias("apple_iphone_se_2022", "iPhone SE 3", "commercial_variant", false, false, "")
addAlias("apple_iphone_air", "iPhone 17 Air", "legacy_name", false, false, "Nome não oficial usado no balcão.")

// ── Modelos novos ──────────────────────────────────────────────────────────
// [marca, linha, nome comercial completo (sem fabricante quando a marca já é o nome), curto, ano, rede, fonte, confiança, fabricante, tier, notas]
const N = []
const add = (brand, line, name, short, year, src, conf = "alta", extra = {}) => N.push({ brand, line, name, short, year, src, conf, ...extra })

// Apple
for (const [n, s, y] of [["iPhone 6", "6", "2014"], ["iPhone 6s", "6s", "2015"], ["iPhone 6s Plus", "6s Plus", "2015"], ["iPhone 18 Pro", "18 Pro", "2026"], ["iPhone 18 Pro Max", "18 Pro Max", "2026"], ["iPhone Duo", "Duo", "2026"]])
  add("Apple", "iPhone", n, s, y, S.apple, "alta", { notes: n === "iPhone Duo" ? "Dobrável (página oficial Apple, 2026)." : "" })

// Samsung
for (const [n, s] of [["Galaxy S20", "S20"], ["Galaxy S20+", "S20+"], ["Galaxy S20 Ultra", "S20 Ultra"]]) add("Samsung", "Galaxy S", n, s, "2020", S.samS)
add("Samsung", "Galaxy S", "Galaxy S21 Ultra", "S21 Ultra", "2021", S.samS)
add("Samsung", "Galaxy S", "Galaxy S25 Edge", "S25 Edge", "2025", S.samS)
add("Samsung", "Galaxy S", "Galaxy S26 FE", "S26 FE", "2026", `${S.samS26fe} | ${S.samS}`)
for (const [n, s, y] of [["Galaxy A14 5G", "A14 5G", "2023"], ["Galaxy A15 5G", "A15 5G", "2023"], ["Galaxy A06 5G", "A06 5G", "2025"], ["Galaxy A16 5G", "A16 5G", "2024"], ["Galaxy A07 5G", "A07 5G", "2025"], ["Galaxy A07s", "A07s", "2025"], ["Galaxy A17 5G", "A17 5G", "2025"], ["Galaxy A27 5G", "A27 5G", "2026"], ["Galaxy A08", "A08", "2026"], ["Galaxy A18", "A18", "2026"]])
  add("Samsung", "Galaxy A", n, s, y, S.samA)
for (const [n, s, y] of [["Galaxy M05", "M05", "2024"], ["Galaxy M55s 5G", "M55s", "2024"], ["Galaxy M06 5G", "M06 5G", "2025"], ["Galaxy M36 5G", "M36 5G", "2025"], ["Galaxy M07", "M07", "2025"], ["Galaxy M17", "M17", "2025"], ["Galaxy M17e", "M17e", "2026"], ["Galaxy M47", "M47", "2026"]])
  add("Samsung", "Galaxy M", n, s, y, S.samM)
for (const [n, s, y] of [["Galaxy F14 5G", "F14 5G", "2023"], ["Galaxy F34 5G", "F34 5G", "2023"], ["Galaxy F15 5G", "F15 5G", "2024"], ["Galaxy F55 5G", "F55 5G", "2024"], ["Galaxy F05", "F05", "2024"], ["Galaxy F06 5G", "F06 5G", "2025"], ["Galaxy F36 5G", "F36 5G", "2025"], ["Galaxy F56 5G", "F56 5G", "2025"], ["Galaxy F17 5G", "F17 5G", "2025"]])
  add("Samsung", "Galaxy F", n, s, y, S.samM, "media", { notes: "Linha F: vendida principalmente na Índia." })
for (const [n, s, y] of [["Galaxy Z Fold5", "Z Fold5", "2023"], ["Galaxy Z Flip5", "Z Flip5", "2023"], ["Galaxy Z Fold6", "Z Fold6", "2024"], ["Galaxy Z Flip6", "Z Flip6", "2024"], ["Galaxy Z Fold7", "Z Fold7", "2025"], ["Galaxy Z Flip7", "Z Flip7", "2025"], ["Galaxy Z Flip7 FE", "Z Flip7 FE", "2025"], ["Galaxy Z TriFold", "Z TriFold", "2025"], ["Galaxy Z Fold8", "Z Fold8", "2026"], ["Galaxy Z Flip8", "Z Flip8", "2026"]])
  add("Samsung", "Galaxy Z", n, s, y, S.samZ)

// Motorola
const mg = (n, s, y, src = S.motoG, conf = "alta", extra) => add("Motorola", "Moto G", n, s, y, src, conf, extra)
for (const [n, s, y] of [["Moto G23", "G23", "2023"], ["Moto G73", "G73", "2023"], ["Moto G04s", "G04s", "2024"], ["Moto G85", "G85", "2024"], ["Moto G96", "G96", "2025"], ["Moto G06 Power", "G06 Power", "2025"], ["Moto G57 Power", "G57 Power", "2025"], ["Moto G67", "G67", "2025"], ["Moto G67 Power", "G67 Power", "2025"], ["Moto G17 Power", "G17 Power", "2026"]])
  mg(n, s, y)
mg("Moto G37", "G37", "2026", S.motoG47)
mg("Moto G37 Power", "G37 Power", "2026", S.motoG47)
mg("Moto G47", "G47", "2026", `${S.motoG47} | ${S.motoBR26}`, "alta", { notes: "Lojas que já cadastraram o G47 manualmente continuam vendo o PRÓPRIO cadastro (a busca prefere o da loja; vínculos preservados)." })
mg("Moto G Max", "G Max", "2026", S.motoBR26, "alta", { notes: "Descrito pela imprensa como derivado do Moto G87; compatibilidade de película/capinha NÃO presumida." })
const me = (n, s, y, src = S.motoEdge, conf = "alta") => add("Motorola", "Motorola Edge", n, s, y, src, conf)
for (const [n, s] of [["Edge 40 Neo", "Edge 40 Neo"], ["Edge 40 Pro", "Edge 40 Pro"]]) me(n, s, "2023")
for (const [n, s] of [["Edge 50", "Edge 50"], ["Edge 50 Pro", "Edge 50 Pro"], ["Edge 50 Fusion", "Edge 50 Fusion"], ["Edge 50 Ultra", "Edge 50 Ultra"]]) me(n, s, "2024")
for (const [n, s] of [["Edge 60", "Edge 60"], ["Edge 60 Pro", "Edge 60 Pro"], ["Edge 60 Fusion", "Edge 60 Fusion"], ["Edge 60 Stylus", "Edge 60 Stylus"]]) me(n, s, "2025", S.conhecimento, "media")
for (const [n, s] of [["Edge 70 Fusion", "Edge 70 Fusion"], ["Edge 70 Fusion+", "Edge 70 Fusion+"], ["Edge 70 Pro", "Edge 70 Pro"]]) me(n, s, "2026", `${S.motoBR26} | ${S.motoEdge}`)
const mr = (n, s, y) => add("Motorola", "Motorola Razr", n, s, y, S.motoRazr)
for (const [n, s, y] of [["Razr 40", "Razr 40", "2023"], ["Razr 40 Ultra", "Razr 40 Ultra", "2023"], ["Razr 50", "Razr 50", "2024"], ["Razr 50 Ultra", "Razr 50 Ultra", "2024"], ["Razr 60", "Razr 60", "2025"], ["Razr 60 Ultra", "Razr 60 Ultra", "2025"], ["Razr 70", "Razr 70", "2026"], ["Razr 70 Ultra", "Razr 70 Ultra", "2026"], ["Razr Fold", "Razr Fold", "2026"]])
  mr(n, s, y)
add("Motorola", "Motorola Signature", "Signature", "Signature", "2026", S.motoBR26, "media", { notes: "Lançamento citado pela imprensa brasileira em 2026; mês não informado." })

// Xiaomi (marca Xiaomi)
const xi = (n, s, y, src = S.xiaomi, conf = "alta", line = "Xiaomi") => add("Xiaomi", line, n, s, y, src, conf, { manufacturer: "Xiaomi" })
for (const [n, s, y] of [["Xiaomi 13 Ultra", "13 Ultra", "2023"], ["Xiaomi 14", "14", "2023"], ["Xiaomi 14 Ultra", "14 Ultra", "2024"], ["Xiaomi 15", "15", "2024"], ["Xiaomi 15 Ultra", "15 Ultra", "2025"], ["Xiaomi 17", "17", "2025"]]) xi(n, s, y)
xi("Xiaomi 17 Ultra", "17 Ultra", "2025", `${S.xiaomi} | ${S.xiaomi17}`)
for (const [n, s, y] of [["Xiaomi 13", "13", "2023"], ["Xiaomi 13 Pro", "13 Pro", "2023"], ["Xiaomi 13 Lite", "13 Lite", "2023"]]) xi(n, s, y, S.conhecimento, "media")
for (const [n, s, y] of [["Xiaomi 14T", "14T", "2024"], ["Xiaomi 14T Pro", "14T Pro", "2024"], ["Xiaomi 15T", "15T", "2025"], ["Xiaomi 15T Pro", "15T Pro", "2025"]]) xi(n, s, y, S.xiaomi, "alta", "Xiaomi T")

// Redmi
const rd = (line, n, s, y, src, conf = "alta") => add("Redmi", line, n, s, y, src, conf, { manufacturer: "Xiaomi" })
rd("Redmi", "Redmi 15 5G", "15 5G", "2025", S.redmi15)
rd("Redmi", "Redmi A7", "A7", "2026", S.a7pro, "media")
rd("Redmi", "Redmi A7 Pro", "A7 Pro", "2026", S.a7pro)
for (const [n, s, y] of [["Redmi 13C 5G", "13C 5G", "2023"], ["Redmi A2", "A2", "2023"], ["Redmi 13 5G", "13 5G", "2024"], ["Redmi A3x", "A3x", "2024"], ["Redmi 14C 5G", "14C 5G", "2025"]]) rd("Redmi", n, s, y, S.conhecimento, "media")
for (const [n, s, y] of [["Redmi Note 12 Pro+ 5G", "Note 12 Pro+", "2023"], ["Redmi Note 13 5G", "Note 13 5G", "2024"], ["Redmi Note 13 Pro 5G", "Note 13 Pro 5G", "2024"], ["Redmi Note 13 Pro+ 5G", "Note 13 Pro+", "2024"]]) rd("Redmi Note", n, s, y, S.conhecimento, "media")
for (const [n, s, y] of [["Redmi Note 14 5G", "Note 14 5G", "2025"], ["Redmi Note 14 Pro 5G", "Note 14 Pro 5G", "2025"], ["Redmi Note 14S", "Note 14S", "2025"]]) rd("Redmi Note", n, s, y, S.conhecimento, "media")
for (const [n, s] of [["Redmi Note 15", "Note 15"], ["Redmi Note 15 5G", "Note 15 5G"], ["Redmi Note 15 Pro 5G", "Note 15 Pro 5G"], ["Redmi Note 15 Pro+ 5G", "Note 15 Pro+"]]) rd("Redmi Note", n, s, "2026", S.note15)

// POCO
const pc = (line, n, s, y, src, conf = "alta") => add("POCO", line, n, s, y, src, conf, { manufacturer: "Xiaomi" })
pc("POCO C", "POCO C85", "C85", "2025", S.pocoC85)
pc("POCO C", "POCO C81 Pro", "C81 Pro", "2026", S.a7pro)
for (const [n, s, y] of [["POCO C51", "C51", "2023"], ["POCO C61", "C61", "2024"]]) pc("POCO C", n, s, y, S.conhecimento, "media")
pc("POCO M", "POCO M8", "M8", "2026", S.pocoM8)
pc("POCO M", "POCO M8 Pro", "M8 Pro", "2026", S.pocoM8)
for (const [n, s, y] of [["POCO M6", "M6", "2024"], ["POCO M6 Pro", "M6 Pro", "2024"], ["POCO M7 Pro 5G", "M7 Pro", "2024"], ["POCO M7", "M7", "2025"]]) pc("POCO M", n, s, y, S.conhecimento, "media")
pc("POCO X", "POCO X8 Pro", "X8 Pro", "2026", S.pocoX8)
pc("POCO X", "POCO X8 Pro Max", "X8 Pro Max", "2026", S.pocoX8)
pc("POCO F", "POCO F8 Pro", "F8 Pro", "2025", S.pocoF8)
pc("POCO F", "POCO F8 Ultra", "F8 Ultra", "2025", S.pocoF8)
for (const [n, s, y] of [["POCO F6", "F6", "2024"], ["POCO F6 Pro", "F6 Pro", "2024"], ["POCO F7", "F7", "2025"], ["POCO F7 Pro", "F7 Pro", "2025"], ["POCO F7 Ultra", "F7 Ultra", "2025"]]) pc("POCO F", n, s, y, S.conhecimento, "media")

// realme (marca gravada como "Realme" no catálogo existente)
const rl = (line, n, s, y, src = S.conhecimento, conf = "media") => add("Realme", line, n, s, y, src, conf)
for (const [n, s] of [["Realme 11", "11"], ["Realme 11 Pro", "11 Pro"], ["Realme 11 Pro+", "11 Pro+"]]) rl("Realme", n, s, "2023")
for (const [n, s] of [["Realme 12", "12"], ["Realme 12+", "12+"], ["Realme 12 Pro", "12 Pro"], ["Realme 12 Pro+", "12 Pro+"], ["Realme 13", "13"], ["Realme 13+", "13+"], ["Realme 13 Pro", "13 Pro"], ["Realme 13 Pro+", "13 Pro+"]]) rl("Realme", n, s, "2024")
for (const [n, s] of [["Realme 14", "14"], ["Realme 14 Pro", "14 Pro"], ["Realme 14 Pro+", "14 Pro+"], ["Realme 14x", "14x"], ["Realme 15", "15"], ["Realme 15 Pro", "15 Pro"]]) rl("Realme", n, s, "2025")
rl("Realme", "Realme 16 Pro", "16 Pro", "2026", S.realme16, "alta")
rl("Realme", "Realme 16 Pro+", "16 Pro+", "2026", S.realme16, "alta")
for (const [n, s, y] of [["Realme GT 6", "GT 6", "2024"], ["Realme GT 6T", "GT 6T", "2024"], ["Realme GT 7 Pro", "GT 7 Pro", "2024"], ["Realme GT 7", "GT 7", "2025"], ["Realme GT 7T", "GT 7T", "2025"]]) rl("Realme GT", n, s, y)
rl("Realme GT", "Realme GT 8 Pro", "GT 8 Pro", "2025", S.realme16, "alta")

// Infinix
const ix = (line, n, s, y, src = S.conhecimento, conf = "media") => add("Infinix", line, n, s, y, src, conf)
for (const [n, s, y] of [["Infinix Hot 30i", "Hot 30i", "2023"], ["Infinix Hot 30 Play", "Hot 30 Play", "2023"], ["Infinix Hot 40i", "Hot 40i", "2023"], ["Infinix Hot 40 Pro", "Hot 40 Pro", "2023"], ["Infinix Hot 50", "Hot 50", "2024"], ["Infinix Hot 50i", "Hot 50i", "2024"], ["Infinix Hot 50 Pro", "Hot 50 Pro", "2024"], ["Infinix Hot 50 Pro+", "Hot 50 Pro+", "2024"], ["Infinix Hot 60", "Hot 60", "2025"], ["Infinix Hot 60i", "Hot 60i", "2025"], ["Infinix Hot 60 Pro", "Hot 60 Pro", "2025"], ["Infinix Hot 60 Pro+", "Hot 60 Pro+", "2025"]]) ix("Infinix Hot", n, s, y)
ix("Infinix Hot", "Infinix Hot 70", "Hot 70", "2026", S.infinixHot70, "alta")
ix("Infinix Hot", "Infinix Hot 70 Pro", "Hot 70 Pro", "2026", S.infinixHot70, "alta")
for (const [n, s, y] of [["Infinix Note 30", "Note 30", "2023"], ["Infinix Note 30 Pro", "Note 30 Pro", "2023"], ["Infinix Note 40", "Note 40", "2024"], ["Infinix Note 40 Pro", "Note 40 Pro", "2024"], ["Infinix Note 40 Pro+", "Note 40 Pro+", "2024"], ["Infinix Note 50", "Note 50", "2025"], ["Infinix Note 50 Pro", "Note 50 Pro", "2025"], ["Infinix Note 50 Pro+", "Note 50 Pro+", "2025"]]) ix("Infinix Note", n, s, y)
ix("Infinix Note", "Infinix Note 60", "Note 60", "2026", S.infinixNote60, "alta")
ix("Infinix Note", "Infinix Note 60 Pro", "Note 60 Pro", "2026", S.infinixNote60, "alta")
for (const [n, s, y] of [["Infinix Smart 9", "Smart 9", "2024"], ["Infinix Smart 10", "Smart 10", "2025"]]) ix("Infinix Smart", n, s, y)
for (const [n, s, y] of [["Infinix Zero 30", "Zero 30", "2023"], ["Infinix Zero 40", "Zero 40", "2024"], ["Infinix Zero Flip", "Zero Flip", "2024"]]) ix("Infinix Zero", n, s, y)
for (const [n, s, y] of [["Infinix GT 10 Pro", "GT 10 Pro", "2023"], ["Infinix GT 20 Pro", "GT 20 Pro", "2024"], ["Infinix GT 30 Pro", "GT 30 Pro", "2025"]]) ix("Infinix GT", n, s, y)

// Marcas SECUNDÁRIAS (disponíveis; ocultas por padrão nas lojas). Cobertura: principais 2023–2025.
const sec = (brand, line, n, s, y, man = brand) => add(brand, line, n, s, y, S.conhecimento, "media", { tier: "secundaria", manufacturer: man })
for (const [n, s, y] of [["Pixel 7a", "7a", "2023"], ["Pixel 8", "8", "2023"], ["Pixel 8 Pro", "8 Pro", "2023"], ["Pixel Fold", "Fold", "2023"], ["Pixel 8a", "8a", "2024"], ["Pixel 9", "9", "2024"], ["Pixel 9 Pro", "9 Pro", "2024"], ["Pixel 9 Pro XL", "9 Pro XL", "2024"], ["Pixel 9 Pro Fold", "9 Pro Fold", "2024"], ["Pixel 9a", "9a", "2025"], ["Pixel 10", "10", "2025"], ["Pixel 10 Pro", "10 Pro", "2025"], ["Pixel 10 Pro XL", "10 Pro XL", "2025"], ["Pixel 10 Pro Fold", "10 Pro Fold", "2025"]]) sec("Google", "Pixel", n, s, y)
for (const [n, s, y] of [["Phone (2)", "Phone (2)", "2023"], ["Phone (2a)", "Phone (2a)", "2024"], ["Phone (2a) Plus", "Phone (2a) Plus", "2024"], ["Phone (3a)", "Phone (3a)", "2025"], ["Phone (3a) Pro", "Phone (3a) Pro", "2025"], ["Phone (3)", "Phone (3)", "2025"]]) sec("Nothing", "Phone", n, s, y)
for (const [n, s, y] of [["CMF Phone 1", "CMF Phone 1", "2024"], ["CMF Phone 2 Pro", "CMF Phone 2 Pro", "2025"]]) sec("CMF", "CMF Phone", n, s, y, "Nothing")
for (const [n, s, y] of [["OnePlus 11", "11", "2023"], ["OnePlus 12", "12", "2024"], ["OnePlus 12R", "12R", "2024"], ["OnePlus 13", "13", "2025"], ["OnePlus 13R", "13R", "2025"], ["OnePlus Nord 3", "Nord 3", "2023"], ["OnePlus Nord 4", "Nord 4", "2024"], ["OnePlus Nord CE4", "Nord CE4", "2024"], ["OnePlus Nord 5", "Nord 5", "2025"]]) sec("OnePlus", n.includes("Nord") ? "Nord" : "OnePlus", n, s, y)
for (const [n, s, y] of [["OPPO A79 5G", "A79 5G", "2023"], ["OPPO A60", "A60", "2024"], ["OPPO Reno12", "Reno12", "2024"], ["OPPO Reno12 Pro", "Reno12 Pro", "2024"], ["OPPO Find X8", "Find X8", "2024"], ["OPPO Find X8 Pro", "Find X8 Pro", "2024"], ["OPPO Reno13", "Reno13", "2025"], ["OPPO Reno13 Pro", "Reno13 Pro", "2025"]]) sec("OPPO", n.includes("Reno") ? "Reno" : n.includes("Find") ? "Find" : "A", n, s, y)
for (const [n, s, y] of [["HONOR Magic6 Pro", "Magic6 Pro", "2024"], ["HONOR 200", "200", "2024"], ["HONOR 200 Pro", "200 Pro", "2024"], ["HONOR Magic7 Pro", "Magic7 Pro", "2025"], ["HONOR 400", "400", "2025"], ["HONOR 400 Pro", "400 Pro", "2025"]]) sec("HONOR", n.includes("Magic") ? "Magic" : "HONOR", n, s, y)
for (const [n, s, y] of [["TECNO Spark 20 Pro", "Spark 20 Pro", "2024"], ["TECNO Spark 30", "Spark 30", "2024"], ["TECNO Camon 30", "Camon 30", "2024"], ["TECNO Pova 6 Pro", "Pova 6 Pro", "2024"]]) sec("Tecno", n.includes("Spark") ? "Tecno Spark" : n.includes("Camon") ? "Tecno Camon" : "Tecno Pova", n, s, y)
for (const [n, s, y] of [["vivo V30", "V30", "2024"], ["vivo V40", "V40", "2024"], ["vivo Y28", "Y28", "2024"], ["vivo X200 Pro", "X200 Pro", "2024"]]) sec("vivo", n.split(" ")[1][0], n, s, y)
for (const [n, s, y] of [["Nokia G42", "G42", "2023"], ["Nokia C32", "C32", "2023"]]) sec("Nokia", "Nokia", n, s, y, "HMD")
for (const [n, s, y] of [["HMD Pulse", "Pulse", "2024"], ["HMD Skyline", "Skyline", "2024"]]) sec("HMD", "HMD", n, s, y, "HMD")
for (const [n, s, y] of [["Zenfone 10", "Zenfone 10", "2023"], ["Zenfone 11 Ultra", "Zenfone 11 Ultra", "2024"], ["ROG Phone 8", "ROG Phone 8", "2024"], ["ROG Phone 9", "ROG Phone 9", "2024"]]) sec("ASUS", n.startsWith("ROG") ? "ROG Phone" : "Zenfone", n, s, y)
for (const [n, s, y] of [["Huawei P60 Pro", "P60 Pro", "2023"], ["Huawei Pura 70", "Pura 70", "2024"], ["Huawei Pura 70 Pro", "Pura 70 Pro", "2024"]]) sec("Huawei", n.includes("Pura") ? "Pura" : "P", n, s, y)
for (const [n, s, y] of [["Xperia 1 V", "1 V", "2023"], ["Xperia 10 V", "10 V", "2023"], ["Xperia 1 VI", "1 VI", "2024"], ["Xperia 10 VI", "10 VI", "2024"], ["Xperia 1 VII", "1 VII", "2025"]]) sec("Sony", "Xperia", n, s, y)
for (const [n, s, y] of [["TCL 40 SE", "40 SE", "2023"], ["TCL 50 SE", "50 SE", "2024"]]) sec("TCL", "TCL", n, s, y)

// Marca LG existente: descontinuada (2021) → secundária por padrão; linhas mantidas.
for (const r of models.rows) if (r.brand === "LG" && !r.visibility_tier) { r.visibility_tier = "secundaria"; relatorio.reconciliados.push(`${r.model_key}: marca LG descontinuada → nível secundário (oculta por padrão; reativável pela loja)`) }

// ── Inserção ───────────────────────────────────────────────────────────────
function canonicalFull(m) {
  const b = norm(m.brand)
  const n = norm(m.name)
  return n.startsWith(b + " ") || n === b ? m.name : `${m.brand} ${m.name}`
}
function addAlias(modelKey, alias, type, ambiguous, requiresBrand, notes) {
  const m = byKey.get(modelKey)
  const normalized = norm(alias)
  const marcaK = `${norm(m.brand)}|${normalized}`
  const dono = aliasesPorMarca.get(marcaK)
  if (dono && dono !== modelKey) { relatorio.aliasesPulados.push(`${alias} (já é de ${dono})`); return }
  if (dono === modelKey) return
  // "+" e " Plus" geram a mesma chave base: sufixo numérico mantém as duas grafias.
  let aliasKey = `${modelKey}__${keyOf(alias)}`
  for (let i = 2; aliasKeys.has(aliasKey); i++) aliasKey = `${modelKey}__${keyOf(alias)}_${i}`
  aliasKeys.add(aliasKey)
  aliasesPorMarca.set(marcaK, modelKey)
  aliases.rows.push({ alias_key: aliasKey, model_key: modelKey, alias, normalized_alias: normalized, alias_type: type, is_ambiguous: String(ambiguous), requires_brand_context: String(requiresBrand), confidence: "alta", notes })
  relatorio.aliasesNovos++
}

for (const m of N) {
  const full = canonicalFull(m)
  const existente = byName.get(norm(full))
  if (existente) { relatorio.existentes.push(`${full} (já existia: ${existente.model_key})`); continue }
  const modelKey = keyOf(full)
  if (byKey.has(modelKey)) throw new Error(`chave já usada: ${modelKey} (${full})`)
  const rede = /\b5G\b/.test(m.name) ? "5G" : /\b4G\b/.test(m.name) ? "4G" : ""
  const row = {
    model_key: modelKey, brand: m.brand, commercial_line: m.line, canonical_name: full, short_name: m.short,
    generation: m.short, network_variant: rede, year_hint: m.year, source_origin: "pesquisa_oficial_2026_11",
    status: "ativo", confidence: m.conf, notes: m.notes ?? "",
    manufacturer: m.manufacturer ?? "", release_year: m.year, visibility_tier: m.tier ?? "", replaced_by: "", sources: m.src,
  }
  models.rows.push(row)
  byKey.set(modelKey, row)
  byName.set(norm(full), row)
  relatorio.novos.push(`${m.year} | ${m.brand} | ${full} | ${m.conf}`)
  addAlias(modelKey, full, "canonical", false, false, "Nome canônico.")
  if (norm(m.name) !== norm(full)) addAlias(modelKey, m.name, "commercial_variant", false, false, "Nome comercial sem a marca.")
  const curtoAmbiguo = m.short.replace(/\s+/g, "").length <= 4
  addAlias(modelKey, m.short, "short", curtoAmbiguo, curtoAmbiguo, curtoAmbiguo ? "Alias curto; usar com contexto de marca quando ambiguo." : "")
  if (m.name.includes("+")) addAlias(modelKey, m.name.replace(/\+/g, " Plus").replace(/\s+/g, " "), "commercial_variant", false, false, "Grafia com Plus.")
  const compacto = m.name.replace(/\s+/g, "")
  if (compacto !== m.name) addAlias(modelKey, compacto, "common_typo", false, false, "Grafia sem espaços.")
}

// ── Compatibilidades documentadas de ACESSÓRIO específico (película) ───────
const ACC = [
  ["acc001", "Belkin UltraGlass 2 — iPhone 18 Pro | iPhone 17 Pro (Belkin OVA193fq; Apple Store)", ["apple_iphone_17_pro", "apple_iphone_18_pro"], "Apple Store AU https://www.apple.com/au/shop/product/hs832zm/a/belkin-ultraglass-2-screen-protector-for-iphone-18-pro-iphone-17-pro | Belkin https://www.belkin.com/p/ultraglass-2-screen-protector-for-iphone-18-pro-%2F-iphone-17-pro/OVA193fq.html"],
  ["acc002", "Belkin UltraGlass 2 — iPhone 18 Pro Max | iPhone 17 Pro Max (Belkin OVA194fq)", ["apple_iphone_17_pro_max", "apple_iphone_18_pro_max"], "Belkin https://www.belkin.com/p/ultraglass-2-screen-protector-for-iphone-18-pro-max-%2F-iphone-17-pro-max/OVA194fq.html"],
  ["acc003", "Belkin UltraGlass 2 — iPhone 17 | iPhone 16 Pro (Belkin OVA157fq; Apple Store)", ["apple_iphone_16_pro", "apple_iphone_17"], "Apple Store US https://www.apple.com/shop/product/hru02zm/a/belkin-ultraglass-2-screen-protector-for-iphone-17-iphone-16-pro | Belkin https://www.belkin.com/p/ultraglass-2-screen-protector-for-iphone-17-iphone-16-pro/OVA157fq.html"],
  ["acc004", "Belkin UltraGlass — iPhone 14 Plus | iPhone 13 Pro Max (Belkin OVA079zz)", ["apple_iphone_13_pro_max", "apple_iphone_14_plus"], "Belkin https://www.belkin.com/p/ultraglass-treated-screen-protector-for-iphone-14-plus-iphone-13-pro-max/OVA079zz.html"],
]
const compatKeys = new Set(compat.rows.map((c) => c.compatibility_key))
const compatNovos = []
for (const [id, grupo, [a, b], fonte] of ACC) {
  for (const k of [a, b]) if (!byKey.has(k)) throw new Error(`compat: modelo ausente ${k}`)
  const key = `pelicula_${id}__${a}__${b}`
  if (compatKeys.has(key)) continue
  compat.rows.push({
    compatibility_key: key, compatibility_type: "acessorio_especifico", group_name: grupo, source_model_key: a, target_model_key: b,
    product_category: "pelicula_tela", status: "confirmado_fornecedor", confidence: "alta", source_origin: "documentacao_fabricante_acessorio",
    evidence: fonte, requires_dry_test: "false",
    notes: "Escopo: SOMENTE este acessório (SKU). Não é equivalência geral de molde nem vale para outras películas ou capinhas.",
  })
  compatNovos.push(grupo)
}

// ── Escrita ────────────────────────────────────────────────────────────────
const write = (file, t) => writeFileSync(file, [toLine(t.header), ...t.rows.map((r) => toLine(t.header.map((h) => r[h] ?? "")))].join("\n") + "\n")
write(F.models, models)
write(F.aliases, aliases)
write(F.compat, compat)
writeFileSync(path.join(path.dirname(process.argv[1]), "relatorio.json"), JSON.stringify({ ...relatorio, compatNovos }, null, 2))
console.log(`modelos: ${models.rows.length} (novos ${relatorio.novos.length}, já existentes ${relatorio.existentes.length}); reconciliados ${relatorio.reconciliados.length}; aliases +${relatorio.aliasesNovos} (pulados ${relatorio.aliasesPulados.length}); compat +${compatNovos.length}`)
