// Regressões observacionais completas, sem alterar testes ou esconder exits não zero.
import {spawn} from 'node:child_process';
import fs from 'node:fs';import path from 'node:path';
const root=path.resolve(import.meta.dirname,'../..'),base=process.argv.includes('--base');
const v=['node_modules/vitest/vitest.mjs','run'];
const jobs=base?[
 ['preview-full','frg',[...v,'components/operacoes-v4-preview/preview-honesty.test.ts']],
 ['fluxo007-full','fluxo007',[...v,'--config','test/ops-v4-fluxo-curto-007/vitest.config.ts']],
 ...[1,2,3].map(n=>['T56c-'+n,'fluxo007',[...v,'--config','test/ops-v4-fluxo-curto-007/vitest.config.ts','-t','T56c']]),
]:[
 ['fluxo001','fluxo006',[...v,'lib/operacoes-v4/entrada-readback.test.ts','lib/operacoes-v4/entrada-readback.integration.test.ts']],
 ['fluxo002-mounted','fluxo006',[...v,'--config','test/ops-v4-fluxo-curto-002/vitest.config.ts']],
 ['fluxo002-pg','fluxo006',[...v,'--config','test/ops-v4-financeiro-retirada-garantia-002/vitest-fluxo002-pg.config.mjs']],
 ['fluxo003','fluxo006',[...v,'--config','test/ops-v4-fluxo-curto-003/vitest.config.ts']],
 ['fluxo004','fluxo006',[...v,'--config','test/ops-v4-fluxo-curto-004/vitest.config.ts']],
 ['fluxo005','fluxo006',[...v,'--config','test/ops-v4-fluxo-curto-005/vitest.config.ts']],
 ['fluxo006','fluxo006',[...v,'--config','test/ops-v4-fluxo-curto-006/vitest.config.ts']],
 ['fluxo007-full','fluxo007',[...v,'--config','test/ops-v4-fluxo-curto-007/vitest.config.ts']],
 ...[1,2,3].map(n=>['T56c-'+n,'fluxo007',[...v,'--config','test/ops-v4-fluxo-curto-007/vitest.config.ts','-t','T56c']]),
 ['v3-misto-pg','misto',[...v,'--config','test/ops-v3-recebimento-misto/vitest.pg.config.ts']],
 ['v4-misto-pg','misto',[...v,'--config','test/ops-v4-recebimento-misto/vitest.pg.config.ts']],
 ['datas-pg','datas',[...v,'--config','test/ops-datas-retroativas-001/vitest.pg.config.ts']],
 ['preview-full','frg',[...v,'components/operacoes-v4-preview/preview-honesty.test.ts']],
];
const results=[];
for(const [name,group,command] of jobs){
 const args=['test/ops-v4-financeiro-retirada-garantia-002/qa-rev8.mjs','run',name,'--group='+group,'--frozen',...(base?['--base']:[]),'--',...command];
 console.log('OBSERVAÇÃO '+(base?'BASE ':'CANDIDATO ')+name);
 const child=spawn(process.execPath,args,{cwd:root,windowsHide:true,stdio:['ignore','inherit','inherit']});
 const exitCode=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('close',resolve)});
 results.push({name,group,command:args,exitCode});
}
let file=path.join(root,'docs/execution-tracks/ops-v4-financeiro-retirada-garantia/review-rev8',base?'baseline-regressions.json':'candidate-regressions.json');
if(fs.existsSync(file))file=file.replace(/\.json$/, '-'+Date.now()+'.json');
fs.writeFileSync(file,JSON.stringify({base,results},null,2)+'\n');
process.exitCode=results.some(r=>r.exitCode!==0)?1:0;
