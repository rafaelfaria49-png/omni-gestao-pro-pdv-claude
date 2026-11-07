// Read-only repository checks; writes this A6's report, never stages or commits.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {spawnSync}=require('node:child_process');
const {ROOT,OUT}=require('./sandbox.cjs');
const sha=p=>crypto.createHash('sha256').update(fs.readFileSync(path.join(ROOT,p))).digest('hex');
const baseline=JSON.parse(fs.readFileSync(path.join(OUT,'00-baseline.json'),'utf8'));
const checks=[];
const record=(name,pass,detail={})=>checks.push({name,pass:!!pass,...detail});
const git=(...args)=>{
 const r=spawnSync('git',args,{cwd:ROOT,encoding:'utf8',windowsHide:true,maxBuffer:4*1024*1024});
 if(r.status!==0)throw Error('git '+args[0]+' failed: '+r.stderr);return r.stdout;
};
const changed=Object.entries(baseline.tracked).filter(([p,h])=>!fs.existsSync(path.join(ROOT,p))||sha(p)!==h).map(([p])=>p);
record('Exactly script 07 changed among baseline tracked files',changed.length===1&&changed[0]===baseline.script,{tracked_count:Object.keys(baseline.tracked).length,changed});
const changedEvidence=Object.entries(baseline.evidence).filter(([p,h])=>!fs.existsSync(path.join(ROOT,p))||sha(p)!==h).map(([p])=>p);
record('All earlier evidence bytes preserved',changedEvidence.length===0,{files:Object.keys(baseline.evidence).length,changed:changedEvidence});
record('HEAD and index preserved',git('rev-parse','HEAD').trim()===baseline.head&&git('diff','--cached','--name-only')===baseline.index,{head:git('rev-parse','HEAD').trim(),index:git('diff','--cached','--name-only')});
const migrationHash=sha(baseline.migration),scriptHash=sha(baseline.script);
record('Original migration bytes and hash preserved',migrationHash==='f07242c4604660008b645004d3dfafde4da1656e728f803d9009f2f02a06a47e'&&sha(baseline.migration)===baseline.tracked[baseline.migration],{sha256:migrationHash,bytes:fs.statSync(path.join(ROOT,baseline.migration)).size});
for(const name of ['03-proof-04.json','04-scale-edge-proof-01.json']){
 const r=JSON.parse(fs.readFileSync(path.join(OUT,name),'utf8'));
 record('Complete proof matches current script: '+name,r.pass&&r.script_sha256===scriptHash&&r.synthetic_only&&r.production_connections===0&&r.vercel_operations===0,{checks:r.results.length,failed:r.results.filter(c=>!c.pass)});
}
record('No default application Prisma client generated',!fs.existsSync(path.join(ROOT,'node_modules/.prisma/client')),{baseline_client_files:Object.keys(baseline.appClient).length});
record('Owned disposable cluster has no postmaster.pid',!fs.existsSync(path.join(OUT,'.scratch/pg17-data/postmaster.pid')));
const syntax=[];
for(const f of fs.readdirSync(__dirname).filter(x=>x.endsWith('.cjs'))){
 const r=spawnSync(process.execPath,['--check',path.join(__dirname,f)],{encoding:'utf8',windowsHide:true});
 syntax.push({file:f,pass:r.status===0,error:r.stderr||null});
}
record('All A6 Node harnesses parse',syntax.every(r=>r.pass),{files:syntax});
const markdown=[];
for(const name of ['README.md','06-independent-review.md']){
 const p=path.join(OUT,name);
 if(!fs.existsSync(p)){markdown.push({file:name,pass:false,missing:true});continue;}
 const content=fs.readFileSync(p,'utf8');
 const links=[...content.matchAll(/\[[^\]]+\]\(([^)\s]+)\)/g)].map(m=>m[1]).filter(x=>!/^https?:\/\//.test(x));
 const missing=links.filter(x=>!fs.existsSync(path.resolve(OUT,x.split('#')[0])));
 markdown.push({file:name,pass:missing.length===0&&(content.match(/^```/gm)||[]).length%2===0,local_links:links.length,missing});
}
record('A6 Markdown local references and code fences',markdown.every(m=>m.pass),{files:markdown});
const diff=spawnSync('git',['diff','--check'],{cwd:ROOT,encoding:'utf8',windowsHide:true});
record('git diff --check',diff.status===0,{output:(diff.stdout+diff.stderr).trim()});
fs.writeFileSync(path.join(OUT,'05-guard-diff.patch'),git('diff','--',baseline.script));
const status=git('status','--short');
const hashManifest={};
for(const d of ['harness','baseline'])for(const f of fs.readdirSync(path.join(OUT,d))){
 const p=path.join(OUT,d,f);if(fs.statSync(p).isFile())hashManifest[d+'/'+f]=crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
}
const report={finished_at:new Date().toISOString(),pass:checks.every(c=>c.pass),checks,script_sha256:scriptHash,migration_sha256:migrationHash,status,source_hashes:hashManifest,commit:'NONE',push:false,merge:false};
fs.writeFileSync(path.join(OUT,'05-local-integrity.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({pass:report.pass,checks:checks.map(({name,pass})=>({name,pass})),script_sha256:scriptHash,migration_sha256:migrationHash},null,2));
if(!report.pass)process.exitCode=1;
