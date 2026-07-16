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
