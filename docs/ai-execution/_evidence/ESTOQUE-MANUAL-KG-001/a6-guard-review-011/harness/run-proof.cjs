const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {spawn,spawnSync}=require('node:child_process');
const pg=require('./sandbox.cjs');
const VERSION=process.argv[2]||'01';
if(!/^\d{2}$/.test(VERSION))throw Error('Two-digit evidence version required');
const DB='a6_final_'+VERSION,results=[],detail={};
const emit=(name,pass,info={})=>{results.push({name,pass:!!pass,...info});if(!pass)throw Error('Assertion failed: '+name);};
const hash=s=>crypto.createHash('sha256').update(s).digest('hex');
const scalar=(db,sql)=>pg.must(db,sql);
const json=(db,sql)=>JSON.parse(scalar(db,sql));
const fixture=fs.readFileSync(path.join(__dirname,'fixture-old.sql'),'utf8');
const migration=fs.readFileSync(path.join(pg.ROOT,'prisma/migrations/20261025120000_estoque_quantidade_fracionada/migration.sql'),'utf8');
const script=fs.readFileSync(path.join(pg.ROOT,'docs/padaria/pesagem/rollout/07-guard-check-opcional.sql'),'utf8');
const targets=[
  {table:'estoque_produtos',column:'stock',constraint:'estoque_produtos_stock_kg_milesimos',id:'a6-kg'},
  {table:'produto_depositos',column:'quantidade',constraint:'produto_depositos_quantidade_kg_milesimos',id:'a6-dep-kg'},
  {table:'movimentacoes_estoque',column:'quantidade',constraint:'movimentacoes_estoque_quantidade_kg_milesimos',id:'a6-ledger-kg'},
  {table:'movimentacoes_estoque',column:'estoqueAntes',constraint:'movimentacoes_estoque_estoqueAntes_kg_milesimos',id:'a6-ledger-kg'},
  {table:'movimentacoes_estoque',column:'estoqueDepois',constraint:'movimentacoes_estoque_estoqueDepois_kg_milesimos',id:'a6-ledger-kg'}
];
const dataHash=db=>scalar(db,`SELECT md5(coalesce(string_agg(row_text,E'\n' ORDER BY row_text),'')) FROM (
 SELECT 'p:'||to_jsonb(p)::text row_text FROM public.estoque_produtos p UNION ALL
 SELECT 'd:'||to_jsonb(d)::text FROM public.produto_depositos d UNION ALL
 SELECT 'm:'||to_jsonb(m)::text FROM public.movimentacoes_estoque m UNION ALL
 SELECT 's:'||to_jsonb(s)::text FROM public.a6_sales s) x;`);
function prepare(db,migrate=true){pg.createDb(db);pg.must(db,fixture);if(migrate)pg.must(db,migration,{single:true});}
function update(t,expression){return `UPDATE public."${t.table}" SET "${t.column}"=${expression} WHERE id='${t.id}';`;}
function apply(db,s=script){const start=performance.now();const r=pg.psql(db,s,{single:true});return {...r,elapsed_ms:Math.round(performance.now()-start)};}
const constraintCount=db=>Number(scalar(db,"SELECT count(*) FROM pg_constraint WHERE conname LIKE '%_kg_milesimos';"));
function safePrismaEnv(db){return pg.cleanEnv({A6_TEST_DATABASE_URL:pg.url(db),DATABASE_URL:pg.url(db),DIRECT_URL:pg.url(db),
  CHECKPOINT_DISABLE:'1',PRISMA_HIDE_UPDATE_MESSAGE:'1',PRISMA_GENERATE_SKIP_AUTOINSTALL:'1',
  PRISMA_QUERY_ENGINE_LIBRARY:path.join(pg.ROOT,'node_modules/@prisma/engines/query_engine-windows.dll.node')});}
function schema(type){return `generator client {
 provider = "prisma-client-js"
 output = "./client"
}
datasource db {
 provider = "postgresql"
 url = env("A6_TEST_DATABASE_URL")
}
model Produto {
 id String @id
 stock ${type} @default(0)
 metadata Json? @db.JsonB
 @@map("estoque_produtos")
}
model ProdutoDeposito {
 id String @id
 produtoId String
 quantidade ${type} @default(0)
 @@map("produto_depositos")
}
model MovimentacaoEstoque {
 id String @id
 produtoId String?
 quantidade ${type}
 estoqueAntes ${type}
 estoqueDepois ${type}
 @@map("movimentacoes_estoque")
}
model A6Sale {
 id String @id
 quantidade Float
 @@map("a6_sales")
}
`;}
function cli(db,args,cwd){
 const r=spawnSync(process.execPath,[path.join(pg.ROOT,'node_modules/prisma/build/index.js'),...args],
  {cwd,env:safePrismaEnv(db),encoding:'utf8',timeout:60000,windowsHide:true,maxBuffer:4*1024*1024});
 return {status:r.status,out:r.stdout||'',err:r.stderr||''};
}
async function clientProof(db){
 const clients={};
 for(const [version,type]of [['old','Int'],['new','Float']]){
  const dir=path.join(pg.SCRATCH,'prisma-'+VERSION+'-'+version);fs.mkdirSync(dir,{recursive:true});
  fs.writeFileSync(path.join(dir,'package.json'),JSON.stringify({name:'a6-isolated-'+version,version:'0.0.0',private:true}));
  fs.writeFileSync(path.join(dir,'schema.prisma'),schema(type));
  const r=cli(db,['generate','--schema',path.join(dir,'schema.prisma'),'--no-hints'],dir);
  emit('Generate isolated Prisma '+version,r.status===0,{output:r.out.trim(),stderr:r.err.trim()});
  const c=require(path.join(dir,'client'));clients[version]=new c.PrismaClient({datasources:{db:{url:pg.url(db)}},log:[]});
  clients[version].$a6dir=dir;
 }
 const old=clients.old,modern=clients.new;
 detail.prisma_versions={cli:require(path.join(pg.ROOT,'node_modules/prisma/package.json')).version,
  client_package:require(path.join(pg.ROOT,'node_modules/@prisma/client/package.json')).version};
 try {
  for(const c of [old,modern]){
   const rows=await c.$queryRawUnsafe(`SELECT current_database() AS db,host(inet_server_addr()) AS host,inet_server_port() AS port,current_setting('neon.project_id',true) AS neon`);
   emit('Prisma identity '+(c===old?'old':'new'),rows[0].db===db&&rows[0].host==='127.0.0.1'&&Number(rows[0].port)===pg.state().port&&rows[0].neon===null,{local_database:rows[0].db,local_host:rows[0].host,local_port:Number(rows[0].port)});
  }
  require(path.join(pg.ROOT,'node_modules/tsx/dist/cjs/index.cjs'));
  const quantity=require(path.join(pg.ROOT,'lib/estoque/stock-quantity.ts'));
  emit('Canonical helper rejects counterexamples',[0.30000000000000004,1.0000000000000002,0.0005].every(v=>quantity.toStockUnits(v,'KG')===null));
  detail.helper_limits={un_fraction_rejected:quantity.toStockUnits(1.001,'UN')===null,
    kg_unit_limit_rejected:quantity.toStockUnits(1000000000000,'KG')===null};
  const reset=()=>pg.must(db,"UPDATE public.estoque_produtos SET stock=13 WHERE id='a6-un'; UPDATE public.produto_depositos SET quantidade=13 WHERE id='a6-dep-un';");
  async function rejected(name,fn){const before=dataHash(db);let error=null;try{await fn();}catch(e){
   const diagnostic=String(e.message)+' '+JSON.stringify(e.meta||{});
   error={name:e.name,code:e.code||null,sqlstate:diagnostic.match(/23514/)?.[0]||null};}
   const unchanged=dataHash(db)===before;
   emit(name,!!error&&error.sqlstate==='23514'&&unchanged,{error,unchanged});}
  for(const value of [12,-1,2147483647]){reset();await rejected('Old Prisma absolute '+value,()=>old.produto.update({where:{id:'a6-un'},data:{stock:value}}));}
  reset();await old.produto.update({where:{id:'a6-un'},data:{stock:0}});
  emit('Old Prisma zero remains a known bypass',scalar(db,"SELECT stock::text FROM public.estoque_produtos WHERE id='a6-un';")==='0');
  const noops=[];
  for(const operation of ['increment','decrement']){reset();const before=dataHash(db);
   await old.produto.update({where:{id:'a6-un'},data:{stock:{[operation]:1}}});
   const stock=scalar(db,"SELECT stock::text FROM public.estoque_produtos WHERE id='a6-un';");
   emit('Old Prisma '+operation+' silent no-op reproduced',stock==='13'&&dataHash(db)===before,{actual_stock:stock,intended_stock:operation==='increment'?14:12});noops.push(operation);}
  detail.old_prisma={absolute_nonzero:'blocked',zero:'accepted',increment_decrement:'silent no-op at nonzero balance',operations:noops};
  console.log('Old Prisma: nonzero set blocked; zero and increment/decrement no-op reproduced');
  pg.must(db,"UPDATE public.estoque_produtos SET stock=0 WHERE id='a6-un';");
  await rejected('Old increment from zero yields denormal and is blocked',()=>old.produto.update({where:{id:'a6-un'},data:{stock:{increment:1}}}));
  reset();await rejected('Old Prisma deposit absolute',()=>old.produtoDeposito.update({where:{id:'a6-dep-un'},data:{quantidade:5}}));
  await rejected('Old Prisma ledger binary Int',()=>old.movimentacaoEstoque.create({data:{id:'old-bad-ledger',produtoId:'a6-un',quantidade:2,estoqueAntes:13,estoqueDepois:11}}));
  reset();await rejected('Old Prisma whole sale transaction rollback',()=>old.$transaction(async tx=>{
   await tx.a6Sale.create({data:{id:'old-sale-rollback',quantidade:1}});
   await tx.produto.update({where:{id:'a6-un'},data:{stock:12}});
   await tx.movimentacaoEstoque.create({data:{id:'old-ledger-rollback',produtoId:'a6-un',quantidade:1,estoqueAntes:13,estoqueDepois:12}});
  }));
  const kgValues=[0,0.001,-0.001,0.1,0.3,1.234,-1.234,3.96,999999999999.999,-999999999999.999];
  for(const value of kgValues){await modern.produto.update({where:{id:'a6-kg'},data:{stock:value}});
   const row=await modern.produto.findUnique({where:{id:'a6-kg'}});emit('New Prisma KG '+value,row.stock===value&&quantity.toStockUnits(row.stock,'KG')!==null);}
  for(const value of [0,1,-1,2147483648,-2147483648,999999999999999,-999999999999999]){
   await modern.produto.update({where:{id:'a6-un'},data:{stock:value}});emit('New Prisma UN '+value,(await modern.produto.findUnique({where:{id:'a6-un'}})).stock===value);}
  detail.new_prisma_precision=[];
  for(const value of [0.1+0.2,1.0000000000000002,0.0005]){
   const before=dataHash(db);let error=null,returned=null;
   try{returned=(await modern.produto.update({where:{id:'a6-kg'},data:{stock:value}})).stock;}
   catch(e){const text=String(e.message)+' '+JSON.stringify(e.meta||{});error={name:e.name,sqlstate:text.match(/23514/)?.[0]||null};}
   const stored=Number(scalar(db,"SELECT stock::text FROM public.estoque_produtos WHERE id='a6-kg';"));
   const entry={javascript_input:String(value),returned,stored,error,
    normalized_before_constraint:!error&&stored!==value&&quantity.toStockUnits(stored,'KG')!==null};
   emit('New Prisma precision: blocked or normalized before DB '+value,error?error.sqlstate==='23514'&&dataHash(db)===before:entry.normalized_before_constraint&&returned===stored,entry);
   detail.new_prisma_precision.push(entry);
  }
  await modern.produto.update({where:{id:'a6-kg'},data:{stock:0}});
  await modern.produtoDeposito.update({where:{id:'a6-dep-kg'},data:{quantidade:0}});
  let units=0;
  const movements=[2500,750,-125,125];
  for(let i=0;i<movements.length;i++){
   const delta=movements[i],before=units,after=units+delta;
   await modern.$transaction(async tx=>{
    const value=quantity.fromStockUnits(after,'KG');
    await tx.produto.update({where:{id:'a6-kg'},data:{stock:value}});
    await tx.produtoDeposito.update({where:{id:'a6-dep-kg'},data:{quantidade:value}});
    await tx.movimentacaoEstoque.create({data:{id:'canonical-'+i,produtoId:'a6-kg',quantidade:quantity.fromStockUnits(delta,'KG'),estoqueAntes:quantity.fromStockUnits(before,'KG'),estoqueDepois:value}});
    if(delta<0)await tx.a6Sale.create({data:{id:'synthetic-kg-sale',quantidade:quantity.fromStockUnits(-delta,'KG')}});
   }); units=after;
  }
  const p=await modern.produto.findUnique({where:{id:'a6-kg'}}),d=await modern.produtoDeposito.findUnique({where:{id:'a6-dep-kg'}});
  const ledger=await modern.movimentacaoEstoque.findMany({where:{id:{startsWith:'canonical-'}},orderBy:{id:'asc'}});
  emit('Canonical KG entry/exit/reversal preserves stock-deposit-ledger',p.stock===3.25&&d.quantidade===3.25&&ledger.length===4&&ledger.every((m,i)=>m.estoqueDepois===quantity.fromStockUnits(movements.slice(0,i+1).reduce((a,b)=>a+b,0),'KG')));
  detail.future_manual_kg={stock_transaction_scenario:'PASS',entries_exits_reversals:true,parallel_feature_code_not_inspected:true,
    actual_sale_model_integration_certified:false,requirement:'integer smallest-unit arithmetic and one atomic transaction'};
  await rejected('New Prisma invalid later ledger rolls back prior sale/stock/deposit',()=>modern.$transaction(async tx=>{
   await tx.a6Sale.create({data:{id:'new-sale-rollback',quantidade:0.001}});
   await tx.produto.update({where:{id:'a6-kg'},data:{stock:3.249}});
   await tx.produtoDeposito.update({where:{id:'a6-dep-kg'},data:{quantidade:3.249}});
   await tx.movimentacaoEstoque.create({data:{id:'new-ledger-rollback',produtoId:'a6-kg',quantidade:0.0005,estoqueAntes:3.25,estoqueDepois:3.249}});
  }));
  await Promise.all([old.$disconnect(),modern.$disconnect()]);
  const diff=cli(db,['migrate','diff','--from-schema-datasource',path.join(modern.$a6dir,'schema.prisma'),
    '--to-schema-datamodel',path.join(modern.$a6dir,'schema.prisma'),'--exit-code'],modern.$a6dir);
  emit('Prisma diff ignores CHECK and otherwise matches synthetic schema',diff.status===0,{output:diff.out.trim(),stderr:diff.err.trim()});
 } finally {await Promise.allSettled([old.$disconnect(),modern.$disconnect()]);}
}
function sqlMatrix(db){
 const good=[0,0.001,-0.001,0.1,-0.1,0.3,3.96,1234.567,-1234.567,999999999999.999,-999999999999.999,2147483647,-2147483648,2147483648,999999999999999,-999999999999999];
 const bad=['NaN','Infinity','-Infinity','1000000000000000','-1000000000000000','0.0001','-0.0001','1.2345','-1.2345','0.30000000000000004','-0.30000000000000004','1.0000000000000002','999999999999.9989','999999999999998.5','5e-324','-5e-324'];
 detail.matrix=[];
 for(const t of targets){
  for(const value of good){const r=pg.psql(db,update(t,`'${value}'::float8`));emit('SQL valid '+t.table+'.'+t.column+'='+value,r.ok);}
  for(const value of bad){const before=dataHash(db);const r=pg.psql(db,update(t,`'${value}'::float8`),{verbose:true});
   const expectedConstraint=scalar(db,`SELECT conname FROM pg_constraint WHERE conname='${t.constraint}';`);
   const constraint=(r.err.match(/violates check constraint "([^"]+)"/)||[])[1];
   emit('SQL invalid '+t.table+'.'+t.column+'='+value,!r.ok&&/23514/.test(r.err)&&dataHash(db)===before&&expectedConstraint===t.constraint&&constraint===t.constraint,{sqlstate:'23514',constraint});
   detail.matrix.push({table:t.table,column:t.column,value,rejected:!r.ok,sqlstate:/23514/.test(r.err)?'23514':null,constraint});}
  const r=pg.psql(db,update(t,'NULL'));emit('NOT NULL '+t.table+'.'+t.column,!r.ok&&/23502/.test(r.err));
  console.log('SQL matrix complete: '+t.table+'.'+t.column);
 }
 // CHECK alone permits unknown/NULL; actual production-model columns are NOT NULL.
 const nullable=json(db,`SELECT json_build_object('null_expression_is_unknown',(NULL::float8 <> 'NaN'::float8 AND abs(NULL::float8)<=999999999999999 AND round(NULL::numeric,3)::float8=NULL::float8) IS NULL);`);
 emit('NULL CHECK semantics documented',nullable.null_expression_is_unknown);
 pg.must(db,"CREATE TEMP TABLE a6_nullable(v float8 CHECK (v <> 'NaN'::float8 AND abs(v)<=999999999999999 AND round(v::numeric,3)::float8=v)); INSERT INTO a6_nullable VALUES(NULL);");
 // SQL arrays are generated independently from integer thousandths. No decimal arithmetic as oracle.
 const sweep=json(db,`SELECT json_build_object('tested',count(*),'rejected',count(*) FILTER(WHERE NOT (v <> 'NaN'::float8 AND abs(v)<=999999999999999 AND round(v::numeric,3)::float8=v)))
 FROM (SELECT m::float8/1000 AS v FROM generate_series(-100000,100000) m UNION ALL
 SELECT m::float8/1000 FROM generate_series(999999999989999::bigint,999999999999999::bigint) m UNION ALL
 SELECT -(m::float8/1000) FROM generate_series(999999999989999::bigint,999999999999999::bigint) m) x;`);
 emit('Canonical KG sweep no false positives',sweep.rejected===0,{...sweep});
 detail.kg_sweep=sweep;
 const unitCases=[['UN',1.001],['KG',1000000000000]];
 for(const [unit,value]of unitCases){const r=pg.psql(db,update({...targets[0],id:unit==='UN'?'a6-un':'a6-kg'},String(value)));emit('Known scalar/unit limitation '+unit,r.ok,{accepted:value,semantic_unit_domain:'must be rejected by application boundary'});}
 // A NULL physical schema change is refused before any guard DDL.
 const integerDomain=json(db,`SELECT json_build_object('tested',count(*),'rejected',count(*) FILTER(WHERE NOT (abs(v)<=999999999999999 AND round(v::numeric,3)::float8=v))) FROM (
 SELECT 999999999999999::float8-g FROM generate_series(0,10000) g UNION ALL SELECT -999999999999999::float8+g FROM generate_series(0,10000) g) x(v);`);
 emit('UN integer upper/lower boundary sweep',integerDomain.rejected===0,integerDomain);
 detail.un_sweep=integerDomain;
}
function failureAndRollbackProof(){
 const wrong='a6_before_migration_'+VERSION;prepare(wrong,false);const h=dataHash(wrong),r=apply(wrong);
 emit('Guard refuses old integer schema atomically',!r.ok&&/P0001/.test(r.err)&&constraintCount(wrong)===0&&dataHash(wrong)===h);
 for(let i=0;i<targets.length;i++){
  const db='a6_corrupt_'+VERSION+'_'+i;prepare(db);pg.must(db,update(targets[i],"'0.30000000000000004'::float8"));
  const before=dataHash(db),r=apply(db);
  emit('Preexisting corruption causes whole DDL rollback '+targets[i].column,!r.ok&&/23514/.test(r.err)&&constraintCount(db)===0&&dataHash(db)===before);
  pg.must(db,update(targets[i],'0'));emit('Recovery after synthetic correction '+i,apply(db).ok&&constraintCount(db)===5);
 }
 const db='a6_nullable_'+VERSION;prepare(db);pg.must(db,'ALTER TABLE public.estoque_produtos ALTER COLUMN stock DROP NOT NULL;');
 emit('Guard refuses nullable schema atomically',!apply(db).ok&&constraintCount(db)===0);
}
async function lockProof(){
 const db='a6_lock_'+VERSION;prepare(db);const before=dataHash(db);
 const sql=pg.guard(db)+"BEGIN; LOCK TABLE public.movimentacoes_estoque IN ACCESS SHARE MODE; SELECT 'A6_BLOCKER_READY'; SELECT pg_sleep(8); ROLLBACK;";
 const child=spawn(path.join(pg.BIN,'psql.exe'),['-X','-w','-q','-A','-t','-v','ON_ERROR_STOP=1','-f','-'],
  {env:pg.environment(db),windowsHide:true,stdio:['pipe','pipe','pipe']});
 child.stdin.end(sql);
 const ended=new Promise(resolve=>child.on('exit',code=>resolve(code)));
 await new Promise((resolve,reject)=>{let text='';child.stdout.on('data',chunk=>{text+=chunk;if(text.includes('A6_BLOCKER_READY'))resolve();});child.on('error',reject);child.on('exit',code=>{if(!text.includes('A6_BLOCKER_READY'))reject(Error('Blocker failed: '+code));});});
 const r=apply(db);emit('Lock timeout rolls back earlier constraints',!r.ok&&/55P03/.test(r.err)&&constraintCount(db)===0&&dataHash(db)===before,{elapsed_ms:r.elapsed_ms,sqlstate:'55P03'});
 emit('Owned blocker released cleanly',(await ended)===0);
 // Inspect locks after ADD and VALIDATE, before transaction rollback.
 const locks=json(db,'BEGIN;\n'+script+`\nSELECT count(DISTINCT relation) AS a6_exclusive FROM pg_locks WHERE pid=pg_backend_pid() AND mode='AccessExclusiveLock' AND relation IN ('public.estoque_produtos'::regclass,'public.produto_depositos'::regclass,'public.movimentacoes_estoque'::regclass) \\gset\nROLLBACK;
 SELECT json_build_object('exclusive_relations',:a6_exclusive,'role_restored',current_user='${pg.ADMIN}','lock_timeout_restored',current_setting('lock_timeout')='0','statement_timeout_restored',current_setting('statement_timeout')='0');`);
 emit('ACCESS EXCLUSIVE held on all three until rollback',locks.exclusive_relations===3&&constraintCount(db)===0,locks);
 emit('Role and local timeouts restored after rollback',locks.role_restored&&locks.lock_timeout_restored&&locks.statement_timeout_restored);
 const timeout=pg.psql(db,'BEGIN;\n'+script+"\nSET LOCAL statement_timeout='10ms'; SELECT pg_sleep(0.1); COMMIT;");
 emit('Statement failure rolls back whole guard transaction',!timeout.ok&&/57014/.test(timeout.err)&&constraintCount(db)===0&&dataHash(db)===before,{sqlstate:'57014'});
 emit('Retry after lock/failure works',apply(db).ok&&constraintCount(db)===5);
}
async function main(){
 pg.resume();emit('Original migration hash preserved',hash(migration.replace(/\r\n/g,'\n'))==='f07242c4604660008b645004d3dfafde4da1656e728f803d9009f2f02a06a47e');
 prepare(DB,false);const before=json(DB,"SELECT json_agg(stock ORDER BY id) FROM public.estoque_produtos;");
 pg.must(DB,migration,{single:true});const after=json(DB,"SELECT json_agg(stock ORDER BY id) FROM public.estoque_produtos;");
 emit('Original migration preserves all synthetic int4 values',JSON.stringify(before)===JSON.stringify(after));
 const oldTypes=json(DB,`SELECT json_agg(json_build_object('column',a.attname,'type',format_type(a.atttypid,a.atttypmod),'not_null',a.attnotnull) ORDER BY c.relname,a.attname) FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND (c.relname,a.attname) IN (('estoque_produtos','stock'),('produto_depositos','quantidade'),('movimentacoes_estoque','quantidade'),('movimentacoes_estoque','estoqueAntes'),('movimentacoes_estoque','estoqueDepois'));`);
 emit('Five Float NOT NULL fields match Prisma contracts',oldTypes.length===5&&oldTypes.every(c=>c.type==='double precision'&&c.not_null));
 pg.must(DB,"UPDATE public.estoque_produtos SET stock=3.25 WHERE id='a6-kg';UPDATE public.produto_depositos SET quantidade=3.25 WHERE id='a6-dep-kg';UPDATE public.movimentacoes_estoque SET quantidade=3.25,\"estoqueAntes\"=0,\"estoqueDepois\"=3.25 WHERE id='a6-ledger-kg';");
 const h=dataHash(DB),applied=apply(DB);emit('Apply exact corrected script to valid UN/KG',applied.ok&&dataHash(DB)===h,{elapsed_ms:applied.elapsed_ms});
 detail.catalog=json(DB,`SELECT json_agg(json_build_object('name',conname,'validated',convalidated,'definition',pg_get_constraintdef(oid)) ORDER BY conname) FROM pg_constraint WHERE conname LIKE '%_kg_milesimos';`);
 emit('Five expected validated CHECK constraints exist',detail.catalog.length===5&&targets.every(t=>detail.catalog.some(c=>c.name===t.constraint&&c.validated)));
 sqlMatrix(DB);
 console.log('All SQL value sweeps passed; starting actual old/new Prisma clients');
 await clientProof(DB);
 console.log('Prisma binary-client proofs passed; starting failure and lock cases');
 const count=constraintCount(DB),h2=dataHash(DB),duplicate=apply(DB);emit('Duplicate application refuses without state change',!duplicate.ok&&/42710/.test(duplicate.err)&&constraintCount(DB)===count&&dataHash(DB)===h2);
 pg.must(DB,targets.map(t=>`ALTER TABLE public."${t.table}" DROP CONSTRAINT "${t.constraint}";`).join('\n'),{single:true});
 emit('Explicit local guard removal preserves values/types',constraintCount(DB)===0&&dataHash(DB)===h2);
 emit('Guard reapplication after explicit local removal',apply(DB).ok&&constraintCount(DB)===5);
 failureAndRollbackProof();await lockProof();
}
(async()=>{
 const started=new Date().toISOString();
 try{await main();}catch(e){results.push({name:'Harness completion',pass:false,error:e.message});process.exitCode=1;}
 finally{
  try{const stopped=pg.stop();results.push({name:'Owned local PostgreSQL stopped',pass:stopped.owned_cluster_stopped});}catch(e){results.push({name:'Owned local PostgreSQL stopped',pass:false,error:e.message});process.exitCode=1;}
  const report={started_at:started,finished_at:new Date().toISOString(),postgres:'17.10',script_sha256:hash(script.replace(/\r\n/g,'\n')),migration_sha256:hash(migration.replace(/\r\n/g,'\n')),synthetic_only:true,production_connections:0,vercel_operations:0,pass:results.every(r=>r.pass),results,detail};
  fs.writeFileSync(path.join(pg.OUT,'03-proof-'+VERSION+'.json'),JSON.stringify(report,null,2)+'\n',{flag:'wx'});
  console.log(JSON.stringify({pass:report.pass,checks:results.length,passed:results.filter(r=>r.pass).length,failed:results.filter(r=>!r.pass),script_sha256:report.script_sha256,detail_summary:{kg_sweep:detail.kg_sweep,un_sweep:detail.un_sweep,old_prisma:detail.old_prisma}},null,2));
 }
})();
