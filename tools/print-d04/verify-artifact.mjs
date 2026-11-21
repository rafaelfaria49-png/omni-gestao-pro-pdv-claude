// Read-only CI evidence verification. Metadata must be obtained independently from GitHub's artifact/PR APIs.
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
const AdmZip=createRequire(import.meta.url)('adm-zip')
const sha=bytes=>createHash('sha256').update(bytes).digest('hex')
const requireThat=(condition,code)=>{if(!condition)throw new Error(code)}
export function verifyArtifact(file, metadata) {
  const bytes=readFileSync(file), digest='sha256:'+sha(bytes)
  requireThat(digest===metadata.artifact.digest,'ARTIFACT_DIGEST_MISMATCH')
  requireThat(metadata.artifact.workflow_run.head_sha===metadata.headSha,'ARTIFACT_HEAD_MISMATCH')
  requireThat(metadata.artifact.workflow_run.id===metadata.runId,'ARTIFACT_RUN_MISMATCH')
  const zip=new AdmZip(bytes)
  requireThat(zip.getEntries().reduce((n,e)=>n+e.header.size,0)<64*1024*1024,'ARTIFACT_TOO_LARGE')
  const read=name=>{const entry=zip.getEntry(name);requireThat(entry&&!entry.isDirectory,'EVIDENCE_MISSING_'+name);return entry.getData().toString('utf8').replace(/\r\n/g,'\n')}
  const run=JSON.parse(read('RUN.json'))
  requireThat(String(run.githubRunId)===String(metadata.runId)&&String(run.githubRunAttempt)===String(metadata.runAttempt),'RUN_PROVENANCE_MISMATCH')
  requireThat(run.commit===metadata.checkoutSha&&run.platform===metadata.platform,'CHECKOUT_OR_PLATFORM_MISMATCH')
  const validation=JSON.parse(read(metadata.validationFile))
  requireThat(validation.provenance.githubRunId===run.githubRunId&&validation.provenance.githubRunAttempt===run.githubRunAttempt,'VALIDATION_PROVENANCE_MISMATCH')
  const results=metadata.expectedSteps.map(step=>{
    const recorded=validation.steps.find(s=>s.step===step)
    requireThat(recorded?.status==='PASS','STEP_NOT_PASS_'+step)
    if(step==='mutation') {
      const mutation=JSON.parse(read('mutations.json'))
      requireThat(mutation.sourceRestored&&mutation.results.length===8&&new Set(mutation.results.map(r=>r.mutant)).size===8&&mutation.results.every(r=>r.status==='KILLED'&&Number.isInteger(r.exit)&&r.exit!==0),'MUTATIONS_NOT_KILLED')
      const logs=mutation.results.map(r=>{
        const log=read('mutation-'+r.mutant+'.log')
        const exit=/(?:^|\n)exit=(-?\d+)\s*$/.exec(log)
        requireThat(exit&&Number(exit[1])===r.exit&&Number(exit[1])!==0,'MUTATION_EXIT_NOT_PROVEN')
        requireThat(/AssertionError|expected .* to |promise resolved .* instead of rejecting/.test(log)&&/1 failed/.test(log),'MUTATION_ASSERTION_NOT_PROVEN')
        return {mutant:r.mutant,sha256:sha(log)}
      })
      return {step,status:'PASS',mutations:logs}
    }
    const log=read(step+'.log')
    requireThat(sha(log)===recorded.sha256,'LOG_DIGEST_MISMATCH_'+step)
    requireThat(/(?:^|\n)exit=0\s*$/.test(log),'LOG_EXIT_NOT_ZERO_'+step)
    return {step,status:'PASS',tests:recorded.tests??null,sha256:sha(log)}
  })
  return {status:'PASS',headSha:metadata.headSha,checkoutSha:run.commit,runId:metadata.runId,runAttempt:metadata.runAttempt,
    artifactId:metadata.artifact.id,artifactName:metadata.artifact.name,artifactDigest:digest,platform:run.platform,steps:results,physicalHomologation:'PENDING'}
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  console.log(JSON.stringify(verifyArtifact(process.argv[2],JSON.parse(readFileSync(process.argv[3],'utf8'))),null,2))
}
