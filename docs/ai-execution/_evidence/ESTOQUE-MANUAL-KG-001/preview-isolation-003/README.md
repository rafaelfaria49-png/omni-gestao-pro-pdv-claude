# PR315-PREVIEW-ISOLATION-READINESS-003 — evidências (2026-10-26, somente leitura)

Plano: `docs/padaria/pesagem/ESTOQUE_MANUAL_KG_PREVIEW_ISOLAMENTO.md`.

| Arquivo | Conteúdo |
| --- | --- |
| `01-vercel-env-inventario.md` | nomes, escopos, branch, tipo e data das envs dos 2 projetos Vercel (sem valores) |
| `02-prova-preparo-banco-preview.txt` | saída da prova em PG 17 descartável local (127.0.0.1:55447, apagado): base da main + resolve das 23 migrations, papel runtime só DML, branch filho com a migration KG |
| `harness/prova-preparo-banco-preview.sh` | roteiro da prova (trava de destino local) |
| `03-p1-projeto-neon.md` | P1 feita pelo dono (Neon via ChatGPT): `nameless-frost-19035275`, relato não conferido no control plane |
| `05-p2-procedimento.md` | P2: escopo, fluxo de segredos, travas, passos, saídas esperadas, recuperação (não executada) |
| `harness/p2-preparo-preview.cjs` | roteiro da P2 (`check` / `main` / `kg`) |
| `harness/prova-local-p2.sh` · `04-prova-local-p2.txt` | prova do roteiro em 2 PG 17 descartáveis (main + cópia física como branch): PASS, 8 recusas esperadas, 0 vazamento |
| `07-p2-url-check.md` | fase `url` (sem conexão) PASS no arquivo real `C:\Projetos\secrets\neon-preview\.env`; validador aceita host `.c-2` |
| `08-p2-1-main.md` | P2.1 PASS (2026-10-27): runtime só DML, base da main `34b70a1` + 23 resolvidas, drift 0, seed sintético, 0 vazamento |
| `09-p2-3-kg.md` · `harness/p2-kg-prova.ts` · `04b-prova-local-p2-kg-estendida.txt` | P2.3 PASS (2026-10-27) no `pr315-kg`: checksum, 5 colunas double, histórico 24, 2,500+0,750=3,250 pelo boundary real em rollback, main intacto |
| `10-p3-0-preflight.md` · `10-p3-0-inventario.json` · `harness/p3-vercel-env.cjs` | P3.0 preflight PASS (2026-10-27, só leitura): mudanças exatas por id (plan), validação, risco dos 55 previews antigos |
| `11-p3-apply.md` | P3 APLICADA (2026-10-27): 12/12 operações por id, conferência pós-apply contra o inventário (não-preview idêntico, 0 deployments novos, aliases inalterados) |
| `12-p4-merge-r5-push.md` · `harness/p4-conexoes.cjs` | P4 (2026-10-28): merge da main (união dos guards de peso), R5 APPROVE, push `b00b230..2731097`, preview READY; conexões por branch (só leitura) |
| `06-p2-0-check.md` | P2.0 PASS (2026-10-27) pelo conector Neon do ChatGPT, não pelo roteiro; dono `omnigestao_preview_owner`, endpoint `ep-purple-morning-b6ajdsfk` |

Leituras adicionais, registradas no plano: estado da PR #315 (`gh pr view`), `/v6/deployments` (14 Production
e 53 Preview READY no `omni-gestao-pro`), log do build de Production `745fb55` (`MIGRATION_SKIPPED`), varredura de
segredos nas linhas de `5e1feb9` (0 literal).

Não feito: inventário do control plane Neon (projetos, plano, limites), porque o console não tem sessão no
navegador desta sessão. Também não houve leitura de catálogo da produção nesta missão.

Na prova local, a consulta do checksum falhou por codificação do cliente `psql` (caractere `…`). O checksum já está
provado no ensaio 002.
