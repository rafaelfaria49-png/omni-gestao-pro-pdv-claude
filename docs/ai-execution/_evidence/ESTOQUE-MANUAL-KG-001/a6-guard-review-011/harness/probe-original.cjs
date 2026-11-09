const fs=require('node:fs'),path=require('node:path');
const pg=require('./sandbox.cjs');
const rows=[];
try {
  pg.resume(); const db='a6_original_probe';pg.createDb(db);
  pg.must(db,fs.readFileSync(path.join(__dirname,'fixture-old.sql'),'utf8'));
  pg.must(db,fs.readFileSync(path.join(pg.ROOT,'prisma/migrations/20261025120000_estoque_quantidade_fracionada/migration.sql'),'utf8'),{single:true});
  const original=fs.readFileSync(path.join(pg.OUT,'baseline/07-original.sql'),'utf8');
  pg.must(db,original,{single:true});
  const targets=[['estoque_produtos','stock','a6-kg'],['produto_depositos','quantidade','a6-dep-kg'],
    ['movimentacoes_estoque','quantidade','a6-ledger-kg'],['movimentacoes_estoque','estoqueAntes','a6-ledger-kg'],['movimentacoes_estoque','estoqueDepois','a6-ledger-kg']];
  for(const [table,column,id]of targets) for(const value of ['0.30000000000000004','1.0000000000000002','999999999999998.5']) {
    const r=pg.psql(db,`UPDATE public."${table}" SET "${column}"='${value}'::float8 WHERE id='${id}';`);
    rows.push({table,column,value,accepted_by_original:r.ok,status:r.status,sqlstate:(r.err.match(/ERROR:\s+([A-Z0-9]{5})/)||[])[1]||null});
  }
  const expression=JSON.parse(pg.must(db,`SELECT json_build_object('original_numeric',('0.30000000000000004'::float8)::numeric::text,
    'original_predicate',round(('0.30000000000000004'::float8)::numeric,3)=('0.30000000000000004'::float8)::numeric,
    'candidate_roundtrip',round(('0.30000000000000004'::float8)::numeric,3)::float8='0.30000000000000004'::float8);`));
  const result={postgres17:true,synthetic_only:true,script:'baseline/07-original.sql',p1_precision_counterexamples:rows,expression,
    reproduced:rows.every(r=>r.accepted_by_original)&&expression.original_predicate&&!expression.candidate_roundtrip};
  fs.writeFileSync(path.join(pg.OUT,'02-original-counterexamples.json'),JSON.stringify(result,null,2)+'\n',{flag:'wx'});
  console.log(JSON.stringify(result,null,2));if(!result.reproduced)process.exitCode=1;
} catch(e){console.error(e.message);process.exitCode=1;}
finally {try{console.log(JSON.stringify(pg.stop()));}catch(e){console.error(e.message);process.exitCode=1;}}
