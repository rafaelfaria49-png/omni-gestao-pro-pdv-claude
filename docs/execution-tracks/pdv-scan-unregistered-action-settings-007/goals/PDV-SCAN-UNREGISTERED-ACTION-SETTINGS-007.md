<!-- AEP:META
{
  "aep": "1.0-R2",
  "id": "PDV-SCAN-UNREGISTERED-ACTION-SETTINGS-007",
  "track": "pdv-scan-unregistered-action-settings-007",
  "title": "Configuração server-first por loja para a ação do PDV ao bipar produto não cadastrado (avisar e continuar / avisar e oferecer Item Avulso / abrir Item Avulso automaticamente)",
  "status": "READY",
  "class": "C2",
  "risk_tier": "MEDIO",
  "branch": "work/pdv-scan-unregistered-settings-007",
  "worktree": "C:/Projetos/work/pdv-scan-unregistered-settings-007",
  "test_command": "npx vitest run lib/pdv-scan-unregistered-action.test.ts lib/pdv-scan-input.test.ts lib/pdv-settings-server-first.test.ts lib/store-settings-put.test.ts components/dashboard/vendas/pdv-scan-autoclear.static.test.ts lib/pdv/parity-keymap.test.ts",
  "allowlist": [
    "lib/pdv-scan-unregistered-action.ts",
    "lib/pdv-scan-unregistered-action.test.ts",
    "lib/pdv-scan-input.ts",
    "lib/pdv-scan-input.test.ts",
    "lib/store-settings-types.ts",
    "lib/store-settings-provider.tsx",
    "lib/pdv-settings-server-first.ts",
    "lib/pdv-settings-server-first.test.ts",
    "lib/pdv-settings-classification.ts",
    "components/dashboard/vendas/use-pdv-scan-feedback.ts",
    "components/dashboard/vendas/pdv-scan-inline-feedback.tsx",
    "components/dashboard/vendas/item-avulso-modal.tsx",
    "components/dashboard/vendas/pdv-classic.tsx",
    "components/dashboard/vendas/pdv-assistencia-enterprise.tsx",
    "components/dashboard/vendas/pdv-supermercado.tsx",
    "components/dashboard/vendas/venda-completa-enterprise.tsx",
    "components/dashboard/vendas/pdv-scan-autoclear.static.test.ts",
    "components/configuracoes-v3/features/settings/sections/PdvSection.tsx",
    "docs/pdv/PDV_SCAN_UNREGISTERED_ACTION_SETTINGS_007.md",
    "docs/ai-execution/_evidence/**",
    "docs/execution-tracks/pdv-scan-unregistered-action-settings-007/**",
    "docs/ai-execution/protocol.json"
  ],
  "gates_liberados": [],
  "read_budget": 300,
  "plan_ref": "prompt GOAL PDV-SCAN-UNREGISTERED-ACTION-SETTINGS-007-ENDTOEND (dono, 2026-09-17); auditorias: docs/pdv/PDV_SCAN_INLINE_FEEDBACK_AUTOFOCUS_006.md, docs/pdv/PDV_PARITY_SUITE_N5_AUDIT_001.md",
  "plan_rev": 1,
  "familia_executor": "zcode",
  "revisao_independente": true,
  "reversibilidade": "Campo aditivo em StoreSettings.printerConfig (JSONB) sem migration; default não invasivo; revert do commit restaura comportamento do GOAL 006",
  "gates_extra": ["npm run typecheck", "npm run build", "prova de browser em docs/ai-execution/_evidence/"],
  "gate_humano": {
    "requerido": false,
    "pendente": false
  }
}
-->

# PDV-SCAN-UNREGISTERED-ACTION-SETTINGS-007 — Ação ao bipar produto não cadastrado

- trilha: `pdv-scan-unregistered-action-settings-007`
- classe: C2 · status: READY
- base: `origin/main` @ `94cb339` (GOAL 006 mergeado via PR #201)
- branch: `work/pdv-scan-unregistered-settings-007` (a partir de `origin/main`)
- worktree: `C:/Projetos/work/pdv-scan-unregistered-settings-007`
- risco: `MEDIO` (touch em superfícies de produção do PDV; default não invasivo; sem migration)

## Objetivo

Preferência server-first, isolada por storeId, na área canônica de configurações
(`StoreSettings.printerConfig` — blob JSONB aditivo, sem schema/migration):

**"Quando bipar um produto não cadastrado"**

1. `warn_continue` — AVISAR E CONTINUAR: comportamento exato do GOAL 006.
2. `warn_offer_avulso` — AVISAR E OFERECER ITEM AVULSO: feedback inline indicando
   Insert; Insert abre Item Avulso com o código não encontrado como contexto,
   quando seguro; não abre modal automaticamente.
3. `open_avulso` — ABRIR ITEM AVULSO AUTOMATICAMENTE (opt-in): após confirmar
   que o código não existe, abrir Item Avulso uma única vez por scan, com o
   código transportado como contexto; concluir/cancelar volta ao Código/Bipe
   limpo e focado.

## Decisões de default e arquitetura

- DEFAULT = `warn_offer_avulso`: idêntico em comportamento operacional material ao
  GOAL 006 (feedback inline, campo livre/focado, próximo bipe imediato; Insert já
  abre Item Avulso hoje nas 4 superfícies) — a única diferença é a copy do hint e
  o código pré-preenchido no modal aberto logo após um miss. Sem autoabertura.
  Documentar a decisão no relatório.
- `open_avulso` é opt-in; nunca ativado silenciosamente para lojas existentes
  (configuração ausente nunca resolve para `open_avulso`).
- Valor inválido no servidor → fail-safe para o default.
- Fonte da verdade: servidor (`GET/PUT /api/stores/[id]/settings`). Sem localStorage
  como autoridade; sem cache além do estado do provider (server-first já canônico).
- Distinção scan × busca manual preservada: a política só age após o fluxo existente
  concluir PRODUTO NÃO ENCONTRADO para consulta scan-like (A05/S23/G54/KD11C/EAN);
  match exato, parciais e pesquisa textual válida jamais disparam a ação.
- Modo automático: um modal por scan; CR/LF duplicado não abre dois modais; novo
  scan não atravessa modal ativo; sem duplicação no carrinho; se outro modal
  crítico está aberto, não abrir Item Avulso por cima.
- Item Avulso: menor extensão segura — prop `initialCodigo` semeia o campo código;
  nada de cadastro automático de Produto, nada de persistência silenciosa de SKU.
- PDV Next/Black: fora do escopo (`PDV_NEXT_SUPPORTED=NO` — scanner próprio sem
  Item Avulso/Insert; mudança deliberada de comportamento não cabe neste GOAL).

## Critério de pronto

1. Configuração existe na área canônica (V3, seção PDV — Leitor/Código de barras),
   server-first, por storeId, default seguro, refletida após reload.
2. Os 3 modos funcionam; código não cadastrado preservado no contexto do Item Avulso;
   concluir/cancelar volta limpo e focado; sem modal duplicado por CR/LF ou scan rápido.
3. A05/S23/G54/KD11C, busca multiword, CR/LF, scan sequencial, Cliente/Quantidade/
   Pagamento e modais: zero regressão (suite GOAL 006 + novos testes verdes).
4. Isolamento Loja A ≠ Loja B provado por teste da camada de resolução.
5. `npm run typecheck`, ESLint focado, `npm run build`, `git diff --check` limpos.
6. Prova de browser (7 PNGs) cobrindo os 3 modos e as 4 superfícies.
7. Commit coerente + push da branch do GOAL + PR + checks + MERGE COMMIT (sem
   squash/rebase/--admin/force) + produção READY + smoke.

## Commit / push

- Commit sugerido: `feat(pdv): configurar ação para produto não cadastrado`
- Push da branch do GOAL autorizado (sem force). PR para main; merge commit.
