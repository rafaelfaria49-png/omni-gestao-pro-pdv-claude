// COMPAT-CATALOGO-BRASIL-2023-2026-002 — preenche `release_year` de linhas que JÁ EXISTIAM no catálogo
// (antes desta trilha), para a matriz de cobertura 2023–2026 sair dos próprios seeds.
//
// Regras: só grava ano em linha com `release_year` vazio — ou em linha cujo ano FOI gravado por este script
// (fonte = FONTE), para corrigir/retirar um ano do mapa; ano de outra origem nunca é tocado. Nunca muda
// model_key, nome, status ou aliases; idempotente (rodar de novo não altera nada). Só entram anos de lançamento GLOBAL de conhecimento público
// sem ambiguidade; anúncio em dezembro com venda em janeiro e linhas "Pro" de lançamento escalonado
// (China → global) ficam SEM ano de propósito e aparecem como "sem ano" na matriz.
// Uso: node scripts/catalogo/preencher-ano-existentes.mjs [--check]
import { readFileSync, writeFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..")
const FILE = path.join(root, "docs/catalogo/seeds/device_models_seed_001.csv")
const FONTE = "Ano: lançamento global de conhecimento público (sem reconsulta individual nesta rodada)"

/** model_key → ano. Apenas linhas pré-existentes (o script recusa chave inexistente). */
const ANOS = {
  // Apple — todos os iPhones desde o 6 (página oficial "Identificar o modelo do iPhone").
  apple_iphone_6_plus: "2014",
  apple_iphone_7: "2016", apple_iphone_7_plus: "2016",
  apple_iphone_8: "2017", apple_iphone_8_plus: "2017", apple_iphone_x: "2017",
  apple_iphone_xr: "2018", apple_iphone_xs: "2018", apple_iphone_xs_max: "2018",
  apple_iphone_11: "2019", apple_iphone_11_pro: "2019", apple_iphone_11_pro_max: "2019",
  apple_iphone_12: "2020", apple_iphone_12_pro: "2020", apple_iphone_12_pro_max: "2020",
  apple_iphone_13: "2021", apple_iphone_13_pro: "2021", apple_iphone_13_pro_max: "2021",
  apple_iphone_14: "2022", apple_iphone_14_plus: "2022", apple_iphone_14_pro: "2022", apple_iphone_14_pro_max: "2022",
  apple_iphone_15: "2023", apple_iphone_15_plus: "2023", apple_iphone_15_pro: "2023", apple_iphone_15_pro_max: "2023",
  apple_iphone_16: "2024", apple_iphone_16_plus: "2024", apple_iphone_16_pro: "2024", apple_iphone_16_pro_max: "2024",
  apple_iphone_17: "2025", apple_iphone_17_pro: "2025", apple_iphone_17_pro_max: "2025",
  // Linhas mescladas acompanham o aparelho real.
  apple_iphone_7_branco: "2016", apple_iphone_7_preto: "2016", apple_iphone_7_plus_branco: "2016", apple_iphone_7_plus_preto: "2016",
  apple_iphone_8_branco: "2017", apple_iphone_8_preto: "2017", apple_iphone_8_plus_branco: "2017", apple_iphone_8_plus_preto: "2017",
  apple_iphone_17_air: "2025",
  // Samsung
  samsung_galaxy_s23: "2023", samsung_galaxy_s23_plus: "2023", samsung_galaxy_s23_ultra: "2023", samsung_galaxy_s23_fe: "2023",
  samsung_galaxy_a14: "2023", samsung_galaxy_a24: "2023", samsung_galaxy_a34: "2023", samsung_galaxy_a54: "2023",
  samsung_galaxy_a05: "2023", samsung_galaxy_a05s: "2023",
  samsung_galaxy_m14: "2023", samsung_galaxy_m34: "2023", samsung_galaxy_m54: "2023", samsung_galaxy_f54: "2023",
  samsung_galaxy_s24: "2024", samsung_galaxy_s24_plus: "2024", samsung_galaxy_s24_ultra: "2024",
  samsung_galaxy_a35: "2024", samsung_galaxy_a55: "2024", samsung_galaxy_a06: "2024",
  samsung_galaxy_m15: "2024", samsung_galaxy_m35: "2024", samsung_galaxy_m55: "2024",
  samsung_galaxy_s25: "2025", samsung_galaxy_s25_plus: "2025", samsung_galaxy_s25_ultra: "2025",
  samsung_galaxy_a26: "2025", samsung_galaxy_a36: "2025", samsung_galaxy_a56: "2025",
  samsung_galaxy_m16: "2025", samsung_galaxy_m56: "2025",
  samsung_galaxy_s26_plus: "2026", samsung_galaxy_s26_ultra: "2026",
  // Motorola
  motorola_moto_g13: "2023", motorola_moto_g14: "2023", motorola_moto_g23: "2023", motorola_moto_g54: "2023",
  motorola_moto_g73: "2023", motorola_moto_g84: "2023", motorola_moto_e13: "2023",
  motorola_edge_40: "2023",
  motorola_moto_g45: "2024", // ago/2024 (não 2023)
  motorola_moto_g04: "2024", motorola_moto_g24: "2024", motorola_moto_g24_power: "2024", motorola_moto_g64: "2024",
  motorola_moto_g55: "2024", motorola_moto_g75: "2024", motorola_moto_e14: "2024", motorola_edge_50_neo: "2024",
  motorola_moto_g56: "2025", motorola_moto_g86: "2025", motorola_moto_g86_power: "2025", motorola_edge_60_neo: "2025",
  // Redmi
  redmi_12: "2023", redmi_12c: "2023", redmi_13c: "2023", redmi_note_12: "2023", redmi_note_12_4g: "2023",
  redmi_note_12_5g: "2023", redmi_note_12s: "2023", redmi_a2_plus: "2023",
  redmi_13: "2024", redmi_13_4g: "2024", redmi_14c: "2024", redmi_note_13_4g: "2024", redmi_note_13_pro_4g: "2024", redmi_a3: "2024",
  redmi_15: "2025", redmi_15c: "2025", redmi_a5: "2025",
  // POCO
  poco_f5: "2023", poco_f5_pro: "2023", poco_c55: "2023", poco_c65: "2023",
  poco_x6: "2024", poco_x6_pro: "2024", poco_c75: "2024",
  poco_x7: "2025", poco_x7_pro: "2025", poco_c71: "2025",
  // realme (marca gravada como "Realme")
  realme_c51: "2023", realme_c53: "2023", realme_c55: "2023",
  // realme_c67: SEM ano — a linha é a 4G (jan/2024); a C67 5G é de dez/2023.
  realme_c61: "2024", realme_c63: "2024", realme_c65: "2024", realme_note_50: "2024", realme_note_60: "2024", realme_c75: "2024",
  realme_c73: "2025", realme_note_70: "2025",
  // Infinix
  // infinix_smart_7: SEM ano — dez/2022 em alguns mercados, jan/2023 em outros.
  infinix_hot_30: "2023", infinix_smart_8: "2023", infinix_hot_40: "2023",
}

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

const original = readFileSync(FILE, "utf8")
const lines = original.replace(/\r\n/g, "\n").replace(/\n+$/, "").split("\n")
const header = parseLine(lines[0])
const iAno = header.indexOf("release_year")
const iFonte = header.indexOf("sources")
const iKey = header.indexOf("model_key")
if (iAno < 0 || iFonte < 0 || iKey < 0) throw new Error("colunas release_year/sources/model_key ausentes")

const chaves = new Set(lines.slice(1).map((l) => parseLine(l)[iKey]))
const faltando = Object.keys(ANOS).filter((k) => !chaves.has(k))
if (faltando.length) throw new Error(`model_key inexistente: ${faltando.join(", ")}`)

let preenchidos = 0
let corrigidos = 0
let retirados = 0
const saida = [lines[0]]
for (const l of lines.slice(1)) {
  const cells = parseLine(l)
  const ano = ANOS[cells[iKey]]
  const atual = (cells[iAno] ?? "").trim()
  const nossa = (cells[iFonte] ?? "").trim() === FONTE
  while (cells.length < header.length) cells.push("")
  if (!atual && ano) {
    cells[iAno] = ano
    if (!(cells[iFonte] ?? "").trim()) cells[iFonte] = FONTE
    preenchidos++
  } else if (atual && nossa && ano && atual !== ano) {
    cells[iAno] = ano // ano gravado por este script e corrigido no mapa
    corrigidos++
  } else if (atual && nossa && !ano) {
    cells[iAno] = "" // ano gravado por este script e retirado do mapa (ambíguo)
    cells[iFonte] = ""
    retirados++
  } else { saida.push(l); continue } // linha intocada, byte a byte
  saida.push(toLine(cells))
}
preenchidos += corrigidos + retirados
const nl = original.includes("\r\n") ? "\r\n" : "\n"
const novo = saida.join(nl) + nl
if (process.argv.includes("--check")) {
  console.log(`a preencher: ${preenchidos}`)
  process.exit(preenchidos ? 1 : 0)
}
if (novo !== original) writeFileSync(FILE, novo)
console.log(`release_year: ${preenchidos - corrigidos - retirados} preenchido(s), ${corrigidos} corrigido(s), ${retirados} retirado(s); ${Object.keys(ANOS).length} chaves mapeadas.`)
