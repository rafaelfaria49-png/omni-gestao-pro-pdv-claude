import { defineConfig } from "vitest/config";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { parse } from "dotenv";

// OPS-DATAS-ENTRADA-ENTREGA-RETROATIVAS-001 — runner dedicado da integração PostgreSQL.
//
// - Arquivos `*.pg.ts`: fora do include global (`**/*.test.ts`), então a suíte
//   global nunca roda estes testes sem banco (nem os pula em silêncio).
// - Só as variáveis de BANCO do `.env` local (gitignorado) entram nos testes; o
//   próprio teste exige loopback + banco `ops_datas_qa*` e FALHA explicitamente
//   se o ambiente não estiver pronto. Sem `passWithNoTests`, sem skip.

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const envFile = resolve(root, ".env");
const local = existsSync(envFile) ? parse(readFileSync(envFile)) : {};
const CHAVES_BANCO = ["DATABASE_URL", "DIRECT_URL", "OPS_DATAS_TEST_DATABASE_URL"] as const;
const env: Record<string, string> = {};
for (const chave of CHAVES_BANCO) {
  const valor = process.env[chave] ?? local[chave];
  if (valor) env[chave] = valor;
}

export default defineConfig({
  resolve: {
    alias: [
      { find: /^@\/api\/(.*)$/, replacement: resolve(root, "components/operacoes/lovable/api/$1") },
      { find: /^@\/types\/(os|estoque|loja|venda|servico|atendimento)$/, replacement: resolve(root, "components/operacoes/lovable/types/$1") },
      { find: /^@\//, replacement: `${root.replace(/\\/g, "/")}/` },
      { find: "server-only", replacement: resolve(root, "test/server-only.ts") },
    ],
  },
  test: {
    environment: "node",
    include: ["test/ops-datas-retroativas-001/*.pg.ts"],
    exclude: ["node_modules/**", ".next/**", "generated/**", "e2e/**"],
    env,
    // Um arquivo por vez: os cenários de concorrência medem travas reais no banco.
    fileParallelism: false,
    testTimeout: 60_000,
    hookTimeout: 60_000,
  },
});
