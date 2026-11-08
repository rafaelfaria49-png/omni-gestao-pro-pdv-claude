# Finalização integral D05 — Omni Print

GOAL `OMNI-PRINT-FINALIZACAO-INTEGRAL-D05-RELEASE-READY-001` · 2026-11-08 · executor Claude Code (Opus 5.5).

**Resultado: software pronto como candidato; homologação física pendente (gate de operador/hardware); produção intocada.**
Este documento não declara D05 físico aprovado nem autoriza merge, deploy, migration ou ativação em Production.

## 1. Estado inicial conferido

| Item | Valor |
|---|---|
| main | `ce9228c57617f72e9c350cc0232f973fb57a0eaa` (inalterada durante a execução) |
| #327 início | `aca73cc0c0e50b49fbb54f1a9916ebd4dbbceb5c`, main ancestral, CI 6/6 |
| #334 início | `172882c6e721bee506307c5ec2aac50ec2fca9ef`, base registrada `0e9eb95`, 19 commits atrás da #327, `MERGEABLE=false` |
| #332/#333 | já ancestrais da #327 (não reintegradas) |
| WIP preservado | 23 arquivos de evidência D05 não rastreados da fase autorizada (05–07/11) na worktree D05: conferidos sem segredos (varredura por padrões de credencial; só metadados/IDs) e versionados |
| Worktree da #327 de outra sessão (`omni-gestao-print-e2e-004c`) | só diferença de fim de linha em `battery-summary.json`; não tocada. Commit da #327 feito em worktree própria destacada |

## 2. Reconciliação da pilha main → #327 → #334

1. `66c359b` — merge normal de `aca73cc` na D05. Conflitos: `two-agents.pg.test.ts` (as duas PRs estabilizaram o mesmo teste de
   formas diferentes; mantidos a barreira determinística D05 de kill em `SUBMITTING` **e** o lease curto + espera de ociosidade
   da #327) e `HASHES.json` (regenerado pelo gerador oficial). Nenhuma migration duplicada; nenhum código de runtime em conflito.
2. `055d785` — correções do núcleo na #327 (seção 4), publicadas por fast-forward.
3. `ef277f0` — merge de `055d785` na D05.
4. `bef40f0` e seguintes — correções D05 + evidências + documentação.

Após o passo 3, a #334 ficou `MERGEABLE` com base `055d785`. Sem rebase, squash ou force-push. A #334 continua mirando a #327.

## 3. Baterias executadas (PostgreSQL 17 descartável 127.0.0.1:55581 no scratchpad, Node 24.22.1)

| Etapa | Pós-merge `66c359b` (run 2026-11-08T11-42-23) | Head corrigido `bef40f0` + ps1/docs (run 2026-11-08T12-32-07) |
|---|---|---|
| d05-tests / d05-plan | PASS / PASS | PASS / PASS |
| gerador 004C / D02 `--check` | PASS / PASS | PASS / PASS |
| unit (impressão + agente + spooler Windows real sem impressora) | 87/87 | PASS (inclui `JOURNAL_MISSING` e `failureKind`) |
| offline (regressão) | 135/135 | PASS |
| retenção PG | 17/17 | PASS |
| offline PG | PASS | PASS |
| cenários PG | 35/35 | PASS |
| dois agentes reais PG (kill -9 no envio) | 1/1 | PASS |
| sintético 004B PG | 3/3 | PASS |
| D02 migrations PG | 8/8 | PASS |
| ensaio D02 | 5/5 | PASS |
| Playwright PDV Clássico | 19/19 | 20/20 (PW20 novo) |
| typecheck | FAIL ambiental (cliente Prisma gerado antes do merge do catálogo) → `prisma generate` + tsc exit 0 | PASS |
| ESLint | PASS | PASS |
| build sem autoridade de migrations | PASS (`MIGRATION_SKIPPED`, `PROXY_PRISMA_ARTIFACT_VERIFIED`, `Compiled successfully`) | PASS (741 s) |
| recuperação Windows | 30/30 | FAIL 26/30 `RUNTIME_HELPER_TIMEOUT` (565 s, concorrendo com o build e a matriz KG) → repetição isolada 30/30 em 77 s (run 2026-11-08T13-10-42) |
| pacote + integridade | PASS | PASS |
| parse PowerShell 5.1 | PASS | PASS |

Logs/hashes: `evidence/d05/2026-11-08T11-42-23-278Z/`, `2026-11-08T12-32-07-221Z/` e `2026-11-08T13-10-42-388Z/` (`summary.json` com `sourceCommit`).
O FAIL de typecheck é registrado, não reclassificado; a repetição após regenerar o cliente passou.

## 4. Revisão independente e correções (RED → GREEN)

Detalhe por achado em `REVISAO_INDEPENDENTE_D05.md` (seção "Finalização integral"). Resumo:

- **P1** `vercel.json` da #334 pararia todo build de Production se chegasse à main → `build-preview.mjs` só exige isolamento na
  branch D05/marcador D05; build sem ref git falha fechado; demais refs rodam o build do projeto sem mudança.
- **P3-3** agente: `.instance` sem diário → `JOURNAL_MISSING` (impede reenvio de reentrega cercada à instância).
- **P3-5** log interno sem mensagem crua do banco.
- **P3-2** aviso ao operador quando a configuração pede mais de 2 vias.
- **Preview D05 500** em `/api/auth/csrf`: causa raiz `AUTH_URL=""` → `trustHost=false` (`UntrustedHost`), reproduzida com o
  `@auth/core` do lockfile (`evidence/d05/finalizacao-2026-11-08/auth-trusthost-repro.jsonl`). Correção no isolamento D05, sem
  alterar o auth do produto.
- Rodada 2: **APPROVE_WITH_NITS**, sem P0/P1/P2; nit de segurança (ref ausente) corrigido; pinos antigos anotados.

## 5. Pacote do agente Windows

`omni-print-agent-0.2.0-d04.zip` — SHA-256 `e974ca03a8ae862b8f7b7da5d78cd6aa5fca0c1664b5bf114d79870f0452bc77`,
contentId `f6af488c0c5d59e70f555f640b2fd97224dbd315b26da8e669335051dec56a40`, 17 arquivos + manifesto, sem assinatura.
Reproduzido byte a byte em três gerações independentes (Node 24.22.1 ×2 e Node 26.12.1). Substitui `f48b3097…` (nunca instalado).
A versão textual permanece `0.2.0-d04`; o contentId distingue a pasta de release instalada.

## 6. Compatibilidade de migrations (main × catálogo × KG × D02)

| Camada | Onde está | Estado |
|---|---|---|
| main (inclui catálogo `20261107120000_catalogo_aparelhos_loja`) | `prisma/migrations` | integrada |
| KG `20261025…`, `20261029…`, `20261106…` | branches #315/#335/#336/#337 | pendente (gate MIG-X da frente KG) |
| Omni Print D02 `20261105120000/120100/120200` | `tools/print-d02/migrations` (fora de `prisma/migrations`, guarda `d02-guard`) | pendente, `APLICACAO.json=NAO_APLICADA` |

- Nenhuma migration Omni Print pode ser aplicada pela liberação KG: o `migrate deploy` só enxerga `prisma/migrations`, e o
  teste `d02-guard` falha se uma pasta `omni_print_d02` aparecer lá antes do registro manual.
- Ensaio em PG17 descartável sobre o baseline da main `ce9228c`: **D02→KG** e **KG→D02** aplicam sem erro e produzem esquemas
  idênticos (`evidence/d05/finalizacao-2026-11-08/kg-d02-matrix/KG_D02_MATRIX.json`, KG em `3a11f61`).
- `merge-tree` da D05 com #315/#335/#336/#337: zero conflitos textuais. #331 só conflita em workflows de CI (base antiga dela).
- Semântica: venda KG é recusada pelo Omni Print (`KG_RECEIPT_BLOCKED`/`UNSUPPORTED_QUANTITY`) e volta ao fluxo de impressão
  anterior; nada é registrado. **Impressão direta de venda KG não existe** — a padaria imprime cupom KG pelo fluxo atual.
- Plano de migrations KG não foi alterado.

## 7. Ambiente D05 (autorização de 2026-11-05 ainda válida: Neon QA free, projeto/branch Vercel exatos, Preview apenas)

- Neon QA `super-credit-72834107`/`omni_print_d05`: existente; não recriado; nenhuma consulta nesta execução.
- Preview `dpl_B9vJfGhLWMuaJPqLkLArFyxzXmZa` (`172882c`): READY, transporte direto desligado, mas login quebrado pelo `AUTH_URL=""`.
- Produção: nenhum acesso, escrita, env, deploy, migration ou merge.

A correção do Preview (alias da branch em `AUTH_URL`/`NEXTAUTH_URL` só da branch D05 + novo deployment Preview do head revisado,
transporte ainda desligado) é registrada na seção 10 quando executada; se não, permanece como pendência explícita.

## 8. Homologação física

`D05_PHYSICAL_HOMOLOGATION=PENDING` · `D05_PHYSICAL_BLOCKER=OPERATOR_OR_HARDWARE_GATE`. H01–H18: 0 executados nesta sessão.
Faltam nome do operador, janela presencial e confirmação por evento das falhas provocadas. A informação de que "a impressão da
padaria já funciona" refere-se ao fluxo de impressão **atual** (navegador/legado): não há instalação, pareamento nem job do
agente D05 registrados, portanto nada disso é atribuído ao Omni Print D05 nem reaproveitado como H01–H18.

## 9. Pacote de liberação produtiva (não executado)

Ordem proposta, cada passo com aprovação explícita do proprietário:

1. Concluir H01–H18 no Preview D05 com operador e aceite final.
2. Revisão final da #327 isolada (sem a #334: a #334 é ferramenta de homologação; se for integrada, o `build-preview.mjs`
   agora repassa builds fora da branch D05, mas o recomendado é **não** levar `tools/print-d05`/`vercel.json` D05 à main).
3. Janela D02 em Production conforme `RUNBOOK_D02.md` (índices CONCURRENTLY → núcleo transacional → verify →
   `prisma migrate resolve --applied` das três pastas → só então promover as pastas a `prisma/migrations`). Coordenar com o
   MIG-X da KG: as ordens são intercambiáveis (seção 6), mas nunca no mesmo deploy automático.
4. Merge da #327 na main (build segue `MIGRATION_SKIPPED`; tabelas ausentes não quebram leitura: `storeHasPrintRecords`=false).
5. Chaves D03 e papel de retenção conforme `RUNBOOK_D03.md`; cron de expurgo **desligado** até autorização própria.
6. `APPROVED_RELEASE` em `lib/printing/direct/activation.ts` = release aprovado + `OMNI_PRINT_DIRECT_ENABLED=1` e release env
   em Production — só com aprovação escrita. Hoje: `APPROVED_RELEASE=null`.
7. Ativar em **uma** loja, um terminal, uma impressora; operador treinado; acompanhar UNKNOWN.

Rollback/desativação imediata: `OMNI_PRINT_DIRECT_ENABLED=0` (o PDV volta ao fluxo atual sem bloqueio); revogar instalações;
**nunca** apagar UNKNOWN, diário, `.instance` nem limpar fila à mão; tabelas D02 ficam (remoção só com runbook §9).
Dupla impressão é impedida por: intenção INITIAL única por documento, sendKey + diário fsync antes do spooler, UNKNOWN sem
reenvio, lock de instância por diário, `JOURNAL_MISSING`.

## 10. Execução do Preview, CI final e limpeza

Preenchido abaixo com o que de fato ocorreu (IDs, runs, SHAs). Ver também o relatório final na PR.
