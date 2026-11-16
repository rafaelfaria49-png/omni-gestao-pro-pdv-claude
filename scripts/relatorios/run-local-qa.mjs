/** Fresh local PostgreSQL only. Never reads .env or connects to a supplied database. */
import { spawnSync } from "node:child_process"
import { mkdtemp,mkdir,writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import net from "node:net"
import { randomBytes } from "node:crypto"

const root=process.cwd(),evidence=path.join(root,"docs/ai-execution/_evidence/OMNI-RELATORIOS-HUB-ENTERPRISE-REAL-001")
const postgresBin=process.env.REPORTS_QA_PG_BIN??(process.platform==="win32"?"C:/Program Files/PostgreSQL/17/bin":"/usr/lib/postgresql/17/bin")
const dir=await mkdtemp(path.join(tmpdir(),"omni-relatorios-qa-"))
const port=await new Promise((resolve,reject)=>{const s=net.createServer();s.once("error",reject);s.listen(0,"127.0.0.1",()=>{const p=s.address().port;s.close(()=>resolve(p))})})
const dbName="omni_reports_qa",url=`postgresql://omni_qa@127.0.0.1:${port}/${dbName}?schema=public&connection_limit=4`
const qaPassword=randomBytes(24).toString("base64url"),authSecret=randomBytes(32).toString("base64url")
const env={...process.env,DATABASE_URL:url,DIRECT_URL:url,REPORTS_QA_DATABASE_URL:url,REPORTS_QA_PASSWORD:qaPassword,REPORTS_QA_DISPOSABLE:"1",AUTH_SECRET:authSecret,AUTH_SESSION_REVOCATION:"on",VERCEL:"0",VERCEL_ENV:"development"}
function run(command,args,childEnv=env){const r=spawnSync(command,args,{cwd:root,env:childEnv,stdio:"inherit",windowsHide:true});if(r.error||r.status!==0)throw new Error(`QA_COMMAND_FAILED: ${path.basename(command)} (${r.status??"spawn"})`)}
const bin=name=>path.join(postgresBin,name+(process.platform==="win32"?".exe":""))
let started=false
try{
  run(bin("initdb"),["-D",dir,"-U","omni_qa","--auth=trust","--encoding=UTF8","--no-locale"])
  run(bin("pg_ctl"),["-D",dir,"-l",path.join(dir,"server.log"),"-o",`-p ${port} -h 127.0.0.1`,"-w","start"]);started=true
  run(bin("createdb"),["-h","127.0.0.1","-p",String(port),"-U","omni_qa",dbName])
  // Only the unchanged repository schema in this newly initialized, empty cluster.
  run(process.execPath,["node_modules/prisma/build/index.js","db","push","--skip-generate"])
  await mkdir(evidence,{recursive:true})
  await writeFile(path.join(evidence,process.argv.includes("--keep")?"local-qa-session.json":"last-qa-run.json"),JSON.stringify({dir,port,url,qaPassword,authSecret,sessionRevocation:"on",target:"fresh loopback PostgreSQL",productionWrites:0,schemaSourceChanged:false},null,2))
  run(process.execPath,["node_modules/vitest/vitest.mjs","run","lib/relatorios/enterprise.pg.test.ts","--maxWorkers=1","--reporter=default","--reporter=json",`--outputFile=${evidence}/postgres-results.json`])
  if(process.argv.includes("--keep")){console.log("QA cluster preserved for browser verification; session recorded in evidence.");started=false}
}finally{
  if(started)run(bin("pg_ctl"),["-D",dir,"-m","fast","-w","stop"])
  // Preserve data/logs for audit. No recursive removal of temp paths.
}
