import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {labRoot,evidence,json,sha} from './lab.mjs';
export function cases(){
 const input=JSON.parse(fs.readFileSync(path.join(labRoot,'acceptance-80-input.json'),'utf8'));
 const gate=JSON.parse(fs.readFileSync(path.join(evidence,'gate-b-results.json'),'utf8'));
 const a=JSON.parse(fs.readFileSync(path.join(evidence,'GATE_A.json'),'utf8'));
 assert.equal(input.rows.length,80);assert.equal(new Set(input.rows.map(r=>r.id)).size,80);
 const results=new Map(gate.results.map(r=>[r.id,r]));
 const rows=input.rows.map(r=>{
  for(const test of r.tests)assert.ok(results.has(test),'Missing actual evidence '+test);
  const status=r.deferredReason?'DEFERRED':r.tests.every(t=>results.get(t).status==='PASS')?'PASS':'FAIL';
  return {id:r.id,scenario:r.scenario,originalLayer:r.originalLayer,status,scope:'LOCAL_SYNTHETIC_004B',
   evidence:r.tests.map(t=>({file:'gate-b-results.json',run:gate.run,test:t,status:results.get(t).status})),
   reason:r.deferredReason||'Prova executada em núcleo interno/fixtures/PostgreSQL real. Não aprova transporte, sessão/UI real ou política produtiva.',
   acceptanceCriterion:r.proof};
 }).sort((x,y)=>x.id.localeCompare(y.id));
 const additions=a.tests.filter(t=>t.id.startsWith('R01')||t.id.startsWith('R02')).map(t=>({id:t.id,status:t.status,evidence:'GATE_A.json'}));
 const summary=Object.fromEntries(['PASS','FAIL','DEFERRED'].map(s=>[s,rows.filter(r=>r.status===s).length]));
 json('case-results-80.json',{goal:'OMNI-PRINT-PERSISTENCIA-004B-CORE-SYNTHETIC',run:gate.run,node:gate.node,summary,
   independentKernelTests:{pass:gate.results.filter(r=>r.status==='PASS').length,fail:gate.results.filter(r=>r.status==='FAIL').length},
   originalIds:80,additionalR01R02:additions,rows});
 let md='# Matriz de aceitação 004B — 80 IDs preservados\n\nExecução '+gate.run+' em '+gate.node+'. PASS é restrito ao núcleo interno sintético e PostgreSQL descartável. Integração real, políticas D03/D04 e homologação permanecem separadas.\n\n';
 md+='Resultado: '+summary.PASS+' PASS, '+summary.FAIL+' FAIL, '+summary.DEFERRED+' DEFERRED. '+gate.results.length+' provas executáveis do núcleo. R01/R02 têm IDs adicionais.\n\n| ID | Estado | Cenário | Prova ou impedimento |\n|---|---|---|---|\n';
 for(const r of rows)md+='| '+r.id+' | '+r.status+' | '+r.scenario.replaceAll('|','/')+' | '+(r.status==='DEFERRED'?r.reason:r.evidence.map(e=>e.test).join(', ')).replaceAll('|','/')+' |\n';
 fs.writeFileSync(path.join(evidence,'CASE_RESULTS_80.md'),md);
 json('acceptance-input-integrity.json',{input:sha(fs.readFileSync(path.join(labRoot,'acceptance-80-input.json'))),rows:80,original004AStatusOverriddenOnlyInNewEvidence:true});
 console.log('MATRIX '+JSON.stringify(summary));
}
