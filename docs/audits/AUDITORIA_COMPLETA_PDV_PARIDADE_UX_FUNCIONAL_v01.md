---
title: Auditoria Completa de PDVs — Paridade, UX e Funcional (v01)
status: read-only (diagnóstico — sem correção)
data: 2026-06-16
autor: Opus 4.8 (Claude Code)
hub: pdv
tags: [pdv, paridade, ux, auditoria, operador, caixa, multi-loja]
escopo: GOAL AUDITORIA_COMPLETA_PDV_PARIDADE_UX_FUNCIONAL
---

# Auditoria Completa de PDVs — Paridade, UX e Funcional · v01

> **Natureza:** auditoria **read-only**. Nenhum código, schema, migration, commit ou push.
> Tudo abaixo é diagnóstico verificado contra o código real (arquivo:linha citados).
> **Estado do código auditado:** working tree atual (inclui mudanças não commitadas em
> `lib/pdv-operator-label.ts` + `lib/pdv-operador-nome.ts` + `lib/pdv-operator-label.test.ts`).

---

## 0. Resumo executivo

- **O núcleo transacional é saudável e único.** Todo PDV de varejo persiste via o mesmo motor
  `finalizeSaleTransaction` (`lib/operations-store.tsx`), que centraliza **gate de caixa aberto**
  (`:1214`), **anti-estoque-negativo** ("Estoque insuficiente" `:1228`), validação de quantidade
  (`:1221/1226`), **fila offline `syncPending` + reenvio + reconciliação** (`:800-922`) e **a-prazo**
  (`aPrazoConfig`). **Nenhum P0 confirmado** nos PDVs ativos de varejo — consistente com auditorias
  anteriores ("núcleo PDV saudável, sem P0").
- **O problema real é de PARIDADE e de INVENTÁRIO de shells**, não de motor:
  - Existem **3 PDVs de varejo ativos** no dispatcher principal (Clássico, Supermercado, Assistência)
    + **1 rota dedicada** (Venda Completa) + **2 experimentais bloqueados** (Black/Next e GitHub
    Original) + **2 shells órfãos** (código morto) + sub-apps Lovable/V3.
  - A **Venda Completa ativa** está **fora de paridade**: sem controles de caixa in-shell
    (sangria/suprimento/abertura/fechamento), **barcode só local** (sem lookup remoto no catálogo
    inteiro), sem item avulso, sem venda em espera, sem fila de produtos a cadastrar.
  - O **PDV Next/Black** já chama `finalizeSaleTransaction` (persiste de verdade), mas **a rota
    ainda o bloqueia com a mensagem "não persiste vendas"** (gate desatualizado) e faltam
    desconto, impressão, devolução, espera (placeholders).
- **Operador por nome:** ✅ implementado e fonte-única (`operatorDisplayName`) — **todos os 5 PDVs**
  o usam; nenhum exibe UUID. Rede de segurança para dados antigos (`sanitizeOperatorLabel`).
- **Higiene:** **2 shells órfãos** (`pdv-venda-completa-enterprise.tsx`, `pdv-neon-shell.tsx`) e
  uma **árvore inteira de referência** (`components/pdv-github-original/**`) vivem no repo como
  código morto/experimental.

**Top-5 a corrigir primeiro:** (1) gate desatualizado do PDV Next; (2) barcode remoto na Venda
Completa; (3) decisão sobre os 2 shells órfãos; (4) paridade da Venda Completa (item avulso/espera);
(5) impressão/desconto no Black antes de qualquer promoção a produção.

---

## PARTE 1 — Inventário dos PDVs

Dispatcher principal: `/dashboard/vendas` → `VendasPageClient` → `VendasPDV` (`vendas-pdv.tsx`),
que escolhe o shell por layout/perfil da loja (`:116` supermercado · `:125` services/Assistência ·
`:133` Clássico default).

| PDV | Rota | Componente principal | Status | Observações |
|---|---|---|---|---|
| **PDV Clássico (Omni Smart)** | `/dashboard/vendas` (default) | `pdv-classic.tsx` (via `pdv-omni-classic-shell.tsx`, `uiShell="omni-smart"`) | ✅ **Ativo / produção** | Layout default do dispatcher. Busca F3 em tabela vive no shell. 1.952 linhas. |
| **PDV Supermercado** | `/dashboard/vendas` (layout `supermercado`) | `pdv-supermercado.tsx` | ✅ **Ativo / produção** | Escolhido por ramo/perfil. "Padrão-ouro" de teclado/atalhos. 1.824 linhas. |
| **PDV Assistência Enterprise** | `/dashboard/vendas` (classicLayout `services`) | `pdv-assistencia-enterprise.tsx` | ✅ **Ativo / produção** | Maior shell (3.288 linhas). Integra OS/garantia/à-prazo. |
| **Venda Completa Enterprise** | `/dashboard/vendas/venda-completa` | `venda-completa-enterprise.tsx` | ✅ **Ativo / rota dedicada** | Fora do dispatcher. Foco em cliente rico + endereço de entrega + garantia/orçamento + cupom (`CupomNaoFiscal`). 1.407 linhas. |
| **PDV Venda Completa (duplicado)** | — (nenhuma) | `pdv-venda-completa-enterprise.tsx` | ⚠️ **ÓRFÃO / código morto** | **Não importado por nenhuma página/rota.** Só referenciado por docs + 1 teste multi-loja. 1.500 linhas. Drift vs. o ativo. |
| **PDV Next / Black Edition** | `/dashboard/pdv-next` | `pdv-next/PdvBlackEdition.tsx` + `PdvBlackShell.tsx` | 🔒 **Experimental — bloqueado em produção** | Gated por `experimentalPdvEnabled` (`NEXT_PUBLIC_OG_EXPERIMENTAL=1`). Rota exibe "não persiste vendas" (**desatualizado** — código já usa `finalizeSaleTransaction`). |
| **PDV GitHub Original** | `/dashboard/pdv-github-original` | `components/pdv-github-original/**` (árvore inteira) | 🔒 **Referência interna — bloqueado** | Snapshot espelho gated. Código morto em produção. |
| **PDV Neon (shell)** | — (nenhuma) | `pdv-neon-shell.tsx` | ⚠️ **ÓRFÃO** | Auto-referência apenas; não wired pelo dispatcher. 189 linhas. |
| **PDV de Serviço V3** | dentro de `/dashboard/operacoes-v3` | `operacoes-v3/pages/PdvServicoV3.tsx` | ✅ **Ativo (não-varejo)** | Recebe **OS** (Conta a Receber + caixa). Não é PDV de balcão de produtos. |
| **Mesas / Controle de Consumo** | `/dashboard/vendas/mesas` | `mesas-page-client` + `controle-consumo.tsx` | ⚠️ **Condicional** | Só aparece se `pdvParams.moduloControleConsumo` (bar/restaurante). |
| **PDV Lovable (hub)** | sub-app Lovable | `vendas-hub/lovable/routes/pdv.tsx` | ❓ **Lovable isolado (provável mock)** | MemoryRouter; não confirmado em produção. |
| `/dashboard/pdv` | redirect → `/dashboard/vendas` | — | ➡️ **Redirect** | Sem UI própria. |

**Conclusão PARTE 1:** o universo "vários PDVs" é, na prática, **3 ativos de varejo + 1 rota
dedicada (Venda Completa)**. Os demais são **experimentais bloqueados** ou **código morto**.

---

## PARTE 2 — Matriz de funcionalidades

Legenda: ✅ existe · ⚠️ parcial · ❌ ausente · ❓ não confirmado · ➖ não se aplica.
Colunas = os 5 PDVs relevantes. (Órfãos e GitHub Original omitidos da matriz operacional.)

| Funcionalidade | Clássico | Supermercado | Assistência | Venda Completa | Next/Black |
|---|---|---|---|---|---|
| Gate caixa aberto/fechado | ✅ | ✅ | ✅ | ✅ (`:447`) | ✅ (`:345`) |
| Abertura de caixa (in-shell) | ✅ | ✅ | ✅ | ❌ (assume caixa aberto) | ✅ (`:503`) |
| Fechamento de caixa (in-shell) | ✅ | ✅ | ✅ | ❌ | ✅ (`:504`) |
| Sangria | ✅ (`CaixaStatusBar`) | ✅ | ✅ | ❌ (sem status bar) | ✅ (`:411`) |
| Suprimento | ✅ | ✅ | ✅ | ❌ | ✅ |
| Cliente | ✅ | ✅ | ✅ | ✅ | ✅ |
| CPF | ✅ (`PaymentModal`) | ✅ | ✅ | ✅ | ⚠️ (F9 só abre busca de cliente) |
| Venda a prazo | ✅ | ✅ | ✅ | ✅ | ⚠️ (passa `aPrazoConfig`, sem modal próprio) |
| Crédito (vale/loja) | ✅ | ✅ | ✅ | ✅ (`getSaldoCreditoCliente`) | ❌ |
| PIX / dinheiro / débito / crédito | ✅ | ✅ | ✅ | ✅ | ✅ |
| Desconto item | ✅ | ✅ | ✅ | ✅ | ❌ (hardcoded 0 `:512-515`) |
| Desconto venda | ✅ | ✅ | ✅ | ✅ | ❌ (F8 placeholder `:295`) |
| Item avulso | ✅ | ✅ | ✅ | ❌ | ❌ |
| Item avulso c/ código/SKU | ✅ | ✅ | ✅ | ❌ | ❌ |
| Fila "produtos a cadastrar" | ✅ | ✅ | ✅ | ❌ | ❌ |
| Busca textual nova (`scorePdvSearch`) | ✅ | ✅ | ✅ | ✅ | ✅ |
| Barcode lookup catálogo inteiro (remoto) | ✅ | ✅ | ✅ | ⚠️ **só local** (sem `lookupPdvScanRemote`) | ✅ (`:239`) |
| Estoque anti-negativo | ✅ (central) | ✅ | ✅ | ✅ | ✅ |
| Venda pendente/offline | ✅ (`syncPending`) | ✅ | ✅ | ✅ | ✅ |
| Badge de pendência | ✅ (via `CaixaStatusBar`) | ✅ | ✅ | ✅ (direto `:38`) | ✅ (via `CaixaStatusBar`) |
| PWA update prompt | ❓ global (não por PDV) | ❓ | ❓ | ❓ | ❓ |
| Impressão de cupom | ✅ (`pdv-post-sale-dialog`) | ✅ | ✅ | ✅ (`CupomNaoFiscal`) | ❌ (não imprime) |
| Reimpressão | ✅ (Vendas/arquivo) | ✅ | ✅ | ⚠️ ❓ | ❌ |
| Operador nome correto (não UUID) | ✅ | ✅ | ✅ | ✅ | ✅ (`:104`) |
| Alta legibilidade | ⚠️ | ⚠️ | ⚠️ | ⚠️ | ⚠️ (tema preto) |
| Atalhos F2–F12 | ✅ | ✅ (referência) | ✅ | ⚠️ | ⚠️ (vários placeholders) |
| Hold / venda em espera | ✅ | ✅ | ✅ | ❌ | ❌ (F11 placeholder `:305`) |
| Cancelamento | ✅ | ✅ | ✅ | ✅ | ⚠️ (limpa carrinho local `:493`) |
| Devolução | ✅ (`trocas-devolucao`) | ✅ | ✅ | ❌ | ❌ (F6 placeholder `:290`) |
| Troca | ✅ | ✅ | ✅ | ❌ | ❌ |
| Orçamento / garantia | ➖ | ➖ | ✅ (OS) | ✅ (tipo de venda `:58`) | ❌ |

> **Nota PWA:** nenhuma busca em `components/dashboard/vendas/**` referencia update-prompt/service
> worker (0 ocorrências). O update do PWA é **global** (`@ducanh2912/next-pwa`), não surfacado
> dentro de cada PDV. Isso conecta ao vetor de **cache PWA defasado** levantado em auditorias
> anteriores (operador em build antigo sem aviso) — ver Riscos.

---

## PARTE 3 — Paridade entre PDVs

- **Clássico vs Assistência:** quase pareados (item avulso, fila a cadastrar, espera, busca,
  barcode remoto, operador). A Assistência **adiciona** OS/garantia/à-prazo enterprise. Não há
  recurso do Clássico ausente na Assistência.
- **Supermercado vs demais:** é o **padrão-ouro de teclado/atalhos**; tem peso/`KG`, bipagem
  rápida com prefixo `3x`. Tudo que o Supermercado tem de varejo existe no Clássico/Assistência.
- **Venda Completa vs demais (o maior gap):** tem **endereço de entrega, garantia, orçamento
  convertido, cliente rico**, mas **NÃO tem**: controles de caixa in-shell (sangria/suprimento/
  abertura/fechamento), **barcode remoto**, item avulso, venda em espera, fila a cadastrar,
  devolução/troca. É um **shell de checkout**, não um PDV de caixa completo.
- **PDV Next/Black — o que tem:** persistência real (`finalizeSaleTransaction`), caixa
  (abertura/fechamento/status bar/sangria), busca nova, **barcode remoto**, operador por nome,
  multiplicador `3x`, a-prazo. **O que falta:** desconto, impressão, devolução, espera, item avulso,
  crédito.

**Respostas diretas:**
- *O que existe no Clássico e falta na Assistência?* Nada relevante — Assistência é superconjunto.
- *O que existe na Assistência e falta no Clássico?* OS/garantia/à-prazo enterprise (por desenho).
- *O que existe no Supermercado e falta nos outros?* Bipagem por peso/`KG` e ergonomia de teclado
  mais madura (referência), porém não exclusivo conceitualmente.
- *O que existe na Venda Completa e falta nos outros?* Endereço de entrega + orçamento convertido.
- *O que existe no PDV Next?* Vide acima — base sólida, acabamento incompleto.
- *PDV Next ainda faz sentido manter?* **Sim como tema/skin**, não como 5º motor. Ver PARTE 7.
- *Algum PDV obsoleto?* **`pdv-venda-completa-enterprise.tsx`** (órfão) e **`pdv-neon-shell.tsx`**
  (órfão) — código morto. `pdv-github-original/**` é referência congelada.
- *Algum deve virar legado?* Os 2 órfãos → arquivar/remover após confirmação.
- *Algum deve sair do menu?* Next e GitHub Original **já estão fora** (gated). Mesas é condicional.

---

## PARTE 4 — Findings visuais / UX (por código)

- **`h-screen` / `min-h-screen`:** ✅ **0 violações** nos shells de PDV — respeitam o
  AppShell como single-scroll-owner (`min-h-0 … overflow-hidden`).
- **Texto minúsculo `text-[10px]`/`text-[11px]`:**
  - `cupom-nao-fiscal.tsx` (`:230-340`) — **legítimo** (cupom térmico 58mm).
  - `pdv-recebimento-modal.tsx` (`:392-551`) — labels/badges no limite de legibilidade — ⚠️ P2.
  - `pdv-venda-completa-enterprise.tsx` (órfão, `:638-1342`) — **dezenas** de `text-[11px]` em form
    de endereço/itens — densidade alta; baixa prioridade por ser código morto.
- **Cores hardcoded fora de token:** `PdvBlackEdition` usa `bg-[#000000]` (`:407`) — **intencional**
  (tema Black), mas é cor fixa fora do token; isolar via token de tema se promovido. `pdv-neon-shell`
  concentra estilo neon (órfão).
- **Modal que perde dados / z-index / rodapé colado:** não foram encontrados padrões evidentes de
  perda de estado nos shells ativos nesta passada estática; **carrinho/rodapé** dos shells usam
  layout flex com `min-w-0` (a investigar em 1366×768 com teste manual — fora do escopo read-only).
- **Geral:** a maioria dos findings visuais é **P2/P3** (refino). Sem overflow horizontal evidente
  por classe nos shells ativos.

---

## PARTE 5 — Findings funcionais (fluxos críticos)

Motor compartilhado: `lib/operations-store.tsx` (`finalizeSaleTransaction`, `retrySyncSale`,
`reconcile`), modais compartilhados `payment-modal.tsx` (PIX/dinheiro/cartão/CPF/a-prazo),
`pdv-post-sale-dialog.tsx` (impressão), `pdv-recebimento-modal.tsx` (crediário).

| Fluxo | Onde | Função/helper | Risco / inconsistência |
|---|---|---|---|
| 1. Abrir caixa | `abertura-caixa-modal.tsx` + `/api/ops/caixa/abrir` | `useCaixa.abrirCaixa` | Venda Completa **não tem** abertura in-shell. |
| 2. Add por busca | shells | `filterPdvCatalogBySearch` (`pdv-product-search`) | Paridade ✅ nos 5. |
| 3. Add por barcode | shells | `findPdvProductByScan` + `lookupPdvScanRemote` | **Venda Completa só local** (sem remoto) → "não encontrado" falso. ⚠️ P1. |
| 4. Item avulso | `item-avulso-modal.tsx` | linha virtual `__avulso__`, pula estoque (`operations-store:279`) | Só Clássico/Super/Assistência. |
| 5. Finalizar venda | `operations-store.tsx` | `finalizeSaleTransaction` (`:1214` caixa, `:1228` estoque) | **Único e seguro** — todos os 5 usam. |
| 6. Desconto | `payment-modal.tsx` + `computePdvCartTotals` | desconto item/venda | Black **zera** desconto (placeholder). |
| 7. Venda com cliente | `use-cliente-search` + `pdv-cliente-picker` | `clienteId` | Paridade ✅. |
| 8. Venda sem cliente | shells | "Consumidor final" default | Paridade ✅. |
| 9. Venda a prazo | `pdv-append-conta-receber` + `payment-modal` | `aPrazoConfig` → N títulos | Black passa config sem UI dedicada. |
| 10. Cartão/crédito | `payment-modal` / `reducePaymentsToBreakdown` | breakdown | Paridade ✅ (crédito-vale ausente no Black). |
| 11. Estoque insuficiente | `operations-store.tsx:1228` | guard central | ✅ bloqueia (anti-negativo). |
| 12. Venda offline | `operations-store.tsx:800-922` | `syncPending` + `retrySyncSale` + reconcile | ✅ não perde venda; badge avisa antes de limpar cache. |
| 13. Reimpressão | `vendas-arquivo-geral.tsx` + `cupom-nao-fiscal` | reimprimir | Black/Venda Completa: reimpressão fraca/ausente. |
| 14. Fechar caixa | `fechamento-caixa-modal.tsx` + server confirm | `fecharCaixa` (confirma servidor) | Venda Completa sem fechamento in-shell. |

---

## PARTE 6 — Operador do caixa

**Regra oficial:** sempre o **nome digitado na abertura**; nunca UUID/hash/id técnico.

- **Fonte única:** `operatorDisplayName({ aberturaNome, session })` em `lib/pdv-operator-label.ts`
  — prioridade: **abertura do caixa → sessão NextAuth → prefixo do e-mail → "Operador não
  identificado"** (`:35-42`). Nunca devolve id.
- **Espelho client:** `lib/pdv-operador-nome.ts` (`usePdvOperadorNome`) lê o nome da abertura por
  loja (localStorage), reativo ao reabrir caixa.
- **Id técnico isolado:** `getOrCreatePdvOperatorId()` (`lib/pdv-operator-id.ts`) gera o `cashierId`
  (UUID/`timestamp-hex`) **só para auditoria** — não vai à tela/cupom.
- **Rede de segurança p/ dados antigos:** `looksLikeOperatorId()` + `sanitizeOperatorLabel()`
  (`:51-72`) filtram UUID/`timestamp-hash` que tenham vazado para `Venda.operador` (filtro puro,
  nunca inventa nome).
- **Cobertura:** `operatorDisplayName`/`usePdvOperadorNome` aparecem nos **5 shells** + `cupom-nao-fiscal`
  + `vendas-arquivo-geral` (histórico) — verificado. **Nenhum PDV exibe UUID** na tela/cupom.

| Ponto | Mostra nome correto? |
|---|---|
| PDV (tela) | ✅ (5 shells via `operatorDisplayName`) |
| Cupom | ✅ (`cupom-nao-fiscal` usa o label, não o `cashierId`) |
| Histórico (Vendas) | ✅ (`vendas-arquivo-geral` aplica `sanitizeOperatorLabel`) |
| Reimpressão | ✅ (deriva do mesmo histórico) |
| Fechamento | ✅ (sessão de caixa grava `SessaoCaixa.operador` server-side) |

⚠️ **Housekeeping:** `lib/pdv-operator-label.ts` está **modificado** e
`lib/pdv-operador-nome.ts` + `lib/pdv-operator-label.test.ts` estão **não rastreados** no working
tree. A memória do projeto registra commit `11eeb40` para essa frente — **conferir** se o working
tree tem ajuste adicional pendente ou se são resíduos a versionar. (Não é correção desta fase.)

---

## PARTE 7 — PDV Next / Black Edition (avaliação especial)

| Pergunta | Resposta (evidência) |
|---|---|
| Está ativo? | **Não em produção** — gated por `experimentalPdvEnabled` (`feature-flags.ts:23`). |
| Aparece em rota/menu? | Rota existe (`/dashboard/pdv-next`), mas mostra `ModuleEmDesenvolvimento`. |
| Tem fluxo real? | **Sim** — carrinho/bipe/cliente/pagamento completos. |
| Usa `finalizeSaleTransaction`? | **Sim** (`:359`) — persiste Venda+estoque+financeiro (não é mais "ghost sale"). |
| Usa busca nova? | ✅ `filterPdvCatalogBySearch` (`:226`). |
| Usa barcode remoto? | ✅ `lookupPdvScanRemote` (`:239`). |
| Item avulso c/ código? | ❌. |
| Usa caixa real? | ✅ `useCaixa` + Abertura/Fechamento + `CaixaStatusBar` (`:18-21,411,503-504`). |
| Imprime? | ❌ (só incrementa nº de cupom). |
| Operador correto? | ✅ `operatorDisplayName` (`:104`). |
| Está em paridade? | ❌ — falta desconto, impressão, devolução, espera, item avulso, crédito. |
| Vale manter? | **Sim, como TEMA/skin do Clássico**, não como 5º motor paralelo. |
| Vale virar tema do Clássico? | **Recomendado** — reaproveita o motor já compartilhado. |
| Vale arquivar? | Só se a direção de produto descartar o tema escuro. |

⚠️ **Inconsistência-chave:** a **mensagem da rota** ("ainda NÃO persiste vendas",
`pdv-next/page.tsx:8-17`) e o comentário em `feature-flags.ts:18-22` estão **desatualizados** —
o código **já persiste**. Risco de decisão errada de produto baseada em doc obsoleta.

---

## PARTE 8 — Riscos classificados

| ID | Risco | Sev. | Evidência |
|---|---|---|---|
| **—** | **Nenhum P0 confirmado** nos PDVs ativos de varejo (caixa/estoque/venda perdida/multi-loja). | **P0** | Motor central com gate de caixa + anti-negativo + fila offline; sem fallback loja-1 nos shells ativos. |
| R-1 | **Barcode da Venda Completa só consulta snapshot local** → bipa código existente e diz "não encontrado" → venda travada/atrito. | **P1** | `venda-completa-enterprise.tsx` importa `findPdvProductByScan` mas **não** `lookupPdvScanRemote`. |
| R-2 | **Gate do PDV Next desatualizado** ("não persiste") vs código que persiste → decisão de produto/promoção errada; se habilitado, ainda faltam impressão/desconto/devolução. | **P1** | `pdv-next/page.tsx:8-17` × `PdvBlackEdition.tsx:359`. |
| R-3 | **Venda Completa sem controles de caixa in-shell** (sangria/suprimento/abertura/fechamento) → operador depende de abrir caixa em outro PDV; fluxo confuso. | **P2** | sem `CaixaStatusBar`/`AberturaCaixaModal` no shell ativo. |
| R-4 | **Falta de paridade de recursos** na Venda Completa (item avulso, espera, devolução, fila a cadastrar). | **P2** | greps de feature = 0 no shell ativo. |
| R-5 | **PWA cache defasado** sem aviso in-PDV → operador em build antigo. | **P2** | 0 update-prompt em `vendas/**`; update só global. |
| R-6 | **2 shells órfãos** (`pdv-venda-completa-enterprise`, `pdv-neon-shell`) + árvore `pdv-github-original` = código morto que confunde manutenção e dilui paridade. | **P3** | nenhum import ativo; só docs/teste. |
| R-7 | **Black: desconto/devolução/espera/CPF como placeholders** + `bg-[#000000]` hardcoded + descarte silencioso de linhas não resolvidas no inventory. | **P3** (gated) | `PdvBlackEdition.tsx:290-307,350-351,512-515`. |
| R-8 | **`text-[10px]/[11px]`** em modal de recebimento e shell órfão → legibilidade. | **P3** | `pdv-recebimento-modal.tsx`, órfão. |

---

## PARTE 9 — Plano de correção (fases)

> **Esta fase é só diagnóstico.** Plano proposto para GOALs futuros — nada aplicado.

### FASE A — P0/P1 críticos
| Item | Arquivos prováveis | Risco | Esforço | Ferramenta sugerida |
|---|---|---|---|---|
| A1. Barcode remoto na Venda Completa | `venda-completa-enterprise.tsx` (+ `lib/pdv-scan-lookup`) | P1 | S | Sonnet (mudança cirúrgica) |
| A2. Atualizar/realinhar gate do PDV Next (doc × realidade) | `pdv-next/page.tsx`, `feature-flags.ts` | P1 | S | Opus (decisão de produto) |

### FASE B — Paridade operacional
| Item | Arquivos | Risco | Esforço |
|---|---|---|---|
| B1. Caixa in-shell na Venda Completa (ou doc explícita de pré-requisito) | `venda-completa-enterprise.tsx` + `CaixaStatusBar` | P2 | M |
| B2. Item avulso + venda em espera na Venda Completa | `item-avulso-modal`, `venda-espera-modal` | P2 | M |
| B3. Impressão + desconto no Black (se promovido) | `PdvBlackEdition`/`PdvBlackShell`, `pdv-post-sale-dialog` | P2 | M |

### FASE C — UX visual
| Item | Arquivos | Risco | Esforço |
|---|---|---|---|
| C1. Legibilidade `text-[10/11px]` (não-cupom) | `pdv-recebimento-modal` | P3 | S |
| C2. Tokenizar cor do tema Black | `PdvBlackEdition`/`PdvBlackShell` | P3 | S |
| C3. Aviso de PWA desatualizado in-PDV | shell/AppShell | P2 | M |

### FASE D — Limpeza / legado
| Item | Arquivos | Risco | Esforço |
|---|---|---|---|
| D1. Decidir e arquivar/remover órfãos | `pdv-venda-completa-enterprise.tsx`, `pdv-neon-shell.tsx` | P3 | S |
| D2. Confirmar destino de `pdv-github-original/**` | árvore inteira | P3 | S |

### FASE E — Decisão sobre PDV Next
| Item | Decisão | Esforço |
|---|---|---|
| E1. Black vira **tema do Clássico** (reusa motor) vs PDV separado vs arquivar | Produto + Opus | M |

---

## PARTE 10 — Próximos GOALs recomendados

1. **GOAL_PDV_VENDA_COMPLETA_PARIDADE** — barcode remoto (A1) + caixa in-shell (B1) + item
   avulso/espera (B2). (P1/P2)
2. **GOAL_PDV_NEXT_DECISAO** — realinhar gate/doc (A2) + decidir tema-vs-motor (E1). (P1)
3. **GOAL_PDV_LIMPEZA_ORFAOS** — arquivar shells mortos (D1/D2). (P3)
4. **GOAL_PDV_PWA_STALE_GUARD** — aviso de build defasado no PDV (C3/R-5). (P2)
5. **GOAL_PDV_UX_LEGIBILIDADE** — varredura `text-[10/11px]` + tokens (C1/C2). (P3)

---

## Anexo — Método e evidência

- **Read-only.** Verificado contra: `app/dashboard/{pdv,vendas,pdv-next,pdv-github-original}/**`,
  `components/dashboard/vendas/**`, `components/pdv-next/**`, `lib/operations-store.tsx`,
  `lib/pdv-operator-*.ts`, `lib/feature-flags.ts`, `lib/pdv-scan-*`, `lib/pdv-product-search`.
- **Limites de confiança:** flags ❓ (PWA, reimpressão Venda Completa, Lovable hub) não foram
  exauridas por leitura completa; marcadas honestamente. Findings de layout 1366×768 exigem teste
  manual (fora do escopo desta auditoria estática).
- **Sem build** (auditoria/docs). Validação executada: `git diff --stat` (apenas este arquivo novo).
