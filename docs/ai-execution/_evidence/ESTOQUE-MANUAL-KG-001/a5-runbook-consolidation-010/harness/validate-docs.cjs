// A5 local documentation validation. No database client, network or secret-file reads.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, ...Array(6).fill('..'));
const out = path.resolve(__dirname, '..');
const baseline = JSON.parse(fs.readFileSync(path.join(out, '00-baseline.json'), 'utf8'));
const targets = baseline.targets;
const records = [];
const sha = buffer => crypto.createHash('sha256').update(buffer).digest('hex');
const read = relative => fs.readFileSync(path.resolve(root, relative), 'utf8').replace(/\r\n/g, '\n');
const record = (name, pass, details = {}) => records.push({ name, pass: !!pass, ...details });
function git(args, cwd = root, allowed = [0]) {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
  if (!allowed.includes(r.status)) throw Error('Read-only git validation failed: ' + args[0]);
  return r;
}
function blocks(markdown) {
  const found = [];
  let current = null;
  for (const line of markdown.split('\n')) {
    const fence = line.match(/^\s*```(.*)$/);
    if (fence) {
      if (current) { found.push(current); current = null; }
      else current = { language: fence[1].trim(), lines: [] };
    } else if (current) current.lines.push(line);
  }
  return { found, balanced: current === null };
}
function slug(text) {
  return text.toLowerCase().replace(/`/g, '').replace(/[^\p{L}\p{N}_\- ]/gu, '').trim().replace(/ /g, '-');
}
function validateMarkdown(file) {
  const text = read(file), parsed = blocks(text);
  record(file + ': fences', parsed.balanced);
  record(file + ': encoding', !text.includes('\uFFFD') && !text.startsWith('\uFEFF'));
  record(file + ': single H1', text.split('\n').filter(l => /^# /.test(l)).length === 1);
  let inFence = false, width = null, tableOK = true;
  for (const line of text.split('\n')) {
    if (/^\s*```/.test(line)) { inFence = !inFence; width = null; continue; }
    if (inFence) continue;
    if (line.startsWith('|') && line.endsWith('|')) {
      const n = line.replace(/\\\|/g, '').split('|').length - 2;
      if (width === null) width = n;
      else if (width !== n) tableOK = false;
    } else width = null;
  }
  record(file + ': table columns', tableOK);
  const broken = [];
  for (const match of text.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)) {
    const url = match[1];
    if (/^[a-z]+:/i.test(url)) continue;
    const [relative, anchor] = url.split('#');
    const absolute = relative ? path.resolve(root, path.dirname(file), decodeURIComponent(relative)) : path.resolve(root, file);
    if (!fs.existsSync(absolute)) { broken.push(url); continue; }
    if (anchor) {
      const headings = fs.readFileSync(absolute, 'utf8').split(/\r?\n/)
        .filter(l => /^#{1,6} /.test(l)).map(l => slug(l.replace(/^#+ /, '')));
      if (!headings.includes(decodeURIComponent(anchor))) broken.push(url);
    }
  }
  record(file + ': local links/anchors', broken.length === 0, { broken });
  const absentPaths = [];
  for (const m of text.matchAll(/`((?:docs|prisma|lib|scripts)\/[^`]+)`/g)) {
    if (/[ …:*]|\.\.\.|,/.test(m[1])) continue;
    if (!fs.existsSync(path.resolve(root, m[1]))) absentPaths.push(m[1]);
  }
  record(file + ': explicit repository paths', absentPaths.length === 0, { absent: absentPaths });
  return text;
}
function validateReadOnlySnippet(name, sql) {
  const plain = sql.replace(/--[^\n]*/g, '').replace(/^\\[^\n]*/gm, '');
  const statements = plain.split(';').map(x => x.trim()).filter(Boolean);
  record(name + ': statement allowlist', statements.every(s => /^(SELECT\b|BEGIN READ ONLY\b|ROLLBACK\b)/i.test(s)));
  record(name + ': read-only/rollback', /BEGIN READ ONLY;/i.test(sql) && /ROLLBACK;\s*$/.test(sql));
  record(name + ': identity guard', ['dry-mouse-36002471', 'br-muddy-meadow-ac7ah2wl', 'ep-summer-tooth-acltc6wi', 'omnigestao_prod', 'transaction_read_only'].every(s => sql.includes(s)) && /1\s*\/\s*CASE WHEN/i.test(sql));
  record(name + ': no effectful function', !/\b(nextval|setval|set_config|pg_terminate_backend|pg_cancel_backend|dblink|pg_notify)\s*\(/i.test(sql));
}
function ddl(text) {
  const plain = text.replace(/--[^\n]*/g, '');
  const result = [];
  for (const table of plain.matchAll(/ALTER TABLE\s+"([^"]+)"([\s\S]*?);/gi))
    for (const column of table[2].matchAll(/ALTER COLUMN\s+"([^"]+)"\s+(?:SET DATA )?TYPE\s+DOUBLE PRECISION/gi))
      result.push(table[1] + '.' + column[1]);
  return result.sort();
}
function ranges(diff, side) {
  const found = [];
  for (const m of diff.matchAll(/^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/gm)) {
    const start = Number(m[side === 'old' ? 1 : 3]);
    const count = Number(m[side === 'old' ? 2 : 4] ?? 1);
    found.push({ start, end: start + Math.max(count, 1) - 1 });
  }
  return found;
}
function main() {
  const attempt = process.argv[2] || '01';
  if (!/^\d{2}$/.test(attempt)) throw Error('Use a two-digit local validation suffix');
  const texts = Object.fromEntries(targets.map(f => [f, validateMarkdown(f)]));
  const [runbook, remediation, checklist] = targets.map(f => texts[f]);
  const currentHead = git(['rev-parse', 'HEAD']).stdout.trim();
  record('Git HEAD preserved', currentHead === baseline.head && currentHead.startsWith('104d768'));
  record('origin/main locally at aaab275', git(['rev-parse', 'origin/main']).stdout.trim() === baseline.origin_main && baseline.origin_main.startsWith('aaab275'));
  record('Index preserved', git(['diff', '--cached', '--binary']).stdout === baseline.staged_diff && baseline.staged_diff === '');
  record('AEP remains opt-out', !fs.existsSync(path.join(root, '.aep-active')) && !fs.existsSync('C:/Projetos/omni-gestao/.aep-active'));
  const changedOutsideScope = [];
  for (const [file, expected] of Object.entries(baseline.tracked_hashes)) {
    if (targets.includes(file)) continue;
    const absolute = path.join(root, file);
    const actual = fs.existsSync(absolute) ? sha(fs.readFileSync(absolute)) : 'absent';
    if (actual !== expected) changedOutsideScope.push(file);
  }
  record('All tracked files outside three docs preserved', changedOutsideScope.length === 0,
    { checked: Object.keys(baseline.tracked_hashes).length - targets.length, changed: changedOutsideScope });
  const changedEvidence = Object.entries(baseline.previous_evidence_hashes).filter(([file, expected]) => !fs.existsSync(path.join(root, file)) || sha(fs.readFileSync(path.join(root, file))) !== expected).map(([file]) => file);
  record('All previous evidence preserved', changedEvidence.length === 0, { checked: Object.keys(baseline.previous_evidence_hashes).length, changed: changedEvidence });
  const rootDiff = git(['diff', '--binary', 'HEAD'], 'C:/Projetos/omni-gestao').stdout;
  record('Root worktree WIPs preserved', sha(rootDiff) === baseline.root_diff_sha256);
  const whitespace = git(['diff', '--check'], root, [0, 2]);
  record('git diff --check', whitespace.status === 0, { exit_code: whitespace.status, output: whitespace.stdout.trim() });
  const migrationPath = 'prisma/migrations/20261025120000_estoque_quantidade_fracionada/migration.sql';
  const migration = read(migrationPath), blob = git(['show', 'HEAD:' + migrationPath]).stdout;
  const migrationHash = sha(Buffer.from(migration));
  record('Migration LF bytes/hash/blob', Buffer.byteLength(migration) === 1041 && migrationHash === 'f07242c4604660008b645004d3dfafde4da1656e728f803d9009f2f02a06a47e' && migration === blob,
    { lf_bytes: Buffer.byteLength(migration), sha256: migrationHash });
  record('Runbook migration hash documented', runbook.includes(migrationHash));
  const expectedColumns = ['estoque_produtos.stock','produto_depositos.quantidade','movimentacoes_estoque.quantidade','movimentacoes_estoque.estoqueAntes','movimentacoes_estoque.estoqueDepois'].sort();
  record('Migration has expected five type changes', JSON.stringify(ddl(migration)) === JSON.stringify(expectedColumns), { columns: ddl(migration) });
  const wrapper = read('docs/padaria/pesagem/estoque-kg-migration-apply.sql');
  record('Apply wrapper matches five type changes', JSON.stringify(ddl(wrapper)) === JSON.stringify(expectedColumns));
  const scriptNames = ['01-papeis.sql','02-grants-runtime.sql','03-corte-posse.sql','04-corte-conexao.sql','05-encerrar-sessoes.sql','06-verificacao.sql','07-guard-check-opcional.sql','99-desfazer-corte.sql'];
  record('All rollout script references exist and remain unchanged', scriptNames.every(s => {
    const f = 'docs/padaria/pesagem/rollout/' + s;
    return fs.existsSync(path.join(root, f)) && sha(fs.readFileSync(path.join(root, f))) === baseline.tracked_hashes[f];
  }));
  const markerPairs = [['01-papeis.sql','KG_PAPEIS_OK'],['02-grants-runtime.sql','KG_RUNTIME_GRANTS_OK'],['03-corte-posse.sql','KG_CORTE_POSSE_OK'],['04-corte-conexao.sql','KG_CORTE_CONEXAO_OK'],['05-encerrar-sessoes.sql','KG_SESSOES_ANTIGAS_ZERO']];
  record('Runbook markers match script sources', markerPairs.every(([s,m]) => runbook.includes(m) && read('docs/padaria/pesagem/rollout/'+s).includes(m)) && wrapper.includes('KG_MIGRATION_OK'));
  const preSection = runbook.split('### Preflight equivalente')[1]?.split('### Pré-janela')[0] || '';
  const pre = blocks(preSection).found.find(b => b.language === 'sql')?.lines.join('\n') || '';
  validateReadOnlySnippet('Pre-01 equivalent', pre);
  record('Pre-01 handles absent owner without role-name resolution', /LEFT JOIN pg_roles owner_role ON owner_role\.rolname = 'omni_owner'/.test(pre)
    && /CASE WHEN owner_role\.oid IS NULL/.test(pre) && !/::regrole/.test(pre)
    && [...pre.matchAll(/pg_has_role\(([^)]*)\)/g)].every(m => !m[1].includes("'omni_owner'")));
  const cashSQL = blocks(checklist).found.find(b => b.language === 'sql')?.lines.join('\n') || '';
  validateReadOnlySnippet('J0 cash reference', cashSQL);
  record('J0 cash query enumerates all storeIds', cashSQL.includes('"storeId", id AS "sessaoId"') && /WHERE status = 'ABERTA'/.test(cashSQL) && !/WHERE[\s\S]*storeId\s*(?:=|IN)/i.test(cashSQL));
  record('A1-A4 evidence reconciliation', ['baseline A1', 'A1.1', 'A2, fase 1', 'A3', 'A4 consolidado', '110/110', 'sete transações', '23 migrations'].every(s => runbook.includes(s)));
  record('Production changes correctly qualified', runbook.includes('alterou papéis e ACLs, não tabelas') && remediation.includes('alterou papéis/ACLs; não alterou estoque'));
  record('Vercel direct vs inference limits documented', [runbook, remediation].every(t => /inferência/.test(t) && /sensitive/.test(t)) && runbook.includes('não é um inventário integral'));
  record('Main reconciliation and 07 remain pending', [runbook, remediation].every(t => t.includes('MAIN_RECONCILIATION=PENDING') && t.includes('SCRIPT_07_DECISION=PENDING') && t.includes('aaab275')));
  record('Later gates unauthorized', runbook.includes('J0–J13 NÃO AUTORIZADOS neste A5') && runbook.includes('A6 — PENDENTE, NÃO AUTORIZADO') && checklist.includes('sem preenchimento ou execução neste A5'));
  record('Historical deployments and effective cutoff', [runbook, remediation, checklist].every(t => /históric/.test(t) && /CONNECT/.test(t) && /sessões/.test(t)) && runbook.includes('imediatamente'));
  record('Migrator ownership capability not claimed', runbook.includes('ainda não possui acesso de proprietário') && runbook.includes('Nenhuma capacidade de migration foi efetivamente exercitada'));
  record('Latest cash store and J0 requirements', checklist.includes('loja-1 aberta e loja-2 fechada') && checklist.includes('RafaCell') && checklist.includes('Rafa Brinquedos') && checklist.includes('ABERTA antes da abertura do J0') && checklist.includes('clientSaleId') && checklist.includes('offline'));
  record('No operational approvals prefilled', !/\[x\]/i.test(checklist));
  record('Auxiliary cron pending authorization', [runbook, remediation, checklist].every(t => t.includes('cron.job') && t.includes('postgres') && /autoriza/.test(t)));
  const oldRunbook = fs.readFileSync(path.join(out,'baseline',path.basename(targets[0])), 'utf8').replace(/\r\n/g,'\n');
  const recovery = text => text.split('## 7. Recuperação por fase')[1]?.split('## Fora deste rollout')[0];
  record('F0-F4 recovery preserved verbatim', !!recovery(runbook) && recovery(runbook) === recovery(oldRunbook));
  record('Migration nonreturn and Int prohibition preserved', runbook.includes('O **COMMIT de `estoque-kg-migration-apply.sql` no J8**') && runbook.includes('jamais autoriza cliente Prisma Int a gravar nas colunas Float') && runbook.includes('99-desfazer-corte.sql'));
  const docDeltas = [], patches = [];
  const initialPatch = fs.readFileSync(path.join(out,'baseline/preexisting-docs.patch'),'utf8');
  for (const file of targets) {
    const relativeBackup = path.relative(root,path.join(out,'baseline',path.basename(file)));
    const delta = git(['diff','--no-index','--unified=0','--',relativeBackup,file],root,[0,1]).stdout;
    patches.push(delta);
    const section = initialPatch.split('diff --git ').find(s => s.startsWith('a/'+file+' b/'+file+'\n')) || '';
    const preRanges = ranges(section,'new'), newRanges = ranges(delta,'old');
    const overlaps = newRanges.filter(a => preRanges.some(b => a.start <= b.end && b.start <= a.end));
    docDeltas.push({file,preexisting_wip:preRanges.length>0,a5_hunks:newRanges.length,overlapping_hunks:overlaps.length});
  }
  const noCommit = docDeltas.some(x => x.preexisting_wip && x.overlapping_hunks > 0);
  record('Commit separation audited; no unrelated WIP staged', noCommit && baseline.staged_diff === '', { decision:'DOCS_COMMIT=NONE', reason:'A5 hunks overlap preexisting hardening WIPs in the runbook/remediation; no staging or commit attempted', documents:docDeltas });
  const passed = records.every(r => r.pass);
  const report = {goal:'ESTOQUE-KG-PRODUCTION-A5-RUNBOOK-001',validated_at:new Date().toISOString(),pass:passed,
    local_only:true,network_operations:0,production_operations:0,vercel_operations:0,sql_executed:0,
    checks:records,document_hashes:Object.fromEntries(targets.map(f=>[f,sha(fs.readFileSync(path.join(root,f)))])),
    docs_commit:'NONE',pending_document_paths:targets};
  fs.writeFileSync(path.join(out,'validation-'+attempt+'.json'),JSON.stringify(report,null,2)+'\n',{flag:'wx'});
  fs.writeFileSync(path.join(out,'a5-only-'+attempt+'.patch'),patches.join('\n'),{flag:'wx'});
  console.log(JSON.stringify({pass:passed,checks_passed:records.filter(r=>r.pass).length,checks_total:records.length,
    failed:records.filter(r=>!r.pass),commit_decision:docDeltas,production_operations:0,vercel_operations:0},null,2));
  if (!passed) process.exitCode = 1;
}
main();
