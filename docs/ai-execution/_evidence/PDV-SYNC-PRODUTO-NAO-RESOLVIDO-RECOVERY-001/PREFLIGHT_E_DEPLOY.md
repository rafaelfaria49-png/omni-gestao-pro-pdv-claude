# PREFLIGHT_E_DEPLOY — PDV-SYNC-PRODUTO-NAO-RESOLVIDO-RECOVERY-001

Coletado em 2026-11-01 (America/Sao_Paulo), somente leitura.

## Repositório

| Item | Valor |
|---|---|
| Remoto | `rafaelfaria49-png/omni-gestao-pro-pdv-claude` |
| `origin/main` (após `git fetch --prune`) | `35a3971c31f62e6e802b7dd8763be81475334780` — Merge PR #322 (`codex/pdv-balanca-visor-readonly-001`), 2026-10-29 11:35:10 -0300 |
| Base desta trilha | `35a3971c` (a main remota atual; nenhuma main mais nova existia) |
| Worktree do incidente | `.worktrees/pdv-sync-produto-nao-resolvido-recovery-001` (nova) |
| Branch | `claude/pdv-sync-produto-nao-resolvido-recovery-001` |
| AEP | inativo (sem `.aep-active` no checkout primário nem na worktree) — opt-in respeitado, não ativado |

Checkout primário (`codex/db-migration-reconciliation-001`, com WIP não commitado) **não foi tocado**.
Nenhuma outra worktree, stash, ref ou WIP foi alterado. `node_modules` da worktree é junction para o
primário (remover com `cmd /c rmdir` antes de `git worktree remove`).

Concorrência: nenhuma worktree/branch existente mira `pdv-sync`/`produto-nao-resolvido`
(`git worktree list` + `git branch -r`). Sem coordenação necessária.

## Produção

| Item | Valor |
|---|---|
| Domínio | `https://omni-gestao-pro.vercel.app` |
| Deployment | `dpl_Atqrf9hWMh5adQtjd5JRARmcYG2m` (`omni-gestao-fmyj7d9pv-…vercel.app`), target production, Ready |
| Criado | 2026-10-29 11:35:14 -0300 — 4 s após o merge `35a3971c` na main (alias `…-git-main-…`) |
| Região | gru1 |
| SHA servido | `35a3971c` (inferido: alias git-main + horário; a CLI não exibiu o SHA diretamente) |

Rota de escrita usada pelo PDV em produção: `POST /api/ops/venda-persist/v2` (Writer V2, confirmado nos logs).

## Ambiente local

- Disco `C:` com **1,3 GB livres** → `npm run build` não executado (o `.next` ocupa ~1,5 GB; ENOSPC
  derrubaria outros processos). Ver MATRIZ_REGRESSAO.md.
- Node 26.12.1 (Node 20 ausente na máquina) — 215 testes de componente já falham na base por
  `localStorage` indefinido; idênticos antes e depois do patch.
