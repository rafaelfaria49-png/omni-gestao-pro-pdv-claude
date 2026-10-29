/**
 * Testes do AEP/1.0-R2 — `node --test "scripts/*.test.mjs"`
 *
 * (A partir do Node 23 os argumentos posicionais de `node --test` são GLOB, não
 * diretório a percorrer; por isso o padrão acima, e não `node --test scripts/`.)
 *
 * Todas as simulações destrutivas (commit de teste, caminho fora da allowlist, gate não
 * autorizado, código produtivo staged, `open` com árvore limpa) acontecem EXCLUSIVAMENTE
 * em repositórios Git temporários criados aqui. Nada toca a worktree real.
 *
 * Zero dependências externas: node:test, node:assert, node:fs, node:path,
 * node:child_process.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import {
  projectLatestGoalStates,
  countProjectedResults,
  classificationSignature,
  RESULTADOS_CLASSIFICATORIOS,
} from './track.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const TRACK = path.join(HERE, 'track.mjs');
const HOOKS_SRC = path.join(HERE, '..', '.githooks');

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

function sh(cmd, args, opts = {}) {
  // Isolamento: `AEP_WRITE` herdado do shell de quem roda a suíte mudaria o
  // comportamento dos hooks e do `close`, tornando o resultado dependente do
  // ambiente externo. Cada teste declara explicitamente o que precisa.
  const base = { ...process.env };
  delete base.AEP_WRITE;
  const r = spawnSync(cmd, args, {
    cwd: opts.cwd,
    encoding: 'utf8',
    env: { ...base, ...(opts.env || {}) },
    maxBuffer: 32 * 1024 * 1024,
    windowsHide: true,
  });
  return {
    code: r.status === null ? 1 : r.status,
    out: (r.stdout || '').replace(/\r\n/g, '\n'),
    err: (r.stderr || '').replace(/\r\n/g, '\n'),
    all: `${(r.stdout || '')}${(r.stderr || '')}`.replace(/\r\n/g, '\n'),
  };
}

function g(cwd, ...args) {
  return sh('git', args, { cwd });
}

function aep(cwd, args, env = {}) {
  return sh(process.execPath, [TRACK, ...args], { cwd, env });
}

/**
 * Emite a SAÍDA LITERAL de uma execução quando AEP_EVIDENCE=1. As evidências das
 * validações f, g, i e k saem daqui — do mesmo repositório Git temporário do fixture,
 * nunca da worktree real.
 */
function ev(rotulo, r) {
  if (process.env.AEP_EVIDENCE !== '1') return;
  const txt = typeof r === 'string' ? r : `$ exit ${r.code}\n${r.all}`;
  console.log(`\n===== EVIDENCIA ${rotulo} =====\n${txt}===== FIM ${rotulo} =====\n`);
}

function w(root, rel, content) {
  const f = path.join(root, rel);
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, content);
  return f;
}

const FIXTURE_PROTOCOL = {
  aep: '1.0-R2',
  default_branch: 'main',
  tracks_dir: 'docs/execution-tracks',
  test_runner: 'node --test "scripts/*.test.mjs"',
  max_attempts: 3,
  max_hot_goals: 3,
  gates: [
    {
      id: 'G-DADOS-SCHEMA',
      tipo: 'caminho',
      autorizacao: 'humana explícita',
      paths: ['prisma/schema.prisma', 'prisma/migrations/**'],
      motivo: 'dados reais',
    },
  ],
  adapters: [
    { slug: 'agents', file: 'AGENTS.md', linha_final: 'Adaptador: AGENTS.md — genérico.' },
  ],
  tracks: {},
  remote_layer: { ci_verify: false, branch_protection_confirmada_por: null, branch_protection_confirmada_em: null },
};

/** Cria origin bare + repo de trabalho já com o AEP instalado e hooks ativos. */
function makeRepo(t) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'aep-test-'));
  const origin = path.join(tmp, 'origin.git');
  const repo = path.join(tmp, 'repo');
  fs.mkdirSync(origin, { recursive: true });
  fs.mkdirSync(repo, { recursive: true });

  assert.equal(sh('git', ['init', '--bare', '-b', 'main', origin]).code, 0);
  assert.equal(sh('git', ['init', '-b', 'main', repo]).code, 0);
  g(repo, 'config', 'user.email', 'aep@test.local');
  g(repo, 'config', 'user.name', 'AEP Test');
  g(repo, 'config', 'commit.gpgsign', 'false');
  g(repo, 'remote', 'add', 'origin', origin);

  fs.mkdirSync(path.join(repo, 'scripts'), { recursive: true });
  fs.copyFileSync(TRACK, path.join(repo, 'scripts', 'track.mjs'));
  fs.mkdirSync(path.join(repo, '.githooks'), { recursive: true });
  for (const h of ['pre-commit', 'commit-msg']) {
    const dst = path.join(repo, '.githooks', h);
    fs.copyFileSync(path.join(HOOKS_SRC, h), dst);
    fs.chmodSync(dst, 0o755);
  }
  w(repo, 'scripts/goal-test.mjs',
    "import fs from 'node:fs';\nprocess.exit(fs.existsSync('TEST_MUST_FAIL') ? 1 : 0);\n");
  w(repo, '.gitignore', '.aep-active\nimport/\nTEST_MUST_FAIL\n');
  w(repo, 'app/produtivo.ts', 'export const produtivo = 1;\n');
  w(repo, 'AGENTS.md', '# Governança humana\n\nEste parágrafo é humano e não pode ser tocado.\n');
  w(repo, 'docs/ai-execution/protocol.json', `${JSON.stringify(FIXTURE_PROTOCOL, null, 2)}\n`);

  g(repo, 'add', '--', 'scripts/track.mjs', 'scripts/goal-test.mjs', '.githooks/pre-commit',
    '.githooks/commit-msg', '.gitignore', 'app/produtivo.ts', 'AGENTS.md',
    'docs/ai-execution/protocol.json');
  assert.equal(g(repo, 'commit', '-m', 'chore: fixture bootstrap').code, 0);
  assert.equal(g(repo, 'push', '-u', 'origin', 'main').code, 0);
  g(repo, 'config', 'core.hooksPath', '.githooks');

  t.after(() => {
    try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* Windows segura handles */ }
  });
  return { tmp, origin, repo, name: path.basename(repo) };
}

const META_DEFAULTS = (repoName, over = {}) => ({
  aep: '1.0-R2',
  id: 'demo-001',
  track: 'demo',
  title: 'GOAL de fixture',
  status: 'READY',
  class: 'C2',
  branch: 'goal/demo-001',
  worktree: repoName,
  test_command: 'node scripts/goal-test.mjs',
  allowlist: ['app/**'],
  gates_liberados: [],
  read_budget: 4,
  ...over,
});

/** Cria a trilha `demo` e ratifica o esqueleto no primeiro commit (tudo CRIAÇÃO). */
function initTrack(repo) {
  assert.equal(aep(repo, ['init', 'demo', '--risk=MEDIO']).code, 0);
  g(repo, 'add', '--', 'docs/ai-execution/protocol.json', 'docs/ai-execution/GATES.md',
    'docs/execution-tracks');
  assert.equal(g(repo, 'commit', '-m', 'chore: trilha demo').code, 0);
}

/** Escreve um GOAL, reconcilia com `registry` e ratifica com AEP_WRITE=1 (ritual de plano). */
function addGoal(repo, meta, bodyOverride) {
  const rel = `docs/execution-tracks/demo/goals/${meta.id}.md`;
  const body = bodyOverride !== undefined
    ? bodyOverride
    : `<!-- AEP:META\n${JSON.stringify(meta, null, 2)}\n-->\n\n# ${meta.id}\n\ncorpo\n`;
  w(repo, rel, body);
  const r = aep(repo, ['registry']);
  if (r.code !== 0) return { rel, registry: r, commit: null };
  const c = g(repo, 'add', '--', rel, 'docs/execution-tracks/demo/state.json',
    'docs/execution-tracks/REGISTRY.md');
  assert.equal(c.code, 0, c.err);
  const commit = sh('git', ['commit', '-m', `aep(demo): plan ${meta.id}`], { cwd: repo, env: { AEP_WRITE: '1' } });
  return { rel, registry: r, commit };
}

function openGoal(repo, branch = 'goal/demo-001') {
  // origin/main precisa refletir o esqueleto já ratificado: base_commit é
  // `git merge-base HEAD origin/<default>`.
  assert.equal(g(repo, 'push', 'origin', 'main').code, 0);
  assert.equal(g(repo, 'checkout', '-q', '-b', branch).code, 0);
  return aep(repo, ['open', 'demo']);
}

// ---------------------------------------------------------------------------
// Gramática de paths e bloco AEP:META
// ---------------------------------------------------------------------------

test('path com glob não suportado falha com exit 1 antes de qualquer execução', (t) => {
  const { repo, name } = makeRepo(t);
  initTrack(repo);
  const meta = META_DEFAULTS(name, { allowlist: ['app/**/*.ts'] });
  const r = addGoal(repo, meta);
  assert.equal(r.registry.code, 1);
  assert.match(r.registry.all, /FALHA \[1\] metadado inválido/);
  assert.match(r.registry.all, /Glob não suportado/);
});

test('bloco AEP:META ausente falha com exit 1', (t) => {
  const { repo, name } = makeRepo(t);
  initTrack(repo);
  const r = addGoal(repo, META_DEFAULTS(name), '# demo-001\n\nsem bloco de metadados\n');
  assert.equal(r.registry.code, 1);
  assert.match(r.registry.all, /bloco.*AEP:META|<!-- AEP:META/);
});

test('bloco AEP:META duplicado falha com exit 1 apontando as linhas', (t) => {
  const { repo, name } = makeRepo(t);
  initTrack(repo);
  const meta = META_DEFAULTS(name);
  const bloco = `<!-- AEP:META\n${JSON.stringify(meta, null, 2)}\n-->\n`;
  const r = addGoal(repo, meta, `${bloco}\n${bloco}`);
  assert.equal(r.registry.code, 1);
  assert.match(r.registry.all, /EXATAMENTE UMA linha/);
});

test('bloco AEP:META malformado falha com exit 1 citando as linhas do miolo', (t) => {
  const { repo, name } = makeRepo(t);
  initTrack(repo);
  const r = addGoal(repo, META_DEFAULTS(name), '<!-- AEP:META\n{ "aep": "1.0-R2", }\n-->\n');
  assert.equal(r.registry.code, 1);
  assert.match(r.registry.all, /deve ser JSON válido/);
});

test('bloco AEP:META sem "-->" falha com exit 1', (t) => {
  const { repo, name } = makeRepo(t);
  initTrack(repo);
  const r = addGoal(repo, META_DEFAULTS(name), `<!-- AEP:META\n${JSON.stringify(META_DEFAULTS(name))}\n`);
  assert.equal(r.registry.code, 1);
  assert.match(r.registry.all, /sem "-->"/);
});

// ---------------------------------------------------------------------------
// open — não troca de branch, não suja a árvore
// ---------------------------------------------------------------------------

test('open falha por branch errada com exit 5 e NÃO troca de branch', (t) => {
  const { repo, name } = makeRepo(t);
  initTrack(repo);
  addGoal(repo, META_DEFAULTS(name));
  const antes = g(repo, 'rev-parse', '--abbrev-ref', 'HEAD').out.trim();
  const r = aep(repo, ['open', 'demo']);
  assert.equal(r.code, 5);
  assert.match(r.all, /FALHA \[5\] pré-condição de ambiente/);
  assert.match(r.all, /nunca executa checkout/);
  const depois = g(repo, 'rev-parse', '--abbrev-ref', 'HEAD').out.trim();
  assert.equal(depois, antes, 'open não pode trocar de branch');
  assert.equal(fs.existsSync(path.join(repo, '.aep-active')), false);
});

test('open falha por worktree divergente com exit 5', (t) => {
  const { repo, name } = makeRepo(t);
  initTrack(repo);
  addGoal(repo, META_DEFAULTS(name, { worktree: 'worktree-que-nao-existe' }));
  g(repo, 'checkout', '-q', '-b', 'goal/demo-001');
  const r = aep(repo, ['open', 'demo']);
  assert.equal(r.code, 5);
  assert.match(r.all, /uma worktree/);
});

test('open NÃO suja a árvore: git status --porcelain segue vazio', (t) => {
  const { repo, name } = makeRepo(t);
  initTrack(repo);
  addGoal(repo, META_DEFAULTS(name));
  assert.equal(g(repo, 'status', '--porcelain').out.trim(), '');
  const r = openGoal(repo);
  assert.equal(r.code, 0, r.all);
  const porcelain = g(repo, 'status', '--porcelain');
  ev('k — open + git status --porcelain (árvore limpa antes e depois)',
    `$ node scripts/track.mjs open demo\n${r.all}\n$ git status --porcelain\n[saída literal: ${JSON.stringify(porcelain.out)}]\n$ ls .aep-active\n${fs.existsSync(path.join(repo, '.aep-active')) ? '.aep-active (presente, gitignored)' : 'AUSENTE'}\n`);
  assert.equal(porcelain.out.trim(), '',
    '.aep-active é gitignored; open não escreve nada versionado');
  assert.equal(fs.existsSync(path.join(repo, '.aep-active')), true);
  assert.match(r.all, /LEIA EXATAMENTE UM ARQUIVO DE GOAL/);
  assert.match(r.all, /CLASSIFICAÇÃO \(8 campos/);
  assert.match(r.all, /tentativa:\s+1\/3/);
});

// ---------------------------------------------------------------------------
// check / close
// ---------------------------------------------------------------------------

function trabalhaECommita(repo, msg = 'goal(demo-001): trabalho') {
  w(repo, 'app/produtivo.ts', 'export const produtivo = 2;\n');
  assert.equal(g(repo, 'add', '--', 'app/produtivo.ts').code, 0);
  return g(repo, 'commit', '-m', msg);
}

test('check falha com árvore suja', (t) => {
  const { repo, name } = makeRepo(t);
  initTrack(repo);
  addGoal(repo, META_DEFAULTS(name));
  openGoal(repo);
  trabalhaECommita(repo);
  w(repo, 'app/produtivo.ts', 'export const produtivo = 3;\n'); // não commitado
  const r = aep(repo, ['check', 'demo']);
  assert.equal(r.code, 3);
  assert.match(r.all, / 3 \[FAIL \] árvore limpa/);
});

test('check falha quando o teste do GOAL falha e close ABORTA sem escrever', (t) => {
  const { repo, name } = makeRepo(t);
  initTrack(repo);
  addGoal(repo, META_DEFAULTS(name));
  openGoal(repo);
  trabalhaECommita(repo);
  w(repo, 'TEST_MUST_FAIL', 'x'); // gitignored: não suja a árvore
  const ledgerAntes = fs.readFileSync(path.join(repo, 'docs/execution-tracks/demo/LEDGER.jsonl'), 'utf8');
  const r = aep(repo, ['close', 'demo']);
  assert.equal(r.code, 3);
  assert.match(r.all, /10 \[FAIL \] teste do GOAL passa/);
  assert.match(r.all, /close ABORTADO/);
  assert.match(r.all, /CONTEXTO: CONTINUE/);
  assert.equal(fs.existsSync(path.join(repo, '.aep-active')), true, 'close preserva .aep-active na falha');
  assert.equal(fs.readFileSync(path.join(repo, 'docs/execution-tracks/demo/LEDGER.jsonl'), 'utf8'), ledgerAntes);
  assert.equal(g(repo, 'status', '--porcelain').out.trim(), '');
});

test('close com check verde ratifica, remove .aep-active e fecha o ÚLTIMO GOAL sem próximo', (t) => {
  const { repo, name } = makeRepo(t);
  initTrack(repo);
  addGoal(repo, META_DEFAULTS(name));
  openGoal(repo);
  trabalhaECommita(repo);
  const headAgente = g(repo, 'rev-parse', 'HEAD').out.trim();

  const r = aep(repo, ['close', 'demo']);
  assert.equal(r.code, 0, r.all);
  assert.match(r.all, /RATIFICADO/);
  assert.match(r.all, /CONTEXTO: CLEAR/, 'sem próximo GOAL o veredito é CLEAR');
  assert.equal(fs.existsSync(path.join(repo, '.aep-active')), false, 'close remove .aep-active no sucesso');

  const linhas = fs.readFileSync(path.join(repo, 'docs/execution-tracks/demo/LEDGER.jsonl'), 'utf8')
    .split('\n').filter(Boolean).map((l) => JSON.parse(l));
  assert.equal(linhas.length, 1);
  assert.equal(linhas[0].result, 'DONE');
  assert.equal(linhas[0].head_commit, headAgente);
  assert.equal(linhas[0].source, 'executado');

  const st = JSON.parse(fs.readFileSync(path.join(repo, 'docs/execution-tracks/demo/state.json'), 'utf8'));
  assert.equal(st.next_goal, null);
  assert.equal(st.current_goal, null);
  assert.equal(st.status, 'PAUSED');
  assert.equal(st.counters.goals_done, 1);

  assert.equal(fs.existsSync(path.join(repo, 'docs/execution-tracks/demo/_closed/goals/demo-001.md')), true);
  assert.equal(fs.existsSync(path.join(repo, 'docs/execution-tracks/demo/goals/demo-001.md')), false);
  assert.equal(fs.existsSync(path.join(repo, 'docs/execution-tracks/demo/_closed/reports/demo-001-a1.md')), true);

  // dois commits: o do agente e o de estado
  const log = g(repo, 'log', '--format=%s', '-2').out.trim().split('\n');
  assert.equal(log[0], 'aep(demo): close demo-001');
  assert.equal(log[1], 'goal(demo-001): trabalho');
  assert.equal(g(repo, 'status', '--porcelain').out.trim(), '');
  assert.equal(aep(repo, ['verify', '--all']).code, 0);
});

test('check acusa base_commit inexistente e commit em branch errada', (t) => {
  const { repo, name } = makeRepo(t);
  initTrack(repo);
  addGoal(repo, META_DEFAULTS(name));
  openGoal(repo);
  trabalhaECommita(repo);

  const activeFile = path.join(repo, '.aep-active');
  const a = JSON.parse(fs.readFileSync(activeFile, 'utf8'));

  // 1) commit inexistente
  fs.writeFileSync(activeFile, JSON.stringify({ ...a, base_commit: '0'.repeat(40) }, null, 2));
  const r1 = aep(repo, ['check', 'demo']);
  assert.equal(r1.code, 3);
  assert.match(r1.all, / 5 \[FAIL \] base_commit é ancestral da branch/);

  // 2) commit real, mas de outra branch (não ancestral)
  g(repo, 'checkout', '-q', '-b', 'outra');
  w(repo, 'app/produtivo.ts', 'export const produtivo = 99;\n');
  g(repo, 'add', '--', 'app/produtivo.ts');
  g(repo, 'commit', '--no-verify', '-m', 'goal(demo-001): commit de outra branch');
  const shaOutra = g(repo, 'rev-parse', 'HEAD').out.trim();
  g(repo, 'checkout', '-q', 'goal/demo-001');
  fs.writeFileSync(activeFile, JSON.stringify({ ...a, base_commit: shaOutra }, null, 2));
  const r2 = aep(repo, ['check', 'demo']);
  assert.equal(r2.code, 3);
  assert.match(r2.all, / 5 \[FAIL \] base_commit é ancestral da branch/);
});

test('check acusa caminho fora da allowlist e gate de caminho não liberado', (t) => {
  const { repo, name } = makeRepo(t);
  initTrack(repo);
  addGoal(repo, META_DEFAULTS(name, { allowlist: ['app/**', 'prisma/migrations/**'] }));
  openGoal(repo);
  // gate G-DADOS-SCHEMA não está em gates_liberados.
  w(repo, 'prisma/migrations/0001/migration.sql', 'SELECT 1;\n');
  g(repo, 'add', '--', 'prisma/migrations/0001/migration.sql');
  // O hook recusaria; --no-verify simula justamente o desvio que só `check` detecta.
  assert.equal(g(repo, 'commit', '--no-verify', '-m', 'goal(demo-001): migration').code, 0);
  const r = aep(repo, ['check', 'demo']);
  assert.equal(r.code, 3);
  assert.match(r.all, / 7 \[FAIL \] nenhum gate de caminho não liberado/);
  assert.match(r.all, /G-DADOS-SCHEMA/);

  // e um caminho simplesmente fora da allowlist
  w(repo, 'services/fora.ts', 'export const x = 1;\n');
  g(repo, 'add', '--', 'services/fora.ts');
  g(repo, 'commit', '--no-verify', '-m', 'goal(demo-001): fora');
  const r2 = aep(repo, ['check', 'demo']);
  assert.equal(r2.code, 3);
  assert.match(r2.all, / 6 \[FAIL \] caminhos do diff dentro da allowlist/);
  assert.match(r2.all, /services\/fora\.ts/);
});

// ---------------------------------------------------------------------------
// tentativas
// ---------------------------------------------------------------------------

test('teto de 3 tentativas: a falha que o esgota converte o GOAL em BLOCKED (exit 3)', (t) => {
  const { repo, name } = makeRepo(t);
  initTrack(repo);
  addGoal(repo, META_DEFAULTS(name));
  openGoal(repo);

  const a1 = aep(repo, ['attempt', 'demo', '--fail', '--reason=abordagem A nao funcionou']);
  assert.equal(a1.code, 0);
  assert.match(a1.all, /nova tentativa: 2\/3/);
  assert.equal(g(repo, 'status', '--porcelain').out.trim(), '', 'attempt não escreve versionado');

  const a2 = aep(repo, ['attempt', 'demo', '--fail', '--reason=abordagem B nao funcionou']);
  assert.equal(a2.code, 0);
  assert.match(a2.all, /nova tentativa: 3\/3/);

  const a3 = aep(repo, ['attempt', 'demo', '--fail', '--reason=abordagem C nao funcionou']);
  assert.equal(a3.code, 3);
  assert.match(a3.all, /TETO DE TENTATIVAS ESGOTADO/);
  assert.match(a3.all, /BLOCKED/);
  assert.equal(fs.existsSync(path.join(repo, '.aep-active')), false);

  const linhas = fs.readFileSync(path.join(repo, 'docs/execution-tracks/demo/LEDGER.jsonl'), 'utf8')
    .split('\n').filter(Boolean).map((l) => JSON.parse(l));
  assert.equal(linhas.length, 1);
  assert.equal(linhas[0].result, 'BLOCKED');
  assert.equal(linhas[0].previous_attempts.length, 3);
  const st = JSON.parse(fs.readFileSync(path.join(repo, 'docs/execution-tracks/demo/state.json'), 'utf8'));
  assert.equal(st.status, 'BLOCKED');
  assert.equal(aep(repo, ['verify', '--all']).code, 0);
});

// ---------------------------------------------------------------------------
// Hooks — OPT-IN. Proteção contra ACIDENTE e desvio de agente COOPERATIVO.
// Nada aqui afirma que o hook detecta `git add .`: ele valida o CONJUNTO STAGED.
// ---------------------------------------------------------------------------

test('SEM .aep-active: commit feat(...) tocando código produtivo passa normalmente', (t) => {
  const { repo } = makeRepo(t);
  initTrack(repo);
  assert.equal(fs.existsSync(path.join(repo, '.aep-active')), false);
  w(repo, 'app/produtivo.ts', 'export const produtivo = 42;\n');
  assert.equal(g(repo, 'add', '--', 'app/produtivo.ts').code, 0);
  const c = g(repo, 'commit', '-m', 'feat(app): mexe em codigo produtivo sem AEP');
  ev('g1 — SEM .aep-active: feat(...) em código produtivo PASSA',
    `$ git add -- app/produtivo.ts\n$ git commit -m "feat(app): mexe em codigo produtivo sem AEP"\n$ exit ${c.code}\n${c.all}`);
  assert.equal(c.code, 0, c.all);
  assert.equal(g(repo, 'log', '--format=%s', '-1').out.trim(), 'feat(app): mexe em codigo produtivo sem AEP');
});

test('SEM .aep-active: modificar state.json à mão é RECUSADO pelo hook (exit 2)', (t) => {
  const { repo } = makeRepo(t);
  initTrack(repo);
  const stateRel = 'docs/execution-tracks/demo/state.json';
  const st = JSON.parse(fs.readFileSync(path.join(repo, stateRel), 'utf8'));
  st.counters.goals_done = 99;
  w(repo, stateRel, `${JSON.stringify(st, null, 2)}\n`);
  assert.equal(g(repo, 'add', '--', stateRel).code, 0);
  const c = g(repo, 'commit', '-m', 'chore: mexe no state a mao');
  ev('g2 — SEM .aep-active: modificar state.json à mão é RECUSADO pelo hook',
    `$ git add -- ${stateRel}\n$ git commit -m "chore: mexe no state a mao"\n$ exit ${c.code}\n${c.all}`);
  assert.notEqual(c.code, 0);
  assert.match(c.all, /FALHA \[2\] gate violado/);
  assert.match(c.all, /não editados à mão/);
  // e o ledger idem
  const ledgerRel = 'docs/execution-tracks/demo/LEDGER.jsonl';
  g(repo, 'reset', '-q');
  w(repo, ledgerRel, '{"linha":"forjada"}\n');
  g(repo, 'add', '--', ledgerRel);
  const c2 = g(repo, 'commit', '-m', 'chore: forja ledger');
  assert.notEqual(c2.code, 0);
  assert.match(c2.all, /FALHA \[2\] gate violado/);
});

test('SEM .aep-active: CRIAÇÃO de state.json/LEDGER/REGISTRY passa (sem exceção de bootstrap)', (t) => {
  const { repo } = makeRepo(t);
  // initTrack cria state.json, LEDGER.jsonl e REGISTRY.md pela primeira vez (diff-filter A)
  // e não existe .aep-active: precisa passar naturalmente, sem flag nenhuma.
  assert.equal(aep(repo, ['init', 'demo', '--risk=MEDIO']).code, 0);
  g(repo, 'add', '--', 'docs/ai-execution/protocol.json', 'docs/ai-execution/GATES.md',
    'docs/execution-tracks');
  const filtro = g(repo, 'diff', '--cached', '--name-only', '--diff-filter=A').out;
  assert.match(filtro, /docs\/execution-tracks\/demo\/state\.json/);
  assert.match(filtro, /docs\/execution-tracks\/REGISTRY\.md/);
  const c = g(repo, 'commit', '-m', 'chore: bootstrap da trilha');
  assert.equal(c.code, 0, c.all);
});

test('COM .aep-active: hook recusa CONJUNTO STAGED fora da allowlist (exit 2)', (t) => {
  const { repo, name } = makeRepo(t);
  initTrack(repo);
  addGoal(repo, META_DEFAULTS(name));
  assert.equal(openGoal(repo).code, 0);
  w(repo, 'services/fora-da-allowlist.ts', 'export const x = 1;\n');
  assert.equal(g(repo, 'add', '--', 'services/fora-da-allowlist.ts').code, 0);
  const c = g(repo, 'commit', '-m', 'goal(demo-001): caminho fora da allowlist');
  ev('f1 — COM .aep-active: CONJUNTO STAGED com caminho fora da allowlist é RECUSADO',
    `$ git add -- services/fora-da-allowlist.ts\n$ git commit -m "goal(demo-001): caminho fora da allowlist"\n$ exit ${c.code}\n${c.all}`);
  assert.notEqual(c.code, 0);
  assert.match(c.all, /FALHA \[2\] gate violado/);
  assert.match(c.all, /fora da allowlist do GOAL demo-001/);
  assert.match(c.all, /services\/fora-da-allowlist\.ts/);
});

test('COM .aep-active: hook recusa caminho que bate em gate NÃO autorizado (exit 2)', (t) => {
  const { repo, name } = makeRepo(t);
  initTrack(repo);
  // allowlist cobre o caminho, mas o gate G-DADOS-SCHEMA não está liberado
  addGoal(repo, META_DEFAULTS(name, { allowlist: ['app/**', 'prisma/migrations/**'] }));
  assert.equal(openGoal(repo).code, 0);
  w(repo, 'prisma/migrations/0001_init/migration.sql', 'SELECT 1;\n');
  assert.equal(g(repo, 'add', '--', 'prisma/migrations/0001_init/migration.sql').code, 0);
  const c = g(repo, 'commit', '-m', 'goal(demo-001): migration nao autorizada');
  ev('f2 — COM .aep-active: CONJUNTO STAGED batendo em gate NÃO autorizado é RECUSADO',
    `$ git add -- prisma/migrations/0001_init/migration.sql\n$ git commit -m "goal(demo-001): migration nao autorizada"\n$ exit ${c.code}\n${c.all}`);
  assert.notEqual(c.code, 0);
  assert.match(c.all, /FALHA \[2\] gate violado/);
  assert.match(c.all, /G-DADOS-SCHEMA/);
  assert.match(c.all, /peça autorização humana/);
});

test('ledger com linha deletada: hook recusa e, se contornado, check item 9 acusa', (t) => {
  const { repo, name } = makeRepo(t);
  initTrack(repo);
  addGoal(repo, META_DEFAULTS(name, { allowlist: ['app/**', 'docs/execution-tracks/demo/LEDGER.jsonl'] }));
  const ledgerRel = 'docs/execution-tracks/demo/LEDGER.jsonl';
  // semeia duas linhas ratificadas
  w(repo, ledgerRel, '{"a":1}\n{"a":2}\n');
  g(repo, 'add', '--', ledgerRel);
  assert.equal(sh('git', ['commit', '-m', 'aep(demo): semeia ledger'], { cwd: repo, env: { AEP_WRITE: '1' } }).code, 0);
  assert.equal(openGoal(repo).code, 0);

  // remove uma linha
  w(repo, ledgerRel, '{"a":1}\n');
  g(repo, 'add', '--', ledgerRel);
  const c = g(repo, 'commit', '-m', 'goal(demo-001): apaga linha do ledger');
  assert.notEqual(c.code, 0, 'o hook precisa recusar');
  assert.match(c.all, /FALHA \[2\] gate violado/);
  // a imutabilidade é a regra que dispara primeiro: LEDGER.jsonl é MODIFICADO (filtro M)
  assert.match(c.all, /ratificados pelo AEP, não editados à mão/);

  // desvio deliberado (--no-verify) — o hook local não impede; `check` DETECTA
  assert.equal(g(repo, 'commit', '--no-verify', '-m', 'goal(demo-001): apaga linha do ledger').code, 0);
  const r = aep(repo, ['check', 'demo']);
  assert.equal(r.code, 3);
  assert.match(r.all, / 9 \[FAIL \] LEDGER\.jsonl sem deleções/);
  assert.match(r.all, /1 linha\(s\) removida\(s\)/);
});

test('COM .aep-active: commit-msg exige goal(...) ou aep(...)', (t) => {
  const { repo, name } = makeRepo(t);
  initTrack(repo);
  addGoal(repo, META_DEFAULTS(name));
  assert.equal(openGoal(repo).code, 0);
  w(repo, 'app/produtivo.ts', 'export const produtivo = 7;\n');
  g(repo, 'add', '--', 'app/produtivo.ts');
  const ruim = g(repo, 'commit', '-m', 'feat(app): mensagem fora do padrao com GOAL aberto');
  assert.notEqual(ruim.code, 0);
  assert.match(ruim.all, /goal\(<trilha>-<nnn>\)/);
  const bom = g(repo, 'commit', '-m', 'goal(demo-001): mensagem correta');
  assert.equal(bom.code, 0, bom.all);
});

// ---------------------------------------------------------------------------
// verify
// ---------------------------------------------------------------------------

test('verify detecta state.json editado à mão e sai com 4', (t) => {
  const { repo, name } = makeRepo(t);
  initTrack(repo);
  addGoal(repo, META_DEFAULTS(name));
  assert.equal(aep(repo, ['verify', '--all']).code, 0);

  const stateRel = path.join(repo, 'docs/execution-tracks/demo/state.json');
  const st = JSON.parse(fs.readFileSync(stateRel, 'utf8'));
  st.counters.goals_done = 7;
  st.status = 'DONE';
  fs.writeFileSync(stateRel, `${JSON.stringify(st, null, 2)}\n`);

  const r = aep(repo, ['verify', '--all']);
  assert.equal(r.code, 4);
  assert.match(r.all, /\[DIVERGE\] demo/);
  assert.match(r.all, /counters/);
  assert.match(r.all, /status/);
  assert.match(r.all, /DETECTA depois do fato/);
});

test('verify detecta LEDGER.jsonl com linha ratificada removida', (t) => {
  const { repo, name } = makeRepo(t);
  initTrack(repo);
  addGoal(repo, META_DEFAULTS(name));
  openGoal(repo);
  w(repo, 'app/produtivo.ts', 'export const produtivo = 2;\n');
  g(repo, 'add', '--', 'app/produtivo.ts');
  g(repo, 'commit', '-m', 'goal(demo-001): trabalho');
  assert.equal(aep(repo, ['close', 'demo']).code, 0);
  assert.equal(aep(repo, ['verify', '--all']).code, 0);

  // apaga a linha ratificada direto no arquivo
  fs.writeFileSync(path.join(repo, 'docs/execution-tracks/demo/LEDGER.jsonl'), '');
  const r = aep(repo, ['verify', '--all']);
  assert.equal(r.code, 4);
  assert.match(r.all, /append-only/);
});

// ---------------------------------------------------------------------------
// sync-adapters
// ---------------------------------------------------------------------------

test('sync-adapters preserva conteúdo humano fora do bloco e é idempotente', (t) => {
  const { repo } = makeRepo(t);
  const file = path.join(repo, 'AGENTS.md');
  const original = fs.readFileSync(file, 'utf8');

  assert.equal(aep(repo, ['sync-adapters']).code, 0);
  const depois = fs.readFileSync(file, 'utf8');
  assert.equal(depois.startsWith(original), true, 'o conteúdo humano é prefixo byte-a-byte');
  assert.match(depois, /<!-- AEP:BEGIN -->/);
  assert.match(depois, /<!-- AEP:END -->/);
  assert.equal(aep(repo, ['sync-adapters', '--check']).code, 0);

  // substituir SOMENTE o miolo
  const mexido = depois.replace(/regra 1:[^\n]*/, 'regra 1: MIOLO ADULTERADO');
  fs.writeFileSync(file, mexido);
  assert.equal(aep(repo, ['sync-adapters', '--check']).code, 4);
  assert.equal(aep(repo, ['sync-adapters']).code, 0);
  const restaurado = fs.readFileSync(file, 'utf8');
  assert.equal(restaurado.startsWith(original), true);
  assert.equal(restaurado, depois);

  // conteúdo humano acrescentado DEPOIS do bloco também sobrevive
  fs.appendFileSync(file, '\n## Seção humana posterior\n\nnão pode sumir\n');
  const comCauda = fs.readFileSync(file, 'utf8');
  assert.equal(aep(repo, ['sync-adapters']).code, 0);
  assert.equal(fs.readFileSync(file, 'utf8'), comCauda);
});

test('sync-adapters recusa bloco duplicado e marcador sem par, sem escrever nada', (t) => {
  const { repo } = makeRepo(t);
  const file = path.join(repo, 'AGENTS.md');

  fs.writeFileSync(file, '# h\n<!-- AEP:BEGIN -->\na\n<!-- AEP:END -->\n<!-- AEP:BEGIN -->\nb\n<!-- AEP:END -->\n');
  const antes = fs.readFileSync(file, 'utf8');
  const r1 = aep(repo, ['sync-adapters']);
  assert.equal(r1.code, 1);
  assert.match(r1.all, /Mais de um bloco AEP/);
  assert.equal(fs.readFileSync(file, 'utf8'), antes);

  fs.writeFileSync(file, '# h\n<!-- AEP:BEGIN -->\na\n');
  const antes2 = fs.readFileSync(file, 'utf8');
  const r2 = aep(repo, ['sync-adapters']);
  assert.equal(r2.code, 1);
  assert.match(r2.all, /sem par/);
  assert.equal(fs.readFileSync(file, 'utf8'), antes2);
});

// ---------------------------------------------------------------------------
// status / doctor
// ---------------------------------------------------------------------------

test('status é somente leitura, cabe em 18 linhas e suporta --json', (t) => {
  const { repo } = makeRepo(t);
  initTrack(repo);
  const antes = g(repo, 'status', '--porcelain').out;
  const r = aep(repo, ['status', 'demo']);
  assert.equal(r.code, 0, r.all);
  assert.match(r.out, /AEP\/1\.0-R2/);
  assert.match(r.out, /PLANNED/);
  assert.ok(r.out.trimEnd().split('\n').length <= 18, 'status excedeu 18 linhas');
  assert.equal(g(repo, 'status', '--porcelain').out, antes);

  const j = aep(repo, ['status', 'demo', '--json']);
  assert.equal(j.code, 0);
  const parsed = JSON.parse(j.out);
  assert.equal(parsed.aep, '1.0-R2');
  assert.equal(parsed.status, 'PLANNED');
  assert.equal(parsed.current_goal, null);
});

test('doctor emite AVISO de camada remota ausente e ainda assim retorna exit 0', (t) => {
  const { repo } = makeRepo(t);
  initTrack(repo);
  const r = aep(repo, ['doctor']);
  assert.equal(r.code, 0, 'doctor nunca bloqueia o bootstrap local');
  assert.match(r.out, /== CAMADA LOCAL ==/);
  assert.match(r.out, /== CAMADA REMOTA ==/);
  assert.match(r.out, /CAMADA REMOTA NÃO CONFIGURADA/);
  assert.match(r.out, /não cooperativo/);
  assert.match(r.out, /NÃO VERIFICÁVEL LOCALMENTE/);
  assert.match(r.out, /CONFIRMAÇÃO DECLARADA/);
});

// ---------------------------------------------------------------------------
// Importador — FUNCIONAL. Fixture Git cobrindo os cinco casos de reconciliação.
// ---------------------------------------------------------------------------

/** Cria uma branch com um commit real e devolve o SHA. */
function commitReal(repo, branch, rel, conteudo, msg) {
  const atual = g(repo, 'rev-parse', '--abbrev-ref', 'HEAD').out.trim();
  assert.equal(g(repo, 'checkout', '-q', '-b', branch).code, 0);
  w(repo, rel, conteudo);
  g(repo, 'add', '--', rel);
  assert.equal(g(repo, 'commit', '--no-verify', '-m', msg).code, 0);
  const sha = g(repo, 'rev-parse', 'HEAD').out.trim();
  g(repo, 'checkout', '-q', atual);
  return sha;
}

test('importador reconcilia DONE verificado, DONE sem prova, READY, SUPERSEDED e DRAFT', (t) => {
  const { repo, name } = makeRepo(t);
  initTrack(repo);

  const shaBom = commitReal(repo, 'goal/demo-001', 'app/feito.ts', 'export const feito = 1;\n', 'goal(demo-001): feito de verdade');
  const shaOrfao = commitReal(repo, 'goal/orfa', 'app/orfao.ts', 'export const orfao = 1;\n', 'goal(demo-004): commit em outra branch');
  const bootstrap = g(repo, 'rev-parse', 'HEAD').out.trim();

  const manifest = {
    aep: '1.0-R2',
    track: 'demo',
    plan_ref: 'docs/planos/PLANO_DEMO.md',
    plan_rev: 3,
    risk_tier: 'MEDIO',
    branch_pattern: 'goal/demo-<nnn>',
    test_command: 'node scripts/goal-test.mjs',
    paths_base: ['app/**'],
    gates_extra: [],
    bootstrap_commit: bootstrap,
    fontes: ['docs/planos/PLANO_DEMO.md', 'docs/audits/AUDITORIA_DEMO.md'],
    plano_ids: ['demo-001', 'demo-002', 'demo-003', 'demo-004', 'demo-005', 'demo-007'],
    goals_declarados: [
      // 1) DONE com commit que existe E está na branch declarada
      { id: 'demo-001', situacao: 'DONE', commit: shaBom, branch: 'goal/demo-001', title: 'Feito e provado', worktree: name },
      // 2) DONE com commit INEXISTENTE → BLOCKED divergencia
      { id: 'demo-002', situacao: 'DONE', commit: 'f'.repeat(40), branch: 'goal/demo-002', title: 'Fantasma', worktree: name },
      // 3) READY → goals/
      { id: 'demo-003', situacao: 'READY', title: 'Pronto para executar', worktree: name },
      // 4) DONE com commit real, porém FORA da branch declarada → BLOCKED divergencia
      { id: 'demo-004', situacao: 'DONE', commit: shaOrfao, branch: 'goal/demo-004', title: 'Commit fora da branch', worktree: name },
      // 5) SUPERSEDED por plan_rev mais novo
      { id: 'demo-005', situacao: 'READY', plan_rev: 2, title: 'Plano velho', worktree: name },
      // 6) no manifesto mas NÃO no plano → BLOCKED decisao
      { id: 'demo-006', situacao: 'READY', title: 'Nunca foi planejado', worktree: name },
    ],
  };
  // demo-007 está no plano e NÃO no manifesto → DRAFT / pendência

  const manifestRel = 'import/demo/MANIFEST.json';
  w(repo, manifestRel, `${JSON.stringify(manifest, null, 2)}\n`);

  const r = aep(repo, ['import', 'demo', `--manifest=${manifestRel}`]);
  ev('i — importador: DONE verificado, DONE sem prova (BLOCKED), READY, SUPERSEDED, DRAFT',
    `$ node scripts/track.mjs import demo --manifest=${manifestRel}\n$ exit ${r.code}\n${r.all}`);
  assert.equal(r.code, 0, r.all);

  const linhas = fs.readFileSync(path.join(repo, 'docs/execution-tracks/demo/LEDGER.jsonl'), 'utf8')
    .split('\n').filter(Boolean).map((l) => JSON.parse(l));
  const porId = Object.fromEntries(linhas.map((l) => [l.goal, l]));

  // 1) DONE verificado
  assert.equal(porId['demo-001'].result, 'DONE');
  assert.equal(porId['demo-001'].source, 'importado');
  assert.equal(porId['demo-001'].bootstrap_commit, bootstrap);
  assert.equal(porId['demo-001'].head_commit, shaBom);
  assert.equal(fs.existsSync(path.join(repo, 'docs/execution-tracks/demo/_closed/goals/demo-001.md')), true);

  // 2) DONE com commit inexistente → BLOCKED divergencia, NUNCA presumido DONE
  assert.equal(porId['demo-002'].result, 'BLOCKED');
  assert.equal(porId['demo-002'].blocked_by, 'divergencia');
  assert.match(porId['demo-002'].evidencia.cmd, /git cat-file -e f{40}\^\{commit\}/);

  // 3) READY → goals/
  assert.equal(fs.existsSync(path.join(repo, 'docs/execution-tracks/demo/goals/demo-003.md')), true);
  assert.equal(porId['demo-003'], undefined, 'READY não gera linha de ledger');

  // 4) DONE fora da branch declarada → BLOCKED divergencia
  assert.equal(porId['demo-004'].result, 'BLOCKED');
  assert.equal(porId['demo-004'].blocked_by, 'divergencia');
  assert.match(porId['demo-004'].evidencia.cmd, /merge-base --is-ancestor/);

  // 5) SUPERSEDED
  assert.equal(porId['demo-005'].result, 'SUPERSEDED');
  assert.equal(fs.existsSync(path.join(repo, 'docs/execution-tracks/demo/_closed/goals/demo-005.md')), true);
  assert.equal(fs.existsSync(path.join(repo, 'docs/execution-tracks/demo/goals/demo-005.md')), false);

  // 6) no manifesto mas não no plano → BLOCKED decisao
  assert.equal(porId['demo-006'].result, 'BLOCKED');
  assert.equal(porId['demo-006'].blocked_by, 'decisao');

  // 7) no plano mas não no manifesto → DRAFT / pendência, fora de goals/
  assert.equal(fs.existsSync(path.join(repo, 'docs/execution-tracks/demo/goals/demo-007.md')), false);

  const rec = fs.readFileSync(path.join(repo, 'docs/execution-tracks/demo/_closed/reports/RECONCILIACAO.md'), 'utf8');
  ev('i — RECONCILIACAO.md gerado pelo importador',
    `$ cat docs/execution-tracks/demo/_closed/reports/RECONCILIACAO.md\n${rec}\n`);
  ev('i — LEDGER.jsonl após a importação',
    `$ cat docs/execution-tracks/demo/LEDGER.jsonl\n${linhas.map((l) => JSON.stringify(l)).join('\n')}\n`);
  assert.match(rec, /## 1\. Confirmados/);
  assert.match(rec, /## 2\. Divergentes/);
  assert.match(rec, /## 3\. Pendentes de planejamento/);
  assert.match(rec, /demo-007/);
  assert.match(rec, new RegExp(shaBom));

  // proveniência do manifesto
  assert.equal(fs.existsSync(path.join(repo, 'docs/execution-tracks/demo/_closed/reports/IMPORT-1-MANIFEST.json')), true);
  // o import/ bruto é gitignored e não entra no commit
  assert.equal(g(repo, 'ls-files', '--', 'import').out.trim(), '');
  // commit de estado só dentro de docs/execution-tracks/
  const tocados = g(repo, 'show', '--name-only', '--format=', 'HEAD').out.split('\n').filter(Boolean);
  assert.equal(tocados.every((p) => p.startsWith('docs/execution-tracks/') || p.startsWith('docs/ai-execution/')), true, tocados.join(' '));
  assert.equal(g(repo, 'log', '--format=%s', '-1').out.trim(), 'aep(demo): import 1 (plan_rev 3)');

  const st = JSON.parse(fs.readFileSync(path.join(repo, 'docs/execution-tracks/demo/state.json'), 'utf8'));
  assert.equal(st.bootstrap_commit, bootstrap);
  assert.equal(st.current_goal, 'demo-003');
  assert.equal(st.counters.goals_imported, linhas.length);
  assert.equal(aep(repo, ['verify', '--all']).code, 0);
  assert.equal(g(repo, 'status', '--porcelain').out.trim(), '');
});

test('importador mantém no máximo 3 GOALs no caminho quente e reporta o excedente', (t) => {
  const { repo, name } = makeRepo(t);
  initTrack(repo);
  const bootstrap = g(repo, 'rev-parse', 'HEAD').out.trim();
  const ids = ['demo-001', 'demo-002', 'demo-003', 'demo-004', 'demo-005'];
  const manifest = {
    aep: '1.0-R2',
    track: 'demo',
    plan_ref: 'docs/planos/PLANO_DEMO.md',
    plan_rev: 1,
    risk_tier: 'BAIXO',
    branch_pattern: 'goal/demo-<nnn>',
    test_command: 'node scripts/goal-test.mjs',
    paths_base: ['app/**'],
    gates_extra: [],
    bootstrap_commit: bootstrap,
    fontes: ['docs/planos/PLANO_DEMO.md'],
    plano_ids: ids,
    goals_declarados: ids.map((id) => ({ id, situacao: 'READY', title: id, worktree: name })),
  };
  w(repo, 'import/demo/MANIFEST.json', `${JSON.stringify(manifest, null, 2)}\n`);
  const r = aep(repo, ['import', 'demo', '--manifest=import/demo/MANIFEST.json']);
  assert.equal(r.code, 0, r.all);
  const quentes = fs.readdirSync(path.join(repo, 'docs/execution-tracks/demo/goals')).filter((f) => f.endsWith('.md'));
  assert.equal(quentes.length, 3);
  const rec = fs.readFileSync(path.join(repo, 'docs/execution-tracks/demo/_closed/reports/RECONCILIACAO.md'), 'utf8');
  assert.match(rec, /demo-004.*READY além do teto de 3/);
  assert.match(rec, /demo-005.*READY além do teto de 3/);
  assert.equal(aep(repo, ['verify', '--all']).code, 0);
});

test('importador recusa manifesto com path fora da gramática (exit 1)', (t) => {
  const { repo } = makeRepo(t);
  initTrack(repo);
  const manifest = {
    aep: '1.0-R2', track: 'demo', plan_ref: 'p.md', plan_rev: 1, risk_tier: 'BAIXO',
    branch_pattern: 'goal/demo-<nnn>', test_command: 'node scripts/goal-test.mjs',
    paths_base: ['app/**/*.ts'], gates_extra: [], bootstrap_commit: 'x',
    fontes: [], goals_declarados: [],
  };
  w(repo, 'import/demo/MANIFEST.json', `${JSON.stringify(manifest, null, 2)}\n`);
  const r = aep(repo, ['import', 'demo', '--manifest=import/demo/MANIFEST.json']);
  assert.equal(r.code, 1);
  assert.match(r.all, /Glob não suportado/);
});

// ---------------------------------------------------------------------------
// Correções do contrato de importação — gates_extra, fontes, gate_humano, plano_ids
// ---------------------------------------------------------------------------

/** Motivo canônico de gate humano pendente (§ D3 do corretivo). */
const MOTIVO_GATE_HUMANO = 'HUMAN_PUSH_AUTHORIZATION_NOT_SENT';

/** Lê o LEDGER.jsonl da trilha demo como array de objetos. */
function ledgerDe(repo) {
  return fs.readFileSync(path.join(repo, 'docs/execution-tracks/demo/LEDGER.jsonl'), 'utf8')
    .split('\n').filter(Boolean).map((l) => JSON.parse(l));
}

/** Lê o RECONCILIACAO.md da trilha demo. */
function reconciliacaoDe(repo) {
  return fs.readFileSync(path.join(repo, 'docs/execution-tracks/demo/_closed/reports/RECONCILIACAO.md'), 'utf8');
}

/** Lê o bloco AEP:META de um arquivo de GOAL. */
function metaDe(repo, rel) {
  const doc = fs.readFileSync(path.join(repo, rel), 'utf8');
  return JSON.parse(doc.split('<!-- AEP:META\n')[1].split('\n-->')[0]);
}

const GATE_EXTRA_11 = ['main', 'schema', 'migration', 'auth_externa', 'storage_r2_preview',
  'storage_r2_production', 'fiscal_readonly', 'portal_legado', 'dados_destrutivos', 'secrets', 'deploy'];

test('C1: gates_extra com 11 gates de domínio e zero interseção com gates centrais é aceito', (t) => {
  const { repo, name } = makeRepo(t);
  initTrack(repo);
  const bootstrap = g(repo, 'rev-parse', 'HEAD').out.trim();
  const manifest = {
    aep: '1.0-R2', track: 'demo', plan_ref: 'p.md', plan_rev: 1, risk_tier: 'ALTO',
    branch_pattern: 'goal/demo-<nnn>', test_command: 'node scripts/goal-test.mjs',
    paths_base: ['app/**'], gates_extra: GATE_EXTRA_11, bootstrap_commit: bootstrap,
    fontes: { resumo: 'import/demo/RESUMO.md' }, goals_declarados: [],
  };
  w(repo, 'import/demo/MANIFEST.json', `${JSON.stringify(manifest, null, 2)}\n`);
  const r = aep(repo, ['import', 'demo', '--manifest=import/demo/MANIFEST.json']);
  assert.equal(r.code, 0, r.all);
  // Nenhum dos 11 é gate central G-*; a importação não pode falhar por vocabulário.
  assert.equal(GATE_EXTRA_11.every((id) => !id.startsWith('G-')), true);
});

test('C2a: fontes no formato objeto (canônico) são consumidas sem .map sobre objeto', (t) => {
  const { repo, name } = makeRepo(t);
  initTrack(repo);
  const bootstrap = g(repo, 'rev-parse', 'HEAD').out.trim();
  const sha = commitReal(repo, 'goal/demo-001', 'app/feito.ts', 'export const feito = 1;\n', 'goal(demo-001): feito');
  const manifest = {
    aep: '1.0-R2', track: 'demo', plan_ref: 'p.md', plan_rev: 1, risk_tier: 'BAIXO',
    branch_pattern: 'goal/demo-<nnn>', test_command: 'node scripts/goal-test.mjs',
    paths_base: ['app/**'], gates_extra: [], bootstrap_commit: bootstrap,
    fontes: { resumo_canonico: 'import/demo/RESUMO.md', masterplan: 'import/demo/MASTERPLAN.md', comandos: 'import/demo/COMANDOS.md' },
    goals_declarados: [{ id: 'demo-001', situacao: 'DONE', commit: sha, branch: 'goal/demo-001', title: 'Feito', worktree: name }],
  };
  w(repo, 'import/demo/MANIFEST.json', `${JSON.stringify(manifest, null, 2)}\n`);
  const r = aep(repo, ['import', 'demo', '--manifest=import/demo/MANIFEST.json']);
  assert.equal(r.code, 0, r.all);
  const doc = fs.readFileSync(path.join(repo, 'docs/execution-tracks/demo/_closed/goals/demo-001.md'), 'utf8');
  assert.match(doc, /resumo_canonico.*RESUMO\.md/);
});

test('C2b: fontes em array legado são aceitas para retrocompatibilidade', (t) => {
  const { repo, name } = makeRepo(t);
  initTrack(repo);
  const bootstrap = g(repo, 'rev-parse', 'HEAD').out.trim();
  const sha = commitReal(repo, 'goal/demo-001', 'app/feito.ts', 'export const feito = 1;\n', 'goal(demo-001): feito');
  const manifest = {
    aep: '1.0-R2', track: 'demo', plan_ref: 'p.md', plan_rev: 1, risk_tier: 'BAIXO',
    branch_pattern: 'goal/demo-<nnn>', test_command: 'node scripts/goal-test.mjs',
    paths_base: ['app/**'], gates_extra: [], bootstrap_commit: bootstrap,
    fontes: ['docs/planos/PLANO.md', 'docs/audits/AUDIT.md'],
    goals_declarados: [{ id: 'demo-001', situacao: 'DONE', commit: sha, branch: 'goal/demo-001', title: 'Feito', worktree: name }],
  };
  w(repo, 'import/demo/MANIFEST.json', `${JSON.stringify(manifest, null, 2)}\n`);
  const r = aep(repo, ['import', 'demo', '--manifest=import/demo/MANIFEST.json']);
  assert.equal(r.code, 0, r.all);
  const doc = fs.readFileSync(path.join(repo, 'docs/execution-tracks/demo/_closed/goals/demo-001.md'), 'utf8');
  assert.match(doc, /PLANO\.md/);
});

test('C3: gate_humano pendente vira BLOCKED com o motivo canônico e não vai ao caminho quente', (t) => {
  const { repo, name } = makeRepo(t);
  initTrack(repo);
  const bootstrap = g(repo, 'rev-parse', 'HEAD').out.trim();
  const manifest = {
    aep: '1.0-R2', track: 'demo', plan_ref: 'p.md', plan_rev: 1, risk_tier: 'ALTO',
    branch_pattern: 'goal/demo-<nnn>', test_command: 'node scripts/goal-test.mjs',
    paths_base: ['app/**'], gates_extra: [], bootstrap_commit: bootstrap,
    fontes: ['p.md'],
    goals_declarados: [{ id: 'demo-012G', situacao: 'READY', gate_humano: true, title: 'Publish main', worktree: name }],
  };
  w(repo, 'import/demo/MANIFEST.json', `${JSON.stringify(manifest, null, 2)}\n`);
  const r = aep(repo, ['import', 'demo', '--manifest=import/demo/MANIFEST.json']);
  assert.equal(r.code, 0, r.all);
  assert.match(r.all, /gate humano \(BLOCKED\):\s*1/);
  assert.match(r.all, new RegExp(`demo-012G\\[${MOTIVO_GATE_HUMANO}\\]`));
  // NÃO está no caminho quente e NÃO é READY.
  assert.equal(fs.existsSync(path.join(repo, 'docs/execution-tracks/demo/goals/demo-012G.md')), false);
  // Está em _closed/goals/ com status BLOCKED — estado já existente na máquina do § 3.
  const meta = metaDe(repo, 'docs/execution-tracks/demo/_closed/goals/demo-012G.md');
  assert.equal(meta.status, 'BLOCKED');
  assert.equal(meta.gate_humano.decisao, MOTIVO_GATE_HUMANO);
  // O ledger ratifica o bloqueio com a categoria já prevista pelo protocolo.
  const linha = ledgerDe(repo).find((l) => l.goal === 'demo-012G');
  assert.equal(linha.result, 'BLOCKED');
  assert.equal(linha.blocked_by, 'gate');
  assert.equal(linha.reason, MOTIVO_GATE_HUMANO);
  // A reconciliação explica a pendência.
  const rec = reconciliacaoDe(repo);
  assert.match(rec, /## 4\. Bloqueados por gate humano \(BLOCKED — não executáveis\)/);
  assert.match(rec, new RegExp(`demo-012G.*BLOCKED[\\s\\S]*?${MOTIVO_GATE_HUMANO}`));
  const st = JSON.parse(fs.readFileSync(path.join(repo, 'docs/execution-tracks/demo/state.json'), 'utf8'));
  assert.equal(st.current_goal, null);
  assert.notEqual(st.status, 'RUNNING', 'sem GOAL no caminho quente a trilha não pode estar RUNNING');
  assert.equal(st.status, 'BLOCKED', 'a última ratificação é um bloqueio humano');
  assert.equal(aep(repo, ['verify', '--all']).code, 0);
});

test('C3b: READY SEM gate humano continua READY e elegível — o gate não vaza para os demais', (t) => {
  const { repo, name } = makeRepo(t);
  initTrack(repo);
  const bootstrap = g(repo, 'rev-parse', 'HEAD').out.trim();
  const manifest = {
    aep: '1.0-R2', track: 'demo', plan_ref: 'p.md', plan_rev: 1, risk_tier: 'ALTO',
    branch_pattern: 'goal/demo-<nnn>', test_command: 'node scripts/goal-test.mjs',
    paths_base: ['app/**'], gates_extra: [], bootstrap_commit: bootstrap,
    fontes: ['p.md'],
    goals_declarados: [
      { id: 'demo-001', situacao: 'READY', title: 'Sem gate', worktree: name },
      { id: 'demo-012G', situacao: 'READY', gate_humano: true, title: 'Com gate', worktree: name },
    ],
  };
  w(repo, 'import/demo/MANIFEST.json', `${JSON.stringify(manifest, null, 2)}\n`);
  assert.equal(aep(repo, ['import', 'demo', '--manifest=import/demo/MANIFEST.json']).code, 0);
  assert.equal(fs.existsSync(path.join(repo, 'docs/execution-tracks/demo/goals/demo-001.md')), true);
  assert.equal(metaDe(repo, 'docs/execution-tracks/demo/goals/demo-001.md').status, 'READY');
  assert.equal(fs.existsSync(path.join(repo, 'docs/execution-tracks/demo/goals/demo-012G.md')), false);
  const st = JSON.parse(fs.readFileSync(path.join(repo, 'docs/execution-tracks/demo/state.json'), 'utf8'));
  assert.equal(st.current_goal, 'demo-001');
  assert.equal(aep(repo, ['verify', '--all']).code, 0);
});

test('C3c: o gate humano NÃO depende do ID 012G — qualquer ID recebe o mesmo tratamento', (t) => {
  const { repo, name } = makeRepo(t);
  initTrack(repo);
  const bootstrap = g(repo, 'rev-parse', 'HEAD').out.trim();
  const manifest = {
    aep: '1.0-R2', track: 'demo', plan_ref: 'p.md', plan_rev: 1, risk_tier: 'ALTO',
    branch_pattern: 'goal/demo-<nnn>', test_command: 'node scripts/goal-test.mjs',
    paths_base: ['app/**'], gates_extra: [], bootstrap_commit: bootstrap,
    fontes: ['p.md'],
    goals_declarados: [
      { id: 'PROJETO-QUALQUER-ABC', situacao: 'READY', gate_humano: true, title: 'Outro projeto', worktree: name },
    ],
  };
  w(repo, 'import/demo/MANIFEST.json', `${JSON.stringify(manifest, null, 2)}\n`);
  const r = aep(repo, ['import', 'demo', '--manifest=import/demo/MANIFEST.json']);
  assert.equal(r.code, 0, r.all);
  assert.match(r.all, new RegExp(`PROJETO-QUALQUER-ABC\\[${MOTIVO_GATE_HUMANO}\\]`));
  assert.equal(fs.existsSync(path.join(repo, 'docs/execution-tracks/demo/goals/PROJETO-QUALQUER-ABC.md')), false);
  const linha = ledgerDe(repo).find((l) => l.goal === 'PROJETO-QUALQUER-ABC');
  assert.equal(linha.result, 'BLOCKED');
  assert.equal(linha.reason, MOTIVO_GATE_HUMANO);
});

test('C3d: motivo explícito de gate humano é normalizado e preservado', (t) => {
  const { repo, name } = makeRepo(t);
  initTrack(repo);
  const bootstrap = g(repo, 'rev-parse', 'HEAD').out.trim();
  const manifest = {
    aep: '1.0-R2', track: 'demo', plan_ref: 'p.md', plan_rev: 1, risk_tier: 'ALTO',
    branch_pattern: 'goal/demo-<nnn>', test_command: 'node scripts/goal-test.mjs',
    paths_base: ['app/**'], gates_extra: [], bootstrap_commit: bootstrap,
    fontes: ['p.md'],
    goals_declarados: [{
      id: 'demo-777', situacao: 'READY', title: 'Motivo próprio', worktree: name,
      gate_humano: { requerido: true, decisao: '  HUMAN_DEPLOY_APPROVAL_NOT_SENT  ' },
    }],
  };
  w(repo, 'import/demo/MANIFEST.json', `${JSON.stringify(manifest, null, 2)}\n`);
  assert.equal(aep(repo, ['import', 'demo', '--manifest=import/demo/MANIFEST.json']).code, 0);
  const linha = ledgerDe(repo).find((l) => l.goal === 'demo-777');
  assert.equal(linha.reason, 'HUMAN_DEPLOY_APPROVAL_NOT_SENT', 'motivo explícito preservado, sem espaços');
});

test('C4: gate_humano pendente impede elegibilidade — open não encontra GOAL', (t) => {
  const { repo, name } = makeRepo(t);
  initTrack(repo);
  const bootstrap = g(repo, 'rev-parse', 'HEAD').out.trim();
  const manifest = {
    aep: '1.0-R2', track: 'demo', plan_ref: 'p.md', plan_rev: 1, risk_tier: 'ALTO',
    branch_pattern: 'goal/demo-<nnn>', test_command: 'node scripts/goal-test.mjs',
    paths_base: ['app/**'], gates_extra: [], bootstrap_commit: bootstrap,
    fontes: ['p.md'],
    goals_declarados: [{ id: 'demo-012G', situacao: 'READY', gate_humano: true, title: 'Publish', worktree: name }],
  };
  w(repo, 'import/demo/MANIFEST.json', `${JSON.stringify(manifest, null, 2)}\n`);
  assert.equal(aep(repo, ['import', 'demo', '--manifest=import/demo/MANIFEST.json']).code, 0);
  g(repo, 'checkout', '-q', '-b', 'goal/demo-012g');
  const o = aep(repo, ['open', 'demo']);
  assert.notEqual(o.code, 0);
  assert.match(o.all, /nenhum GOAL com status READY|Não há GOAL elegível/);
});

test('C5: ausência de aprovação (silêncio/undefined/false) NÃO libera o GOAL', (t) => {
  const { repo, name } = makeRepo(t);
  initTrack(repo);
  const bootstrap = g(repo, 'rev-parse', 'HEAD').out.trim();
  for (const [i, gh] of [true, { requerido: true }, { requerido: true, aprovacao: { aprovado: false } }].entries()) {
    const id = `demo-01${i}`;
    const manifest = {
      aep: '1.0-R2', track: 'demo', plan_ref: 'p.md', plan_rev: 1, risk_tier: 'ALTO',
      branch_pattern: 'goal/demo-<nnn>', test_command: 'node scripts/goal-test.mjs',
      paths_base: ['app/**'], gates_extra: [], bootstrap_commit: bootstrap,
      fontes: ['p.md'],
      goals_declarados: [{ id, situacao: 'READY', gate_humano: gh, title: id, worktree: name }],
    };
    w(repo, 'import/demo/MANIFEST.json', `${JSON.stringify(manifest, null, 2)}\n`);
    const r = aep(repo, ['import', 'demo', '--manifest=import/demo/MANIFEST.json']);
    assert.equal(r.code, 0, r.all);
    assert.equal(fs.existsSync(path.join(repo, `docs/execution-tracks/demo/goals/${id}.md`)), false,
      `gate_humano=${JSON.stringify(gh)} não pode liberar READY`);
    const st = JSON.parse(fs.readFileSync(path.join(repo, 'docs/execution-tracks/demo/state.json'), 'utf8'));
    assert.equal(st.current_goal, null);
  }
});

test('C6: aprovação explícita pelo fluxo oficial libera o gate humano para READY', (t) => {
  const { repo, name } = makeRepo(t);
  initTrack(repo);
  const bootstrap = g(repo, 'rev-parse', 'HEAD').out.trim();
  const manifest = {
    aep: '1.0-R2', track: 'demo', plan_ref: 'p.md', plan_rev: 1, risk_tier: 'ALTO',
    branch_pattern: 'goal/demo-<nnn>', test_command: 'node scripts/goal-test.mjs',
    paths_base: ['app/**'], gates_extra: [], bootstrap_commit: bootstrap,
    fontes: ['p.md'],
    goals_declarados: [{
      id: 'demo-012G', situacao: 'READY', title: 'Publish aprovado', worktree: name,
      gate_humano: { requerido: true, aprovacao: { aprovado: true, autorizacao: 'HUMAN_PUSH_AUTHORIZATION_SENT', registrado_por: 'rafael', em: '2026-07-30T00:00:00Z' } },
    }],
  };
  w(repo, 'import/demo/MANIFEST.json', `${JSON.stringify(manifest, null, 2)}\n`);
  const r = aep(repo, ['import', 'demo', '--manifest=import/demo/MANIFEST.json']);
  assert.equal(r.code, 0, r.all);
  assert.equal(fs.existsSync(path.join(repo, 'docs/execution-tracks/demo/goals/demo-012G.md')), true,
    'com aprovação explícita o GOAL entra no caminho quente como READY');
  const st = JSON.parse(fs.readFileSync(path.join(repo, 'docs/execution-tracks/demo/state.json'), 'utf8'));
  assert.equal(st.current_goal, 'demo-012G');
});

test('C8: commit inexistente ou branch incorreta bloqueia a importação (divergencia)', (t) => {
  const { repo, name } = makeRepo(t);
  initTrack(repo);
  const bootstrap = g(repo, 'rev-parse', 'HEAD').out.trim();
  const manifest = {
    aep: '1.0-R2', track: 'demo', plan_ref: 'p.md', plan_rev: 1, risk_tier: 'ALTO',
    branch_pattern: 'goal/demo-<nnn>', test_command: 'node scripts/goal-test.mjs',
    paths_base: ['app/**'], gates_extra: [], bootstrap_commit: bootstrap,
    fontes: ['p.md'],
    goals_declarados: [
      { id: 'demo-001', situacao: 'DONE', commit: 'f'.repeat(40), branch: 'goal/demo-001', title: 'Fantasma', worktree: name },
    ],
  };
  w(repo, 'import/demo/MANIFEST.json', `${JSON.stringify(manifest, null, 2)}\n`);
  const r = aep(repo, ['import', 'demo', '--manifest=import/demo/MANIFEST.json']);
  assert.equal(r.code, 0, r.all);
  assert.match(r.all, /divergentes \(BLOCKED\):\s*1/);
  const linhas = ledgerDe(repo);
  assert.equal(linhas[0].result, 'BLOCKED');
  assert.equal(linhas[0].blocked_by, 'divergencia');
});

test('C9: GOAL 012G permanece não executável — nem READY nem elegível nem abrível', (t) => {
  const { repo, name } = makeRepo(t);
  initTrack(repo);
  const bootstrap = g(repo, 'rev-parse', 'HEAD').out.trim();
  const manifest = {
    aep: '1.0-R2', track: 'demo', plan_ref: 'p.md', plan_rev: 1, risk_tier: 'ALTO',
    branch_pattern: 'goal/demo-<nnn>', test_command: 'node scripts/goal-test.mjs',
    paths_base: ['app/**'], gates_extra: GATE_EXTRA_11, bootstrap_commit: bootstrap,
    fontes: ['p.md'],
    goals_declarados: [
      { id: 'CONTADOR-HUB-FECHAMENTO-R2-012G-PUBLISH-MAIN', situacao: 'READY', gate_humano: true, title: 'Publish main', worktree: name },
    ],
  };
  w(repo, 'import/demo/MANIFEST.json', `${JSON.stringify(manifest, null, 2)}\n`);
  assert.equal(aep(repo, ['import', 'demo', '--manifest=import/demo/MANIFEST.json']).code, 0);
  const quentes = fs.readdirSync(path.join(repo, 'docs/execution-tracks/demo/goals')).filter((f) => f.endsWith('.md'));
  assert.equal(quentes.length, 0, 'nenhum GOAL no caminho quente');
  const st = JSON.parse(fs.readFileSync(path.join(repo, 'docs/execution-tracks/demo/state.json'), 'utf8'));
  assert.equal(st.current_goal, null);
  assert.equal(st.next_goal, null);
  assert.equal(aep(repo, ['verify', '--all']).code, 0);
});

test('C10: dry-run não toca state.json, LEDGER.jsonl, REGISTRY.md ou goals/', (t) => {
  const { repo, name } = makeRepo(t);
  initTrack(repo);
  const bootstrap = g(repo, 'rev-parse', 'HEAD').out.trim();
  const before = {
    state: g(repo, 'hash-object', 'docs/execution-tracks/demo/state.json').out.trim(),
    ledger: g(repo, 'hash-object', 'docs/execution-tracks/demo/LEDGER.jsonl').out.trim(),
    registry: g(repo, 'hash-object', 'docs/execution-tracks/REGISTRY.md').out.trim(),
  };
  const manifest = {
    aep: '1.0-R2', track: 'demo', plan_ref: 'p.md', plan_rev: 1, risk_tier: 'ALTO',
    branch_pattern: 'goal/demo-<nnn>', test_command: 'node scripts/goal-test.mjs',
    paths_base: ['app/**'], gates_extra: [], bootstrap_commit: bootstrap,
    fontes: ['p.md'], goals_declarados: [{ id: 'demo-001', situacao: 'READY', title: 'x', worktree: name }],
  };
  w(repo, 'import/demo/MANIFEST.json', `${JSON.stringify(manifest, null, 2)}\n`);
  // status é somente leitura — não deve alterar nada.
  assert.equal(aep(repo, ['status', 'demo']).code, 0);
  assert.equal(g(repo, 'hash-object', 'docs/execution-tracks/demo/state.json').out.trim(), before.state);
  assert.equal(g(repo, 'hash-object', 'docs/execution-tracks/demo/LEDGER.jsonl').out.trim(), before.ledger);
  assert.equal(g(repo, 'hash-object', 'docs/execution-tracks/REGISTRY.md').out.trim(), before.registry);
  const quentes = fs.readdirSync(path.join(repo, 'docs/execution-tracks/demo/goals')).filter((f) => f.endsWith('.md'));
  assert.equal(quentes.length, 0, 'status não cria GOAL em goals/');
});

test('C11: gates_extra é preservado como metadata governada no GOAL importado', (t) => {
  const { repo, name } = makeRepo(t);
  initTrack(repo);
  const bootstrap = g(repo, 'rev-parse', 'HEAD').out.trim();
  const sha = commitReal(repo, 'goal/demo-001', 'app/feito.ts', 'export const feito = 1;\n', 'goal(demo-001): feito');
  const manifest = {
    aep: '1.0-R2', track: 'demo', plan_ref: 'p.md', plan_rev: 1, risk_tier: 'ALTO',
    branch_pattern: 'goal/demo-<nnn>', test_command: 'node scripts/goal-test.mjs',
    paths_base: ['app/**'], gates_extra: GATE_EXTRA_11, bootstrap_commit: bootstrap,
    fontes: ['p.md'],
    goals_declarados: [{ id: 'demo-001', situacao: 'DONE', commit: sha, branch: 'goal/demo-001', title: 'Feito', worktree: name }],
  };
  w(repo, 'import/demo/MANIFEST.json', `${JSON.stringify(manifest, null, 2)}\n`);
  assert.equal(aep(repo, ['import', 'demo', '--manifest=import/demo/MANIFEST.json']).code, 0);
  const doc = fs.readFileSync(path.join(repo, 'docs/execution-tracks/demo/_closed/goals/demo-001.md'), 'utf8');
  const meta = JSON.parse(doc.split('<!-- AEP:META\n')[1].split('\n-->')[0]);
  assert.equal(Array.isArray(meta.gates_extra), true);
  assert.equal(meta.gates_extra.length, 11);
  assert.equal(meta.gates_extra[0].id, 'main');
});

test('C12: import --dry-run classifica sem escrever state.json, LEDGER, REGISTRY ou goals/', (t) => {
  const { repo, name } = makeRepo(t);
  initTrack(repo);
  const bootstrap = g(repo, 'rev-parse', 'HEAD').out.trim();
  const before = {
    state: g(repo, 'hash-object', 'docs/execution-tracks/demo/state.json').out.trim(),
    ledger: g(repo, 'hash-object', 'docs/execution-tracks/demo/LEDGER.jsonl').out.trim(),
    registry: g(repo, 'hash-object', 'docs/execution-tracks/REGISTRY.md').out.trim(),
  };
  const sha = commitReal(repo, 'goal/demo-001', 'app/feito.ts', 'export const feito = 1;\n', 'goal(demo-001): feito');
  const manifest = {
    aep: '1.0-R2', track: 'demo', plan_ref: 'p.md', plan_rev: 1, risk_tier: 'ALTO',
    branch_pattern: 'goal/demo-<nnn>', test_command: 'node scripts/goal-test.mjs',
    paths_base: ['app/**'], gates_extra: GATE_EXTRA_11, bootstrap_commit: bootstrap,
    fontes: { resumo: 'import/demo/RESUMO.md' },
    goals_declarados: [
      { id: 'demo-001', situacao: 'DONE', commit: sha, branch: 'goal/demo-001', title: 'Feito', worktree: name },
      { id: 'demo-012G', situacao: 'READY', gate_humano: true, title: 'Publish', worktree: name },
    ],
  };
  w(repo, 'import/demo/MANIFEST.json', `${JSON.stringify(manifest, null, 2)}\n`);
  const r = aep(repo, ['import', 'demo', '--manifest=import/demo/MANIFEST.json', '--dry-run']);
  assert.equal(r.code, 0, r.all);
  assert.match(r.all, /DRY-RUN/);
  assert.match(r.all, /demo-001/);
  assert.match(r.all, /gate humano \(BLOCKED\):\s*1/);
  // Nada operacional foi escrito.
  assert.equal(g(repo, 'hash-object', 'docs/execution-tracks/demo/state.json').out.trim(), before.state);
  assert.equal(g(repo, 'hash-object', 'docs/execution-tracks/demo/LEDGER.jsonl').out.trim(), before.ledger);
  assert.equal(g(repo, 'hash-object', 'docs/execution-tracks/REGISTRY.md').out.trim(), before.registry);
  assert.equal(fs.readdirSync(path.join(repo, 'docs/execution-tracks/demo/goals')).filter((f) => f.endsWith('.md')).length, 0);
  assert.equal(fs.readdirSync(path.join(repo, 'docs/execution-tracks/demo/_closed/goals')).filter((f) => f.endsWith('.md')).length, 0);
  assert.equal(g(repo, 'status', '--porcelain').out.trim(), '', 'dry-run não suja a árvore');
});

// ---------------------------------------------------------------------------
// D4 — plano_ids. `plano_ids` e `goals_declarados` têm funções DIFERENTES:
// não há fallback de um para o outro.
// ---------------------------------------------------------------------------

/** Manifesto mínimo de `demo` com os campos obrigatórios preenchidos. */
function manifestoBase(bootstrap, over = {}) {
  return {
    aep: '1.0-R2', track: 'demo', plan_ref: 'p.md', plan_rev: 1, risk_tier: 'BAIXO',
    branch_pattern: 'goal/demo-<nnn>', test_command: 'node scripts/goal-test.mjs',
    paths_base: ['app/**'], gates_extra: [], bootstrap_commit: bootstrap,
    fontes: ['p.md'], goals_declarados: [],
    ...over,
  };
}

function importarManifesto(repo, manifest) {
  w(repo, 'import/demo/MANIFEST.json', `${JSON.stringify(manifest, null, 2)}\n`);
  return aep(repo, ['import', 'demo', '--manifest=import/demo/MANIFEST.json']);
}

/** Cria `n` commits encadeados numa única branch e devolve os SHAs, em ordem. */
function commitsEmCadeia(repo, branch, n, prefixo) {
  const atual = g(repo, 'rev-parse', '--abbrev-ref', 'HEAD').out.trim();
  assert.equal(g(repo, 'checkout', '-q', '-b', branch).code, 0);
  const shas = [];
  for (let i = 0; i < n; i += 1) {
    const rel = `app/${prefixo}-${i}.ts`;
    w(repo, rel, `export const entrega${i} = ${i};\n`);
    g(repo, 'add', '--', rel);
    assert.equal(g(repo, 'commit', '--no-verify', '-m', `goal(${prefixo}-${i}): entrega real`).code, 0);
    shas.push(g(repo, 'rev-parse', 'HEAD').out.trim());
  }
  assert.equal(g(repo, 'checkout', '-q', atual).code, 0);
  return shas;
}

test('D4a: plano_ids ausente equivale a [] — sem fallback e sem DRAFT fantasma', (t) => {
  const { repo, name } = makeRepo(t);
  initTrack(repo);
  const bootstrap = g(repo, 'rev-parse', 'HEAD').out.trim();
  const r = importarManifesto(repo, manifestoBase(bootstrap, {
    goals_declarados: [{ id: 'demo-001', situacao: 'READY', title: 'Pronto', worktree: name }],
  }));
  assert.equal(r.code, 0, r.all);
  // Ausência do campo NÃO bloqueia o que foi declarado…
  assert.equal(fs.existsSync(path.join(repo, 'docs/execution-tracks/demo/goals/demo-001.md')), true);
  assert.match(r.all, /divergentes \(BLOCKED\):\s*0/);
  // …e NÃO inventa DRAFTs a partir de goals_declarados (era o efeito do fallback).
  assert.match(r.all, /rascunhos \(DRAFT\):\s*0/);
  const rec = reconciliacaoDe(repo);
  assert.doesNotMatch(rec, /demo-001.*DRAFT/);
});

test('D4b: plano_ids explicitamente [] se comporta como ausente', (t) => {
  const { repo, name } = makeRepo(t);
  initTrack(repo);
  const bootstrap = g(repo, 'rev-parse', 'HEAD').out.trim();
  const r = importarManifesto(repo, manifestoBase(bootstrap, {
    plano_ids: [],
    goals_declarados: [{ id: 'demo-001', situacao: 'READY', title: 'Pronto', worktree: name }],
  }));
  assert.equal(r.code, 0, r.all);
  assert.equal(fs.existsSync(path.join(repo, 'docs/execution-tracks/demo/goals/demo-001.md')), true);
  assert.match(r.all, /rascunhos \(DRAFT\):\s*0/);
});

test('D4c: IDs só em plano_ids viram DRAFT — fora do caminho quente, do ledger e do open', (t) => {
  const { repo, name } = makeRepo(t);
  initTrack(repo);
  const bootstrap = g(repo, 'rev-parse', 'HEAD').out.trim();
  const r = importarManifesto(repo, manifestoBase(bootstrap, {
    plano_ids: ['demo-001', 'demo-900', 'demo-901'],
    goals_declarados: [{ id: 'demo-001', situacao: 'READY', title: 'Pronto', worktree: name }],
  }));
  assert.equal(r.code, 0, r.all);
  assert.match(r.all, /rascunhos \(DRAFT\):\s*2 → demo-900, demo-901/);
  for (const id of ['demo-900', 'demo-901']) {
    assert.equal(fs.existsSync(path.join(repo, `docs/execution-tracks/demo/goals/${id}.md`)), false, `${id} não pode ir ao caminho quente`);
    assert.equal(fs.existsSync(path.join(repo, `docs/execution-tracks/demo/_closed/goals/${id}.md`)), false, `${id} não é um GOAL fechado`);
    assert.equal(ledgerDe(repo).some((l) => l.goal === id), false, `${id} não gera ratificação no ledger`);
  }
  // DRAFT aparece no tracking como planejamento futuro, sem exigir commit/branch/prova.
  const rec = reconciliacaoDe(repo);
  assert.match(rec, /demo-900` → DRAFT · no plano \(`plano_ids`\) e não declarado no manifesto/);
  assert.match(rec, /não exige commit, branch nem prova no Git/);
  // O único elegível é o READY declarado — nenhum futuro entra na fila.
  const st = JSON.parse(fs.readFileSync(path.join(repo, 'docs/execution-tracks/demo/state.json'), 'utf8'));
  assert.equal(st.current_goal, 'demo-001');
  assert.equal(st.next_goal, null);
  assert.equal(aep(repo, ['verify', '--all']).code, 0);
});

test('D4d: plano_ids inválido (string isolada, objeto, item não string) falha com exit 1', (t) => {
  const { repo } = makeRepo(t);
  initTrack(repo);
  const bootstrap = g(repo, 'rev-parse', 'HEAD').out.trim();
  const invalidos = [
    ['string isolada', 'demo-001'],
    ['objeto', { 'demo-001': true }],
    ['número', 42],
    ['boolean', true],
  ];
  for (const [rotulo, valor] of invalidos) {
    const r = importarManifesto(repo, manifestoBase(bootstrap, { plano_ids: valor }));
    assert.equal(r.code, 1, `${rotulo} deveria falhar: ${r.all}`);
    assert.match(r.all, /plano_ids deve ser um array de IDs/);
  }
  const itemRuim = importarManifesto(repo, manifestoBase(bootstrap, { plano_ids: ['demo-001', 7] }));
  assert.equal(itemRuim.code, 1);
  assert.match(itemRuim.all, /Cada item de plano_ids deve ser um ID/);
  const itemVazio = importarManifesto(repo, manifestoBase(bootstrap, { plano_ids: ['demo-001', '   '] }));
  assert.equal(itemVazio.code, 1);
  assert.match(itemVazio.all, /Cada item de plano_ids deve ser um ID/);
});

test('D4e: duplicatas internas de plano_ids são eliminadas deterministicamente', (t) => {
  const { repo } = makeRepo(t);
  initTrack(repo);
  const bootstrap = g(repo, 'rev-parse', 'HEAD').out.trim();
  const r = importarManifesto(repo, manifestoBase(bootstrap, {
    plano_ids: ['demo-900', 'demo-901', 'demo-900', 'demo-901', 'demo-900'],
  }));
  assert.equal(r.code, 0, r.all);
  assert.match(r.all, /rascunhos \(DRAFT\):\s*2 → demo-900, demo-901/);
  const rec = reconciliacaoDe(repo);
  assert.equal((rec.match(/`demo-900` → DRAFT/g) || []).length, 1, 'uma única entrada por ID');
});

test('D4f: ID em plano_ids E em goals_declarados prevalece o declarado, sem entrada dupla', (t) => {
  const { repo, name } = makeRepo(t);
  initTrack(repo);
  const bootstrap = g(repo, 'rev-parse', 'HEAD').out.trim();
  const sha = commitReal(repo, 'goal/demo-001', 'app/feito.ts', 'export const feito = 1;\n', 'goal(demo-001): feito');
  const r = importarManifesto(repo, manifestoBase(bootstrap, {
    plano_ids: ['demo-001', 'demo-002', 'demo-900'],
    goals_declarados: [
      { id: 'demo-001', situacao: 'DONE', commit: sha, branch: 'goal/demo-001', title: 'Feito', worktree: name },
      { id: 'demo-002', situacao: 'READY', title: 'Pronto', worktree: name },
    ],
  }));
  assert.equal(r.code, 0, r.all);
  // Só demo-900 é DRAFT; os declarados mantêm a situação operacional.
  assert.match(r.all, /rascunhos \(DRAFT\):\s*1 → demo-900/);
  assert.equal(ledgerDe(repo).find((l) => l.goal === 'demo-001').result, 'DONE');
  assert.equal(fs.existsSync(path.join(repo, 'docs/execution-tracks/demo/goals/demo-002.md')), true);
  const rec = reconciliacaoDe(repo);
  assert.doesNotMatch(rec, /`demo-001` → DRAFT/);
  assert.doesNotMatch(rec, /`demo-002` → DRAFT/);
});

// ---------------------------------------------------------------------------
// Cenário integrado — equivalente ao manifesto real da trilha contador.
// ---------------------------------------------------------------------------

const CONTADOR_DONE = [
  'CONTADOR-HUB-STATUS-RECONCILE-001',
  'CONTADOR-HUB-HONESTY-ROUTE-SAFETY-002',
  'CONTADOR-HUB-P0-AUTH-EXTERNA-003',
  'CONTADOR-HUB-P0-STORE-SCOPE-004',
  'CONTADOR-HUB-COMPETENCIA-CONTRATOS-005',
  'CONTADOR-HUB-DADOS-REAIS-READONLY-006',
  'CONTADOR-HUB-FECHAMENTO-READONLY-007',
  'CONTADOR-HUB-PACOTE-EXPORT-MVP-008',
  'CONTADOR-HUB-SCHEMA-NUCLEO-009',
  'CONTADOR-HUB-STATUS-COMENTARIOS-011',
];
const CONTADOR_SUPERSEDED = [
  'CONTADOR-HUB-DOCUMENTOS-REAL-010',
  'CONTADOR-HUB-FECHAMENTO-SNAPSHOT-012',
];
const CONTADOR_GATE = 'CONTADOR-HUB-FECHAMENTO-R2-012G-PUBLISH-MAIN';
const CONTADOR_FUTUROS = [
  'CONTADOR-HUB-PORTAL-EXTERNO-AUDIT-013',
  'CONTADOR-HUB-IDENTIDADE-CONVITE-014',
  'CONTADOR-HUB-PORTAL-EXTERNO-READONLY-015',
  'CONTADOR-HUB-OBRIGACOES-GUIAS-016',
  'CONTADOR-HUB-OMNI-AGENT-INTEGRATION-017',
  'CONTADOR-HUB-FISCAL-INTEGRATION-018',
  'CONTADOR-HUB-PRODUCTION-HARDENING-019',
];

test('CI1: cenário integrado — 10 DONE, 2 SUPERSEDED, 012G BLOCKED por gate humano, 013–019 DRAFT', (t) => {
  const { repo, name } = makeRepo(t);
  initTrack(repo);
  const produtivoAntes = g(repo, 'hash-object', 'app/produtivo.ts').out.trim();
  const branch = 'goal/contador-entregas';
  const shas = commitsEmCadeia(repo, branch, CONTADOR_DONE.length, 'contador');
  const bootstrap = g(repo, 'rev-parse', 'HEAD').out.trim();

  const manifest = manifestoBase(bootstrap, {
    risk_tier: 'MEDIO',
    gates_extra: GATE_EXTRA_11,
    fontes: { resumo: 'import/contador/RESUMO.md', masterplan: 'import/contador/MASTERPLAN.md' },
    plano_ids: [...CONTADOR_DONE, ...CONTADOR_SUPERSEDED, CONTADOR_GATE, ...CONTADOR_FUTUROS],
    goals_declarados: [
      ...CONTADOR_DONE.map((id, i) => ({ id, situacao: 'DONE', commit: shas[i], branch, title: id, worktree: name })),
      ...CONTADOR_SUPERSEDED.map((id) => ({ id, situacao: 'SUPERSEDED', title: id, worktree: name })),
      { id: CONTADOR_GATE, situacao: 'READY', gate_humano: true, title: 'Publish main', worktree: name },
    ],
  });
  const r = importarManifesto(repo, manifest);
  assert.equal(r.code, 0, r.all);

  const porId = Object.fromEntries(ledgerDe(repo).map((l) => [l.goal, l]));

  // 001–009 e 011 reconciliáveis com prova no Git.
  for (const id of CONTADOR_DONE) {
    assert.equal(porId[id].result, 'DONE', id);
    assert.equal(porId[id].source, 'importado');
    assert.equal(fs.existsSync(path.join(repo, `docs/execution-tracks/demo/_closed/goals/${id}.md`)), true, id);
  }
  // 010 e 012 originais SUPERSEDED.
  for (const id of CONTADOR_SUPERSEDED) {
    assert.equal(porId[id].result, 'SUPERSEDED', id);
    assert.equal(fs.existsSync(path.join(repo, `docs/execution-tracks/demo/goals/${id}.md`)), false, id);
  }
  // 012G BLOCKED pelo motivo canônico — nunca READY.
  assert.equal(porId[CONTADOR_GATE].result, 'BLOCKED');
  assert.equal(porId[CONTADOR_GATE].blocked_by, 'gate');
  assert.equal(porId[CONTADOR_GATE].reason, MOTIVO_GATE_HUMANO);
  assert.equal(metaDe(repo, `docs/execution-tracks/demo/_closed/goals/${CONTADOR_GATE}.md`).status, 'BLOCKED');
  assert.equal(fs.existsSync(path.join(repo, `docs/execution-tracks/demo/goals/${CONTADOR_GATE}.md`)), false);
  // 013–019 DRAFT: sem arquivo, sem ledger, sem prova Git.
  const rec = reconciliacaoDe(repo);
  for (const id of CONTADOR_FUTUROS) {
    assert.equal(porId[id], undefined, `${id} não pode ratificar nada`);
    assert.equal(fs.existsSync(path.join(repo, `docs/execution-tracks/demo/goals/${id}.md`)), false, id);
    assert.equal(fs.existsSync(path.join(repo, `docs/execution-tracks/demo/_closed/goals/${id}.md`)), false, id);
    assert.match(rec, new RegExp(`\`${id}\` → DRAFT`));
  }
  // Caminho quente vazio (≤ max_hot_goals) e nenhum GOAL futuro executável.
  const quentes = fs.readdirSync(path.join(repo, 'docs/execution-tracks/demo/goals')).filter((f) => f.endsWith('.md'));
  assert.equal(quentes.length, 0);
  assert.ok(quentes.length <= FIXTURE_PROTOCOL.max_hot_goals);
  const st = JSON.parse(fs.readFileSync(path.join(repo, 'docs/execution-tracks/demo/state.json'), 'utf8'));
  assert.equal(st.current_goal, null);
  assert.equal(st.next_goal, null);
  assert.equal(st.counters.goals_done, CONTADOR_DONE.length);
  g(repo, 'checkout', '-q', '-b', 'goal/demo-012g');
  const o = aep(repo, ['open', 'demo']);
  assert.notEqual(o.code, 0, 'nenhum GOAL é abrível após a importação');
  g(repo, 'checkout', '-q', 'main');

  // A importação NÃO altera código produtivo e só commita dentro de docs/.
  assert.equal(g(repo, 'hash-object', 'app/produtivo.ts').out.trim(), produtivoAntes);
  const tocados = g(repo, 'show', '--name-only', '--format=', 'HEAD').out.split('\n').filter(Boolean);
  assert.equal(tocados.every((p) => p.startsWith('docs/execution-tracks/') || p.startsWith('docs/ai-execution/')), true, tocados.join(' '));
  assert.equal(g(repo, 'ls-files', '--', 'import').out.trim(), '', 'import/ é gitignored');
  assert.equal(aep(repo, ['verify', '--all']).code, 0);
  assert.equal(g(repo, 'status', '--porcelain').out.trim(), '');
});

// ---------------------------------------------------------------------------
// Reimportação incremental last-wins — projeção, idempotência e revisão.
//
// O LEDGER.jsonl continua append-only: nenhuma linha antiga é removida ou
// reescrita. O que muda é a LEITURA — o estado vigente de um GOAL é o último
// evento classificatório dele — e a ESCRITA — só GOAL novo ou alterado gera linha.
// ---------------------------------------------------------------------------

/** Entrada de ledger mínima, no formato real gravado pelo importador. */
const linhaLedger = (goal, result, over = {}) => ({
  aep: '1.0-R2', ts: '2026-07-30T21:29:13.806Z', track: 'demo', goal, result,
  attempt: 1, source: 'importado', ...over,
});

// ---- A. Projeção last-wins -------------------------------------------------

test('A1: um evento por GOAL — a projeção devolve exatamente o estado de cada linha', () => {
  const ledger = [
    linhaLedger('demo-001', 'DONE', { head_commit: 'a'.repeat(40) }),
    linhaLedger('demo-002', 'SUPERSEDED'),
    linhaLedger('demo-003', 'BLOCKED', { blocked_by: 'gate' }),
  ];
  const p = projectLatestGoalStates(ledger);
  assert.equal(p.size, 3);
  assert.equal(p.get('demo-001').result, 'DONE');
  assert.equal(p.get('demo-002').result, 'SUPERSEDED');
  assert.equal(p.get('demo-003').result, 'BLOCKED');
  assert.deepEqual(countProjectedResults(p), { DONE: 1, BLOCKED: 1, SUPERSEDED: 1 });
});

test('A2: BLOCKED seguido de SUPERSEDED no mesmo GOAL projeta SUPERSEDED e conta UM GOAL', () => {
  const antiga = linhaLedger('demo-001', 'BLOCKED', { blocked_by: 'divergencia', reason: 'DONE sem prova no Git' });
  const ledger = [antiga, linhaLedger('demo-001', 'SUPERSEDED', { superseded_from_rev: 1 })];
  const p = projectLatestGoalStates(ledger);
  // Um GOAL, não duas linhas.
  assert.equal(p.size, 1);
  assert.equal(p.get('demo-001').result, 'SUPERSEDED');
  assert.equal(p.get('demo-001').linha, 1, 'a entrada vencedora é a segunda linha física');
  assert.deepEqual(countProjectedResults(p), { DONE: 0, BLOCKED: 0, SUPERSEDED: 1 });
  // A linha BLOCKED antiga continua íntegra no ledger — histórico não some.
  assert.equal(ledger.length, 2);
  assert.deepEqual(ledger[0], antiga);
  assert.equal(ledger[0].result, 'BLOCKED');
  assert.equal(ledger[0].blocked_by, 'divergencia');
});

test('A3: a ORDEM FÍSICA vence — timestamps iguais ou fora de ordem não desempatam', () => {
  const mesmoTs = [
    linhaLedger('demo-001', 'DONE', { head_commit: 'a'.repeat(40) }),
    linhaLedger('demo-001', 'SUPERSEDED'),
  ];
  assert.equal(projectLatestGoalStates(mesmoTs).get('demo-001').result, 'SUPERSEDED');
  // Timestamp da última linha é ANTERIOR ao da primeira: ainda assim ela vence.
  const tsInvertido = [
    linhaLedger('demo-001', 'DONE', { ts: '2026-07-30T23:59:59.000Z', head_commit: 'a'.repeat(40) }),
    linhaLedger('demo-001', 'BLOCKED', { ts: '2020-01-01T00:00:00.000Z', blocked_by: 'gate' }),
  ];
  assert.equal(projectLatestGoalStates(tsInvertido).get('demo-001').result, 'BLOCKED');
  // Determinismo: mesma entrada, mesma projeção, mesma ordem de iteração.
  assert.deepEqual([...projectLatestGoalStates(mesmoTs).keys()], [...projectLatestGoalStates(mesmoTs).keys()]);
});

test('A4: entradas não classificatórias não entram na projeção nem nas contagens', () => {
  const p = projectLatestGoalStates([
    linhaLedger('demo-001', 'DONE', { head_commit: 'a'.repeat(40) }),
    linhaLedger('demo-002', 'READY'),
    linhaLedger('', 'DONE'),
    { ts: 'x', result: 'DONE' },
    null,
    'nem objeto',
  ]);
  assert.equal(p.size, 1);
  assert.equal(p.has('demo-002'), false, 'READY não é resultado classificatório');
  assert.deepEqual(countProjectedResults(p), { DONE: 1, BLOCKED: 0, SUPERSEDED: 0 });
  assert.deepEqual(RESULTADOS_CLASSIFICATORIOS, ['DONE', 'BLOCKED', 'SUPERSEDED']);
});

// ---- F. Compatibilidade do formato antigo ----------------------------------

test('F1: ledger antigo sem campos opcionais continua legível e comparável', () => {
  // Formato mínimo: sem blocked_by, sem head_commit, sem plan_rev, sem evidencia.
  const antigo = [{ goal: 'demo-001', result: 'DONE' }, { goal: 'demo-002', result: 'BLOCKED' }];
  const p = projectLatestGoalStates(antigo);
  assert.equal(p.size, 2);
  assert.deepEqual(countProjectedResults(p), { DONE: 1, BLOCKED: 1, SUPERSEDED: 0 });
  // A assinatura normaliza ausência para null — nada explode e nada vira delta falso.
  assert.equal(classificationSignature({ result: 'DONE' }), classificationSignature({ result: 'DONE', head_commit: null }));
  assert.equal(classificationSignature({ result: 'BLOCKED' }), classificationSignature({ result: 'BLOCKED', blocked_by: null }));
});

test('F2: a assinatura compara ESTADO, não proveniência', () => {
  const base = { result: 'SUPERSEDED', plan_rev: 1, superseded_from_rev: 1, ts: 'a' };
  const revisado = { result: 'SUPERSEDED', plan_rev: 9, superseded_from_rev: 9, ts: 'b' };
  assert.equal(classificationSignature(base), classificationSignature(revisado),
    'bump de plan_rev não pode virar delta — foi esse acoplamento que duplicaria o ledger');
  // Categoria de bloqueio É estado: gate difere de divergencia.
  assert.notEqual(
    classificationSignature({ result: 'BLOCKED', blocked_by: 'gate' }),
    classificationSignature({ result: 'BLOCKED', blocked_by: 'divergencia' }));
  // Prova de um DONE é estado: commit diferente é ratificação nova.
  assert.notEqual(
    classificationSignature({ result: 'DONE', head_commit: 'a'.repeat(40) }),
    classificationSignature({ result: 'DONE', head_commit: 'b'.repeat(40) }));
});

test('F3: verify denuncia result fora do vocabulário classificatório', (t) => {
  const { repo, name } = makeRepo(t);
  initTrack(repo);
  const bootstrap = g(repo, 'rev-parse', 'HEAD').out.trim();
  const sha = commitReal(repo, 'goal/demo-001', 'app/feito.ts', 'export const feito = 1;\n', 'goal(demo-001): feito');
  assert.equal(importarManifesto(repo, manifestoBase(bootstrap, {
    goals_declarados: [{ id: 'demo-001', situacao: 'DONE', commit: sha, branch: 'goal/demo-001', title: 'Feito', worktree: name }],
  })).code, 0);
  const ledgerFile = path.join(repo, 'docs/execution-tracks/demo/LEDGER.jsonl');
  fs.appendFileSync(ledgerFile, `${JSON.stringify(linhaLedger('demo-002', 'PARCIALMENTE_FEITO'))}\n`);
  const v = aep(repo, ['verify', 'demo']);
  assert.equal(v.code, 4);
  assert.match(v.all, /fora do vocabulário classificatório/);
  assert.match(v.all, /PARCIALMENTE_FEITO/);
});

// ---- Cenário Contador: R1 → R4 ---------------------------------------------

/** 002–009 e 011: os 9 DONE com prova no Git. */
const R4_DONE = CONTADOR_DONE.slice(1);
/** 001: declarado DONE no R1 com commit fora da branch → BLOCKED (divergencia). */
const R4_DIVERGENTE = CONTADOR_DONE[0];

/**
 * Monta o cenário real da trilha contador: 9 DONE provados, 2 SUPERSEDED,
 * 001 BLOCKED por divergência, 012G BLOCKED por gate humano e 013–019 DRAFT.
 */
function cenarioContador(repo, name) {
  const branch = 'goal/contador-entregas';
  // O commit do GOAL 001 existe, mas NÃO está na branch declarada — é a DIV-1 real.
  const shaOrfao = commitReal(repo, 'goal/contador-001-orfao', 'app/orfao.ts',
    'export const orfao = 1;\n', 'goal(contador-001): entrega fora da branch');
  const shas = commitsEmCadeia(repo, branch, R4_DONE.length, 'contador');
  const bootstrap = g(repo, 'rev-parse', 'HEAD').out.trim();
  const comuns = [
    ...R4_DONE.map((id, i) => ({ id, situacao: 'DONE', commit: shas[i], branch, title: id, worktree: name })),
    ...CONTADOR_SUPERSEDED.map((id) => ({ id, situacao: 'SUPERSEDED', title: id, worktree: name })),
    { id: CONTADOR_GATE, situacao: 'READY', gate_humano: true, title: 'Publish main', worktree: name },
  ];
  const base = (declarado) => manifestoBase(bootstrap, {
    risk_tier: 'MEDIO',
    gates_extra: GATE_EXTRA_11,
    fontes: { masterplan: 'import/contador/MASTERPLAN.md', resumo: 'import/contador/RESUMO.md' },
    plano_ids: [...CONTADOR_DONE, ...CONTADOR_SUPERSEDED, CONTADOR_GATE, ...CONTADOR_FUTUROS],
    goals_declarados: [declarado, ...comuns],
  });
  return {
    bootstrap,
    // R1: 001 declarado DONE, sem prova válida na branch → BLOCKED (divergencia).
    r1: base({ id: R4_DIVERGENTE, situacao: 'DONE', commit: shaOrfao, branch, title: R4_DIVERGENTE, worktree: name }),
    // R4: única alteração do manifesto — 001 passa a SUPERSEDED.
    r4: base({ id: R4_DIVERGENTE, situacao: 'SUPERSEDED', title: R4_DIVERGENTE, worktree: name }),
  };
}

const ledgerBruto = (repo) => fs.readFileSync(path.join(repo, 'docs/execution-tracks/demo/LEDGER.jsonl'), 'utf8').replace(/\r\n/g, '\n');
const stateDe = (repo) => JSON.parse(fs.readFileSync(path.join(repo, 'docs/execution-tracks/demo/state.json'), 'utf8'));
const projecaoDe = (repo) => countProjectedResults(projectLatestGoalStates(ledgerDe(repo)));

function dryRunManifesto(repo, manifest) {
  w(repo, 'import/demo/MANIFEST.json', `${JSON.stringify(manifest, null, 2)}\n`);
  return aep(repo, ['import', 'demo', '--manifest=import/demo/MANIFEST.json', '--dry-run']);
}

/** Hash de cada arquivo de GOAL fechado — prova de que INALTERADO não é reescrito. */
function hashesDosGoals(repo) {
  const dir = path.join(repo, 'docs/execution-tracks/demo/_closed/goals');
  return Object.fromEntries(fs.readdirSync(dir).sort()
    .map((f) => [f, g(repo, 'hash-object', `docs/execution-tracks/demo/_closed/goals/${f}`).out.trim()]));
}

// ---- B. Reimportação idempotente -------------------------------------------

test('B1: reimportar o manifesto idêntico anexa ZERO linhas e não cria commit', (t) => {
  const { repo, name } = makeRepo(t);
  initTrack(repo);
  const { r1 } = cenarioContador(repo, name);

  assert.equal(importarManifesto(repo, r1).code, 0);
  const ledgerAntes = ledgerBruto(repo);
  const stateAntes = stateDe(repo);
  const headAntes = g(repo, 'rev-parse', 'HEAD').out.trim();
  const goalsAntes = hashesDosGoals(repo);
  assert.equal(ledgerDe(repo).length, 13, 'a primeira importação gera as 13 linhas do piloto');

  const r = importarManifesto(repo, r1);
  assert.equal(r.code, 0, r.all);
  assert.match(r.all, /NO-OP/);
  assert.match(r.all, /linhas de ledger a anexar: 0/);

  // Ledger: zero linhas novas e bytes anteriores idênticos.
  assert.equal(ledgerBruto(repo), ledgerAntes);
  assert.equal(ledgerDe(repo).length, 13);
  // Contagens, estado, arquivos e HEAD intactos.
  assert.deepEqual(stateDe(repo), stateAntes);
  assert.deepEqual(hashesDosGoals(repo), goalsAntes);
  assert.equal(g(repo, 'rev-parse', 'HEAD').out.trim(), headAntes, 'nenhum commit automático');
  assert.equal(g(repo, 'status', '--porcelain').out.trim(), '', 'reimportação idêntica não suja a árvore');
  // Nenhuma segunda cópia de proveniência foi criada.
  assert.equal(fs.existsSync(path.join(repo, 'docs/execution-tracks/demo/_closed/reports/IMPORT-2-MANIFEST.json')), false);
  assert.equal(aep(repo, ['verify', '--all']).code, 0);
});

// ---- C. Revisão incremental R4 ---------------------------------------------

test('C-R4: a revisão altera só o GOAL 001 — o ledger cresce de 13 para 14 linhas', (t) => {
  const { repo, name } = makeRepo(t);
  initTrack(repo);
  const produtivoAntes = g(repo, 'hash-object', 'app/produtivo.ts').out.trim();
  const { r1, r4 } = cenarioContador(repo, name);

  // --- R1: o cenário atual da trilha contador.
  assert.equal(importarManifesto(repo, r1).code, 0);
  assert.equal(ledgerDe(repo).length, 13);
  assert.deepEqual(projecaoDe(repo), { DONE: 9, BLOCKED: 2, SUPERSEDED: 2 });
  const st1 = stateDe(repo);
  assert.equal(st1.counters.goals_done, 9);
  assert.equal(st1.counters.goals_blocked, 2);
  assert.equal(st1.counters.ledger_lines, 13);
  const porId1 = Object.fromEntries(ledgerDe(repo).map((l) => [l.goal, l]));
  assert.equal(porId1[R4_DIVERGENTE].result, 'BLOCKED');
  assert.equal(porId1[R4_DIVERGENTE].blocked_by, 'divergencia');

  const ledgerAntes = ledgerBruto(repo);
  const goalsAntes = hashesDosGoals(repo);
  const headAntes = g(repo, 'rev-parse', 'HEAD').out.trim();

  // --- dry-run do R4: uma única mudança, uma única linha futura, zero escrita.
  const dry = dryRunManifesto(repo, r4);
  assert.equal(dry.code, 0, dry.all);
  assert.match(dry.all, /delta: 0 NOVO · 1 ALTERADO · 12 INALTERADO/);
  assert.match(dry.all, /linhas de ledger a anexar: 1/);
  assert.match(dry.all, new RegExp(`ALTERADO\\s+${R4_DIVERGENTE}: BLOCKED → SUPERSEDED`));
  assert.equal(ledgerBruto(repo), ledgerAntes, 'dry-run não escreve no ledger');
  assert.deepEqual(stateDe(repo), st1);
  assert.equal(g(repo, 'rev-parse', 'HEAD').out.trim(), headAntes, 'dry-run não commita');
  assert.equal(g(repo, 'status', '--porcelain').out.trim(), '');

  // --- R4 real.
  const r = importarManifesto(repo, r4);
  assert.equal(r.code, 0, r.all);
  assert.match(r.all, /ledger: \+1 linha\(s\) anexada\(s\)/);

  const ledgerDepois = ledgerBruto(repo);
  assert.equal(ledgerDe(repo).length, 14, 'o ledger cresce de 13 para 14 — não para 26');
  assert.equal(ledgerDepois.startsWith(ledgerAntes), true, 'o prefixo antigo permanece byte-a-byte idêntico');

  // Contagem final do cenário R4.
  assert.deepEqual(projecaoDe(repo), { DONE: 9, BLOCKED: 1, SUPERSEDED: 3 });
  const st4 = stateDe(repo);
  assert.equal(st4.counters.goals_done, 9);
  assert.equal(st4.counters.goals_blocked, 1);
  assert.equal(st4.counters.ledger_lines, 14);
  assert.equal(st4.current_goal, null, '0 READY');
  assert.equal(st4.next_goal, null);
  assert.equal(fs.readdirSync(path.join(repo, 'docs/execution-tracks/demo/goals')).filter((f) => f.endsWith('.md')).length, 0);

  // O GOAL 001 tem DUAS linhas no ledger e UM estado vigente.
  const linhas001 = ledgerDe(repo).filter((l) => l.goal === R4_DIVERGENTE);
  assert.equal(linhas001.length, 2);
  assert.equal(linhas001[0].result, 'BLOCKED', 'a linha BLOCKED antiga continua no ledger');
  assert.equal(linhas001[1].result, 'SUPERSEDED');
  assert.equal(projectLatestGoalStates(ledgerDe(repo)).get(R4_DIVERGENTE).result, 'SUPERSEDED');

  // Os 9 DONE não ganharam linha nova e seus arquivos não foram reescritos.
  const goalsDepois = hashesDosGoals(repo);
  for (const id of R4_DONE) {
    assert.equal(ledgerDe(repo).filter((l) => l.goal === id).length, 1, id);
    assert.equal(goalsDepois[`${id}.md`], goalsAntes[`${id}.md`], `${id}.md não pode ser reescrito`);
  }
  // 012G permanece BLOCKED pelo motivo canônico, em uma única linha.
  const linhasGate = ledgerDe(repo).filter((l) => l.goal === CONTADOR_GATE);
  assert.equal(linhasGate.length, 1);
  assert.equal(linhasGate[0].blocked_by, 'gate');
  assert.equal(linhasGate[0].reason, MOTIVO_GATE_HUMANO);
  assert.equal(metaDe(repo, `docs/execution-tracks/demo/_closed/goals/${CONTADOR_GATE}.md`).status, 'BLOCKED');
  // 013–019 continuam DRAFT: sem linha, sem arquivo, presentes na reconciliação.
  const rec = reconciliacaoDe(repo);
  for (const id of CONTADOR_FUTUROS) {
    assert.equal(ledgerDe(repo).some((l) => l.goal === id), false, id);
    assert.equal(fs.existsSync(path.join(repo, `docs/execution-tracks/demo/goals/${id}.md`)), false, id);
    assert.match(rec, new RegExp(`\`${id}\` → DRAFT`));
  }
  // A reconciliação registra o delta e nenhum órfão.
  assert.match(rec, /## 0\. Delta desta importação/);
  assert.match(rec, new RegExp(`\`${R4_DIVERGENTE}\` — \\*\\*ALTERADO\\*\\*: BLOCKED → SUPERSEDED`));
  assert.match(rec, /linhas anexadas ao LEDGER\.jsonl: 1/);
  assert.match(rec, /### Órfãos preservados[\s\S]*?_\(nenhum\)_/);

  // open recusa e nada produtivo foi tocado.
  g(repo, 'checkout', '-q', '-b', 'goal/demo-pos-r4');
  assert.notEqual(aep(repo, ['open', 'demo']).code, 0, 'nenhum GOAL é abrível após o R4');
  g(repo, 'checkout', '-q', 'main');
  assert.equal(g(repo, 'hash-object', 'app/produtivo.ts').out.trim(), produtivoAntes);
  assert.equal(aep(repo, ['verify', '--all']).code, 0);
  assert.equal(g(repo, 'status', '--porcelain').out.trim(), '');
});

// ---- D. Segunda aplicação do R4 --------------------------------------------

test('D-R4: aplicar o R4 duas vezes não duplica a reclassificação', (t) => {
  const { repo, name } = makeRepo(t);
  initTrack(repo);
  const { r1, r4 } = cenarioContador(repo, name);
  assert.equal(importarManifesto(repo, r1).code, 0);
  assert.equal(importarManifesto(repo, r4).code, 0);

  const ledgerAntes = ledgerBruto(repo);
  const stateAntes = stateDe(repo);
  const headAntes = g(repo, 'rev-parse', 'HEAD').out.trim();

  const r = importarManifesto(repo, r4);
  assert.equal(r.code, 0, r.all);
  assert.match(r.all, /NO-OP/);
  assert.equal(ledgerBruto(repo), ledgerAntes, 'zero linha adicionada na segunda aplicação');
  assert.equal(ledgerDe(repo).length, 14);
  assert.equal(ledgerDe(repo).filter((l) => l.goal === R4_DIVERGENTE && l.result === 'SUPERSEDED').length, 1,
    'a reclassificação não é duplicada');
  assert.deepEqual(stateDe(repo), stateAntes);
  assert.deepEqual(projecaoDe(repo), { DONE: 9, BLOCKED: 1, SUPERSEDED: 3 });
  assert.equal(g(repo, 'rev-parse', 'HEAD').out.trim(), headAntes);
  assert.equal(g(repo, 'status', '--porcelain').out.trim(), '');
  assert.equal(aep(repo, ['verify', '--all']).code, 0);
});

// ---- E. Segurança da reimportação ------------------------------------------

test('E1: GOAL fora do novo plano é PRESERVADO e reportado, nunca removido em silêncio', (t) => {
  const { repo, name } = makeRepo(t);
  initTrack(repo);
  const bootstrap = g(repo, 'rev-parse', 'HEAD').out.trim();
  const sha = commitReal(repo, 'goal/demo-001', 'app/feito.ts', 'export const feito = 1;\n', 'goal(demo-001): feito');
  const declarado = { id: 'demo-001', situacao: 'DONE', commit: sha, branch: 'goal/demo-001', title: 'Feito', worktree: name };
  assert.equal(importarManifesto(repo, manifestoBase(bootstrap, {
    plano_ids: ['demo-001', 'demo-002'],
    goals_declarados: [declarado, { id: 'demo-002', situacao: 'SUPERSEDED', title: 'Superado', worktree: name }],
  })).code, 0);
  assert.equal(ledgerDe(repo).length, 2);

  // Novo plano esquece demo-002 por completo.
  const r = importarManifesto(repo, manifestoBase(bootstrap, {
    plano_ids: ['demo-001'], goals_declarados: [declarado],
  }));
  assert.equal(r.code, 0, r.all);
  assert.match(r.all, /órfãos preservados[^\n]*demo-002\[SUPERSEDED\]/);
  // Estado preservado: a linha continua no ledger e a projeção segue SUPERSEDED.
  assert.equal(projectLatestGoalStates(ledgerDe(repo)).get('demo-002').result, 'SUPERSEDED');
  assert.deepEqual(projecaoDe(repo), { DONE: 1, BLOCKED: 0, SUPERSEDED: 1 });
  assert.match(reconciliacaoDe(repo), /`demo-002` — mantém `SUPERSEDED`/);
  assert.equal(aep(repo, ['verify', '--all']).code, 0);
});

test('E2: regressão de DONE e perda de gate humano aparecem como delta sensível no dry-run', (t) => {
  const { repo, name } = makeRepo(t);
  initTrack(repo);
  const bootstrap = g(repo, 'rev-parse', 'HEAD').out.trim();
  const sha = commitReal(repo, 'goal/demo-001', 'app/feito.ts', 'export const feito = 1;\n', 'goal(demo-001): feito');
  assert.equal(importarManifesto(repo, manifestoBase(bootstrap, {
    plano_ids: ['demo-001', 'demo-002'],
    goals_declarados: [
      { id: 'demo-001', situacao: 'DONE', commit: sha, branch: 'goal/demo-001', title: 'Feito', worktree: name },
      { id: 'demo-002', situacao: 'READY', gate_humano: true, title: 'Sob gate', worktree: name },
    ],
  })).code, 0);
  assert.deepEqual(projecaoDe(repo), { DONE: 1, BLOCKED: 1, SUPERSEDED: 0 });

  // Nova revisão: 001 regride de DONE para SUPERSEDED e 002 perde o gate humano.
  const dry = dryRunManifesto(repo, manifestoBase(bootstrap, {
    plano_ids: ['demo-001', 'demo-002'],
    goals_declarados: [
      { id: 'demo-001', situacao: 'SUPERSEDED', title: 'Feito', worktree: name },
      { id: 'demo-002', situacao: 'READY', title: 'Sem gate', worktree: name },
    ],
  }));
  assert.equal(dry.code, 0, dry.all);
  assert.match(dry.all, /deltas sensíveis: 2/);
  assert.match(dry.all, /demo-001: regressão de DONE → SUPERSEDED/);
  assert.match(dry.all, /demo-002: gate humano deixaria de bloquear → READY/);
  // O dry-run não escreveu nada: o gate segue bloqueando e o DONE segue DONE.
  assert.deepEqual(projecaoDe(repo), { DONE: 1, BLOCKED: 1, SUPERSEDED: 0 });
  assert.equal(g(repo, 'status', '--porcelain').out.trim(), '');
});

test('E3: BLOCKED que muda de categoria é ALTERADO — divergencia por gate não passa muda', (t) => {
  const { repo, name } = makeRepo(t);
  initTrack(repo);
  const bootstrap = g(repo, 'rev-parse', 'HEAD').out.trim();
  assert.equal(importarManifesto(repo, manifestoBase(bootstrap, {
    plano_ids: ['demo-001'],
    goals_declarados: [{ id: 'demo-001', situacao: 'DONE', commit: 'f'.repeat(40), branch: 'goal/demo-001', title: 'Fantasma', worktree: name }],
  })).code, 0);
  assert.equal(ledgerDe(repo)[0].blocked_by, 'divergencia');

  const r = importarManifesto(repo, manifestoBase(bootstrap, {
    plano_ids: ['demo-001'],
    goals_declarados: [{ id: 'demo-001', situacao: 'READY', gate_humano: true, title: 'Sob gate', worktree: name }],
  }));
  assert.equal(r.code, 0, r.all);
  assert.match(r.all, /1 ALTERADO/);
  assert.match(r.all, /categoria de bloqueio divergencia → gate/);
  assert.equal(ledgerDe(repo).length, 2);
  assert.equal(projectLatestGoalStates(ledgerDe(repo)).get('demo-001').entrada.blocked_by, 'gate');
  assert.deepEqual(projecaoDe(repo), { DONE: 0, BLOCKED: 1, SUPERSEDED: 0 });
  assert.equal(aep(repo, ['verify', '--all']).code, 0);
});

// ---------------------------------------------------------------------------
// Reconciliação fiel de BLOCKED executado — cenário Pessoas 001B, sem open/close.
// ---------------------------------------------------------------------------

function blockedHistoryFixture(t, options = {}) {
  const fixture = makeRepo(t);
  const { repo, name } = fixture;
  initTrack(repo);
  g(repo, 'config', 'core.autocrlf', options.crlf ? 'true' : 'false');
  const goal = 'demo-003';
  const sourceBranch = 'goal/demo-blocked';
  const rel = 'docs/execution-tracks/demo';
  const ledger = `${rel}/LEDGER.jsonl`;
  const hot = `${rel}/goals/${goal}.md`;
  const closed = `${rel}/_closed/goals/${goal}.md`;
  const predecessors = [1, 2].map((n) => ({ aep: '1.0-R2', track: 'demo', goal: `demo-00${n}`,
    result: 'DONE', source: 'executado', attempt: n, ts: `2026-10-0${n}T12:00:00.000Z`, custom_evidence: `Preservar ${n}` }));
  // A formatação deliberadamente incomum detecta reserialização de eventos.
  const prefix = Buffer.from(predecessors.map((e) => `  ${JSON.stringify(e)} `).join('\n') + '\n');
  w(repo, ledger, prefix);
  for (const e of predecessors) w(repo, `${rel}/_closed/goals/${e.goal}.md`,
    `<!-- AEP:META\n${JSON.stringify(META_DEFAULTS(name, { id: e.goal, status: 'DONE' }), null, 2)}\n-->\n# predecessor\n`);
  assert.equal(g(repo, 'add', '--', ledger, ...predecessors.map((e) => `${rel}/_closed/goals/${e.goal}.md`)).code, 0);
  const planned = addGoal(repo, META_DEFAULTS(name, { id: goal, branch: sourceBranch }));
  assert.equal(planned.commit.code, 0, planned.commit.all);
  const base = g(repo, 'rev-parse', 'HEAD').out.trim();
  assert.equal(g(repo, 'checkout', '-q', '-b', sourceBranch).code, 0);
  const attempts = [1, 2, 3].map((n) => ({ n, at: `2026-10-11T1${n}:00:00.000Z`, reason: `Falha histórica ${n}: E2E NOT_RUN` }));
  const events = [1, 3].map((attempt) => ({ aep: '1.0-R2', ts: `2026-10-11T1${attempt}:00:00.000Z`, track: 'demo', goal,
    result: 'BLOCKED', source: 'executado', blocked_by: 'decisao', attempt, branch: sourceBranch, base_commit: base,
    reason: attempt === 1 ? 'Privacidade salarial; exige replanejamento' : 'Typecheck FAIL; E2E e temas NOT_RUN; teto 3',
    previous_attempts: attempt === 1 ? [] : attempts, extra_provenance: { must_survive: '\u00e7/\\literal' } }));
  if (options.mutate) options.mutate(events, predecessors);
  const remotePrefix = options.prefixMismatch ? prefix.toString().replace('Preservar 1', 'Reescrito 1') : prefix.toString();
  w(repo, ledger, remotePrefix + events.map((e) => ` ${JSON.stringify(e)}  `).join('\n') + '\n');
  const closedMeta = META_DEFAULTS(name, { id: options.wrongGoal ? 'demo-wrong' : goal, branch: sourceBranch, status: options.readySource ? 'READY' : 'BLOCKED', plan_rev: 4 });
  w(repo, closed, `<!-- AEP:META\n${JSON.stringify(closedMeta, null, 2)}\n-->\n\n# Evidência histórica imutável\nGate preview/R2 NÃO AUTORIZADO.\n`);
  fs.unlinkSync(path.join(repo, hot));
  assert.equal(aep(repo, ['registry']).code, 0);
  assert.equal(g(repo, 'add', '--', ledger, hot, closed, `${rel}/state.json`, 'docs/execution-tracks/REGISTRY.md').code, 0);
  const commit = sh('git', ['commit', '-m', 'aep(demo): fixture remote blocked'], { cwd: repo, env: { AEP_WRITE: '1' } });
  assert.equal(commit.code, 0, commit.all);
  const sourceCommit = g(repo, 'rev-parse', 'HEAD').out.trim();
  const pushed = g(repo, 'push', 'origin', sourceBranch);
  assert.equal(pushed.code, 0, pushed.all);
  assert.equal(g(repo, 'fetch', 'origin').code, 0);
  assert.equal(g(repo, 'checkout', '-q', '-b', 'plan/demo-recovery', base).code, 0);
  const sourceRef = `refs/remotes/origin/${sourceBranch}`;
  const args = ['reconcile-blocked', 'demo', `--goal=${goal}`, `--source-ref=${sourceRef}`, `--source-commit=${sourceCommit}`];
  return { ...fixture, goal, ledger, hot, closed, sourceRef, sourceCommit, args, events, prefix };
}

function reconciliationSnapshot(repo) {
  const tracked = g(repo, 'ls-files', '-z').out.split('\0').filter(Boolean);
  return {
    head: g(repo, 'rev-parse', 'HEAD').out.trim(),
    status: g(repo, 'status', '--porcelain').out,
    files: Object.fromEntries(tracked.map((p) => [p, fs.readFileSync(path.join(repo, p)).toString('base64')])),
  };
}

test('R-BLOCKED: dry-run preserva todos os arquivos, índice e HEAD', (t) => {
  const f = blockedHistoryFixture(t);
  const before = reconciliationSnapshot(f.repo);
  const r = aep(f.repo, [...f.args, '--dry-run']);
  assert.equal(r.code, 0, r.all);
  assert.match(r.all, /eventos BLOCKED a anexar: 2/);
  assert.match(r.all, /tentativa histórica 3\/3/);
  assert.deepEqual(reconciliationSnapshot(f.repo), before);
  assert.equal(fs.existsSync(path.join(f.repo, '.aep-active')), false);
  assert.equal(fs.readdirSync(path.join(f.repo, 'docs/execution-tracks/demo/_closed/reports')).filter((p) => p.endsWith('.json')).length, 0);
});

for (const crlf of [false, true]) test(`R-BLOCKED: preserva dois DONE, ambos BLOCKED, tentativas, bytes e produto; CRLF=${crlf}`, (t) => {
  const f = blockedHistoryFixture(t, { crlf });
  const before = reconciliationSnapshot(f.repo);
  const localBytes = fs.readFileSync(path.join(f.repo, f.ledger));
  const remoteBytes = spawnSync('git', ['cat-file', 'blob', `${f.sourceCommit}:${f.ledger}`], { cwd: f.repo }).stdout;
  const remoteGoal = spawnSync('git', ['cat-file', 'blob', `${f.sourceCommit}:${f.closed}`], { cwd: f.repo }).stdout;
  const r = aep(f.repo, f.args);
  assert.equal(r.code, 0, r.all);
  const afterBytes = fs.readFileSync(path.join(f.repo, f.ledger));
  assert.ok(afterBytes.subarray(0, localBytes.length).equals(localBytes), 'bytes preexistentes da worktree preservados');
  assert.ok(afterBytes.subarray(localBytes.length).equals(remoteBytes.subarray(f.prefix.length)), 'sufixo literal, sem reserialização');
  assert.ok(fs.readFileSync(path.join(f.repo, f.closed)).equals(remoteGoal));
  assert.equal(fs.existsSync(path.join(f.repo, f.hot)), false);
  assert.equal(fs.existsSync(path.join(f.repo, '.aep-active')), false);
  const ledger = ledgerDe(f.repo);
  assert.equal(ledger.length, 4);
  assert.deepEqual(ledger.slice(2), f.events);
  assert.deepEqual(stateDe(f.repo).counters, { goals_done: 2, goals_blocked: 1, goals_imported: 0, ledger_lines: 4 });
  assert.equal(stateDe(f.repo).current_goal, null);
  assert.equal(stateDe(f.repo).status, 'BLOCKED');
  for (const p of ['app/produtivo.ts', 'docs/execution-tracks/demo/_closed/goals/demo-001.md', 'docs/execution-tracks/demo/_closed/goals/demo-002.md']) {
    assert.equal(fs.readFileSync(path.join(f.repo, p)).toString('base64'), before.files[p]);
  }
  const committed = spawnSync('git', ['cat-file', 'blob', `HEAD:${f.ledger}`], { cwd: f.repo }).stdout;
  assert.ok(committed.equals(remoteBytes), 'ledger ratificado idêntico ao objeto Git remoto');
  assert.equal(aep(f.repo, ['verify', '--all']).code, 0);
  const reports = fs.readdirSync(path.join(f.repo, 'docs/execution-tracks/demo/_closed/reports')).filter((p) => p.endsWith('.json'));
  assert.equal(reports.length, 1);
  assert.equal(reports[0], `RECONCILE-BLOCKED-${f.sourceCommit.slice(0, 12)}.json`);
  const proof = JSON.parse(fs.readFileSync(path.join(f.repo, 'docs/execution-tracks/demo/_closed/reports', reports[0]), 'utf8'));
  assert.equal(proof.source_commit, f.sourceCommit);
  assert.equal(proof.events_appended, 2);
  const reconciled = reconciliationSnapshot(f.repo);
  const again = aep(f.repo, f.args);
  assert.equal(again.code, 0, again.all);
  assert.match(again.all, /NO-OP/);
  assert.deepEqual(reconciliationSnapshot(f.repo), reconciled, 'repetição não cria eventos, arquivos ou commit');
});

for (const [label, options, expected] of [
  ['prefixo divergente', { prefixMismatch: true }, /prefixo literal/],
  ['evento de outro GOAL', { mutate: (events) => { events[0].goal = 'outro'; } }, /fora do recorte/],
  ['DONE no sufixo', { mutate: (events) => { events[0].result = 'DONE'; } }, /fora do recorte/],
  ['tentativa 4', { mutate: (events) => { events[1].attempt = 4; } }, /fora do recorte/],
  ['previous_attempts inválido', { mutate: (events) => { events[1].previous_attempts[2].n = 4; } }, /fora do recorte/],
  ['evento importado', { mutate: (events) => { events[0].source = 'importado'; } }, /fora do recorte/],
  ['branch de evento divergente', { mutate: (events) => { events[0].branch = 'goal/outra'; } }, /fora do recorte/],
  ['base histórica inexistente', { mutate: (events) => { events[0].base_commit = 'f'.repeat(40); } }, /base histórica/],
  ['GOAL fechado errado', { wrongGoal: true }, /GOAL fechado/],
  ['GOAL fechado READY', { readySource: true }, /GOAL fechado/],
]) test(`R-BLOCKED: rejeita ${label} sem escrever`, (t) => {
  const f = blockedHistoryFixture(t, options);
  const before = reconciliationSnapshot(f.repo);
  const r = aep(f.repo, f.args);
  assert.equal(r.code, 4, r.all);
  assert.match(r.all, expected);
  assert.deepEqual(reconciliationSnapshot(f.repo), before);
});

test('R-BLOCKED: SHA/ref divergentes, path traversal, sessão ativa e índice sujo não escrevem', (t) => {
  const f = blockedHistoryFixture(t);
  for (const replacement of [
    [`--source-commit=${f.sourceCommit}`, `--source-commit=${'f'.repeat(40)}`],
    [`--source-ref=${f.sourceRef}`, '--source-ref=HEAD'],
    [`--goal=${f.goal}`, '--goal=../../externo'],
  ]) {
    const before = reconciliationSnapshot(f.repo);
    const r = aep(f.repo, f.args.map((a) => a === replacement[0] ? replacement[1] : a));
    assert.notEqual(r.code, 0, r.all);
    assert.deepEqual(reconciliationSnapshot(f.repo), before);
  }
  for (const flag of ['--dry-run=true', '--dryrun']) {
    const before = reconciliationSnapshot(f.repo);
    assert.equal(aep(f.repo, [...f.args, flag]).code, 1);
    assert.deepEqual(reconciliationSnapshot(f.repo), before);
  }
  w(f.repo, '.aep-active', JSON.stringify({ goal: f.goal, attempt: 3 }));
  const active = reconciliationSnapshot(f.repo);
  assert.equal(aep(f.repo, f.args).code, 5);
  assert.deepEqual(reconciliationSnapshot(f.repo), active);
  assert.equal(JSON.parse(fs.readFileSync(path.join(f.repo, '.aep-active'), 'utf8')).attempt, 3);
  fs.unlinkSync(path.join(f.repo, '.aep-active'));
  w(f.repo, 'app/staged.ts', 'export const unrelated = true;\n');
  assert.equal(g(f.repo, 'add', '--', 'app/staged.ts').code, 0);
  const staged = reconciliationSnapshot(f.repo);
  assert.equal(aep(f.repo, f.args).code, 5);
  assert.deepEqual(reconciliationSnapshot(f.repo), staged);
});

test('R-BLOCKED: recusa default branch e arquivo fechado conflitante sem sobrescrever', (t) => {
  const f = blockedHistoryFixture(t);
  assert.equal(g(f.repo, 'checkout', '-q', 'main').code, 0);
  const before = reconciliationSnapshot(f.repo);
  assert.equal(aep(f.repo, f.args).code, 5);
  assert.deepEqual(reconciliationSnapshot(f.repo), before);
  assert.equal(g(f.repo, 'checkout', '-q', 'plan/demo-recovery').code, 0);
  w(f.repo, f.closed, '# Histórico local diferente\n');
  assert.equal(g(f.repo, 'add', '--', f.closed).code, 0);
  assert.equal(sh('git', ['commit', '-m', 'aep(demo): fixture closed conflict'], { cwd: f.repo, env: { AEP_WRITE: '1' } }).code, 0);
  const conflict = reconciliationSnapshot(f.repo);
  const r = aep(f.repo, f.args);
  assert.equal(r.code, 4, r.all);
  assert.match(r.all, /fechado local diverge/);
  assert.deepEqual(reconciliationSnapshot(f.repo), conflict);
});

test('R-BLOCKED: falha de commit restaura ledger, GOALs, derivados, índice e HEAD; retry não duplica', (t) => {
  const f = blockedHistoryFixture(t);
  const hook = path.join(f.repo, '.githooks/commit-msg');
  const hookBefore = fs.readFileSync(hook);
  fs.writeFileSync(hook, '#!/bin/sh\ncase "$(cat "$1")" in *reconcile-blocked*) exit 1;; esac\nexit 0\n');
  // Hook alterado fica commitado: precondição de árvore limpa continua verdadeira.
  assert.equal(g(f.repo, 'add', '--', '.githooks/commit-msg').code, 0);
  const first = g(f.repo, 'commit', '-m', 'fixture: reject reconciliation commit');
  assert.equal(first.code, 0, first.all);
  const before = reconciliationSnapshot(f.repo);
  const r = aep(f.repo, f.args);
  assert.equal(r.code, 3, r.all);
  assert.deepEqual(reconciliationSnapshot(f.repo), before);
  assert.equal(fs.readdirSync(path.join(f.repo, 'docs/execution-tracks/demo/_closed/reports')).filter((p) => p.endsWith('.json')).length, 0);
  fs.writeFileSync(hook, hookBefore);
  assert.equal(g(f.repo, 'add', '--', '.githooks/commit-msg').code, 0);
  assert.equal(g(f.repo, 'commit', '-m', 'fixture: restore commit-msg').code, 0);
  assert.equal(aep(f.repo, f.args).code, 0);
  assert.equal(ledgerDe(f.repo).length, 4);
});

// ---------------------------------------------------------------------------
// refresh-active — todos os fluxos usam origin bare e sessão/planos descartáveis.
// ---------------------------------------------------------------------------

function activeRefreshFixture(t, options = {}) {
  const f = makeRepo(t);
  const { repo, name } = f;
  const goal = 'PESSOAS-DP-FRONTEND-001B-RECOVERY-001';
  const rel = `docs/execution-tracks/pessoas/goals/${goal}.md`;
  const addition = 'lib/pessoas/documentos/service.ts';
  const branch = 'goal/pessoas-001b-recovery-001';
  assert.equal(aep(repo, ['init', 'pessoas', '--risk=ALTO']).code, 0);
  const oldMeta = META_DEFAULTS(name, { id: goal, track: 'pessoas', branch, class: 'C3', risk_tier: 'ALTO',
    plan_ref: 'OMNIGESTAO_PESSOAS_DP_RH_MASTERPLAN_2026-09-15', plan_rev: 5,
    familia_executor: 'openai', revisao_independente: true,
    allowlist: ['app/**', rel, 'docs/execution-tracks/pessoas/state.json',
      'docs/execution-tracks/REGISTRY.md', 'docs/ai-execution/GATES.md'],
    gate_humano: { requerido: true, pendente: true, motivo: 'Plano aprovado; merge humano pendente.' } });
  const validations = '\n## Runner obrigatório, preflight e evidências\n\nTestes reais, zero skipped, reserva de 12 GiB.\n\n## Gates e entrega futura\n\nPreview pendente; produção e GOAL 002 proibidos.\n';
  const doc = (meta, tail = validations) => `<!-- AEP:META\n${JSON.stringify(meta, null, 2)}\n-->\n\n# ${goal}\n${tail}`;
  w(repo, rel, doc(oldMeta));
  const ledgerRel = 'docs/execution-tracks/pessoas/LEDGER.jsonl';
  const history = [
    { goal: 'pessoas-001a', result: 'DONE', attempt: 1, ts: '2026-10-01T00:00:00.000Z' },
    { goal: 'pessoas-p2', result: 'DONE', attempt: 1, ts: '2026-10-02T00:00:00.000Z' },
    { goal: 'pessoas-original', result: 'BLOCKED', attempt: 1, ts: '2026-10-03T00:00:00.000Z' },
    { goal: 'pessoas-original', result: 'BLOCKED', attempt: 3, ts: '2026-10-04T00:00:00.000Z',
      previous_attempts: [1, 2, 3].map((n) => ({ n, reason: `falha histórica ${n}` })) },
  ];
  w(repo, ledgerRel, history.map((e) => JSON.stringify(e)).join('\n') + '\n');
  for (const e of history.slice(0, 3)) w(repo, `docs/execution-tracks/pessoas/_closed/goals/${e.goal}.md`,
    doc({ ...oldMeta, id: e.goal, status: e.result }));
  w(repo, 'docs/execution-tracks/pessoas/_closed/reports/historico.md', '# Histórico ratificado\n');
  assert.equal(aep(repo, ['registry']).code, 0);
  const commitPlan = (message) => {
    assert.equal(g(repo, 'add', '--', 'docs/ai-execution/protocol.json', 'docs/ai-execution/GATES.md',
      'docs/execution-tracks/pessoas', 'docs/execution-tracks/REGISTRY.md').code, 0);
    const r = sh('git', ['commit', '-m', message], { cwd: repo, env: { AEP_WRITE: '1' } });
    assert.equal(r.code, 0, r.all);
  };
  commitPlan('aep(pessoas): fixture plano revisão 5 com histórico');
  assert.equal(g(repo, 'push', 'origin', 'main').code, 0);
  const oldBase = g(repo, 'rev-parse', 'HEAD').out.trim();
  assert.equal(g(repo, 'checkout', '-q', '-b', branch).code, 0);
  const opened = aep(repo, ['open', 'pessoas']);
  assert.equal(opened.code, 0, opened.all);
  for (let n = 1; n < (options.attempt || 1); n += 1) {
    const r = aep(repo, ['attempt', 'pessoas', '--fail', `--reason=Falha real ${n}`]);
    assert.equal(r.code, 0, r.all);
  }
  w(repo, 'app/produtivo.ts', 'export const produtivo = 2;\n');
  assert.equal(g(repo, 'add', '--', 'app/produtivo.ts').code, 0);
  assert.equal(g(repo, 'commit', '-m', 'goal(pessoas-001): fixture produto').code, 0);
  assert.equal(g(repo, 'checkout', '-q', 'main').code, 0);
  const meta = { ...oldMeta, plan_rev: 6, allowlist: [...oldMeta.allowlist, addition],
    gate_humano: { ...oldMeta.gate_humano, motivo: 'Revisão 6 aprovada; demais gates pendentes.' },
    dispensa_humana_revisao: { INDEPENDENT_REVIEW: 'WAIVED_BY_HUMAN_DECISION', SELF_REVIEW: 'CODEX',
      HUMAN_MERGE_AUTHORIZATION: 'PENDING', condicao_satisfeita: false } };
  if (options.mutateMeta) options.mutateMeta(meta);
  const newDoc = doc(meta, options.validations || validations);
  w(repo, rel, newDoc);
  if (options.history) options.history(repo, ledgerRel);
  assert.equal(aep(repo, ['registry']).code, 0);
  commitPlan('aep(pessoas): fixture ampliação humana revisão 6');
  assert.equal(g(repo, 'push', 'origin', 'main').code, 0);
  const approvedBase = g(repo, 'rev-parse', 'HEAD').out.trim();
  assert.equal(g(repo, 'checkout', '-q', branch).code, 0);
  if (options.copyOnly) {
    w(repo, rel, newDoc);
    assert.equal(g(repo, 'add', '--', rel).code, 0);
    assert.equal(sh('git', ['commit', '-m', 'goal(pessoas-001): fixture cópia sem base'],
      { cwd: repo, env: { AEP_WRITE: '1' } }).code, 0);
  } else if (!options.noIntegrate) {
    const merged = g(repo, 'merge', '--no-ff', 'main', '-m', 'goal(pessoas-001): incorporar plano aprovado');
    assert.equal(merged.code, 0, merged.all);
  }
  return { ...f, goal, rel, addition, oldMeta, oldBase, approvedBase, ledgerRel, branch,
    args: ['refresh-active', 'pessoas'] };
}

// Inclui bytes e mtimes de arquivos ignorados, índice, refs, reflogs e FETCH_HEAD.
// Portanto um dry-run que fizesse fetch ou atualizasse o índice também falharia.
function refreshSnapshot(repo) {
  const files = {};
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const file = path.join(dir, e.name);
      if (e.isDirectory()) walk(file);
      else files[path.relative(repo, file)] = { bytes: fs.readFileSync(file).toString('base64'),
        mtime: fs.statSync(file).mtimeMs };
    }
  };
  walk(repo);
  return files;
}

test('REFRESH: dry-run valida base/revisão 6 sem alterar nenhum arquivo ou metadado Git', (t) => {
  const f = activeRefreshFixture(t, { attempt: 3 });
  const before = refreshSnapshot(f.repo);
  const r = aep(f.repo, [...f.args, '--dry-run']);
  assert.equal(r.code, 0, r.all);
  assert.match(r.all, /DRY-RUN/);
  assert.match(r.all, /item 8 preservado/);
  assert.match(r.all, /tentativa 3\/3/);
  assert.deepEqual(refreshSnapshot(f.repo), before);
});

test('REFRESH: ampliação legítima preserva sessão/tentativas/histórico; repetição é NO-OP', (t) => {
  const f = activeRefreshFixture(t, { attempt: 3 });
  const file = path.join(f.repo, '.aep-active');
  // Campos futuros/desconhecidos e formatação do marcador antigo não são perdidos.
  const active = JSON.parse(fs.readFileSync(file, 'utf8'));
  active.executor_context = { opaque: 'preservar' };
  fs.writeFileSync(file, JSON.stringify(active, null, 4).replace(/\n/g, '\r\n') + '\r\n');
  const original = fs.readFileSync(file);
  const before = refreshSnapshot(f.repo);
  const r = aep(f.repo, f.args);
  assert.equal(r.code, 0, r.all);
  const after = refreshSnapshot(f.repo);
  const updated = JSON.parse(fs.readFileSync(file, 'utf8'));
  assert.equal(updated.base_commit, f.approvedBase);
  assert.deepEqual(updated.allowlist, [...active.allowlist, f.addition]);
  const { base_commit, allowlist, scope_refresh_log, ...preserved } = updated;
  const { base_commit: oldBase, allowlist: oldAllowlist, ...oldPreserved } = active;
  assert.deepEqual(preserved, oldPreserved);
  assert.equal(scope_refresh_log.length, 1);
  assert.equal(scope_refresh_log[0].previous_active_sha256, createHash('sha256').update(original).digest('hex'));
  delete before['.aep-active'];
  delete after['.aep-active'];
  assert.deepEqual(after, before, 'somente o marcador foi escrito; nenhum commit, índice ou histórico');
  for (const args of [f.args, [...f.args, '--dry-run']]) {
    const snapshot = refreshSnapshot(f.repo);
    const again = aep(f.repo, args);
    assert.equal(again.code, 0, again.all);
    assert.match(again.all, /NO-OP/);
    assert.deepEqual(refreshSnapshot(f.repo), snapshot);
  }
  const check = aep(f.repo, ['check', 'pessoas']);
  assert.equal(check.code, 0, check.all);
  assert.match(check.all, /8 \[PASS\s*\].*goals/);
  assert.equal(aep(f.repo, ['verify', '--all']).code, 0);
});

for (const [label, options, expected] of [
  ['plano só na main, não incorporado', { noIntegrate: true }, /idêntico.*base comum/],
  ['arquivo copiado sem base comum revisão 6', { copyOnly: true }, /idêntico.*base comum/],
  ['permissão removida', { mutateMeta: (m) => { m.allowlist.shift(); } }, /ampliação exclusiva/],
  ['outro path acrescentado', { mutateMeta: (m) => { m.allowlist.push('lib/pessoas/**'); } }, /ampliação exclusiva/],
  ['path duplicado', { mutateMeta: (m) => { m.allowlist.push(m.allowlist[0]); } }, /ampliação exclusiva/],
  ['teste reduzido', { mutateMeta: (m) => { m.test_command = 'node -e "process.exit(0)"'; } }, /contrato do plano/],
  ['gate trocado', { mutateMeta: (m) => { m.gates_liberados = ['G-DADOS-SCHEMA']; } }, /contrato do plano/],
  ['risco reduzido', { mutateMeta: (m) => { m.risk_tier = 'BAIXO'; } }, /contrato do plano/],
  ['revisão independente removida', { mutateMeta: (m) => { m.revisao_independente = false; } }, /contrato do plano/],
  ['validações técnicas reduzidas', { validations: '\n## Runner obrigatório, preflight e evidências\n\nTestes opcionais.\n' }, /validações, gates/],
  ['outra revisão', { mutateMeta: (m) => { m.plan_rev = 7; } }, /revisão fora/],
  ['outro plano', { mutateMeta: (m) => { m.plan_ref = 'OUTRO'; } }, /plano ou revisão/],
  ['merge humano declarado aprovado', { mutateMeta: (m) => { m.dispensa_humana_revisao.HUMAN_MERGE_AUTHORIZATION = 'APPROVED'; } }, /condicional divergente/],
  ['histórico ratificado alterado', { history: (repo, rel) => { fs.appendFileSync(path.join(repo, rel), '{"goal":"outro","result":"DONE"}\n'); } }, /histórico AEP divergente/],
]) test(`REFRESH: recusa ${label} sem escrita, inclusive dry-run`, (t) => {
  const f = activeRefreshFixture(t, options);
  for (const args of [f.args, [...f.args, '--dry-run']]) {
    const before = refreshSnapshot(f.repo);
    const r = aep(f.repo, args);
    assert.equal(r.code, 4, r.all);
    assert.match(r.all, expected);
    assert.deepEqual(refreshSnapshot(f.repo), before);
  }
});

test('REFRESH: recusa divergências do marcador, falta de sessão e argumentos sem escrita', (t) => {
  const f = activeRefreshFixture(t);
  const file = path.join(f.repo, '.aep-active');
  const original = fs.readFileSync(file);
  for (const mutate of [
    (a) => { a.goal = 'outro'; }, (a) => { a.track = 'demo'; },
    (a) => { a.branch = 'goal/outra'; }, (a) => { a.worktree += '-outra'; },
    (a) => { a.goal_file = '../fora.md'; }, (a) => { a.goal_file_abs += '.outro'; },
    (a) => { a.base_commit = 'f'.repeat(40); }, (a) => { a.default_branch = 'outra'; },
    (a) => { a.attempt = 4; }, (a) => { a.attempt = 2; },
    (a) => { a.opened_at = 'inválido'; }, (a) => { a.max_attempts = 4; },
    (a) => { a.test_command = 'node falso.mjs'; }, (a) => { a.allowlist.push(f.addition); },
    (a) => { a.gates_liberados.push('G-DADOS-SCHEMA'); }, (a) => { a.scope_refresh_log = []; },
  ]) {
    const active = JSON.parse(original);
    mutate(active);
    fs.writeFileSync(file, JSON.stringify(active));
    const before = refreshSnapshot(f.repo);
    const r = aep(f.repo, f.args);
    assert.notEqual(r.code, 0, r.all);
    assert.deepEqual(refreshSnapshot(f.repo), before);
  }
  fs.writeFileSync(file, original);
  for (const args of [[...f.args, '--dryrun'], [...f.args, '--dry-run=false'], [...f.args, 'extra'], ['refresh-active', 'demo']]) {
    const before = refreshSnapshot(f.repo);
    assert.notEqual(aep(f.repo, args).code, 0);
    assert.deepEqual(refreshSnapshot(f.repo), before);
  }
  fs.writeFileSync(file, '{ JSON inválido');
  const corrupt = refreshSnapshot(f.repo);
  const refused = aep(f.repo, f.args);
  assert.equal(refused.code, 1, refused.all);
  assert.match(refused.all, /não remova, regenere ou reabra/);
  assert.deepEqual(refreshSnapshot(f.repo), corrupt);
  fs.unlinkSync(file);
  const before = refreshSnapshot(f.repo);
  assert.equal(aep(f.repo, f.args).code, 5);
  assert.deepEqual(refreshSnapshot(f.repo), before, 'não cria nem reabre sessão');
});

test('REFRESH: índice/árvore sujos e open prévio que perdeu a base histórica são recusados', (t) => {
  const f = activeRefreshFixture(t);
  w(f.repo, 'app/sujo.ts', 'não commitado\n');
  for (const staged of [false, true]) {
    if (staged) assert.equal(g(f.repo, 'add', '--', 'app/sujo.ts').code, 0);
    const before = refreshSnapshot(f.repo);
    assert.equal(aep(f.repo, f.args).code, 4);
    assert.deepEqual(refreshSnapshot(f.repo), before);
  }
  assert.equal(g(f.repo, 'restore', '--staged', '--', 'app/sujo.ts').code, 0);
  fs.unlinkSync(path.join(f.repo, 'app/sujo.ts'));
  assert.equal(aep(f.repo, ['open', 'pessoas']).code, 0);
  const before = refreshSnapshot(f.repo);
  const r = aep(f.repo, f.args);
  assert.equal(r.code, 4, r.all);
  assert.deepEqual(refreshSnapshot(f.repo), before);
});

test('REFRESH: falha de rename faz rollback completo e retry não duplica auditoria', (t) => {
  const f = activeRefreshFixture(t, { attempt: 2 });
  const preload = w(f.tmp, 'fail-refresh-rename.mjs', "import fs from 'node:fs';\nfs.renameSync = () => { throw new Error('rename recusado no teste'); };\n");
  const before = refreshSnapshot(f.repo);
  const r = sh(process.execPath, ['--import', pathToFileURL(preload).href, TRACK, ...f.args], { cwd: f.repo });
  assert.equal(r.code, 5, r.all);
  assert.match(r.all, /marcador original preservado/);
  assert.deepEqual(refreshSnapshot(f.repo), before, 'nenhum temporário, índice ou marcador parcial');
  assert.equal(aep(f.repo, f.args).code, 0);
  assert.equal(JSON.parse(fs.readFileSync(path.join(f.repo, '.aep-active'))).scope_refresh_log.length, 1);
});

test('REFRESH: compare-and-swap preserva escrita concorrente no marcador', (t) => {
  const f = activeRefreshFixture(t);
  const preload = w(f.tmp, 'concurrent-refresh.mjs', "import fs from 'node:fs';\nconst original = fs.fsyncSync;\nfs.fsyncSync = (fd) => { original(fd); const a = JSON.parse(fs.readFileSync('.aep-active')); a.concurrent = true; fs.writeFileSync('.aep-active', JSON.stringify(a)); };\n");
  const original = JSON.parse(fs.readFileSync(path.join(f.repo, '.aep-active')));
  const r = sh(process.execPath, ['--import', pathToFileURL(preload).href, TRACK, ...f.args], { cwd: f.repo });
  assert.equal(r.code, 4, r.all);
  assert.match(r.all, /mudaram durante o refresh/);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(f.repo, '.aep-active'))), { ...original, concurrent: true });
  assert.equal(fs.readdirSync(f.repo).filter((p) => p.includes('.refresh-')).length, 0);
});

test('REFRESH: hooks usam a nova allowlist e item 8 continua recusando GOAL editado', (t) => {
  const f = activeRefreshFixture(t);
  w(f.repo, f.addition, 'serviço de fixture\n');
  assert.equal(g(f.repo, 'add', '--', f.addition).code, 0);
  const denied = g(f.repo, 'commit', '-m', 'goal(pessoas-001): ainda fora da allowlist');
  assert.notEqual(denied.code, 0, denied.all);
  assert.equal(g(f.repo, 'restore', '--staged', '--', f.addition).code, 0);
  fs.unlinkSync(path.join(f.repo, f.addition));
  assert.equal(aep(f.repo, f.args).code, 0);
  w(f.repo, f.addition, 'serviço de fixture\n');
  assert.equal(g(f.repo, 'add', '--', f.addition).code, 0);
  const allowed = g(f.repo, 'commit', '-m', 'goal(pessoas-001): path oficialmente ampliado');
  assert.equal(allowed.code, 0, allowed.all);
  assert.equal(aep(f.repo, ['check', 'pessoas']).code, 0);
  fs.appendFileSync(path.join(f.repo, f.rel), '\nEdição local do plano proibida.\n');
  assert.equal(g(f.repo, 'add', '--', f.rel).code, 0);
  assert.equal(sh('git', ['commit', '-m', 'aep(pessoas): fixture edição de GOAL'],
    { cwd: f.repo, env: { AEP_WRITE: '1' } }).code, 0);
  const before = refreshSnapshot(f.repo);
  assert.equal(aep(f.repo, f.args).code, 4);
  assert.deepEqual(refreshSnapshot(f.repo), before);
  const check = aep(f.repo, ['check', 'pessoas']);
  assert.equal(check.code, 3, check.all);
  assert.match(check.all, /8 \[FAIL\s*\].*goals/);
});

test('REFRESH: item 8 também recusa GOAL de outra trilha no delta', (t) => {
  const f = activeRefreshFixture(t);
  const rel = 'docs/execution-tracks/outra/goals/REVISAO-Á.md';
  w(f.repo, rel, '# Plano local de outra trilha\n');
  assert.equal(g(f.repo, 'add', '--', rel).code, 0);
  assert.equal(sh('git', ['commit', '-m', 'aep(outra): fixture plano local'],
    { cwd: f.repo, env: { AEP_WRITE: '1' } }).code, 0);
  const before = refreshSnapshot(f.repo);
  const r = aep(f.repo, f.args);
  assert.equal(r.code, 4, r.all);
  assert.match(r.all, /item 8: GOALs no delta/);
  assert.deepEqual(refreshSnapshot(f.repo), before);
});

test('REFRESH: auditoria divergente é recusada; nova tentativa oficial continua válida', (t) => {
  const f = activeRefreshFixture(t, { attempt: 2 });
  assert.equal(aep(f.repo, f.args).code, 0);
  const file = path.join(f.repo, '.aep-active');
  const original = fs.readFileSync(file);
  for (const mutate of [
    (a) => { a.scope_refresh_log[0].from_base_commit = 'f'.repeat(40); },
    (a) => { a.scope_refresh_log[0].goal_blob_after = 'f'.repeat(40); },
    (a) => { a.scope_refresh_log[0].added_paths = ['lib/pessoas/**']; },
    (a) => { a.scope_refresh_log[0].attempt = 1; },
    (a) => { a.scope_refresh_log[0].opened_at = '2026-01-01T00:00:00.000Z'; },
    (a) => { a.base_commit = f.oldBase; a.scope_refresh_log[0].base_commit = f.oldBase; },
  ]) {
    const active = JSON.parse(original);
    mutate(active);
    fs.writeFileSync(file, JSON.stringify(active));
    const before = refreshSnapshot(f.repo);
    const r = aep(f.repo, f.args);
    assert.equal(r.code, 4, r.all);
    assert.deepEqual(refreshSnapshot(f.repo), before);
  }
  fs.writeFileSync(file, original);
  assert.equal(aep(f.repo, ['attempt', 'pessoas', '--fail', '--reason=Falha posterior ao refresh']).code, 0);
  const before = refreshSnapshot(f.repo);
  const r = aep(f.repo, f.args);
  assert.equal(r.code, 0, r.all);
  assert.match(r.all, /NO-OP/);
  assert.deepEqual(refreshSnapshot(f.repo), before);
  assert.equal(JSON.parse(fs.readFileSync(file)).attempt, 3);
});

// ---------------------------------------------------------------------------
// RESUME — histórico produzido por open/attempt/block/reconcile em Git isolado.
// A main de fixture ratifica o plano; a branch original integra essa main.
// ---------------------------------------------------------------------------

function blockedResumeFixture(t, options = {}) {
  const f = makeRepo(t);
  const { repo, name } = f;
  initTrack(repo);
  g(repo, 'config', 'core.autocrlf', options.crlf ? 'true' : 'false');
  const goal = 'demo-resume-002';
  const branch = 'goal/demo-resume-002';
  const rel = 'docs/execution-tracks/demo';
  const hot = `${rel}/goals/${goal}.md`;
  const closed = `${rel}/_closed/goals/${goal}.md`;
  const ledger = `${rel}/LEDGER.jsonl`;
  const oldMeta = META_DEFAULTS(name, { id: goal, branch, plan_ref: 'PLANO-RESUME', plan_rev: 8 });
  assert.equal(addGoal(repo, oldMeta).commit.code, 0);
  assert.equal(openGoal(repo, branch).code, 0);
  const worked = trabalhaECommita(repo);
  assert.equal(worked.code, 0, worked.all);
  if (options.exhausted) {
    for (const n of [1, 2]) assert.equal(aep(repo, ['attempt', 'demo', '--fail', `--reason=Falha real ${n}`]).code, 0);
  }
  assert.equal(aep(repo, ['block', 'demo', '--by=gate', '--reason=Consumidor fora da allowlist; aguardar plano humano']).code, 3);
  const blocked = g(repo, 'rev-parse', 'HEAD').out.trim();
  w(repo, 'app/evidence.txt', 'Evidência posterior ao BLOCKED; nenhuma tentativa nova.\n');
  assert.equal(g(repo, 'add', '--', 'app/evidence.txt').code, 0);
  assert.equal(g(repo, 'commit', '-m', 'docs: preservar origem bloqueada').code, 0);
  const source = g(repo, 'rev-parse', 'HEAD').out.trim();
  assert.equal(g(repo, 'push', 'origin', branch).code, 0);
  assert.equal(g(repo, 'fetch', 'origin').code, 0);
  const event = ledgerDe(repo).at(-1);
  const archiveBlob = spawnSync('git', ['cat-file', 'blob', `${source}:${closed}`], { cwd: repo }).stdout;
  assert.equal(g(repo, 'checkout', '-q', '-b', 'plan/demo-resume', 'main').code, 0);
  const reconciled = aep(repo, ['reconcile-blocked', 'demo', `--goal=${goal}`,
    `--source-ref=refs/remotes/origin/${branch}`, `--source-commit=${source}`]);
  assert.equal(reconciled.code, 0, reconciled.all);
  const reconciliation = g(repo, 'rev-parse', 'HEAD').out.trim();
  const authorization = 'HUMAN-RESUME-2026-10-28';
  const meta = { ...oldMeta, status: 'BLOCKED', plan_rev: 9,
    autorizacao_humana_execucao: { aprovado: true, authorization_id: authorization,
      condicao_previa: 'Plano e mecanismo integrados legitimamente na main; retomada cumulativa oficial.' },
    gate_humano: { requerido: true, pendente: true, motivo: 'Plano e rito oficial pendentes de merge humano.' },
    retomada_aep: { status: 'BLOCKED_PENDING_OFFICIAL_RITE', source_commit: source, blocked_commit: blocked,
      reconciliation_commit: reconciliation, historical_attempt: event.attempt, historical_previous_attempts: event.previous_attempts,
      max_attempts: 3, next_corrective_attempt_required: event.attempt + 1,
      current_cli_supported: false, G_AEP_CORE: 'REQUESTED_NOT_AUTHORIZED' } };
  if (options.mutatePlan) options.mutatePlan(meta);
  assert.equal(addGoal(repo, meta).commit.code, 0);
  assert.equal(g(repo, 'checkout', '-q', 'main').code, 0);
  assert.equal(g(repo, 'merge', '--ff-only', 'plan/demo-resume').code, 0);
  assert.equal(g(repo, 'push', 'origin', 'main').code, 0);
  const base = g(repo, 'rev-parse', 'HEAD').out.trim();
  assert.equal(g(repo, 'checkout', '-q', branch).code, 0);
  const merge = g(repo, 'merge', '--no-commit', '--no-ff', 'main');
  if (merge.code !== 0) assert.match(merge.all, /CONFLICT/, merge.all);
  // O rename detector do Git pode aplicar a revisão 9 no arquivo fechado 8.
  // A integração humana preserva explicitamente os blobs ratificados da main.
  const integrated = g(repo, 'restore', '--source=main', '--staged', '--worktree', '--', hot, closed,
    ledger, `${rel}/state.json`, 'docs/execution-tracks/REGISTRY.md', 'docs/ai-execution/GATES.md');
  assert.equal(integrated.code, 0, integrated.all);
  const resolved = sh('git', ['commit', '-m', 'merge: integrar plano humano preservando BLOCKED'], { cwd: repo, env: { AEP_WRITE: '1' } });
  assert.equal(resolved.code, 0, resolved.all);
  assert.equal(g(repo, 'status', '--porcelain').out, '');
  assert.ok(fs.existsSync(path.join(repo, hot)), `plano quente ausente após merge: ${merge.all}\n${g(repo, 'ls-tree', '-r', '--name-only', 'HEAD', '--', rel).out}\n${g(repo, 'log', '--oneline', '--all', '-8').out}`);
  assert.ok(spawnSync('git', ['cat-file', 'blob', `HEAD:${closed}`], { cwd: repo }).stdout.equals(archiveBlob),
    'integração preserva literalmente o blob histórico, inclusive sob autocrlf');
  const sourceBytes = fs.readFileSync(path.join(repo, ledger));
  const archiveBytes = fs.readFileSync(path.join(repo, closed));
  return { ...f, goal, branch, rel, hot, closed, ledger, meta, source, blocked, reconciliation, base,
    sourceBytes, archiveBytes, event, args: ['resume-blocked', 'demo', `--goal=${goal}`, `--authorization=${authorization}`] };
}

const resumedMarker = (f) => JSON.parse(fs.readFileSync(path.join(f.repo, '.aep-active'), 'utf8'));

test('RESUME: dry-run integralmente read-only, incluindo mtimes, índice, refs e objetos Git', (t) => {
  const f = blockedResumeFixture(t);
  const before = refreshSnapshot(f.repo);
  const r = aep(f.repo, [...f.args, '--dry-run']);
  assert.equal(r.code, 0, r.all);
  assert.match(r.all, /BLOCKED 1\/3 preservado/);
  assert.match(r.all, /próxima corretiva: 2\/3/);
  assert.deepEqual(refreshSnapshot(f.repo), before);
  assert.equal(fs.existsSync(path.join(f.repo, '.aep-active')), false);
});

for (const crlf of [false, true]) test(`RESUME: BLOCKED 1/3 → 2/3 sem falha/evento artificial; CRLF=${crlf}`, (t) => {
  const f = blockedResumeFixture(t, { crlf });
  const before = refreshSnapshot(f.repo);
  const r = aep(f.repo, f.args);
  assert.equal(r.code, 0, r.all);
  const a = resumedMarker(f);
  assert.equal(a.goal, f.goal);
  assert.equal(a.attempt, 2);
  assert.equal(a.max_attempts, 3);
  assert.equal(a.base_commit, f.base);
  assert.deepEqual(a.attempts_log, [], 'bloqueio não se transforma em falha inventada');
  assert.deepEqual(a.resumption.historical_previous_attempts, []);
  assert.equal(a.resumption.historical_attempt, 1);
  assert.equal(a.resumption.blocked_commit, f.blocked);
  assert.deepEqual(a.allowlist, f.meta.allowlist);
  const after = refreshSnapshot(f.repo);
  delete after['.aep-active'];
  assert.deepEqual(after, before, 'somente marcador; nenhum temporário nem metadado Git alterado');
  assert.equal(stateDe(f.repo).status, 'BLOCKED', 'estado ratificado continua BLOCKED');
  assert.equal(ledgerDe(f.repo).length, 1);
  assert.ok(fs.readFileSync(path.join(f.repo, f.closed)).equals(f.archiveBytes));
  const stable = refreshSnapshot(f.repo);
  for (const args of [f.args, [...f.args, '--dry-run']]) {
    const again = aep(f.repo, args);
    assert.equal(again.code, 0, again.all);
    assert.match(again.all, /NO-OP/);
    assert.deepEqual(refreshSnapshot(f.repo), stable);
  }
});

test('RESUME: falha corretiva 2/3 → 3/3; repetição não reseta; esgotamento mantém ambos BLOCKED', (t) => {
  const f = blockedResumeFixture(t);
  assert.equal(aep(f.repo, f.args).code, 0);
  const fail2 = aep(f.repo, ['attempt', 'demo', '--fail', '--reason=Falha corretiva real da tentativa 2']);
  assert.equal(fail2.code, 0, fail2.all);
  assert.equal(resumedMarker(f).attempt, 3);
  assert.deepEqual(resumedMarker(f).attempts_log.map((a) => a.n), [2]);
  const before = refreshSnapshot(f.repo);
  assert.equal(aep(f.repo, f.args).code, 0);
  assert.deepEqual(refreshSnapshot(f.repo), before);
  const fail3 = aep(f.repo, ['attempt', 'demo', '--fail', '--reason=Falha corretiva real da tentativa 3']);
  assert.equal(fail3.code, 3, fail3.all);
  const events = ledgerDe(f.repo);
  assert.equal(events.length, 2);
  assert.deepEqual(events[0], f.event);
  assert.equal(events[1].attempt, 3);
  assert.deepEqual(events[1].previous_attempts.map((a) => a.n), [2, 3]);
  assert.equal(events[1].resumed_from.historical_attempt, 1);
  assert.equal(events[1].result, 'BLOCKED');
  assert.ok(fs.readFileSync(path.join(f.repo, f.ledger)).subarray(0, f.sourceBytes.length).equals(f.sourceBytes));
  assert.ok(fs.readFileSync(path.join(f.repo, f.closed)).equals(f.archiveBytes));
  assert.equal(metaDe(f.repo, `${f.rel}/_closed/goals/${f.goal}-r9-a3.md`).status, 'BLOCKED');
  assert.equal(stateDe(f.repo).counters.goals_blocked, 1, 'projeção conta um GOAL, dois eventos');
  assert.equal(aep(f.repo, ['verify', '--all']).code, 0);
  const exhausted = refreshSnapshot(f.repo);
  assert.notEqual(aep(f.repo, f.args).code, 0);
  assert.notEqual(aep(f.repo, ['attempt', 'demo', '--fail', '--reason=quarta proibida']).code, 0);
  assert.deepEqual(refreshSnapshot(f.repo), exhausted);
});

test('RESUME: close legítimo em 2/3 preserva histórico e evidencia revisão/arquivo final distintos', (t) => {
  const f = blockedResumeFixture(t);
  assert.equal(aep(f.repo, f.args).code, 0);
  w(f.repo, 'app/produtivo.ts', 'export const produtivo = 3;\n');
  assert.equal(g(f.repo, 'add', '--', 'app/produtivo.ts').code, 0);
  assert.equal(g(f.repo, 'commit', '-m', 'goal(demo-resume-002): corretivo autorizado').code, 0);
  assert.equal(aep(f.repo, ['check', 'demo']).code, 0);
  const r = aep(f.repo, ['close', 'demo']);
  assert.equal(r.code, 0, r.all);
  const events = ledgerDe(f.repo);
  assert.equal(events.length, 2, 'somente BLOCKED original e DONE real');
  assert.deepEqual(events[0], f.event);
  assert.equal(events[1].result, 'DONE');
  assert.equal(events[1].attempt, 2);
  assert.deepEqual(events[1].previous_attempts, []);
  assert.equal(events[1].plan_rev, 9);
  assert.equal(events[1].goal_archive, `${f.rel}/_closed/goals/${f.goal}-r9-a2.md`);
  assert.equal(events[1].resumed_from.blocked_commit, f.blocked);
  assert.ok(fs.readFileSync(path.join(f.repo, f.closed)).equals(f.archiveBytes));
  assert.ok(fs.readFileSync(path.join(f.repo, f.ledger)).subarray(0, f.sourceBytes.length).equals(f.sourceBytes));
  assert.equal(metaDe(f.repo, events[1].goal_archive).status, 'DONE');
  assert.equal(metaDe(f.repo, events[1].goal_archive).plan_rev, 9);
  assert.equal(fs.existsSync(path.join(f.repo, f.hot)), false);
  assert.equal(fs.existsSync(path.join(f.repo, '.aep-active')), false);
  assert.match(fs.readFileSync(path.join(f.repo, events[1].report), 'utf8'), /sem falha artificial/);
  assert.deepEqual(stateDe(f.repo).counters, { goals_done: 1, goals_blocked: 0, goals_imported: 0, ledger_lines: 2 });
  assert.equal(aep(f.repo, ['verify', '--all']).code, 0);
});

for (const [label, mutatePlan, expected] of [
  ['autorização não aprovada', (m) => { m.autorizacao_humana_execucao.aprovado = false; }, /autorização/],
  ['autorização divergente', (m) => { m.autorizacao_humana_execucao.authorization_id = 'OUTRA'; }, /autorização/],
  ['origem divergente', (m) => { m.retomada_aep.source_commit = 'f'.repeat(40); }, /FALHA/],
  ['contagem histórica divergente', (m) => { m.retomada_aep.historical_attempt = 0; }, /contagem histórica/],
  ['falha retroativa inventada', (m) => { m.retomada_aep.historical_previous_attempts = [{ n: 1, reason: 'inventada' }]; }, /contagem histórica/],
  ['revisão não avançada', (m) => { m.plan_rev = 8; }, /plano revisado/],
  ['worktree divergente', (m) => { m.worktree = 'outra-worktree'; }, /worktree/],
]) test(`RESUME: recusa ${label}, sem escrita inclusive no dry-run`, (t) => {
  const f = blockedResumeFixture(t, { mutatePlan });
  const before = refreshSnapshot(f.repo);
  for (const args of [f.args, [...f.args, '--dry-run']]) {
    const r = aep(f.repo, args);
    assert.notEqual(r.code, 0, r.all);
    assert.match(r.all, expected);
    assert.deepEqual(refreshSnapshot(f.repo), before);
  }
});

test('RESUME: teto 3/3 não pode ser retomado nem por nova autorização', (t) => {
  const f = blockedResumeFixture(t, { exhausted: true });
  const before = refreshSnapshot(f.repo);
  const r = aep(f.repo, [...f.args, '--dry-run']);
  assert.equal(r.code, 4, r.all);
  assert.match(r.all, /3\/3 esgotado/);
  assert.deepEqual(refreshSnapshot(f.repo), before);
});

test('RESUME: recusa plano copiado fora da main, branch/HEAD errados, sessão aberta e argumentos ambíguos', (t) => {
  const f = blockedResumeFixture(t);
  for (const args of [f.args.filter((a) => !a.startsWith('--authorization=')), [...f.args, '--dry-run=true'],
    [...f.args, '--surpresa'], [...f.args, 'extra'], f.args.map((a) => a === `--goal=${f.goal}` ? '--goal=../../fora' : a)]) {
    const before = refreshSnapshot(f.repo);
    assert.notEqual(aep(f.repo, args).code, 0);
    assert.deepEqual(refreshSnapshot(f.repo), before);
  }
  w(f.repo, '.aep-active', JSON.stringify({ goal: f.goal, track: 'demo', attempt: 1 }));
  const opened = refreshSnapshot(f.repo);
  assert.equal(aep(f.repo, f.args).code, 4);
  assert.deepEqual(refreshSnapshot(f.repo), opened);
  fs.unlinkSync(path.join(f.repo, '.aep-active'));
  for (const args of [['checkout', '-q', '-b', 'wrong-branch'], ['checkout', '-q', '--detach']]) {
    assert.equal(g(f.repo, ...args).code, 0);
    const wrong = refreshSnapshot(f.repo);
    assert.equal(aep(f.repo, f.args).code, 4);
    assert.deepEqual(refreshSnapshot(f.repo), wrong);
  }
  assert.equal(g(f.repo, 'checkout', '-q', f.branch).code, 0);
  assert.equal(addGoal(f.repo, { ...f.meta, read_budget: 99 }).commit.code, 0);
  const copied = refreshSnapshot(f.repo);
  assert.equal(aep(f.repo, f.args).code, 4);
  assert.deepEqual(refreshSnapshot(f.repo), copied);
});

test('RESUME: árvore/índice sujos, origem remota divergente e plano ausente são recusados', (t) => {
  const f = blockedResumeFixture(t);
  w(f.repo, 'app/dirty.txt', 'não autorizado\n');
  for (const staged of [false, true]) {
    if (staged) assert.equal(g(f.repo, 'add', '--', 'app/dirty.txt').code, 0);
    const before = refreshSnapshot(f.repo);
    assert.equal(aep(f.repo, f.args).code, 4);
    assert.deepEqual(refreshSnapshot(f.repo), before);
  }
  assert.equal(g(f.repo, 'restore', '--staged', '--', 'app/dirty.txt').code, 0);
  fs.unlinkSync(path.join(f.repo, 'app/dirty.txt'));
  assert.equal(g(f.repo, 'update-ref', `refs/remotes/origin/${f.branch}`, f.base).code, 0);
  const divergent = refreshSnapshot(f.repo);
  assert.equal(aep(f.repo, f.args).code, 4);
  assert.deepEqual(refreshSnapshot(f.repo), divergent);
  assert.equal(g(f.repo, 'update-ref', `refs/remotes/origin/${f.branch}`, f.source).code, 0);
  assert.equal(g(f.repo, 'rm', '--', f.hot).code, 0);
  assert.equal(aep(f.repo, ['registry']).code, 0);
  assert.equal(g(f.repo, 'add', '--', `${f.rel}/state.json`, 'docs/execution-tracks/REGISTRY.md').code, 0);
  assert.equal(sh('git', ['commit', '-m', 'aep(demo): fixture plano ausente'], { cwd: f.repo, env: { AEP_WRITE: '1' } }).code, 0);
  const missing = refreshSnapshot(f.repo);
  assert.notEqual(aep(f.repo, f.args).code, 0);
  assert.deepEqual(refreshSnapshot(f.repo), missing);
});

test('RESUME: sessão concorrente da mesma trilha em outra worktree é preservada e impede abertura', (t) => {
  const f = blockedResumeFixture(t);
  const other = path.join(f.tmp, 'other-worktree');
  assert.equal(g(f.repo, 'worktree', 'add', '-b', 'other-session', other, 'main').code, 0);
  const marker = w(other, '.aep-active', JSON.stringify({ track: 'demo', goal: 'other-goal', attempt: 2 }));
  const bytes = fs.readFileSync(marker);
  const before = refreshSnapshot(f.repo);
  const r = aep(f.repo, f.args);
  assert.equal(r.code, 4, r.all);
  assert.match(r.all, /sessão ativa concorrente/);
  assert.deepEqual(refreshSnapshot(f.repo), before);
  assert.ok(fs.readFileSync(marker).equals(bytes));
});

test('RESUME: falha na publicação atômica reverte temporário; retry cria somente uma sessão', (t) => {
  const f = blockedResumeFixture(t);
  const preload = w(f.tmp, 'fail-resume-link.mjs', "import fs from 'node:fs';\nfs.linkSync = () => { throw new Error('publicação recusada'); };\n");
  const before = refreshSnapshot(f.repo);
  const r = sh(process.execPath, ['--import', pathToFileURL(preload).href, TRACK, ...f.args], { cwd: f.repo });
  assert.equal(r.code, 5, r.all);
  assert.deepEqual(refreshSnapshot(f.repo), before);
  assert.equal(aep(f.repo, f.args).code, 0);
  assert.equal(resumedMarker(f).attempt, 2);
});

test('RESUME: corrida de sessão entre validação e link nunca sobrescreve marcador concorrente', (t) => {
  const f = blockedResumeFixture(t);
  const preload = w(f.tmp, 'race-resume-link.mjs', "import fs from 'node:fs';\nconst link = fs.linkSync;\nfs.linkSync = (from, to) => { fs.writeFileSync(to, 'sessão concorrente preservada'); return link(from, to); };\n");
  const before = refreshSnapshot(f.repo);
  const r = sh(process.execPath, ['--import', pathToFileURL(preload).href, TRACK, ...f.args], { cwd: f.repo });
  assert.equal(r.code, 5, r.all);
  assert.equal(fs.readFileSync(path.join(f.repo, '.aep-active'), 'utf8'), 'sessão concorrente preservada');
  const after = refreshSnapshot(f.repo);
  delete after['.aep-active'];
  assert.deepEqual(after, before);
});

test('RESUME: mudança concorrente de Git após fsync impede publicação e preserva a mudança externa', (t) => {
  const f = blockedResumeFixture(t);
  const preload = w(f.tmp, 'race-resume-ref.mjs', `import fs from 'node:fs';\nimport {execFileSync} from 'node:child_process';\nconst sync = fs.fsyncSync;\nfs.fsyncSync = (fd) => { sync(fd); execFileSync('git', ['update-ref', 'refs/remotes/origin/${f.branch}', '${f.base}']); };\n`);
  const ledger = fs.readFileSync(path.join(f.repo, f.ledger));
  const r = sh(process.execPath, ['--import', pathToFileURL(preload).href, TRACK, ...f.args], { cwd: f.repo });
  assert.equal(r.code, 4, r.all);
  assert.equal(g(f.repo, 'rev-parse', `refs/remotes/origin/${f.branch}`).out.trim(), f.base);
  assert.equal(fs.existsSync(path.join(f.repo, '.aep-active')), false);
  assert.equal(fs.readdirSync(f.repo).filter((p) => p.includes('.resume-')).length, 0);
  assert.ok(fs.readFileSync(path.join(f.repo, f.ledger)).equals(ledger));
  assert.ok(fs.readFileSync(path.join(f.repo, f.closed)).equals(f.archiveBytes));
});

test('RESUME: arquivo final e histórico conflitantes são recusados sem sobrescrita', (t) => {
  const f = blockedResumeFixture(t);
  const dest = `${f.rel}/_closed/goals/${f.goal}-r9-a2.md`;
  w(f.repo, dest, 'Fechamento anterior não pode ser sobrescrito.\n');
  assert.equal(g(f.repo, 'add', '--', dest).code, 0);
  assert.equal(g(f.repo, 'commit', '-m', 'aep(demo): fixture colisão').code, 0);
  const before = refreshSnapshot(f.repo);
  assert.equal(aep(f.repo, f.args).code, 4);
  assert.deepEqual(refreshSnapshot(f.repo), before);
  assert.equal(g(f.repo, 'rm', '--', dest).code, 0);
  assert.equal(g(f.repo, 'commit', '-m', 'aep(demo): fixture remover colisão').code, 0);
  assert.equal(aep(f.repo, f.args).code, 0);
  w(f.repo, dest, 'Colisão posterior à abertura.\n');
  assert.equal(g(f.repo, 'add', '--', dest).code, 0);
  assert.equal(sh('git', ['commit', '-m', 'aep(demo): fixture colisão posterior'], { cwd: f.repo, env: { AEP_WRITE: '1' } }).code, 0);
  const blocked = reconciliationSnapshot(f.repo);
  const marker = fs.readFileSync(path.join(f.repo, '.aep-active'));
  assert.equal(aep(f.repo, ['block', 'demo', '--by=gate', '--reason=Gate real']).code, 4);
  assert.deepEqual(reconciliationSnapshot(f.repo), blocked);
  assert.ok(fs.readFileSync(path.join(f.repo, '.aep-active')).equals(marker));
  assert.ok(fs.readFileSync(path.join(f.repo, f.closed)).equals(f.archiveBytes));
});

test('RESUME: open não reinicia BLOCKED executado marcado READY por replanejamento', (t) => {
  const f = blockedResumeFixture(t);
  assert.equal(addGoal(f.repo, { ...f.meta, status: 'READY' }).commit.code, 0);
  const before = refreshSnapshot(f.repo);
  const r = aep(f.repo, ['open', 'demo']);
  assert.equal(r.code, 4, r.all);
  assert.match(r.all, /resume-blocked/);
  assert.deepEqual(refreshSnapshot(f.repo), before);
});

test('RESUME: classificação importada posterior não apaga teto executado 3/3 para open', (t) => {
  const f = blockedResumeFixture(t, { exhausted: true });
  const imported = importarManifesto(f.repo, manifestoBase(f.base, { plan_ref: f.meta.plan_ref, plan_rev: 10,
    goals_declarados: [{ id: f.goal, title: 'Reclassificação humana sem prova de DONE', situacao: 'DONE',
      commit: 'f'.repeat(40), branch: f.branch, worktree: f.name }] }));
  assert.equal(imported.code, 0, imported.all);
  assert.equal(ledgerDe(f.repo).at(-1).source, 'importado');
  assert.equal(ledgerDe(f.repo).at(-1).result, 'BLOCKED');
  assert.equal(ledgerDe(f.repo)[0].attempt, 3);
  assert.equal(addGoal(f.repo, { ...f.meta, status: 'READY', plan_rev: 10 }).commit.code, 0);
  const before = refreshSnapshot(f.repo);
  const r = aep(f.repo, ['open', 'demo']);
  assert.equal(r.code, 4, r.all);
  assert.match(r.all, /resume-blocked/);
  assert.deepEqual(refreshSnapshot(f.repo), before);
});

test('RESUME: falha no arquivo final restaura close/block sem linha, relatório, mudança de índice ou perda da sessão', (t) => {
  const f = blockedResumeFixture(t);
  assert.equal(aep(f.repo, f.args).code, 0);
  const preload = w(f.tmp, 'fail-closure-archive.mjs', "import fs from 'node:fs';\nconst open = fs.openSync;\nfs.openSync = (file, ...args) => { if (String(file).endsWith('-r9-a2.md')) throw new Error('arquivo final recusado'); return open(file, ...args); };\n");
  for (const args of [['close', 'demo'], ['block', 'demo', '--by=gate', '--reason=Gate real']]) {
    const before = reconciliationSnapshot(f.repo);
    const marker = fs.readFileSync(path.join(f.repo, '.aep-active'));
    const index = fs.readFileSync(path.join(f.repo, '.git/index'));
    const r = sh(process.execPath, ['--import', pathToFileURL(preload).href, TRACK, ...args], { cwd: f.repo });
    assert.notEqual(r.code, 0, r.all);
    assert.match(r.all, /arquivo final recusado/);
    assert.ok(fs.readFileSync(path.join(f.repo, '.git/index')).equals(index));
    assert.deepEqual(reconciliationSnapshot(f.repo), before);
    assert.ok(fs.readFileSync(path.join(f.repo, '.aep-active')).equals(marker));
    assert.equal(fs.existsSync(path.join(f.repo, `${f.rel}/_closed/reports/${f.goal}-a2.md`)), false);
  }
  assert.equal(aep(f.repo, ['close', 'demo']).code, 0);
});

test('RESUME: commit recusado em close/block faz rollback; retry ratifica somente um novo evento', (t) => {
  const f = blockedResumeFixture(t);
  assert.equal(aep(f.repo, f.args).code, 0);
  const hookDir = path.join(f.tmp, 'reject-state-hooks');
  w(hookDir, 'commit-msg', '#!/bin/sh\nexit 1\n');
  fs.copyFileSync(path.join(f.repo, '.githooks/pre-commit'), path.join(hookDir, 'pre-commit'));
  assert.equal(g(f.repo, 'config', 'core.hooksPath', hookDir).code, 0);
  for (const args of [['close', 'demo'], ['block', 'demo', '--by=gate', '--reason=Gate real']]) {
    const before = reconciliationSnapshot(f.repo);
    const marker = fs.readFileSync(path.join(f.repo, '.aep-active'));
    const index = fs.readFileSync(path.join(f.repo, '.git/index'));
    const r = aep(f.repo, args);
    assert.equal(r.code, 3, r.all);
    assert.ok(fs.readFileSync(path.join(f.repo, '.git/index')).equals(index));
    assert.deepEqual(reconciliationSnapshot(f.repo), before);
    assert.ok(fs.readFileSync(path.join(f.repo, '.aep-active')).equals(marker));
    assert.equal(ledgerDe(f.repo).length, 1);
  }
  assert.equal(g(f.repo, 'config', 'core.hooksPath', '.githooks').code, 0);
  assert.equal(aep(f.repo, ['close', 'demo']).code, 0);
  assert.equal(ledgerDe(f.repo).length, 2);
});

test('RESUME: check/close mantêm falha de teste; hooks/allowlist/gates e item 8 continuam obrigatórios', (t) => {
  const f = blockedResumeFixture(t);
  assert.equal(aep(f.repo, f.args).code, 0);
  w(f.repo, 'TEST_MUST_FAIL', '1');
  const before = refreshSnapshot(f.repo);
  assert.equal(aep(f.repo, ['close', 'demo']).code, 3);
  // check busca origin conforme contrato preexistente; compare os fatos ratificados.
  assert.ok(fs.readFileSync(path.join(f.repo, f.closed)).equals(f.archiveBytes));
  assert.equal(fs.readFileSync(path.join(f.repo, '.aep-active')).toString('base64'), before['.aep-active'].bytes);
  assert.equal(ledgerDe(f.repo).length, 1);
  fs.unlinkSync(path.join(f.repo, 'TEST_MUST_FAIL'));
  w(f.repo, 'outside.txt', 'fora da allowlist\n');
  assert.equal(g(f.repo, 'add', '--', 'outside.txt').code, 0);
  const outside = g(f.repo, 'commit', '-m', 'goal(demo-001): fora do escopo');
  assert.notEqual(outside.code, 0, outside.all);
  assert.match(outside.all, /fora da allowlist/);
  assert.equal(g(f.repo, 'restore', '--staged', '--', 'outside.txt').code, 0);
  fs.unlinkSync(path.join(f.repo, 'outside.txt'));
  w(f.repo, f.hot, fs.readFileSync(path.join(f.repo, f.hot), 'utf8') + '\nEdição indevida.\n');
  assert.equal(g(f.repo, 'add', '--', f.hot).code, 0);
  const plan = g(f.repo, 'commit', '-m', 'goal(demo-001): mudar plano');
  assert.notEqual(plan.code, 0, plan.all);
  assert.match(plan.all, /fora da allowlist|caminho quente/);
  const setup = sh('git', ['commit', '-m', 'aep(demo): fixture violação item 8'], { cwd: f.repo, env: { AEP_WRITE: '1' } });
  assert.equal(setup.code, 0, setup.all);
  const check = aep(f.repo, ['check', 'demo']);
  assert.equal(check.code, 3, check.all);
  assert.match(check.all, /8 \[FAIL/);
  assert.equal(aep(f.repo, ['close', 'demo']).code, 3);
  assert.equal(ledgerDe(f.repo).length, 1);
});
