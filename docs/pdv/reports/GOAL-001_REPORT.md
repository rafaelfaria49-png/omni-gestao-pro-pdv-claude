# GOAL-001 — Relatório · PDV Capabilities Status Reconcile

- **Tipo:** auditoria read-only · **Modelo:** Opus 4.8 · **Data:** 2026-07-13
- **Branch:** `goal/pdv-capabilities-status-reconcile-001`
- **Worktree:** `C:\Projetos\omni-gestao-goal-001-status-reconcile` (a partir de `origin/main`)
- **Hash-base:** `b528945` (`Merge pull request #2 … integrate/fiscal-goal-001-status-reconcile`)
- **Âncoras:** `738af36` ✅ ancestral · `f42072a` ✅ ancestral de `origin/main`
- **Dossiê:** [`docs/pdv/PDV_CAPABILITIES_STATUS_RECONCILE_001.md`](../PDV_CAPABILITIES_STATUS_RECONCILE_001.md)

## Tabela de vereditos

| # | Pendência | Veredito |
|---|---|---|
| P-01 | Motor único (`finalizeSaleTransaction`) nos 3 PDVs | **Confirmado** |
| P-02 | Black = skin do Next | **Ajustado** (shell = skin; edition = skin+lógica) |
| P-03 | Rápido = modo do Clássico (`?modo=`) | **Confirmado** |
| P-04 | `AdminUser` = tenant de fato (billing) | **Confirmado** |
| P-05 | Inventário worktrees/branches | **Confirmado (registrado)** |
| P-06 | Condicionais internos nos 3 PDVs | **Ajustado** (settings, não capabilities) |
| P-07 | Natureza "Venda Completa" | **Confirmado** (superfície distinta, mesmo motor) |
| P-08 | Lacunas de paridade do Next | **Confirmado** (troca/desconto/cupom/settings ausentes) |
| P-09 | Preservação de `accessoryConfig` nos catálogos locais | **Ajustado** (risco resolvido) |
| P-10 | `dashboardHref` dos 6 cards do VendasHub | **Confirmado** |

## Divergências que exigem correção no masterplan (G1 depende)

- **D-1** — A camada de *feature-keys* por loja **não existe** no código: só há papel/permissão, plano-tier (`AdminUser.planName`), settings por loja (`pdvParams`) e seleção de layout. Qualquer `pdv.*` é net-new; definir o ponto de leitura.
- **D-2** — "Catálogos locais descartam `accessoryConfig`" está **obsoleto** (Assistência `:984` e Supermercado `:143` preservam).
- **D-3** — "Black = skin do Next" precisa de precisão terminológica; paridade incompleta.
- **D-4** — `sales.paymentMethods` **já** tem persistência (`pdvParams.formasPagamento`) → migração de leitura, não construção; candidato a 1ª capability.
- **D-5** — 6 cards do VendasHub são **hardcoded por índice**; refatorar antes de gating por card.

## Feature-keys v0.9 (validadas contra código)

Ativas/válidas: `pdv.filmLookup`, `pdv.deviceCatalog`, `pdv.accessoryModelColor`,
`pdv.quickServices`, `pdv.serviceCatalog`, `pdv.osLookup`, `pdv.tables`,
`sales.paymentMethods` (mais forte — já persistida).
Bloqueadas (corretas): `pdv.scale.*`, `sale.fractionalQty`.

## Commits relevantes desde `f42072a`

8 no total; 4 de PDV (todos de acessórios): `42f622b`, `1ca4288`, `2b9c51a`, `2e64fa8`.
Demais: fiscal/contador docs + merge.

## Pendências geradas (riscos)

- **R-1 (P0):** `app/api/stores/[id]/settings/route.ts` — PUT/GET sem checagem de posse do `storeId`.
- **R-2 (P1):** balança/fracionado dormentes (`rowToItem` sem `vendaPorPeso`; `Math.round` na correção).
- **R-3 (P2):** duplicata morta `pdv-venda-completa-enterprise.tsx`.
- **R-4 (P2):** cards do VendasHub fixos por índice.
- **R-5 (P3):** `moduloControleConsumo` declarado e não consumido.

## Conformidade

- Read-only: nenhum arquivo de código alterado. Somente 2 documentos criados.
- Nenhuma credencial/dado de cliente nos documentos.
- Worktrees alheias intactas; `origin/main` não reescrito.
