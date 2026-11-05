import { describe, expect, it } from 'vitest'
import { createRequire } from 'node:module'
import { createHash } from 'node:crypto'
import { mkdtempSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { verifyArtifact } from './verify-artifact.mjs'
const AdmZip=createRequire(import.meta.url)('adm-zip')
type Mutant={mutant:string;status:string;exit:number|null}
function fixture(change:(rows:Mutant[],logs:Record<string,string>)=>void=()=>{}) {
  const head='a'.repeat(40),checkout='b'.repeat(40)
  const rows:Mutant[]=Array.from({length:8},(_,i)=>({mutant:'synthetic-'+i,status:'KILLED',exit:1}))
  const logs=Object.fromEntries(rows.map(r=>['mutation-'+r.mutant+'.log','AssertionError: expected false to be true\nTests 1 failed\nexit=1\n']))
  change(rows,logs)
  const provenance={githubRunId:'7',githubRunAttempt:'1',commit:checkout,platform:'linux'}
  const zip=new AdmZip()
  for(const [name,value] of Object.entries({...logs,'RUN.json':JSON.stringify(provenance),'VALIDACAO_D03.json':JSON.stringify({provenance,steps:[{step:'mutation',status:'PASS'}]}),'mutations.json':JSON.stringify({sourceRestored:true,results:rows})}))zip.addFile(name,Buffer.from(value))
  const bytes=zip.toBuffer(),file=path.join(mkdtempSync(path.join(os.tmpdir(),'d04-proof-')),'synthetic.zip')
  writeFileSync(file,bytes)
  const metadata={artifact:{id:1,name:'synthetic',digest:'sha256:'+createHash('sha256').update(bytes).digest('hex'),workflow_run:{head_sha:head,id:7}},headSha:head,checkoutSha:checkout,runId:7,runAttempt:1,platform:'linux',validationFile:'VALIDACAO_D03.json',expectedSteps:['mutation']}
  return ()=>verifyArtifact(file,metadata)
}
describe('CI evidence refuses false mutation success',()=>{
  it('accepts eight distinct, assertion-killed mutations with matching nonzero exits',()=>{expect(fixture()().status).toBe('PASS')})
  it('refuses timeout/null exit even if an assertion was printed',()=>{expect(fixture(rows=>{rows[0].exit=null})).toThrow('MUTATIONS_NOT_KILLED')})
  it('refuses exit zero labeled KILLED',()=>{expect(fixture(rows=>{rows[0].exit=0})).toThrow('MUTATIONS_NOT_KILLED')})
  it('refuses a summary/log exit mismatch',()=>{expect(fixture((_rows,logs)=>{logs['mutation-synthetic-0.log']='AssertionError\n1 failed\nexit=2\n'})).toThrow('MUTATION_EXIT_NOT_PROVEN')})
  it('refuses a collection/preparation failure without assertion evidence',()=>{expect(fixture((_rows,logs)=>{logs['mutation-synthetic-0.log']='FAIL suite: missing dependency\n1 failed\nexit=1\n'})).toThrow('MUTATION_ASSERTION_NOT_PROVEN')})
  it('refuses duplicated mutation names',()=>{expect(fixture(rows=>{rows[1].mutant=rows[0].mutant})).toThrow('MUTATIONS_NOT_KILLED')})
})
