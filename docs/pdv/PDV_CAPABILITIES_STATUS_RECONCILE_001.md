# PDV Capabilities — Reconciliação de Estado vs Código Vivo (GOAL-001)

> Auditoria **read-only**. Reconcilia o masterplan/auditoria (ancorados em `f42072a`)
> contra o código vivo de `origin/main`. **O código vence** em qualquer divergência.
> Nenhuma linha de código foi alterada nesta tarefa.

- **Hash-base da worktree:** `b528945` (`Merge pull request #2 … integrate/fiscal-goal-001-status-reconcile`)
- **Branch:** `goal/pdv-capabilities-status-reconcile-001` (worktree `C:\Projetos\omni-gestao-goal-001-status-reconcile`, a partir de `origin/main`)
- **Âncoras confirmadas como ancestrais de `origin/main`:** `738af36` ✅ · `f42072a` ✅ (`git merge-base --is-ancestor`)
- **Data:** 2026-07-13

---

## 1. Modelo mental do PDV no código vivo (resumo)

O PDV **não** é um sistema de *capabilities* por loja. É um **seletor de layout** com
configuração por unidade e gating por papel/plano. As camadas reais que decidem "o que
o operador vê/pode" são, hoje, apenas quatro:

| Camada | Onde | Eixo de decisão |
|---|---|---|
| Seleção de layout | `components/dashboard/vendas/vendas-pdv.tsx` | `layout` (`classic`/`supermercado`/`next`) × `classicLayout` (`lovable`/`services`) |
| Configuração por loja | `lib/store-settings-provider.tsx` + `lib/store-settings-types.ts` | `pdvParams` + `impressaoConfig` persistidos no blob `StoreSettings.printerConfig` |
| Entitlement por plano | `lib/plan-guard.ts` | `AdminUser.planName` (BRONZE/PRATA/OURO/DIAMANTE) |
| Navegação/ação por papel | `lib/navigation/dashboard-nav-items.ts` + `lib/auth/enterprise-permissions.ts` | `UserRole` → `EnterprisePermissions` + `canAccessStore` |

**Não existe** camada de *feature-key* por loja. Qualquer lista de `pdv.*` proposta é
**net-new** — não há gancho de leitura no código atual. Esta é a divergência central
(ver §4).

---

## 2. Veredito das pendências P-01 … P-10

Legenda: **Confirmado** = plano bate com o código · **Refutado** = plano está errado ·
**Ajustado** = plano correto no espírito, mas com correção factual.

| # | Pendência | Veredito | Evidência (`arquivo:linha`) |
|---|---|---|---|
| **P-01** | Motor único de finalização usado pelos 3 PDVs de produção | **Confirmado** | `lib/operations-store.tsx:275` (tipo), `:1280` (impl), `:1739` (exposto no contexto). Consumido via `useOperationsStore()`: `pdv-classic.tsx:241` (call `:1914`), `pdv-assistencia-enterprise.tsx:939` (call `:1889`), `pdv-supermercado.tsx:182` (call `:1421`). Também `PdvBlackEdition.tsx:61` e `venda-completa-enterprise.tsx`. **Um só motor** para todas as superfícies de venda. |
| **P-02** | Black = *skin* do PDV Next | **Ajustado** | Rota `app/dashboard/pdv-next/page.tsx` (gate `experimentalPdvEnabled`, `:12`) renderiza `PdvBlackEdition`. `PdvBlackShell.tsx` é **apenas apresentacional** (tipos `PdvBlackCartRow`, `SHORTCUTS`, componentes UI; **não importa** `operations-store`). Ajuste: o *skin* puro é o `PdvBlackShell`; `PdvBlackEdition.tsx` carrega a lógica real (caixa, cliente, à prazo) sobre o motor oficial. |
| **P-03** | Rápido = modo do Clássico (`?modo=`) | **Confirmado** | `app/dashboard/vendas/vendas-page-client.tsx:30-31` (`searchParams.get("modo")` → `isModoRapido`), `:137` (`<VendasPDV isModoRapido/>`). Preferência persistida por loja em `lib/omnigestao-pdv-modo.ts` (`"rapido"｜"normal"`, `:11`), com redirect `:68-79`. `pdv-classic.tsx:215-216` documenta `?modo=rapido`. **Rápido não é um PDV** — é foco do Clássico (ou da Assistência quando `classicLayout=services`, `vendas-pdv.tsx:128`). |
| **P-04** | `AdminUser` é o tenant de fato | **Confirmado** | `prisma/schema.prisma:2095` (`model AdminUser`): campos Stripe/billing (`stripeCustomerId`, `subscriptionStatus`, `planName`, `currentPeriodEnd`) + `role` + `lojaId?` + `adminUserStores` (M:N `Store`). `lib/plan-guard.ts:24` lê `adminUser.planName/subscriptionStatus`. Webhook Stripe grava em `adminUser`: `app/api/webhooks/stripe/route.ts:39,66,86,105,121`. **`AdminUser` = tenant de cobrança/assinatura; `Store` = unidade operacional.** |
| **P-05** | Inventário superficial de worktrees/branches | **Confirmado (registrado)** | 30+ worktrees ativas; 49 branches locais / ~28 remotas. `git log f42072a..origin/main` = **8 commits** (ver §5). Branches PDV paralelas em sua maioria já mergeadas; remanescentes `+1/+2` são variantes superadas (§5). `origin/HEAD → origin/master` é ponteiro **stale** (produção = `main`; ver memória de release). Nenhuma worktree alheia foi tocada. |
| **P-06** | Condicionais internos de recurso nos 3 PDVs | **Ajustado** | Os 3 consomem `useStoreSettings()` e ramificam em **settings por loja**, não em entitlement: `atalhosRapidos`, `ocultarCategoriasNoPdv`/`categoriasOcultasNoPdv` (`pdv-classic.tsx:422,433-436`), `incluirImpostoEstimadoNoPdv`/`aliquota…` (classic `:1063`, assist `:1274`, super `:551`), `formasPagamento` (classic `:1066-1073`, assist `:1088`, super `:555-564`), `impressaoConfig` (viasCupom/imprimirAutomatico/host). Ajuste: são **toggles de configuração**, não *feature-keys* de plano. `moduloControleConsumo` existe no tipo mas **não é consumido** nos PDVs (dormente). |
| **P-07** | Natureza do fluxo "Venda Completa" | **Confirmado** | Rota `app/dashboard/vendas/venda-completa/page.tsx` → `venda-completa-page-client.tsx:4,10` → `VendaCompletaEnterprise` (`components/dashboard/vendas/venda-completa-enterprise.tsx`), `onBack → /dashboard/vendas-hub`. Superfície **distinta** do seletor de 3 layouts; usa o mesmo `finalizeSaleTransaction`. ⚠️ Duplicata morta não-roteada: `pdv-venda-completa-enterprise.tsx:6` (auto-documentada). |
| **P-08** | Lacunas de paridade do Next | **Confirmado** | `PdvBlackEdition.tsx`: tem caixa (abrir/fechar+PIN), cliente picker, **à prazo** (`:127,381,390,548`), NF-e placeholder (F7). Faltam/placeholder: **Troca/Devolução** (`:298` placeholder), **Desconto/Acréscimo** (`:304` placeholder), impressão de cupom (comentário `pdv-next/page.tsx:8-16`), **sem** `SelecionarAcessorioDialog`, **sem** `useStoreSettings`/`pdvParams`/`formasPagamento` (formas de pagamento não configuráveis por loja no Black), sem vale/crédito, sem orçamento. Liberado só em dev (`experimentalPdvEnabled`). |
| **P-09** | Preservação de `accessoryConfig` nos catálogos locais | **Ajustado (risco resolvido)** | Assistência preserva: `pdv-assistencia-enterprise.tsx:984` (`...(inv.accessoryConfig ? { accessoryConfig } : {})` no mapper `inventory.map`). Supermercado preserva: `pdv-supermercado.tsx:143` (mesmo spread). Clássico resolve via catálogo real: `pdv-classic.tsx:738-739`. Projeção do servidor também emite: `app/api/ops/inventory/route.ts:90,104`. Ajuste vs auditoria: a preocupação "catálogos locais descartam campos" está **RESOLVIDA** (landou em `42f622b`/`2e64fa8`). |
| **P-10** | Destinos (`dashboardHref`) dos 6 cards do VendasHub | **Confirmado** | `components/vendas-hub/lovable/features/vendas/VendasHub.tsx:29-80`: (1) PDV Rápido → `/dashboard/vendas?modo=rapido` [ativo,highlight]; (2) Venda Completa → `/dashboard/vendas/venda-completa` [ativo — **rota viva**]; (3) Orçamentos → `/dashboard/orcamentos` [beta]; (4) Histórico → `/dashboard/vendas-arquivo-geral` [ativo]; (5) Estoque → `/dashboard/estoque` [ativo]; (6) Relatórios → `/dashboard/relatorios` [ativo]. Todas as rotas existem. **Sem card Black/Next.** ⚠️ Cards fixos por índice (`:158-163`), frágil a reordenação. |

---

## 3. Feature-keys candidatas — validação v0.9

Cada chave foi validada contra a superfície real. **Nenhuma é lida por código hoje** —
todas exigem um gancho novo (ver §4). Coluna "Estado hoje" = como o recurso é
controlado atualmente.

| Feature-key | Veredito | Superfície real | Estado hoje |
|---|---|---|---|
| `pdv.filmLookup` | **Válida** | `app/dashboard/catalogo-aparelhos` + `app/api/catalogo/peliculas/search` | Sempre-on onde roteado |
| `pdv.deviceCatalog` | **Válida** | `app/dashboard/catalogo-aparelhos` | Sempre-on onde roteado |
| `pdv.accessoryModelColor` | **Válida** | `lib/acessorios/*` + `selecionar-acessorio-dialog.tsx`; ligado nos 3 PDVs (`pdv-classic.tsx:738`, `pdv-assistencia-enterprise.tsx:1642`, `pdv-supermercado.tsx:412`) | Dirigido por `product.accessoryConfig`, sem gate |
| `pdv.quickServices` | **Válida** | Aba Serviços (Assistência) via `app/api/ops/servicos` | Só no layout `services` (Assistência) |
| `pdv.serviceCatalog` | **Válida** | `model Servico` + `app/api/ops/servicos` | Sem gate |
| `pdv.osLookup` | **Válida (plausível)** | `pdv-classic.tsx:241` lê `ordens` de `useOperationsStore()` | Sem gate |
| `pdv.tables` | **Válida** | `app/dashboard/vendas/mesas/page.tsx` (rota viva) | Rota separada, sem gate |
| `sales.paymentMethods` | **Válida (mais forte)** | `pdvParams.formasPagamento` (`store-settings-types.ts:28`), consumido pelos 3 PDVs | **Já configurável por loja** → candidato natural a 1ª capability |
| `pdv.scale.*` | **Bloqueada (correta)** | `app/api/ops/inventory/route.ts:80-106` — `rowToItem` **não emite** `vendaPorPeso`/`precoPorKg` | Balança **dormente** ponta-a-ponta |
| `sale.fractionalQty` | **Bloqueada (correta)** | `lib/vendas/correcao-itens-plan.ts:102` — `Math.round(quantidade)` força inteiro | Fracionado **bloqueado** na correção |

**Nota `sales.paymentMethods`:** é a única chave que já tem persistência por loja
(`pdvParams.formasPagamento`, normalizada em `store-settings-provider.tsx:78-80`).
Recomenda-se formalizá-la primeiro — o modelo de dados já existe.

---

## 4. Divergências do masterplan e correções propostas

| # | Divergência | Correção proposta ao masterplan |
|---|---|---|
| D-1 | Masterplan pressupõe/planeja uma camada de **capabilities por loja**. O código **não tem** gating por *feature-key* — só papel/permissão, plano-tier (`AdminUser.planName`), settings por loja (`pdvParams`) e seleção de layout. | Declarar explicitamente que a camada de *feature-keys* é **net-new**. Definir o ponto de leitura (provável: estender `StoreSettingsBlob`/`pdvParams` ou um novo `capabilities` no blob `printerConfig`, sem migração de coluna — padrão já usado). |
| D-2 | Auditoria (f42072a) registrou "catálogos locais de Assistência/Supermercado descartam `accessoryConfig`". | **Obsoleto.** Ambos preservam (`pdv-assistencia-enterprise.tsx:984`, `pdv-supermercado.tsx:143`). Remover o P0 correspondente; virou risco residual apenas a associação por índice (memória `pdv_acessorios_readback_venda_004c`). |
| D-3 | "Black = skin do Next" tratado como equivalência simples. | Precisar: `PdvBlackShell` = skin; `PdvBlackEdition` = skin + lógica; rota `/dashboard/pdv-next` gated a dev. Paridade incompleta (§P-08) — não usar como base de capabilities enquanto não consumir `useStoreSettings`. |
| D-4 | `sales.paymentMethods` listada junto das demais como "a construir". | Reclassificar: **já existe** persistência (`pdvParams.formasPagamento`). É migração de leitura, não construção. |
| D-5 | Masterplan pode assumir os 6 cards do VendasHub como configuráveis. | São **hardcoded por índice** (`VendasHub.tsx:158-163`). Qualquer capability que oculte cards exige refatorar essa lógica antes. |

---

## 5. Commits relevantes desde `f42072a` (`git log f42072a..origin/main`)

8 commits no total; 4 tocam caminhos de PDV do contexto:

```
b528945 Merge pull request #2 … integrate/fiscal-goal-001-status-reconcile
2010fef docs(fiscal): contextualizar snapshot de vendas do GOAL-001
ce54cdc docs(fiscal): reconciliar status fiscal F0-F12 (GOAL-001)
7310d9e feat(contador): reforcar honestidade visual do preview
2e64fa8 feat(vendas): exibir modelo e cor no detalhe da venda        ← PDV
2b9c51a fix(pdv): eliminar atraso ao fechar modal de acessorio        ← PDV
1ca4288 fix(pdv): fechar modal de acessorio apos adicionar            ← PDV
42f622b feat(pdv): persistir selecao de acessorios na venda           ← PDV
```

Efeito no plano: os 4 commits de PDV são todos de **acessórios** (persistência +
readback + latência de modal). Consolidam P-09 (preservação de `accessoryConfig`) e a
chave `pdv.accessoryModelColor`. Os demais são fiscais/contador (fora do escopo PDV).

**Branches PDV paralelas ahead de `origin/main` (inventário P-05):**

```
work/pdv-acessorios-selecao-readback-004c            +1 (superada por 2e64fa8)
work/pdv-acessorios-cadastro-projecao-002            +2 (cadastro→PDV; não mergeada)
work/pdv-acessorios-contratos-001                    +1
work/venda-corrigir-itens-metadata-001              +1 (variante descartável; superada por f42072a)
work/pdv-acessorios-persistencia-server-004b         +0 (mergeada)
work/pdv-acessorios-selecao-readback-004c-integrate  +0 (mergeada)
work/pdv-vendas-corrigir-itens-metadata-004a         +0 (mergeada)
audit/pdv-capabilities-modular-settings-001          +0
work/pdv-acessorios-rapido-close-latency-003b        +0 (mergeada)
```

---

## 6. Riscos novos / pendências geradas

| Risco | Local | Descrição | Severidade |
|---|---|---|---|
| **R-1** | `app/api/stores/[id]/settings/route.ts:12-20` | `canManageStoreSettings()` valida só admin **ou** assinatura válida — **nunca** que o chamador é dono do `storeId`. `GET` (`:22-31`) não tem gate. Qualquer admin/assinante lê/escreve settings de **qualquer** loja. Persiste no HEAD. | **P0** |
| **R-2** | `app/api/ops/inventory/route.ts:80-106` + `lib/vendas/correcao-itens-plan.ts:102` | Balança/fracionado dormentes. Manter `pdv.scale.*` e `sale.fractionalQty` **bloqueadas** na v0.9. | P1 |
| **R-3** | `components/dashboard/vendas/pdv-venda-completa-enterprise.tsx` | Duplicata morta não-roteada de `venda-completa-enterprise.tsx`. Candidata a remoção. | P2 |
| **R-4** | `components/vendas-hub/lovable/features/vendas/VendasHub.tsx:158-163` | Cards fixos por índice; frágil a reordenação/ocultação. Refatorar antes de gating por card. | P2 |
| **R-5** | `lib/store-settings-types.ts:24` | `moduloControleConsumo` declarado em `pdvParams` mas **não consumido** pelos PDVs (dormente). | P3 |

> **G1 depende desta revisão.** As correções D-1 (camada de capabilities é net-new) e
> D-4 (`sales.paymentMethods` já persistida) mudam o ponto de partida do próximo GOAL.
