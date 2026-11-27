import { readdirSync, readFileSync, statSync } from "node:fs"
import { join, resolve } from "node:path"
import { describe, expect, it } from "vitest"

const REPO_ROOT = resolve(__dirname, "../..")

function collectSourceFiles(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    const st = statSync(full)
    if (st.isDirectory()) {
      out.push(...collectSourceFiles(full))
    } else if (/\.(ts|tsx|js|jsx|mjs)$/.test(entry)) {
      out.push(full)
    }
  }
  return out
}

describe("GOAL_A=OMNI-BUILD-LOCAL-FONTS-STABILITY-001 — contrato de fontes locais sem Google Fonts", () => {
  it("nenhuma rota ativa em app/ importa next/font/google", () => {
    const appFiles = collectSourceFiles(join(REPO_ROOT, "app"))
    const offending = appFiles.filter((file) => readFileSync(file, "utf8").includes("next/font/google"))
    expect(offending).toEqual([])
  })

  it("todos os arquivos WOFF2 locais existem com assinatura mágica wOF2 válida e licenças SIL OFL-1.1 versionadas", () => {
    const woff2Files = [
      "app/fonts/inter/InterVariable.woff2",
      "app/fonts/space-grotesk/SpaceGrotesk-Variable.woff2",
      "app/fonts/plus-jakarta-sans/PlusJakartaSans-SemiBold.woff2",
      "app/fonts/plus-jakarta-sans/PlusJakartaSans-Bold.woff2",
      "app/fonts/plus-jakarta-sans/PlusJakartaSans-ExtraBold.woff2",
      "app/fonts/ibm-plex-mono/IBMPlexMono-Medium.woff2",
      "app/fonts/ibm-plex-mono/IBMPlexMono-Bold.woff2",
    ]
    for (const rel of woff2Files) {
      const buf = readFileSync(join(REPO_ROOT, rel))
      expect(buf.length, `${rel} deve ser não-vazio`).toBeGreaterThan(10_000)
      expect(buf.subarray(0, 4).toString("ascii"), `${rel} deve ter cabeçalho wOF2`).toBe("wOF2")
    }

    const licenses = [
      "app/fonts/inter/LICENSE.txt",
      "app/fonts/space-grotesk/OFL.txt",
      "app/fonts/plus-jakarta-sans/OFL.txt",
      "app/fonts/ibm-plex-mono/LICENSE.txt",
    ]
    for (const rel of licenses) {
      const text = readFileSync(join(REPO_ROOT, rel), "utf8")
      expect(text, `${rel} deve conter SIL OPEN FONT LICENSE`).toMatch(/SIL OPEN FONT LICENSE/i)
    }
  })

  it("preserva variáveis CSS, pesos, display swap e fallbacks em app/layout.tsx e app/gestao-lojas/page.tsx", () => {
    const rootLayout = readFileSync(join(REPO_ROOT, "app/layout.tsx"), "utf8")
    expect(rootLayout).toContain("next/font/local")
    expect(rootLayout).toContain("variable: '--font-sans'")
    expect(rootLayout).toContain("variable: '--font-display'")
    expect(rootLayout).toContain("display: 'swap'")

    const gestaoLojas = readFileSync(join(REPO_ROOT, "app/gestao-lojas/page.tsx"), "utf8")
    expect(gestaoLojas).toContain("next/font/local")
    expect(gestaoLojas).toContain('variable: "--gl-font-jakarta"')
    expect(gestaoLojas).toContain('variable: "--gl-font-plex-mono"')
    expect(gestaoLojas).toContain('weight: "600"')
    expect(gestaoLojas).toContain('weight: "700"')
    expect(gestaoLojas).toContain('weight: "800"')
    expect(gestaoLojas).toContain('weight: "500"')
    expect(gestaoLojas).toContain('display: "swap"')
  })
})
