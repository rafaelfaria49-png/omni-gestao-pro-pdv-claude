/**
 * WhatsApp IA — F4 · Resolver de aparelho (marca + modelo) a partir de texto livre.
 *
 * NÚCLEO PURO: sem rede, sem Prisma, sem env. Determinístico e testável. Reconhece os
 * aparelhos mais comuns na assistência (Apple/Samsung/Motorola/Xiaomi e afins) e devolve
 * marca, modelo normalizado e confiança.
 *
 * Não tem efeito colateral e não consulta catálogo — apenas interpreta o texto.
 *
 * Referência: docs/whatsapp/WHATSAPP_IA_ORCAMENTOS_E_CATALOGO_BLUEPRINT.md (§3-B).
 */

export type WhatsAppDeviceResolution = {
  marca: string
  modelo: string
  /** Texto exibível "Marca Modelo" (ou o que houver). */
  aparelhoTexto: string
  /** 0..1 — alto quando marca + número de modelo; médio quando só a família. */
  confidence: number
}

function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .trim()
}

function titleCase(s: string): string {
  return s
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => (/^\d/.test(w) ? w.toUpperCase() : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(" ")
}

const EMPTY: WhatsAppDeviceResolution = {
  marca: "",
  modelo: "",
  aparelhoTexto: "",
  confidence: 0,
}

/** Resolve o aparelho citado no texto. Retorna confiança 0 quando nada é reconhecido. */
export function resolveWhatsAppDevice(text: string): WhatsAppDeviceResolution {
  const norm = normalize(text)
  if (!norm) return { ...EMPTY }

  // ── Apple / iPhone ──
  {
    const m = norm.match(/iphone\s*(\d{1,2})?\s*(pro\s*max|pro|plus|mini|se|xr|xs|x)?/)
    if (m) {
      const num = (m[1] ?? "").trim()
      const variant = (m[2] ?? "").replace(/\s+/g, " ").trim()
      const modeloParts = ["iPhone", num, variant ? titleCase(variant) : ""].filter(Boolean)
      const modelo = modeloParts.join(" ").trim()
      const confidence = num || variant ? 0.9 : 0.6
      return { marca: "Apple", modelo, aparelhoTexto: modelo, confidence }
    }
  }

  // ── Xiaomi (Redmi / Poco / Mi) — antes de Samsung p/ não colidir em "note" ──
  {
    const m = norm.match(
      /\b(redmi\s+note|redmi|poco|mi|xiaomi)\s*([a-z])?\s*(\d{1,3})?\s*(pro|plus|ultra|lite|note)?/
    )
    if (m && /redmi|poco|xiaomi|\bmi\b/.test(m[0])) {
      const fam = m[1].replace(/\s+/g, " ").trim()
      const letra = (m[2] ?? "").trim()
      const num = (m[3] ?? "").trim()
      const suf = (m[4] ?? "").trim()
      const famLabel = /redmi\s+note/.test(fam)
        ? "Redmi Note"
        : titleCase(fam === "mi" ? "Mi" : fam)
      const modelo = [famLabel, letra ? letra.toUpperCase() : "", num, suf ? titleCase(suf) : ""]
        .filter(Boolean)
        .join(" ")
        .trim()
      const confidence = num ? 0.88 : 0.6
      return { marca: "Xiaomi", modelo, aparelhoTexto: modelo, confidence }
    }
  }

  // ── Motorola / Moto ──
  {
    const m = norm.match(/\b(moto(rola)?)\s*(edge|one|g|e|x|z)?\s*(\d{1,3})?\s*(plus|play|power|neo|fusion|ultra)?/)
    if (m && /moto/.test(m[0])) {
      const linha = (m[3] ?? "").trim()
      const num = (m[4] ?? "").trim()
      const suf = (m[5] ?? "").trim()
      const linhaLabel = linha ? (linha === "edge" || linha === "one" ? titleCase(linha) : linha.toUpperCase()) : ""
      const modelo = ["Moto", linhaLabel, num, suf ? titleCase(suf) : ""]
        .filter(Boolean)
        .join(" ")
        .replace(/\s+/g, " ")
        .trim()
      const confidence = linha && num ? 0.9 : linha || num ? 0.7 : 0.55
      return { marca: "Motorola", modelo: modelo || "Motorola", aparelhoTexto: modelo || "Motorola", confidence }
    }
  }

  // ── Samsung / Galaxy (A/S/J/M/Note + número) ──
  {
    const m = norm.match(/\b(samsung\s+)?(galaxy\s+)?(note\s+)?([asjm])\s?(\d{2,3})\b/)
    if (m) {
      const linha = (m[4] ?? "").toUpperCase()
      const num = (m[5] ?? "").trim()
      const note = m[3] ? "Note " : ""
      const modelo = `Galaxy ${note}${linha}${num}`.replace(/\s+/g, " ").trim()
      const confidence = 0.85
      return { marca: "Samsung", modelo, aparelhoTexto: modelo, confidence }
    }
    if (/\bsamsung\b|\bgalaxy\b/.test(norm)) {
      return { marca: "Samsung", modelo: "Galaxy", aparelhoTexto: "Samsung Galaxy", confidence: 0.55 }
    }
  }

  return { ...EMPTY }
}
