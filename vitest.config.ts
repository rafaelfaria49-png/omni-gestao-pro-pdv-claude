import { defineConfig } from "vitest/config"
import { fileURLToPath } from "node:url"
import { dirname, resolve } from "node:path"
import { readFileSync } from "node:fs"
import { verifyTestDatasources } from "./lib/db/datasource-policy.mjs"

verifyTestDatasources()

const root = dirname(fileURLToPath(import.meta.url))

// Caminhos EXATOS (sem `*`) do tsconfig — ex.: `@/types/os` usado pelo Omni Agent. Nenhum deles existe
// na raiz, então sem este espelho o import simplesmente não resolvia no Vitest; os com `*` ficam de fora
// para não mudar a resolução de imports que já funcionam pelo alias `@`.
const tsPaths = (JSON.parse(readFileSync(resolve(root, "tsconfig.json"), "utf8")).compilerOptions?.paths ?? {}) as Record<string, string[]>
const aliasesExatos = Object.fromEntries(
  Object.entries(tsPaths).filter(([k, v]) => !k.includes("*") && v[0]).map(([k, v]) => [k, resolve(root, v[0])]),
)

/**
 * Vitest config mínimo para os testes-baseline pré-piloto SPRINT_01_MULTI_LOJA.
 *
 * Resolve apenas o alias `@/*` para a raiz do repo, espelhando `tsconfig.json`.
 * Sem plugins externos — evita nova dependência.
 *
 * Testes que importam módulos `@/lib/prisma`, `@/generated/prisma` etc. (pesados em
 * runtime e ligados a banco) devem evitar essa importação ou mockar pontualmente.
 */
export default defineConfig({
  resolve: {
    alias: {
      ...aliasesExatos,
      "@": resolve(root, "."),
      // Next resolve `server-only` internamente. Nos testes Node, o stub preserva
      // o marcador sem executar o pacote sentinela do runtime de componentes.
      "server-only": resolve(root, "test/server-only.ts"),
    },
  },
  test: {
    environment: "node",
    include: ["**/*.test.ts", "**/*.spec.ts"],
    exclude: [
      "node_modules/**",
      ".next/**",
      "generated/**",
      "components/pdv-github-original/**",
      "e2e/**",
      // Cliente Windows: tem vitest/tsconfig próprios (apps/desktop/package.json).
      "apps/desktop/**",
    ],
  },
})
