import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import dotenv from "dotenv";
const require = createRequire(import.meta.url);
const functional = path.resolve(import.meta.dirname, "../.."), baseline = "C:/Projetos/omni-gestao-ops-v4-frg-002-base";
const group = process.argv[2], useBase = process.argv.includes("--base"), cwd = useBase ? baseline : functional;
const local = dotenv.parse(fs.readFileSync(path.join(functional, ".env")));
const url = new URL(local.DATABASE_URL);
if (url.hostname !== "127.0.0.1" || !url.pathname.startsWith("/ops_v4_frg_qa") || !local.PLAYWRIGHT_E2E_EMAIL?.endsWith(".test")) throw Error("QA_ONLY");
const groups = {
 frg: { db: "ops_v4_frg_qa_002", bootstrap: "test/ops-v4-financeiro-retirada-garantia-001/qa-bootstrap.mjs", specs: ["e2e/specs/ops-v4-financeiro-retirada-garantia-002.spec.ts"] },
 frg001: { db: "ops_v4_frg_qa_002", bootstrap: "test/ops-v4-financeiro-retirada-garantia-001/qa-bootstrap.mjs", specs: ["e2e/specs/ops-v4-financeiro-retirada-garantia-001.spec.ts"] },
 misto: { db: "ops_v3_misto_qa_frg", bootstrap: "test/ops-v3-recebimento-misto/qa-bootstrap.mjs", specs: ["e2e/specs/ops-v4-recebimento-misto-paridade-001.spec.ts", "e2e/specs/ops-v3-recebimento-misto-001.spec.ts", "e2e/specs/ops-recebimento-misto-p1-hardening-001.spec.ts"] },
 datas: { db: "ops_datas_qa_frg", bootstrap: "test/ops-datas-retroativas-001/qa-bootstrap.mjs", specs: ["e2e/specs/ops-datas-retroativas-001.spec.ts"] },
 fluxo006: { db: "ops_v4_fluxo_006_qa_frg", bootstrap: "test/ops-v4-fluxo-curto-006/qa-bootstrap.mjs", specs: ["e2e/specs/operacoes-v4-fluxo-curto-006.spec.ts"] },
};
const entry = groups[group];
if (!entry && group !== "build") throw Error("Grupo QA desconhecido");
url.pathname = "/" + (entry?.db ?? "ops_v4_frg_qa_002");
const env = { ...process.env, ...local, DATABASE_URL: url.href, DIRECT_URL: url.href, OPS_V4_FRG_TEST_DATABASE_URL: url.href, OPS_V4_FLUXO_CURTO_TEST_DATABASE_URL: url.href, OPS_V3_MISTO_TEST_DATABASE_URL: url.href, OPS_DATAS_TEST_DATABASE_URL: url.href, NEXTAUTH_URL: "http://127.0.0.1:3071", AUTH_URL: "http://127.0.0.1:3071", PLAYWRIGHT_BASE_URL: "http://127.0.0.1:3071", PLAYWRIGHT_E2E_SKIP_WEBSERVER: "1", VERCEL_ENV: "development", NODE_OPTIONS: "--max-old-space-size=6144" };
const reportsDir = process.argv.includes("--final") ? "docs/execution-tracks/ops-v4-financeiro-retirada-garantia/review-rev7" : "docs/execution-tracks/ops-v4-financeiro-retirada-garantia/_closed/reports/rev7";
const report = path.join(functional, reportsDir, (useBase ? "base-" : "candidate-") + group);
async function run(args, logFile) {
 const child = spawn(process.execPath, args, { cwd, env, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
 let output = "";
 for (const stream of [child.stdout, child.stderr]) stream.on("data", chunk => { output += chunk; process.stdout.write(chunk); });
 const code = await new Promise((resolve, reject) => { child.once("error", reject); child.once("exit", resolve); });
 fs.writeFileSync(logFile, output); return code ?? 1;
}
if (group === "build") { process.exitCode = await run(["scripts/vercel-build.mjs"], report + ".log"); }
else {
 const { PrismaClient } = require(path.join(cwd, "generated/prisma"));
 const pg = new PrismaClient({ datasourceUrl: url.href });
 try { const [target] = await pg.$queryRawUnsafe("SELECT current_database() AS db, inet_server_addr()::text AS host, inet_server_port() AS port"); if (target.db !== entry.db || target.host !== "127.0.0.1/32") throw Error("Banco QA não confere"); console.log("QA confirmado: " + target.db + " @ " + target.host + ":" + target.port); } finally { await pg.$disconnect(); }
 const boot = await run([entry.bootstrap], report + "-bootstrap.log"); if (boot !== 0) process.exit(boot);
 const server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "-p", "3071", "-H", "127.0.0.1"], { cwd, env: { ...env, NODE_ENV: "production" }, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
 let serverLog = "", readyResolve, readyReject;
 const ready = new Promise((resolve, reject) => { readyResolve = resolve; readyReject = reject; });
 for (const stream of [server.stdout, server.stderr]) stream.on("data", chunk => { serverLog += chunk; if (serverLog.includes("Ready in")) readyResolve(); });
 server.once("error", readyReject); server.once("exit", code => readyReject(Error("Servidor QA encerrou: " + code)));
 try { await ready; console.log("Servidor QA pronto, PID=" + server.pid + " · " + (useBase ? "BASE" : "CANDIDATO")); process.exitCode = await run(["node_modules/@playwright/test/cli.js", "test", ...entry.specs, "--retries=0", "--workers=1"], report + ".log"); }
 finally { server.kill(); fs.writeFileSync(report + "-server.log", serverLog); }
}
