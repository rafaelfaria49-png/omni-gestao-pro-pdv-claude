import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
import { root,labRoot,evidence,privateRoot,deps,run,json,sha,config,validateConfig,qualify } from './lab.mjs';
const require=createRequire(path.join(deps,'../package.json'));
export async function checks(){
 const out={node:process.version,typescript:JSON.parse(fs.readFileSync(path.join(deps,'typescript/package.json'))).version};
 for(const [name,args]of [['typecheck',[path.join(deps,'typescript/bin/tsc'),'--project',path.join(labRoot,'tsconfig.core.json')]],
  ['lint',[path.join(deps,'eslint/bin/eslint.js'),'--config',path.join(labRoot,'eslint.core.mjs'),'--no-cache','--debug','lib/print-core-synthetic','tools/print-core-004b/*.mjs','tools/print-core-004b/gate-b-run.ts']]]){
  try{run(process.execPath,args,{cwd:root,env:{...process.env},log:name+'.log',timeout:180000});out[name]={status:'PASS'};}
  catch(e){out[name]={status:'FAIL',message:e.message};}
 }
 try{
  const esbuild=require('esbuild');
  const result=await esbuild.build({entryPoints:[path.join(root,'lib/print-core-synthetic/core.ts')],bundle:true,platform:'node',format:'cjs',
   target:'node24',outfile:path.join(privateRoot,'build/core.cjs'),tsconfig:path.join(labRoot,'tsconfig.core.json'),metafile:true,logLevel:'silent'});
  const imported=Object.keys(result.metafile.inputs);
  assert.ok(imported.every(p=>p.replaceAll('\\','/').match(/lib\/(print-core-synthetic|auth\/(enterprise-permissions|access-policy)|vendas\/(venda-cupom-mapper|venda-detalhe-contract))/)));
  assert.ok(!imported.some(p=>p.includes('lib/prisma')||p.includes('auth.ts')||p.includes('/api/')));
  json('isolated-bundle-metafile.json',result.metafile);
  out.isolatedCoreBuild={status:'PASS',sha256:sha(fs.readFileSync(path.join(privateRoot,'build/core.cjs'))),externalImports:result.metafile.outputs[Object.keys(result.metafile.outputs)[0]].imports};
 }catch(e){out.isolatedCoreBuild={status:'FAIL',message:e.message};}
 const original=fs.readFileSync(path.join(labRoot,'scratch/original.sql'),'utf8');
 assert.equal(sha(original),'4F05F943112DF35AFE986CA8BC1B4CFCF15FC53B0AFA23328C5E9A786F2FD97F');
 const migration=fs.readFileSync(path.join(root,'prisma/migrations/20261030_print_core_synthetic_local/migration.sql'),'utf8');
 assert.equal(sha(qualify(original)),sha(migration),'R01-R04 pure correction reproducibility');
 out.sqlReproducibility={status:'PASS',original:sha(original),final:sha(migration)};
 const runner=fs.readFileSync(path.join(root,'scripts/vercel-build.mjs'),'utf8');
 const next=fs.readFileSync(path.join(root,'next.config.mjs'),'utf8');
 assert.ok(runner.includes("['npx', ['prisma', 'generate']]")&&runner.includes("['npx', ['prisma', 'migrate', 'deploy']]"));
 assert.ok(next.includes('dest: "public"'));
 out.fullApplicationBuild={status:'BLOCKED_NOT_RUN',command:'npm run build -> node scripts/vercel-build.mjs',
  inspected:[{file:'scripts/vercel-build.mjs',sha256:sha(runner)},{file:'next.config.mjs',sha256:sha(next)}],
  reasons:['Build wrapper invokes npx for Prisma generation and Next. Implicit downloads are prohibited.',
   'Isolated worktree has no node_modules and no generated/prisma. Shared dependency/cache outputs must not be mutated.',
   'Next PWA emits public/* outside the laboratory allowlist. Application build/config changes are not authorized.'],
  remoteMigrationsExecuted:false,dependenciesInstalled:false,focusedCoreBundleIsNotApplicationBuild:true};
 try{
  run(process.execPath,[path.join(deps,'prisma/build/index.js'),'validate','--schema',path.join(root,'prisma/schema.prisma')],{cwd:labRoot,env:(()=>{const c=validateConfig(config(),false);const u=new URL('postgresql://127.0.0.1:'+c.port+'/'+c.db);u.username=c.owner;u.password='SYNTHETIC_UNUSED_VALIDATION_ONLY';return{...process.env,DATABASE_URL:u.href,DIRECT_URL:u.href};})(),log:'final-prisma-validate.log'});
  out.materializedPrismaValidate={status:'PASS'};
 }catch(e){out.materializedPrismaValidate={status:'FAIL',message:e.message};}
 json('checks.json',out);
 console.log(JSON.stringify(out));
 if(['typecheck','lint','isolatedCoreBuild','materializedPrismaValidate'].some(k=>out[k].status!=='PASS'))process.exitCode=1;
}
