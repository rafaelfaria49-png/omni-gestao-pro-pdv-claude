# Comandos de continuação fiscal — execução segura

> **Proveniência:** reconstrução do pacote Fable 5 ausente, ajustada aos scripts reais da base
> `2b9c51a`. Nenhum comando abaixo autoriza produção ou escrita em banco.

## Pré-flight Git

```text
git fetch origin
git worktree add <worktree-isolada> -b <branch-propria> origin/main
git rev-parse HEAD
git status --short
git branch --show-current
git log -1 --oneline
```

## Descoberta e baseline reais

Scripts encontrados em `package.json`:

```text
npm test
npx tsc --noEmit
npm run lint
npm run build
```

Em worktree nova, `npx prisma generate` pode ser necessário antes dos testes. Ele gera client local;
não consulta nem altera o banco.

## Banco e schema — somente leitura

```text
prisma migrate diff --from-url <DIRECT_URL_REDACTED> \
  --to-schema-datamodel prisma/schema.prisma --script
```

Nunca imprimir a URL. Nunca executar `db push`, `db pull`, `migrate dev`, `migrate deploy` ou SQL de
escrita. Se o diff não for vazio e mudar a leitura da arquitetura fiscal, parar no checkpoint de
drift material.

## Inventário mínimo

```text
git log --oneline --decorate --all -- lib/fiscal
git log --oneline --all -- docs/fiscal docs/roadmaps/ROADMAP_FISCAL.md
git branch -a
rg -n '@/lib/fiscal|@/lib/produto-fiscal' app components lib
rg -n 'assertVendaFiscal(Editavel|Cancelavel)' app
```

## Stage e publicação

```text
git add <caminho-literal-1>
git add <caminho-literal-2>
git status --porcelain
git diff --cached --name-only
git diff --cached --stat
git diff --check
git commit -m "docs(fiscal): reconciliar status fiscal F0-F12 (GOAL-001)"
git push -u origin fiscal/goal-001-status-reconcile
```

Proibidos: `git add .`, `git add -A`, `git commit -a`, reset, stash, rebase, merge, force-push e push
para `main`.

## Nota reconciliada — decisão XSD ADR-0010

Em 14/07/2026, a decisão do checkpoint `FISCAL-XSD-ADR-P01-DECISION-002A` foi documentada em
worktree própria, baseada na `origin/main`, usando as branches de pesquisa/WASM/nativa apenas como
fontes read-only. Não fazer merge, rebase, cherry-pick ou cópia integral dos spikes.

Para a implementação futura de B2:

```text
git fetch origin --prune
git worktree add <worktree-isolada> -b <branch-propria> origin/main
git rev-parse origin/fiscal/goal-002-xsd-official
git rev-parse origin/fiscal/goal-002-xsd-wasm-spike
git rev-parse origin/fiscal/goal-002-xmllint-native-spike
```

Antes de criar outra ADR, repetir a busca global de número em `origin/main` e branches remotas. A
ADR-0010 está aceita; mudanças de direção exigem nova ADR, não edição silenciosa da decisão.

## Nota reconciliada — execução GOAL-002 XSD (B2) + G-C2

Em 15/07/2026, o GOAL nomeado `FISCAL-XSD-OFFICIAL-VALIDATION-002` foi **implementado, integrado e
fechado documentalmente**:

- PR #4 mergeado por **merge commit** `82c219c4e241b145109a697aa3eb0e5d26a24d93`
  (parents `50c1db8…` + `d497775e…`);
- worker B2 + `validarXsd` real + pacote `PL_010e_v1.02` na `main`;
- gate **G-C2 fechado** (N4 no eixo XSD; N6=0; N7=0; sem SEFAZ; sem emissão);
- relatório: `docs/fiscal/FISCAL_XSD_GOAL_002_CLOSURE_REPORT.md`;
- branch documental de fechamento: `fiscal/goal-002-xsd-close` (somente docs da allowlist).

Esta nota **não reescreve** o comando histórico acima; apenas reconcilia o estado pós-merge.
Próximo GOAL técnico à época: `FISCAL-XML-C14N-EXTERNAL-PROOF-003` — **não iniciado** naquele
fechamento XSD.

## Nota reconciliada — execução GOAL-003 C14N/XMLDSig + critério F4→F5

Em 15/07/2026, o GOAL nomeado `FISCAL-XML-C14N-EXTERNAL-PROOF-003` foi **implementado, integrado e
fechado documentalmente**:

- PR #6 mergeado por **merge commit** `e52d16b1ad62b5aa82dbd00e734e45af7e17f94c`
  (parents `edc79de…` + `586c135…`);
- C14N 1.0 inclusivo + XMLDSig endurecido + prova externa Java JSR 105 na `main`;
- run do PR `29450960130` · artefato `8357457694`;
- **critério técnico C14N/XMLDSig do gate F4→F5 = FECHADO**; gate Fiscal **global permanece ABERTO**;
- N4 somente no eixo C14N/XMLDSig; N6=0; N7=0; sem SEFAZ; sem emissão; signer dormente;
- relatório: `docs/fiscal/FISCAL_XML_C14N_GOAL_003_CLOSURE_REPORT.md`;
- branch documental de fechamento: `fiscal/goal-003-c14n-close` (somente docs da allowlist).

Esta nota **não reescreve** comandos históricos de implementação; apenas reconcilia o estado
pós-merge do GOAL-003. GOAL-004 **não iniciado** aqui.

## Nota reconciliada — execução GOAL-004 paridade `upsertProduto` + P-04

Em 16/07/2026, o GOAL nomeado `FISCAL-PRODUTO-UPSERT-PARITY-004` foi **implementado, integrado e
fechado documentalmente**:

- PR #8 mergeado por **merge commit** `b307337ce89535355d18cd9138e17f635f1c1bf5`
  (parents `5b96df7…` + `3f8928c…`);
- commit de implementação `3f8928c0d8dc7361b6282cbb2b225ae04ed8a501`
  (`fix(cadastros-v2): canonizar dados fiscais no upsertProduto`);
- 4 arquivos: `app/actions/cadastros.ts`, `produto-ia.tsx`,
  `lib/produtos/produto-fiscal-upsert.ts`, `lib/produtos/produto-fiscal-upsert.test.ts`
  (+206 / −20);
- `metadata.fiscal` canônica na porta Cadastros V2; `metadata.fiscalRegime` **não canônico**;
- N3 no eixo cadastro/produto; N6=0; N7=0; sem SEFAZ; sem emissão; signer dormente;
- gates G-C1/G-C2/C14N e G-F5/G-F7/G-F12 **inalterados** por este GOAL;
- relatório: `docs/fiscal/FISCAL_PRODUTO_UPSERT_PARITY_004_CLOSURE_REPORT.md`;
- branch documental de fechamento: `fiscal/goal-004-produto-upsert-close` (somente docs da
  allowlist).

### Colisão de numeração (registrar; não renumerar)

Este GOAL nomeado **004** corresponde, por objetivo, ao **GOAL histórico 002 / P-04**
(“paridade fiscal do `upsertProduto`”), com implementação parcial prévia em `04ce54d`
(contrato + REST/importadores). Na sequência oficial de execução:

- GOAL-002 nomeado = validação XSD oficial (FECHADO);
- GOAL-003 nomeado = prova externa C14N/XMLDSig (FECHADO);
- GOAL-004 nomeado = fechamento da paridade fiscal do `upsertProduto` (FECHADO aqui).

O GOAL histórico **004** da tabela (ST mínima / CSOSN 500) **permanece distinto e não iniciado**.

Esta nota **não reescreve** comandos históricos; apenas reconcilia o estado pós-merge.
**GOAL-005 não iniciado.**

## Nota reconciliada — escopo oficial do GOAL-005 (16/07/2026)

Em 16/07/2026, após a auditoria formal `FISCAL-GOAL-005-FORMAL-EVALUATION` (classe **G**, branch
`audit/fiscal-goal-005-formal-evaluation`, commit `f6d6f2a…`), o GOAL
`FISCAL-GOAL-005-SCOPE-RECONCILIATION` **reconciliou documentalmente** a numeração “005”. Esta nota
**não reescreve** os comandos históricos acima; apenas registra a decisão.

- Slot nomeado **005** = **`FISCAL-DRY-RUN-INTEGRITY-PROOF-005`** (“Prova de Integridade do Dry-Run
  Fiscal”); rótulo provisório equivalente: `FISCAL-DRY-RUN-INTEGRITY-005`.
- Estado: **definido documentalmente, NÃO iniciado**. Nenhuma implementação técnica autorizada por
  esta nota.
- Colisão “005” registrada e separada: XSD histórico (**cumprido**, GOAL nomeado 002); rótulo de
  código `GOAL_005` snapshot (**dormente**, componente/pré-requisito); Contador HUB competência
  (**trilho distinto**, read-only). **Não renumerar histórico.**
- Proibições permanentes desta trilha: sem `git add .` / `git add -A` / `git commit -a`; sem reset,
  stash, rebase, merge, force-push, push para `main`; sem PR nesta etapa documental.

Quando o GOAL-005 técnico for autorizado (após merge readiness + PR + aprovação humana), a esteira
segura de comandos é a mesma das notas acima: `git fetch origin --prune` → `git worktree add
<worktree> -b <branch> origin/main` → pré-flight → allowlist literal → commit → push da branch
própria. Execução **offline**; nenhuma credencial; nenhum caller produtivo.

Fonte: [`FISCAL_GOAL_005_SCOPE_RECONCILIATION.md`](./FISCAL_GOAL_005_SCOPE_RECONCILIATION.md).

## Nota — escopo do GOAL-005B ratificado (20/07/2026)

Em 20/07/2026, o GOAL `FISCAL-DRY-RUN-INTEGRITY-PROOF-005B-SCOPE-RATIFICATION` ratificou
documentalmente o escopo do **005B** pelo **Caminho 2** (o 005B carrega o harness). Esta nota
**não reescreve** os comandos históricos acima; apenas registra a decisão e as travas de execução.

- **Estado:** 005B **definido documentalmente, NÃO iniciado**. Nenhuma implementação técnica é
  autorizada por esta nota.
- **Próximo comando somente após integração documental.** A implementação do 005B só pode ser
  iniciada depois que a ratificação estiver na `main` (**Gate H1**). Não iniciar com base na branch
  documental.
- **Implementação futura separada.** O comando de implementação do 005B é um comando **próprio**,
  distinto desta ratificação e do 005A.

**Artifact — fail-closed.** O workflow do 005B consome o bundle offline aprovado do 005A
(artifact `8436826125`, run `29669361609`, digest `sha256:aa60526d…`). A identidade é **composta**:
run ID + nome completo + head SHA + digest — não confiar só no ID nem só no nome. Se o artifact
estiver **expirado, ausente, com nome/digest/conteúdo divergente, ou com hash diferente do lock**,
o workflow deve terminar com **erro não-zero**. Proibido: reconstruir silenciosamente, substituir
por imagem local, baixar imagem de registry, alterar o lock.

**Fallback de renovação do 005A.** O artifact expira em **2026-07-26T01:59:00Z**. Se expirar antes
da execução: (1) parar o 005B; (2) executar um GOAL **separado** de renovação controlada do bundle
005A; (3) produzir novo run, artifact e lock; (4) integrar a renovação; (5) retomar o 005B.
**Não** usar o workflow do 005B para renovar o 005A.

**Gates humanos (H1–H8), nenhum automático:** H1 ratificação na `main` · H2 revisão de
implementação/workflow antes do primeiro dispatch · H3 autorização manual de execução do workflow ·
H4 autorização manual para regenerar manifesto/golden · H5 auditoria de evidências pós-run ·
H6 merge-readiness · H7 PR e aprovação humana · H8 fechamento documental do GOAL-005.

**Esteira segura (inalterada):** `git fetch origin --prune` → `git worktree add <worktree> -b
<branch> origin/main` → pré-flight → allowlist literal → commit → push da branch própria.
Proibições permanentes desta trilha: sem `git add .` / `git add -A` / `git commit -a`; sem reset,
stash, rebase, cherry-pick, amend, merge, force-push ou push para `main`.

Fonte: [`FISCAL_DRY_RUN_INTEGRITY_PROOF_005B_SCOPE_RATIFICATION.md`](./FISCAL_DRY_RUN_INTEGRITY_PROOF_005B_SCOPE_RATIFICATION.md).
**GOAL-005 técnico permanece PARCIAL. 005B não iniciado.**
