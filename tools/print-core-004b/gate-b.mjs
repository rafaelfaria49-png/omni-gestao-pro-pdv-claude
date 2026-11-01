import path from 'node:path';
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {config,validateConfig,psql,run,json,labRoot,evidence,deps} from './lab.mjs';
export function restrictRuntime() {
 const c=config();validateConfig(c);
 psql(c,'owner','REVOKE SELECT ON public.admin_users FROM "'+c.runtime+'"; GRANT SELECT(id,role,active,"mustChangePassword","accessScope","sessionVersion","lojaId") ON public.admin_users TO "'+c.runtime+'";',{log:'runtime-column-restriction.log'});
 let rejected=false;
 try{psql(c,'runtime','SELECT password FROM public.admin_users LIMIT 1;',{log:'ROLE-NO-PASSWORD.log'});}
 catch(e){assert.match(e.output,/42501/);assert.match(e.output,/permission denied/);rejected=true;}
 assert.equal(rejected,true);
 const allowed=psql(c,'runtime','SELECT id,role,active,"mustChangePassword","accessScope","sessionVersion" FROM public.admin_users LIMIT 1;',{log:'ROLE-AUTH-METADATA.log'});
 assert.ok(allowed.stdout.trim());
 json('independent-review-A-remediation.json',{finding:'P2 table-wide admin_users SELECT',status:'FIXED_AND_EXECUTED',deniedColumn:'password',sqlstate:'42501',allowedColumns:['id','role','active','mustChangePassword','accessScope','sessionVersion','lojaId'],productionGrantsChanged:false});
 const a=JSON.parse(fs.readFileSync(path.join(evidence,'GATE_A.json'),'utf8'));
 a.leastPrivilege.adminUserSelectColumns=['id','role','active','mustChangePassword','accessScope','sessionVersion','lojaId'];
 a.leastPrivilege.passwordRead=false;
 json('GATE_A.json',a);
}
export async function gateB() {
 assert.equal(JSON.parse(fs.readFileSync(path.join(evidence,'GATE_A.json'),'utf8')).status,'PASS');
 restrictRuntime();
 run(process.execPath,[path.join(deps,'tsx/dist/cli.mjs'),'--tsconfig',path.join(labRoot,'tsconfig.core.json'),path.join(labRoot,'gate-b-run.ts')],{cwd:labRoot,env:{...process.env},log:'gate-b-execution.log',timeout:180000});
 console.log('GATE B executed; inspect per-test status and 80-case mapping');
}
