# Revisão independente — PADARIA-KG-RELEASE-READINESS-A4-A8-001

Revisor: subagente Claude de **contexto limpo**, somente leitura (sem edição, banco ou rede), 2026-11-06.
A revisão cruzada por outra família de modelo (Codex) **não ocorreu** neste GOAL.

## Rodada 1 — commit `6671401` · veredito **APPROVE_WITH_LIMITATIONS**

**A. Equivalência de `manual_kg_title_protected`** (raciocínio + matriz): sem entrada divergente.
Ramo `tid` idêntico; ramo de prefixo = todos os prefixos do sufixo, inclusive o vazio (`pedidoId ''`), `len<11`
e `local_key NULL` falsos nos dois, `left/substr/length` contam caracteres (multibyte igual); ramo `doc`
equivalente para entradas não-objeto, `doc NULL` e `vendas` não-array; escopo por loja em todos os ramos;
`SECURITY DEFINER`, `search_path = public, pg_temp`, `STABLE` mantidos; `CREATE OR REPLACE` preserva dono e
grants. Matriz de 2.304 casos adequada; a cópia v1 é conferida contra o corpo instalado. Pré-condição de dono
correta com `-c role=omni_owner` e em runner superusuário.

| Sev. | Achado | Tratamento |
| --- | --- | --- |
| P2 | Replay só main → topo; a produção passa por #315 (dias), #335 (W2) e #336 (W3) | **Corrigido**: run-05 encadeia main → árvore do J4 (`ff3870d4…`) → `406ea48` → topo; cada versão reenvia todas as anteriores, envia a fila da anterior e deixa a sua; PASS |
| P2 | Ordem 9b × J10 ambígua; `migrate diff` da #315 depois do 9b acusaria `quantidadeKg` | **Corrigido**: J10 (checkout da #315) **antes**; 10b/9b depois com status/diff **do checkout desta PR**; nota explícita para não "corrigir" o drift; ensaio reproduz a ordem |
| P2 | Lacuna de schema W1→W2: `db push`/`migrate diff --script` de checkout da main derrubaria `quantidadeKg` e travaria toda venda | **Corrigido no plano**: proibição explícita até o merge desta PR; janelas curtas; congelamento estendido |
| P2 | `20261029` não tinha sido aplicada por `prisma migrate deploy` com o papel | **Corrigido**: run-05 aplica a `20261029` por `migrate deploy` do checkout da #335 com `options=-c role=omni_owner` e a `20261106` do topo; doc ajustado |
| P3 | Evidência não fixava SHAs das versões | **Corrigido**: `versions` (commit, árvore, dirty) no `cross-version-summary.json` do run-05 |
| P3 | Doc citava este arquivo antes de existir | **Corrigido** (este arquivo) |
| P3 | `migration.json` do runner rotulava só a `20261029` | **Corrigido**: `newMigrations` lista as duas |
| P3 | `localKey` muito longo gera O(L²) de prefixos | **Aceito**: chaves são geradas pelo servidor (`pdv-aprazo-{pedidoId}[-n]`); um teto mudaria a semântica frente ao corpo original, contrariando a equivalência exata |
| P3 | Método de merge para retarget não especificado | **Corrigido**: merge commit (não squash) |
| P3 | `migrate deploy` do build falharia na `20261029` se `MIGRATION_AUTHORITY_ENABLED` fosse ligado antes do 9b | **Corrigido no plano**: manter `false` até o merge desta PR |

Confirmados pelo revisor: 07 bloqueia o cliente Int (`23514`); corte do papel antigo; 99 recusa após o J8;
35 verificações Prisma315; nenhuma ordem que deixe cliente Int gravar Float (com corte + proibição de Redeploy)
ou binário da #335 sem `quantidadeKg`. Sem segredos nem dados de cliente nas evidências (IDs de projeto/branch/
endpoint Neon são identificadores de infraestrutura, não segredos).

## Rodada 2 — commits `053d77a` + `ffe8787` · veredito **APPROVE**

Todos os P2 da rodada 1 confirmados como corrigidos e sustentados por evidência (cadeia executada, contagens =
somas esperadas, clientSaleIds válidos e únicos, `migrate deploy` com papel, ordem J10 → 10b, proibições de
schema/flag/merge, sem segredos). Nenhum P0–P2. P3 e tratamento:

| P3 | Tratamento |
| --- | --- |
| Run conclusivo com topo `dirty=true` | **Corrigido**: run-06 no HEAD limpo `4385d3f` |
| Fila só v1 nas transições; v2 nunca era 1º envio após troca | **Corrigido**: cada versão deixa v1 **e** v2 na fila |
| Paralelos só depois do replay sequencial | **Corrigido**: 1º envio da fila é concorrente (3×); wrapper v1 reproduz a releitura do vencedor da rota |
| Recusa de fatos diferentes aceitava qualquer erro | **Corrigido**: classe exata (`PedidoIdConflitoMesmaLojaError` / `ClientSaleIdReusedError`) |
| Doc citava `2e-322` | **Corrigido**: valor do run-06 |
| F2b sem caso parcial (20261029 ok, 20261106 falha) | **Corrigido**: gate explícito em F2b |
| Campos do passo aditivo fixos em `true` | parcialmente: `titleGuardDeployed` agora lança se ausente; os outros dois já eram garantidos por `throw` anterior |
