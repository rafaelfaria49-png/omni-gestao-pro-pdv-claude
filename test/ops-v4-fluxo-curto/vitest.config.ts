import { defineConfig } from "vitest/config"
import { fileURLToPath } from "node:url"
import { dirname, resolve } from "node:path"

// OPS-V4-FLUXO-CURTO-001 / R05 — runner dedicado dos testes MONTADOS.
//
// - Descoberta EXPLÍCITA de .test.tsx desta tarefa (lista fechada: falha com
//   "No test files found" se nenhum caso for descoberto/executado).
// - Ambiente DOM SOMENTE aqui (a suíte global em vitest.config.ts permanece
//   `node` e intocada — include/exclude globais não alterados).
// - Aliases espelhados do tsconfig/global (`@/*`, stub `server-only`).
// - Sem `passWithNoTests`, sem skip como aprovação: arquivo sem assert falha.

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..")

export default defineConfig({
  resolve: {
    alias: {
      "@": repoRoot,
      "server-only": resolve(repoRoot, "test/server-only.ts"),
    },
  },
  test: {
    environment: "jsdom",
    include: [
      "components/operacoes-v4-preview/use-ordens-v4.test.tsx",
      "components/operacoes-v4-preview/use-entrada-draft-guard.test.tsx",
      "components/operacoes-v4-preview/parts/stages/EntradaWorkspace.test.tsx",
      "lib/loja-ativa.test.tsx",
    ],
    exclude: ["node_modules/**", ".next/**", "generated/**", "e2e/**"],
    testTimeout: 15_000,
    css: false,
  },
})
