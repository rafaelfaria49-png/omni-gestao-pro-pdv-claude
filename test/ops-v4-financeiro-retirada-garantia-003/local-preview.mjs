// Servidor Next real, guardado para o banco sintético desta experiência.
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { spawnSync, spawn } from "node:child_process";
import { createRequire } from "node:module";
const root = fileURLToPath(new URL("../../", import.meta.url));
const require = createRequire(import.meta.url);
const { parse } = require("dotenv");
const e = parse(readFileSync(path.join(root,".env")));
const esperado = "postgresql://qa@127.0.0.1:55439/ops_v4_frg_qa_garantias?schema=public";
for (const key of ["DATABASE_URL","DIRECT_URL"]) if (e[key] !== esperado) throw new Error("BLOQUEIO_QA: somente o PostgreSQL sintético dedicado em loopback:55439.");
for (const file of [".env.local",".env.development",".env.development.local"]) if (existsSync(path.join(root,file))) throw new Error("BLOQUEIO_QA: remova ou revise explicitamente o override " + file + " desta worktree experimental.");
const pg = path.join(root,"test/ops-v4-financeiro-retirada-garantia-003/.local/pg");
if (!existsSync(path.join(pg,"PG_VERSION"))) throw new Error("Cluster QA ausente. Consulte README.md desta experiência.");
const pgCtl = process.env.QA_PG_CTL || "C:/Program Files/PostgreSQL/17/bin/pg_ctl.exe";
if (spawnSync(pgCtl,["-D",pg,"status"],{stdio:"ignore",windowsHide:true}).status !== 0) {
  const r = spawnSync(pgCtl,["-D",pg,"-l",path.join(pg,"../postgres.log"),"-o","-h 127.0.0.1 -p 55439","start"],{stdio:"inherit",windowsHide:true});
  if (r.status !== 0) throw new Error("Não foi possível iniciar o PostgreSQL QA.");
}
const env = { ...process.env, ...e, DATABASE_URL: esperado, DIRECT_URL: esperado, AUTH_URL: "http://127.0.0.1:3043", NEXTAUTH_URL: "http://127.0.0.1:3043", NEXT_TELEMETRY_DISABLED: "1", NODE_OPTIONS: process.env.QA_NODE_OPTIONS || "--max-old-space-size=1536" };
const child = spawn(process.execPath,[path.join(root,"node_modules/next/dist/bin/next"),"dev","--webpack","-p","3043","-H","127.0.0.1"],{ cwd:root,env,stdio:"inherit",windowsHide:true });
child.on("exit",(code) => process.exit(code ?? 1));
console.log("V4 experimental: http://127.0.0.1:3043/dashboard/operacoes-v4-preview — somente dados sintéticos.");
