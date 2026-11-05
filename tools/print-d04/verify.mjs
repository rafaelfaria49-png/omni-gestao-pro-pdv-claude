// Reuses the complete D03 battery: no duplicated business scenarios, no real pairing/printer/database.
import { steps as regression } from '../print-d03/verify.mjs'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..')
const out=path.join(root,'docs/print-004c-e2e/evidence/d04')
mkdirSync(out,{recursive:true})
const packageRoot=path.join(root,'tools/print-d04/.artifacts/omni-print-agent')
const ps=(file,args=[])=>({command:'powershell.exe',args:['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',file,...args]})
const steps=[
  ...regression.map(([name,args,env])=>[name,args,name==='two-agents-pg'?{...env,PRINT_EVIDENCE_FILE:path.join(out,'two-agents.jsonl')}:env]),
  ['recovery',['node_modules/vitest/vitest.mjs','run','tools/print-d04/recovery.test.ts','tools/print-d04/verify-artifact.test.ts','--maxWorkers=1']],
  ['package',['tools/print-d04/package.mjs']],
  ['d04-eslint',['node_modules/eslint/bin/eslint.js','tools/omni-print-agent','tools/print-d04','tools/print-d03/verify.mjs','tools/print-004c-e2e/agent-host.mjs','--ignore-pattern','tools/print-d04/.artifacts/**']],
  ...(process.platform==='win32' ? [
    ['powershell-parse',ps('tools/print-d04/parse-powershell.ps1')],
    ...(process.env.GITHUB_ACTIONS==='true' ? [
      ['installer',ps('tools/print-d04/installer-lab.ps1',['-PackageRoot',packageRoot])],
      ['cross-user-dpapi',ps('tools/print-d04/cross-user-dpapi.ps1')],
    ]:[]),
  ]:[]),
]
const selected=process.argv.slice(2)
const provenance={platform:process.platform,node:process.version,githubRunId:process.env.GITHUB_RUN_ID??null,githubRunAttempt:process.env.GITHUB_RUN_ATTEMPT??null,
  commit:process.env.GITHUB_SHA??spawnSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).stdout.trim(),localChanges:process.env.GITHUB_ACTIONS!=='true'}
writeFileSync(path.join(out,'RUN.json'),JSON.stringify(provenance,null,2)+'\n')
const summary={goal:'OMNI-PRINT-D04-WINDOWS-AGENT-FINALIZACAO-001',provenance,productionWrites:0,realPairing:false,physicalHomologation:'PENDING',steps:[]}
for(const [name,spec,extra] of steps){
  if(selected.length&&!selected.includes(name))continue
  const args=Array.isArray(spec)?spec:spec.args, command=Array.isArray(spec)?process.execPath:spec.command
  const started=Date.now()
  const r=spawnSync(command,args,{cwd:root,encoding:'utf8',maxBuffer:64<<20,timeout:1_200_000,windowsHide:true,env:{...process.env,
    DATABASE_URL:'postgresql://test:test@127.0.0.1:1/isolated',DIRECT_URL:'postgresql://test:test@127.0.0.1:1/isolated',MIGRATION_AUTHORITY_ENABLED:'false',VERCEL:'0',VERCEL_ENV:'development',
    AUTH_SECRET:'synthetic-d04-build-only',AUTH_TRUST_HOST:'true',NEXTAUTH_URL:'http://localhost:3000',NEXT_TELEMETRY_DISABLED:'1',FORCE_COLOR:'0',NO_COLOR:'1',...extra}})
  const log=((r.stdout??'')+(r.stderr??'')).replace(/\x1b\[[0-9;]*[A-Za-z]/g,'').replace(/[\t ]+$/gm,'')+`\nexit=${r.status}\n`
  writeFileSync(path.join(out,name+'.log'),log)
  summary.steps.push({step:name,status:r.status===0?'PASS':'FAIL',exit:r.status,seconds:Math.round((Date.now()-started)/1000),tests:/Tests\s+([^\n]+)/.exec(log)?.[1]??/(\d+ passed[^\n]*)/.exec(log)?.[1]??null,sha256:createHash('sha256').update(log).digest('hex')})
  writeFileSync(path.join(out,selected.length?'summary-'+selected.join('-')+'.json':'summary.json'),JSON.stringify(summary,null,2)+'\n')
  console.log(`${name}: ${r.status===0?'PASS':'FAIL'} (${Math.round((Date.now()-started)/1000)}s)`)
}
process.exitCode=summary.steps.every(s=>s.status==='PASS')?0:1
