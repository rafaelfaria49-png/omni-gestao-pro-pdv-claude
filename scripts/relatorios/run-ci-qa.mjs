/** CI only: fresh synthetic PostgreSQL bound to loopback; never a supplied database. */
import { spawn,spawnSync } from "node:child_process"
import { randomBytes } from "node:crypto"
import { mkdir,writeFile,open } from "node:fs/promises"
import path from "node:path"

if(process.env.GITHUB_ACTIONS!=="true"||process.env.CI!=="true"||!/^[0-9]+$/.test(process.env.GITHUB_RUN_ID??""))throw new Error("GITHUB_SYNTHETIC_QA_ONLY")
const container=`reports-qa-${process.env.GITHUB_RUN_ID}-${process.env.GITHUB_RUN_ATTEMPT??"1"}`
const evidence=path.resolve("docs/ai-execution/_evidence/OMNI-RELATORIOS-HUB-ENTERPRISE-REAL-001")
const url="postgresql://omni_qa@127.0.0.1:55432/omni_reports_qa?schema=public&connection_limit=4"
const qaPassword=randomBytes(24).toString("base64url"),authSecret=randomBytes(32).toString("base64url")
const env={...process.env,DATABASE_URL:url,DIRECT_URL:url,REPORTS_QA_DATABASE_URL:url,REPORTS_QA_PASSWORD:qaPassword,REPORTS_QA_DISPOSABLE:"1",
  AUTH_SECRET:authSecret,AUTH_URL:"http://127.0.0.1:3107",NEXTAUTH_URL:"http://127.0.0.1:3107",AUTH_TRUST_HOST:"true",AUTH_SESSION_REVOCATION:"on",
  MIGRATION_AUTHORITY_ENABLED:"false",VERCEL:"0",VERCEL_ENV:"development",PW_EXPERIMENTAL_SERVICE_WORKER_NETWORK_EVENTS:"1"}
function run(command,args){const result=spawnSync(command,args,{env,stdio:"inherit",windowsHide:true});if(result.error||result.status!==0)throw new Error(`QA_COMMAND_FAILED:${path.basename(command)}`)}
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms))
let started=false,server,log
try{
  // Trust is restricted to a new disposable container on runner loopback. No password secret.
  run("docker",["run","-d","--rm","--name",container,"-e","POSTGRES_USER=omni_qa","-e","POSTGRES_DB=omni_reports_qa","-e","POSTGRES_HOST_AUTH_METHOD=trust","-p","127.0.0.1:55432:5432","postgres:17"]);started=true
  let ready=false
  for(let attempt=0;attempt<40;attempt++){
    const status=spawnSync("docker",["exec",container,"pg_isready","-U","omni_qa","-d","omni_reports_qa"],{stdio:"ignore"})
    if(status.status===0){ready=true;break}await wait(500)
  }
  if(!ready)throw new Error("QA_POSTGRES_NOT_READY")
  run(process.execPath,["node_modules/prisma/build/index.js","db","push","--skip-generate"])
  await mkdir(evidence,{recursive:true})
  await writeFile(path.join(evidence,"local-qa-session.json"),JSON.stringify({url,qaPassword,authSecret,sessionRevocation:"on",target:"fresh loopback CI PostgreSQL",productionWrites:0,schemaSourceChanged:false}))
  run(process.execPath,["node_modules/vitest/vitest.mjs","run","lib/relatorios/enterprise.pg.test.ts","lib/relatorios/session-revocation.pg.test.ts","--maxWorkers=1"])
  run(process.execPath,["scripts/vercel-build.mjs"])
  run(process.execPath,["--test","scripts/relatorios/inspect-enterprise-pwa.test.mjs"])
  log=await open(path.join(evidence,"ci-server.log"),"w")
  server=spawn(process.execPath,["node_modules/next/dist/bin/next","start","-p","3107","-H","127.0.0.1"],{env,stdio:["ignore",log.fd,log.fd],windowsHide:true})
  let online=false
  for(let attempt=0;attempt<60;attempt++){
    if(server.exitCode!==null)throw new Error("QA_SERVER_EXITED")
    try{const response=await fetch("http://127.0.0.1:3107/api/auth/csrf",{signal:AbortSignal.timeout(2000)});if(response.ok){online=true;break}}catch{}
    await wait(500)
  }
  if(!online)throw new Error("QA_SERVER_NOT_READY")
  // Windows Electron runtime is verified locally; this Linux job covers browser/mobile.
  run(process.execPath,["node_modules/@playwright/test/cli.js","test","--config","e2e/reports.config.ts","--grep-invert","actual Electron runtime","--reporter=list"])
}finally{
  server?.kill("SIGTERM")
  await log?.close()
  if(started)spawnSync("docker",["stop",container],{stdio:"ignore"})
  // No session manifests, traces, credentials or raw local artifacts are uploaded.
}
