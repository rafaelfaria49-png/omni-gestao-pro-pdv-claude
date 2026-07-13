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
