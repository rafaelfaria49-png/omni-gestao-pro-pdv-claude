// Missing or foreign-run logs are PENDING. A process killed/timed out (exit=null) is FAIL.
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, readdirSync, unlinkSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..')
const dir=path.join(root,'docs/print-004c-e2e/evidence/d04')
mkdirSync(dir,{recursive:true})
if(process.argv.includes('--reset')){
  for(const entry of readdirSync(dir,{withFileTypes:true}))if(entry.isFile()&&(/\.log$/.test(entry.name)||/^summary.*\.json$/.test(entry.name)||['RUN.json','VALIDACAO_D04.json','two-agents.jsonl'].includes(entry.name)))unlinkSync(path.join(dir,entry.name))
  console.log('D04_EVIDENCE_RESET');process.exit(0)
}
const provenance=existsSync(path.join(dir,'RUN.json'))?JSON.parse(readFileSync(path.join(dir,'RUN.json'),'utf8')):null
const sameRun=process.env.GITHUB_ACTIONS!=='true'||provenance?.githubRunId===process.env.GITHUB_RUN_ID&&provenance?.githubRunAttempt===process.env.GITHUB_RUN_ATTEMPT
const expected=['generator','d02-generator','unit','offline-regression','retention-pg','offline-pg','scenarios-pg','two-agents-pg','synthetic-pg','d02-pg','d02-rehearsal','playwright','typecheck','eslint','build','recovery','package','d04-eslint','powershell-parse','installer','cross-user-dpapi']
const steps=expected.map(step=>{
  const file=path.join(dir,step+'.log')
  if(!sameRun||!existsSync(file))return {step,status:'PENDING'}
  const log=readFileSync(file,'utf8').replace(/\r\n/g,'\n'),exit=/(?:^|\n)exit=(-?\d+|null)\s*$/.exec(log)
  return {step,status:!exit?'PENDING':exit[1]==='0'?'PASS':'FAIL',exit:exit&&exit[1]!=='null'?Number(exit[1]):null,
    tests:/Tests\s+([^\n]+)/.exec(log)?.[1]??/(\d+ passed[^\n]*)/.exec(log)?.[1]??null,sha256:createHash('sha256').update(log).digest('hex')}
})
const result={goal:'OMNI-PRINT-D04-WINDOWS-AGENT-FINALIZACAO-001',provenance,sameRun,
  currentHead:spawnSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).stdout.trim(),status:steps.some(s=>s.status==='FAIL')?'FAIL':steps.every(s=>s.status==='PASS')?'PASS':'PENDING',
  productionWrites:0,physicalHomologation:'PENDING',realPairing:false,steps}
writeFileSync(path.join(dir,'VALIDACAO_D04.json'),JSON.stringify(result,null,2)+'\n')
console.log('D04_EVIDENCE_'+result.status)
