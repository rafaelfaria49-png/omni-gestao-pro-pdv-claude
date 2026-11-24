import path from "node:path";
import { defineConfig } from "@playwright/test";

// OPERACOES-V3-SELETOR-003-ACEITE-REAL — aceite no navegador contra `next start` local,
// NextAuth real e PostgreSQL descartável (`ops_v3_seletor_qa*`). Login, app e navegador
// na MESMA origem (`http://localhost:3047`). Sem webServer: o servidor de QA sobe à parte
// com o env de QA (fora do repositório). Sem trace/vídeo: nada de credencial em artefato.

const ORIGEM = "http://localhost:3047";
if ((process.env.PLAYWRIGHT_BASE_URL ?? "") !== ORIGEM || (process.env.AUTH_URL ?? "") !== ORIGEM || (process.env.NEXTAUTH_URL ?? "") !== ORIGEM) {
  throw new Error(`BLOQUEIO_QA: PLAYWRIGHT_BASE_URL, AUTH_URL e NEXTAUTH_URL precisam ser ${ORIGEM}.`);
}

const out = path.resolve(__dirname, "../../test-results/ops-v3-seletor-003-aceite");

export default defineConfig({
  testDir: __dirname,
  testMatch: /.*\.e2e\.ts$/,
  outputDir: path.join(out, "artifacts"),
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 120_000,
  expect: { timeout: 20_000 },
  reporter: [["list"]],
  use: {
    baseURL: ORIGEM,
    serviceWorkers: "block",
    trace: "off",
    video: "off",
    screenshot: "off",
    locale: "pt-BR",
    timezoneId: "America/Sao_Paulo",
  },
});
