// Additional physical validation at synthetic scale and session-format edge cases.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const pg=require('./sandbox.cjs');
const rows=[],details={};
const record=(name,pass,data={})=>{rows.push({name,pass:!!pass,...data});if(!pass)throw Error(name);};
const script=fs.readFileSync(path.join(pg.ROOT,'docs/padaria/pesagem/rollout/07-guard-check-opcional.sql'),'utf8');
const sha=crypto.createHash('sha256').update(script.replace(/\r\n/g,'\n')).digest('hex');
const BASE_VERSION=process.argv[2]||'03';
const ATTEMPT=process.argv[3]||'01';
if(!/^\d{2}$/.test(BASE_VERSION)||!/^\d{2}$/.test(ATTEMPT))throw Error('Two-digit proof versions required');
const DB='a6_scale_edges_'+ATTEMPT;
const json=sql=>JSON.parse(pg.must(DB,sql));
const snapshot=()=>pg.must(DB,`SELECT md5(string_agg(s,E'\n' ORDER BY s)) FROM (
 SELECT to_jsonb(p)::text s FROM public.estoque_produtos p UNION ALL SELECT to_jsonb(d)::text FROM public.produto_depositos d
 UNION ALL SELECT to_jsonb(m)::text FROM public.movimentacoes_estoque m) x;`);
let started=false;
try {
 const main=JSON.parse(fs.readFileSync(path.join(pg.OUT,'03-proof-'+BASE_VERSION+'.json'),'utf8'));
 record('Main proof complete at the same candidate hash',main.pass&&main.script_sha256===sha);
 pg.resume();started=true;
 pg.createDb(DB);pg.must(DB,fs.readFileSync(path.join(__dirname,'fixture-old.sql'),'utf8'));
 pg.must(DB,fs.readFileSync(path.join(pg.ROOT,'prisma/migrations/20261025120000_estoque_quantidade_fracionada/migration.sql'),'utf8'),{single:true});
 pg.must(DB,`CREATE TEMP TABLE a6_numbers AS SELECT g,
   CASE WHEN g%2=0 THEN (g::bigint*9999999967)::float8 ELSE (g::bigint*9999999967)::float8/1000 END AS v
   FROM generate_series(1,100000) g;
 INSERT INTO public.estoque_produtos(id,stock,metadata) SELECT 'scale-p-'||g,v,
   CASE WHEN g%2=0 THEN '{"comercial":{"version":1,"modoVenda":"unidade","unidade":"UN","basePreco":"UN"}}'::jsonb
   ELSE '{"comercial":{"version":1,"modoVenda":"peso","unidade":"KG","basePreco":"KG"}}'::jsonb END FROM a6_numbers;
 INSERT INTO public.produto_depositos(id,"produtoId",quantidade) SELECT 'scale-d-'||g,'scale-p-'||g,v FROM a6_numbers;
 INSERT INTO public.movimentacoes_estoque(id,"produtoId",quantidade,"estoqueAntes","estoqueDepois")
 SELECT 'scale-m-'||g,'scale-p-'||g,v,0,v FROM a6_numbers;`);
 const before=snapshot(),validationStarted=performance.now();
 const applied=pg.psql(DB,script,{single:true});const elapsed=Math.round(performance.now()-validationStarted);
 record('Physical validation of 300000 additional canonical rows',applied.ok,{elapsed_ms:elapsed,added_rows_per_table:100000,projected_production_duration:false,error:applied.err.trim()||null});
 record('No data change during scaled validation',snapshot()===before);
 const catalog=json("SELECT json_agg(json_build_object('name',conname,'validated',convalidated) ORDER BY conname) FROM pg_constraint WHERE conname LIKE '%_kg_milesimos';");
 record('All five CHECKs validated at synthetic scale',catalog.length===5&&catalog.every(c=>c.validated));
 details.scale={rows_added:300000,added_rows_per_table:100000,elapsed_ms:elapsed,canonical_kg_stratified:50000,canonical_un_stratified:50000,catalog};
 console.log('Scaled physical validation passed; starting format and ULP cases');
 for(const guc of [-15,0,1,3]){
   const r=pg.psql(DB,`BEGIN; SET LOCAL extra_float_digits=${guc}; UPDATE public.estoque_produtos SET stock=1.234 WHERE id='a6-kg'; ROLLBACK;`);
   record('Canonical input independent of extra_float_digits='+guc,r.ok);
   const invalid=pg.psql(DB,`BEGIN; SET LOCAL extra_float_digits=${guc}; UPDATE public.estoque_produtos SET stock='0.30000000000000004'::float8 WHERE id='a6-kg'; COMMIT;`);
   record('Invalid precision independent of extra_float_digits='+guc,!invalid.ok&&/23514/.test(invalid.err));
 }
 for(const value of ['1e100','-1e100','1.7976931348623157e308','-1.7976931348623157e308','1e-300','-1e-300']){
   const r=pg.psql(DB,`UPDATE public.estoque_produtos SET stock='${value}'::float8 WHERE id='a6-kg';`);
   const sqlstate=(r.err.match(/ERROR:\s+([A-Z0-9]{5})/)||[])[1]||null;
   record('Finite magnitude edge '+value,!r.ok&&!r.process_error&&sqlstate==='23514',{sqlstate});
 }
 const negativeZero=json(`BEGIN;UPDATE public.estoque_produtos SET stock='-0'::float8 WHERE id='a6-kg';
 SELECT json_build_object('equals_zero',stock=0,'binary',encode(float8send(stock),'hex')) FROM public.estoque_produtos WHERE id='a6-kg';ROLLBACK;`);
 record('Negative zero is allowed as numeric zero',negativeZero.equals_zero,negativeZero);
 require(path.join(pg.ROOT,'node_modules/tsx/dist/cjs/index.cjs'));
 const {toStockUnits,MAX_STOCK_UNITS}=require(path.join(pg.ROOT,'lib/estoque/stock-quantity.ts'));
 function neighbor(v,direction){
   if(v===0)return direction*Number.MIN_VALUE;
   const b=Buffer.alloc(8);b.writeDoubleBE(v);let bits=b.readBigUInt64BE();
   bits+=(v>0)===(direction>0)?1n:-1n;b.writeBigUInt64BE(bits);return b.readDoubleBE();
 }
 const ulps=[];let excluded=0;
 for(const seed of [0,0.001,0.1,0.3,1.234,123456.789,1000000000.001,123456789012.345,999999999999.999])
  for(const sign of [1,-1])for(const direction of [1,-1])for(const steps of [1,2,4,8]){
   let value=seed*sign;for(let i=0;i<steps;i++)value=neighbor(value,direction);
   if(Math.abs(value)>MAX_STOCK_UNITS/1000){excluded++;continue;}
   const expected=toStockUnits(value,'KG')!==null;
   const r=pg.psql(DB,`BEGIN;UPDATE public.estoque_produtos SET stock='${String(value)}'::float8 WHERE id='a6-kg';ROLLBACK;`);
   const state=(r.err.match(/ERROR:\s+([A-Z0-9]{5})/)||[])[1]||null;
   record('ULP KG '+String(seed*sign)+' direction='+direction+' steps='+steps,expected?r.ok:!r.ok&&!r.process_error&&state==='23514',{value:String(value),expected_by_helper:expected,accepted:r.ok,sqlstate:state});
   ulps.push({seed:String(seed*sign),direction,steps,value:String(value),expected_by_helper:expected,accepted:r.ok});
  }
 details.ulps={vectors:ulps.length,excluded_beyond_kg_specific_bound:excluded,oracle:'actual toStockUnits(value, KG)',cases:ulps};
 // Strengthen the representative transaction proof without inspecting the parallel feature.
 const sourceDB='a6_final_'+BASE_VERSION;
 const ledger=JSON.parse(pg.must(sourceDB,"SELECT json_agg(json_build_object('id',id,'quantidade',quantidade,'antes',\"estoqueAntes\",'depois',\"estoqueDepois\") ORDER BY id) FROM public.movimentacoes_estoque WHERE id LIKE 'canonical-%';"));
 const deltas=[2500,750,-125,125];let cursor=0;
 const chain=ledger.length===4&&ledger.every((m,i)=>{
   const delta=toStockUnits(m.quantidade,'KG'),before=toStockUnits(m.antes,'KG'),after=toStockUnits(m.depois,'KG');
   const ok=delta===deltas[i]&&before===cursor&&after===before+delta;cursor+=deltas[i];return ok;
 });
 const sale=Number(pg.must(sourceDB,"SELECT quantidade FROM public.a6_sales WHERE id='synthetic-kg-sale';"));
 record('Every canonical ledger delta/before/after matches integer oracle',chain&&cursor===3250);
 record('Synthetic sale amount is exactly 125 thousandths',toStockUnits(sale,'KG')===125,{quantity:sale});
 details.ledger={checked:ledger.length,integer_deltas:deltas,final_thousandths:cursor,sale_thousandths:toStockUnits(sale,'KG'),feature_parallel_not_certified:true};
 const types=()=>json(`SELECT json_agg(json_build_object('table',c.relname,'column',a.attname,'type',format_type(a.atttypid,a.atttypmod),'not_null',a.attnotnull) ORDER BY c.relname,a.attname)
 FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname='public' AND (c.relname,a.attname) IN (('estoque_produtos','stock'),('produto_depositos','quantidade'),('movimentacoes_estoque','quantidade'),('movimentacoes_estoque','estoqueAntes'),('movimentacoes_estoque','estoqueDepois'));`);
 const priorTypes=types();
 const constraints=[['estoque_produtos','estoque_produtos_stock_kg_milesimos'],['produto_depositos','produto_depositos_quantidade_kg_milesimos'],['movimentacoes_estoque','movimentacoes_estoque_quantidade_kg_milesimos'],['movimentacoes_estoque','movimentacoes_estoque_estoqueAntes_kg_milesimos'],['movimentacoes_estoque','movimentacoes_estoque_estoqueDepois_kg_milesimos']];
 pg.must(DB,constraints.map(([t,c])=>`ALTER TABLE public."${t}" DROP CONSTRAINT "${c}";`).join('\n'),{single:true});
 record('Physical types and NOT NULL unchanged after local guard removal',JSON.stringify(types())===JSON.stringify(priorTypes)&&priorTypes.every(t=>t.type==='double precision'&&t.not_null));
 record('Scaled guard recovery after removal',pg.psql(DB,script,{single:true}).ok);
 record('All edge-case transactions leave scaled rows unchanged',snapshot()===before);
}catch(e){rows.push({name:'Supplement completion',pass:false,error:e.message});process.exitCode=1;}
finally{
 if(started)try{record('Owned synthetic cluster stopped',pg.stop().owned_cluster_stopped);}catch(e){rows.push({name:'Stop',pass:false,error:e.message});process.exitCode=1;}
 const report={script_sha256:sha,finished_at:new Date().toISOString(),pass:rows.every(r=>r.pass),synthetic_only:true,production_connections:0,vercel_operations:0,results:rows,details};
 fs.writeFileSync(path.join(pg.OUT,'04-scale-edge-proof-'+ATTEMPT+'.json'),JSON.stringify(report,null,2)+'\n',{flag:'wx'});
 console.log(JSON.stringify({pass:report.pass,checks:rows.length,failed:rows.filter(r=>!r.pass),scale:details.scale,ulps:details.ulps&&{vectors:details.ulps.vectors,excluded_beyond_kg_specific_bound:details.ulps.excluded_beyond_kg_specific_bound},ledger:details.ledger},null,2));
}
