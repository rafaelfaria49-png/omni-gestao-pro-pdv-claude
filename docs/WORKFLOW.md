# Workflow de Branches Paralelas — OmniGestão Pro

## Problema que resolve
Múltiplos terminais Claude Code trabalhando simultaneamente no mesmo repo
causavam conflitos de push no `main` e builds quebrados na Vercel.

## Estrutura de branches

```
main       ← produção (Vercel deploy automático em cada push)
  └── dev  ← integração (staging area antes de ir para main)
       ├── terminal-1  ← Terminal 1 (auth, billing, integrações)
       ├── terminal-2  ← Terminal 2 (UI, UX, empty states)
       └── terminal-3  ← Terminal 3 (fixes, docs, smoke tests)
```

## Responsabilidades por terminal

### Terminal 1
- **Branch:** `terminal-1`
- **Foco:** Auth, billing, integrações pesadas, Server Actions críticos
- **Exemplos:** NextAuth, Stripe, webhooks, middleware

### Terminal 2
- **Branch:** `terminal-2`
- **Foco:** UI, UX, componentes, loading states, empty states, error boundaries
- **Exemplos:** Skeletons, toasts, formulários, layouts

### Terminal 3
- **Branch:** `terminal-3`
- **Foco:** Fixes pontuais, documentação, smoke tests, limpeza
- **Exemplos:** Bug fixes, CLAUDE.md, scripts utilitários, testes

## Regra de ouro

> **NUNCA** fazer push direto no `main` ou no `dev`.

Cada terminal:
1. Commita apenas na sua branch (`terminal-N`)
2. Quando o trabalho estiver pronto, roda o script de merge

## Ciclo de trabalho (por terminal)

```bash
# 1. Garantir que está na branch correta
git checkout terminal-1   # ou terminal-2 / terminal-3

# 2. Sincronizar com o main antes de começar
git fetch origin
git merge origin/main

# 3. Trabalhar e commitar normalmente
git add <arquivos>
git commit -m "feat: ..."

# 4. Push da branch (não do main!)
git push origin terminal-1

# 5. Quando pronto para ir para produção: rodar o script
./scripts/merge-to-main.sh terminal-1
```

## Script de merge

```bash
# Sintaxe:
./scripts/merge-to-main.sh <branch>

# Exemplos:
./scripts/merge-to-main.sh terminal-1
./scripts/merge-to-main.sh terminal-2
./scripts/merge-to-main.sh terminal-3
```

O script faz automaticamente:
1. Atualiza `main` e `dev` com o remoto
2. Merge `main → dev` (sincroniza dev)
3. Merge `terminal-N → dev`
4. Roda `npm run build` para validar
5. Push `dev`
6. Merge `dev → main`
7. Push `main` → dispara deploy Vercel

## Resolução de conflitos

Se dois terminais modificaram o mesmo arquivo:

```bash
# No terminal que está fazendo o merge:
git merge terminal-2   # conflito detectado

# Resolver manualmente os arquivos em conflito
# (VS Code mostra os conflitos com <<<< ==== >>>>)

git add <arquivo-resolvido>
git merge --continue
```

## Sincronizar branch do terminal com main atualizado

```bash
git checkout terminal-1
git fetch origin
git merge origin/main   # pega o que os outros terminais mergearam
```

## Não fazer

- `git push origin main` direto de um terminal
- `git push origin dev` direto de um terminal
- Commitar `.env`, `node_modules`, `.next`
- Fazer push sem rodar build local antes

## Verificações antes de mergear

```bash
npm run lint           # sem erros de lint
npx tsc --noEmit       # sem erros de TypeScript
npm run build          # build deve passar
```
