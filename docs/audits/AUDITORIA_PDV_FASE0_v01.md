# AUDITORIA PDV — FASE 0 (diagnóstico profundo pré-correção) — v01

> **Modo:** READ ONLY — nenhuma linha de código foi alterada. Nada commitado/pushado. Operações V3 **não tocada**.
> **Data:** 2026-06-10 · **Autor:** Claude Code (Opus) · **Escopo:** ecossistema PDV/Vendas.
> **Objetivo:** consolidar o diagnóstico antes de qualquer correção do GOAL
> `PDV_VENDA_COMPLETA_E_SYNC_FASE_0` — Venda Completa, sincronização offline, localStorage legado, PWA cache,
> código morto e divergências entre PDVs.
>
> **Base:** estende `AUDITORIA_OPERACIONAL_PDV_FINAL_v03.md` (commit `ae36701`) e o runbook
> `DIAGNOSTICO_VENDA_COMPLETA_MAQUINA_LOJA_v01.md`. **Novos achados desta Fase 0 marcados `★ NOVO`.** Onde apenas
> reconfirma, marca `(=v03)`.

---

## 1. Resumo executivo

O **núcleo transacional do PDV está saudável e seguro** — motor único `finalizeSaleTransaction`
(`lib/operations-store.tsx`) faz, para todos os PDVs: gate de caixa fechado, validação de estoque, conferência
soma-pagamentos × total (tol. 0,02), CPF obrigatório p/ à-prazo e crédito, baixa de estoque, lançamento no caixa
e persistência com rede de reenvio (`syncPending`). **Sem P0 ativo. Sem caixa fantasma.** (Re-verificado.)

**Sobre a Venda Completa (a queixa que motivou tudo):**

- ✅ **Há exatamente UM caminho de entrada** para a Venda Completa: o card do Vendas HUB
  (`VendasHub.tsx:45` → `/dashboard/vendas/venda-completa`). Uma varredura por **todas** as ocorrências de
  `venda-completa`/`Venda Completa` confirmou que **todas as outras menções são comentários/rótulos**
  (`caixa-status-bar.tsx`, `payment-modal.tsx`, `pdv-payments.ts`) — **nenhum outro link/redirect**. `★ NOVO (exaustivo)`
- ✅ A rota renderiza `VendaCompletaEnterprise` **sem redirect**, e o href é estável **desde o 1º commit**
  (git-provado no v03). **O link nunca abriu o PDV comum por código.** `(=v03)`
- ⚠️ O sintoma "abre como PDV comum" vem de **estado da máquina**: (a) `localStorage` legado
  `omni-pdv-classic-layout = "venda-completa"` que o runtime degrada em silêncio para o Clássico, e/ou (b)
  **PWA Service Worker** servindo bundle/shell antigo. `(=v03)`

**Achados materiais NOVOS desta Fase 0 (não estavam no v03):**

1. **`★ Operador impresso como UUID de dispositivo`** — **todos** os PDVs montam o comprovante com
   `operador: cashierId`, e `cashierId = getOrCreatePdvOperatorId()` é um **UUID aleatório por navegador**
   (`lib/pdv-operator-id.ts`, chave `assistec-pdv-operator-id-v1`). O cupom (térmico e HTML) imprime esse UUID em
   "Operador:". A **persistência no banco**, porém, grava o **nome da sessão** (`venda-persist` →
   `getOperatorLabelFromSession`). → comprovante do cliente mostra `Operador: 3f2a…-…` em vez do nome. **(P1)**
2. **`★ Mapa completo de localStorage`** inclui **duas chaves não listadas** no runbook original:
   `omnigestao:caixa:{storeId}` (snapshot do caixa) e `assistec-pdv-operator-id-v1` (UUID do operador). Ver §4.
3. **`★ PWA sem mecanismo de "nova versão disponível"`** — `next-pwa` registra o SW automaticamente
   (`register:true`, `skipWaiting:true`, `cacheOnFrontEndNav:true`), mas **não há banner/prompt de update** no app
   nem detecção de versão. A atualização depende de reload + `skipWaiting`. Ver §5.
4. **`★ Catálogo do PDV não tem limite de 1000`** — `app/api/ops/inventory/route.ts` faz
   `findMany({ where:{ storeId }, orderBy:{ name:"asc" } })` **sem `take`** → carrega **todos** os produtos da
   loja. O "limite de 1000" não existe na API; só há cap de **autocomplete** (~8 sugestões do bipe). Ver §7.

**Persistência das correções do v02/v03:** a Fase 0 recomendada **ainda NÃO foi aplicada** — tipo órfão
`"venda-completa"`, prop morta `classicLayoutKind`, `saleMode` morto, duplicata `pdv-venda-completa-enterprise.tsx`
e placeholder `/vendas/nova` continuam todos vivos. Ver §9.

---

## 2. Mapa de rotas (vendas)

| Rota | Arquivo | Renderiza | Observação |
|---|---|---|---|
| `/dashboard/vendas` | `app/dashboard/vendas/page.tsx` → `VendasPDV` (`vendas-pdv.tsx`) | **1 dos 3 shells** (Clássico/Supermercado/Assistência) | Shell escolhido por layout/perfil; sem menu de troca |
| `/dashboard/vendas?modo=rapido` | idem | shell + `isModoRapido` | Modo compacto, não é PDV separado |
| `/dashboard/vendas/venda-completa` | `venda-completa/page.tsx` → `venda-completa-page-client.tsx` | `VendaCompletaEnterprise` | **Sem redirect**; único caminho real da Venda Completa |
| `/dashboard/vendas/mesas` | `controle-consumo.tsx` | Comanda/mesa | Gated por `pdvParams.moduloControleConsumo` |
| `/dashboard/vendas-hub` | `VendasHub` (TanStack) | Cards de navegação | Card "Venda Completa" usa `<a href>` (hard nav) |
| `/dashboard/vendas-arquivo-geral` | `vendas-arquivo-geral.tsx` | Histórico + "Reenviar sincronização" | — |
| `/dashboard/pdv` | `app/dashboard/pdv/page.tsx` | redirect → `/dashboard/vendas` | Alias OK |
| `/dashboard/historico-vendas` | — | redirect → `/dashboard/vendas-arquivo-geral` | Alias legado OK |
| `/dashboard/pdv-next` | `pdv-next/page.tsx` | `PdvBlackEdition` **bloqueado por flag** | `NEXT_PUBLIC_OG_EXPERIMENTAL` |
| `/dashboard/pdv-github-original` | espelho | bloqueado por flag | Referência interna |
| `/dashboard/vendas-hub/vendas/nova` | `lovable/routes/vendas.nova.tsx` | `PlaceholderModule` "Venda completa" | **Placeholder órfão**, alcançável por URL |

**Seleção de shell** (`vendas-pdv.tsx`): `layout==="supermercado"` → Supermercado (`:116`); `resolvedClassicLayout
==="services"` → Assistência (`:125`); **qualquer outro** (inclusive `"venda-completa"`, normalizado→`"lovable"`
em `:118-123`) → **Clássico** (`:133`). Esta cadeia é a raiz do sintoma "venda-completa vira PDV comum".

---

## 3. Mapa de componentes

| Componente | Arquivo | Papel | Estado |
|---|---|---|---|
| Roteador de shell | `components/dashboard/vendas/vendas-pdv.tsx` | escolhe Clássico/Supermercado/Assistência | Funcional (degrada `venda-completa`→Clássico) |
| PDV Clássico | `pdv-classic.tsx` + `pdv-omni-classic-shell.tsx` | balcão padrão | Funcional |
| PDV Supermercado | `pdv-supermercado.tsx` | balcão bipe-first | Funcional (divergente) |
| PDV Assistência | `pdv-assistencia-enterprise.tsx` | balcão assistência (mais completo) | Funcional |
| Venda Completa | `venda-completa-enterprise.tsx` | venda comercial, cliente obrigatório | Funcional |
| **Venda Completa (duplicata)** | `pdv-venda-completa-enterprise.tsx` | re-exporta `VendaCompletaEnterprise` | **Órfã / dead code** |
| Motor de venda | `lib/operations-store.tsx` (`finalizeSaleTransaction`) | gate+estoque+pagamento+persist+reenvio | Funcional (núcleo) |
| Persistência server | `lib/ops-upsert-venda.ts` · `app/api/ops/venda-persist/route.ts` | upsert transacional + operador da sessão | Funcional |
| Modal de pagamento | `payment-modal.tsx` (compartilhado) | formas/split; layout 2-col opt-in só no Clássico | Funcional |
| Pós-venda | `pdv-post-sale-dialog.tsx` | Sim/Não imprimir, foco determinístico | Funcional |
| Comprovante | `lib/pdv-print-runtime.ts` · `cupom-nao-fiscal.tsx` · `lib/escpos.ts` | térmico/HTML | Funcional (⚠️ operador=UUID) |
| Caixa | `caixa-status-bar.tsx` + `caixa-provider` | abrir/fechar/sangria/suprimento (compartilhado) | Funcional |
| Trocas/Devolução | `trocas-devolucao.tsx` | devolução/troca (Clássico+Assistência) | Funcional |
| Item avulso | `item-avulso-modal.tsx` | venda de item não cadastrado (Insert) | Funcional |
| Busca | `lib/pdv-product-search.ts` (canônica) | acento+multi-termo+ranking | Funcional (Supermercado não usa) |
| Scanner | `lib/pdv-scan-product.ts` (`findPdvProductByScan`) | bipe → produto | Funcional |

---

## 4. Mapa de localStorage `★ (mapa completo, verificado no código)`

| Chave (real) | Conteúdo | Pode causar | Quando some |
|---|---|---|---|
| `omni-pdv-classic-layout` **e** `omni-pdv-classic-layout::{storeId}` | sub-layout Clássico (`lovable`/`services`/**`venda-completa`**) | **venda-completa→Clássico (silencioso)**, layout errado | Só se removida manualmente |
| `@omnigestao:pdv-layout` **e** `::{storeId}` | layout principal (`classic`/`supermercado`/`next`) | shell errado | idem |
| `omnigestao-pdv-modo` **e** `::{storeId}` | modo do PDV | modo errado | idem |
| `@omnigestao:ramo-atuacao:{storeId}` | inferência supermercado×assistência | shell inferido errado | idem |
| **`assistec-pro-ops-v1`** (legado) **e** `assistec-pro-ops-v1-{storeId}` | **estado de operações**: `sales[]`, `devolucoes[]`, `pendingCaixaOperations[]` (com `syncPending`), inventory/ordens | **venda offline perdida** se limpar antes de sincronizar; estado antigo sobrevive a deploy | "Clear site data" / limpeza manual |
| `omnigestao:caixa:{storeId}` `★ NOVO` | snapshot do caixa (sessão) | caixa "fantasma" local divergente do servidor | "Clear site data" / limpeza manual |
| `assistec-pdv-operator-id-v1` `★ NOVO` | **UUID do operador (device)** = `cashierId` | **operador impresso como UUID** | limpeza manual |
| `assistec-staff-*` / cookies de PIN | sessão de staff legada | — | logout/limpeza |

**Migração legado→scoped (atenção):** `readStoreScopedString` **copia** o valor da chave global legada para a
chave `::{storeId}` na primeira leitura (`store-scoped-storage.ts:22-28`). Logo, um `omni-pdv-classic-layout =
"venda-completa"` global vira também `omni-pdv-classic-layout::{storeId}` — por isso o diagnóstico deve **varrer
por substring**, não só a chave global.

**Fontes:** `lib/store-scoped-storage.ts:52-60`, `lib/pdv-classic-layout.ts:24`, `lib/ops-loja-id.ts:4`,
`lib/loja-ativa.tsx:36`, `lib/operations-store.tsx:405-407,446-453,521`, `lib/pdv-operator-id.ts:1`.

---

## 5. Mapa de Service Worker / PWA `★`

| Item | Valor | Risco |
|---|---|---|
| Plugin | `@ducanh2912/next-pwa` (`next.config.mjs:1-12`) | — |
| `disable` | só em `NODE_ENV==="development"` | **PWA ativo em produção** |
| `register` | `true` (auto-registra o SW) | — |
| `skipWaiting` | `true` (novo SW assume na hora) | troca de versão sem confirmação |
| `cacheOnFrontEndNav` | `true` (pré-cacheia páginas na navegação SPA) | **shell/bundle antigo servido** entre deploys |
| `workboxOptions` | só `disableDevLogs:true` | usa **runtime caching default** do next-pwa (sem estratégia explícita por rota) |
| Update UI | **inexistente** `★` | usuário não é avisado de "nova versão"; depende de reload manual |
| `proxy.ts` | libera `"/workbox-"` e `"/worker-"` (`proxy.ts:35`) | esperado (assets do SW) |

**Diagnóstico de versão velha (operacional, no console):**
`navigator.serviceWorker.getRegistrations()` (ver `active`/`waiting`) e `caches.keys()`.
**Update seguro:** `unregister()` + `caches.delete(...)` + hard reload — **não** "Clear site data" (apaga
`localStorage` e leva vendas pendentes junto). Procedimento completo no runbook
`DIAGNOSTICO_VENDA_COMPLETA_MAQUINA_LOJA_v01.md`.

---

## 6. Sincronização offline (auditoria) `(=v03, detalhado)`

- **Onde fica salvo:** `assistec-pro-ops-v1[-{storeId}]` → `sales[]` com flag `syncPending`
  (`operations-store.tsx:446-453,521`).
- **Fluxo:** `finalizeSaleTransaction` grava local + marca `syncPending:true` (`:1336`) + dispara POST
  `fire-and-forget` para `/api/ops/venda-persist` (`:1357`). Sucesso → `syncPending:false` (`:1371`).
- **Reenvio automático:** `flushPendingSales` em `online`, `visibilitychange` e a cada **30s**; reconciliação por
  ID com o servidor (descarte só se o servidor confirma; nunca perde silenciosamente).
- **Reenvio manual:** botão "Reenviar sincronização" no Histórico (`vendas-arquivo-geral.tsx`).
- **Quando some / risco de perder venda:** apenas se `localStorage` for limpo (ex.: "Clear site data") **antes** de
  qualquer flush. → este é o **único cenário plausível de "venda perdida"** (cauda P0).
- **Sinal ao operador:** apenas **toast transitório** em falha; **não há indicador persistente** "N pendentes" no
  header do PDV. Combinado com a limpeza de cache do PWA, é o ponto de atenção operacional.
- **★ Observação nova:** no Histórico, vendas **locais/pendentes** mapeiam `operador: s.cashierId`
  (`vendas-arquivo-geral.tsx:259`) → mostram o **UUID** até o registro do servidor (com nome) prevalecer.

---

## 7. Matriz de PDVs (funcionalidades)

Legenda: ✅ presente · ⚠️ com ressalva · ❌ ausente · 🔒 bloqueado por flag

| Recurso | Clássico | Supermercado | Assistência | Venda Completa | Black/Next |
|---|:---:|:---:|:---:|:---:|:---:|
| Abrir/Fechar caixa (`CaixaStatusBar`) | ✅ | ✅ | ✅ | ❌ (só avisa) | 🔒 |
| Bloqueio venda c/ caixa fechado | ✅ motor | ⚠️ só no finalizar | ✅ motor | ✅ gate | 🔒 (já tem gate) |
| Busca por nome/SKU/EAN/código | ✅ canônica | ⚠️ sem acento/multi-termo | ✅ canônica | ✅ canônica | 🔒 |
| Limite de produtos | sem limite (catálogo completo) | idem | idem | idem | — |
| Scanner / código de barras | ✅ | ✅ | ✅ | ✅ | 🔒 |
| Cliente (F2/seleção) | ✅ `useClienteSearch` | ❌ (cliente=null) | ✅ `PdvClientePicker` | ✅ obrigatório | 🔒 |
| Desconto | ✅ | ✅ (R$/%) | ✅ | ✅ | 🔒 |
| Item avulso (Insert) | ✅ | ✅ | ✅ | ❌ | 🔒 |
| Pagamento (modal) | ✅ | ✅ | ✅ (próprio) | ✅ | 🔒 |
| Pagamento múltiplo (F12) | ✅ | ✅ (se habilitado) | ✅ | ✅ | 🔒 |
| Venda em espera (F7) | ✅ | ✅ | ✅ | ❌ | 🔒 |
| Cancelamento / Devolução | ✅ `TrocasDevolucao` | ❌ | ✅ + F8 | ❌ | 🔒 |
| Impressão de comprovante | ✅ | ✅ | ✅ | ✅ `CupomNaoFiscal` | 🔒 |
| **Operador no comprovante** | ⚠️ **UUID** | ⚠️ **UUID** | ⚠️ **UUID** | ⚠️ **UUID** | — |
| Integração estoque (baixa/restaura) | ✅ motor | ✅ motor | ✅ motor | ✅ motor | 🔒 |
| Integração caixa/financeiro | ✅ | ✅ | ✅ | ✅ | 🔒 |
| Venda à prazo → Contas a Receber | ✅ | ✅ | ✅ | ✅ | 🔒 |
| Multi-loja (`storeId`) | ✅ | ✅ | ✅ | ✅ | — |

> Black/Next (`PdvBlackEdition`) já chama `finalizeSaleTransaction` + gate de caixa, mas segue **bloqueado por
> flag** em produção — por isso 🔒 (não operável hoje).

---

## 8. Matriz de atalhos

Fonte (verificada): `pdv-classic.tsx` · `pdv-supermercado.tsx:624-660` · `pdv-assistencia-enterprise.tsx`.

| Tecla | Clássico | Supermercado | Assistência |
|---:|---|---|---|
| F1 | Finalizar/Pagamento | — | Pagamento (dinheiro) |
| **F2** | **Cliente** | **Pagamento #1 (dinheiro)** ⚠️ | Toggle cliente |
| **F3** | **Busca produto** | **Pagamento #2 (PIX)** ⚠️ | Foca busca |
| **F4** | **Quantidade** | **Pagamento #3 (débito)** ⚠️ | Editar quantidade |
| F5 | Receber contas | — | Remove item |
| F6 | Cancelar venda | — | Remove item |
| F7 | **Espera** | **Espera** | **Espera** |
| F8 | Volta ao bipe | — | **Trocas/Devolução** |
| F9 | Receber contas | Recebimento | Recebimento |
| F10 | Desconto | — | Desconto |
| F11 | — | — | Fullscreen |
| F12 | Pgto múltiplo | Pgto múltiplo (se habilitado) | Pgto múltiplo |
| **Insert** | **Item avulso** | **Item avulso** | **Item avulso** |
| Delete | Remove item | — | — |
| End | Ajuda | — | — |

**Consistentes 100%:** `Insert` (item avulso) e `F7` (espera). **Divergência de risco (⚠️):** `F2/F3/F4` =
pagamento no Supermercado (`:647-655`) vs. cliente/busca/quantidade nos demais. **Guard de modais correto** no
Supermercado (`:640` + deps `:660`) — sem closure stale. **Doc desatualizada:** `PDV_HOTKEYS.md` diz F11=Suspender
na Assistência; código atual F11=Fullscreen, F7=Suspender.

---

## 9. Lista de código morto / órfão

| Item | Local | Tipo | Ação sugerida |
|---|---|---|---|
| Tipo `"venda-completa"` em `PdvClassicLayoutKind` | `lib/store-settings-types.ts:14` | tipo órfão (nenhuma UI grava) | remover ou tratar explicitamente |
| Prop `classicLayoutKind` | `pdv-classic.tsx:176,188` | recebida, **0 leituras** | remover |
| Estado `saleMode` | `pdv-classic.tsx:205` | `useState` nunca lido (vestígio modo "completa") | remover |
| `pdv-venda-completa-enterprise.tsx` | componente | **duplicata** que re-exporta `VendaCompletaEnterprise`, sem importadores de rota | remover |
| Rota `/vendas/nova` | `lovable/routes/vendas.nova.tsx` | `PlaceholderModule` órfão alcançável por URL | remover ou apontar p/ a página real |
| Texto de bloqueio do PDV Next | `pdv-next/page.tsx` | diz "não registra vendas" (desatualizado; já chama `finalizeSaleTransaction`) | atualizar texto |

---

## 10. Lista de inconsistências

1. **`★ Operador = UUID no comprovante`** (todos os shells): `operador: cashierId` em `pdv-classic.tsx:912,1650`,
   `pdv-supermercado.tsx:1114`, `pdv-assistencia-enterprise.tsx:2105`, `venda-completa-enterprise.tsx:520`,
   `pdv-venda-completa-enterprise.tsx:557` → cupom imprime o UUID de `assistec-pdv-operator-id-v1`. O **banco**
   grava o nome da sessão (`venda-persist:48` + `session-operator.ts`). **Divergência cliente×banco.**
2. **F2/F3/F4 com semântica oposta no Supermercado** (pagamento vs. cliente/busca/quantidade).
3. **Busca do Supermercado mais fraca** — `.toLowerCase().includes()` sem acento e sem multi-termo
   (`pdv-supermercado.tsx:274-293`) vs. motor canônico (`lib/pdv-product-search.ts`).
4. **Cobertura desigual:** Supermercado sem cliente e sem devolução; Venda Completa sem abrir caixa / item avulso /
   espera / devolução.
5. **Layout legado `"venda-completa"` degradado em silêncio** para o Clássico (`vendas-pdv.tsx:118-123`).
6. **Sem indicador persistente de vendas pendentes** no header do PDV (só toast).
7. **Sem prompt de atualização do PWA** (risco de bundle antigo silencioso).
8. **`PDV_HOTKEYS.md` desatualizado** (F11).

---

## 11. Riscos classificados

### P0 — venda perdida / não salva / estoque errado / caixa errado / valor errado
- **Nenhum P0 ativo confirmado.** Motor valida caixa/estoque/soma e persiste com reconciliação.
- **Cauda P0:** venda `syncPending` perdida apenas se `localStorage` (`assistec-pro-ops-v1*`) for limpo **antes**
  de sincronizar — risco operacional ao "limpar cache" sem sincronizar. Mitigação: §13 GOAL (indicador + ordem).

### P1 — fluxo confunde / atalho divergente / venda completa abrindo errado por estado local / offline não sync / cache PWA antigo / impressão com dado errado
- **P1-0** — `"venda-completa"` legado abre PDV comum (localStorage) **+** PWA cache servindo bundle antigo. (não corrigido)
- **P1-1 ★** — **operador impresso como UUID** no comprovante do cliente (todos os shells). Divergente do banco (nome).
- **P1-2** — persistência otimista com sinal fraco (só toast); sem badge "N pendentes".
- **P1-3** — F2/F3/F4 oposto no Supermercado (risco de lançar pagamento ao tentar buscar).
- **P1-4** — cobertura desigual de recursos entre PDVs.

### P2 — UX / busca fraca / empty state
- **P2-1** — busca do Supermercado sem acento/multi-termo.
- **P2-2** — caixa fechado só falha no finalizar (Supermercado), sem gate visual antecipado.
- **P2-3** — Venda Completa sem botão de abrir caixa.
- **P2-4** — rota placeholder `/vendas/nova` (confusão "2ª Venda Completa").
- **P2-5 ★** — sem estratégia explícita de cache PWA por rota crítica / sem prompt de update.

### P3 — polimento / dívida técnica
- **P3-1** — duplicata `pdv-venda-completa-enterprise.tsx`.
- **P3-2** — `saleMode` morto; tipo `"venda-completa"` órfão + prop `classicLayoutKind` morta.
- **P3-3** — texto de bloqueio do PDV Next desatualizado.
- **P3-4** — `PDV_HOTKEYS.md` (F11) desatualizado.

---

## 12. Plano recomendado de correção (por fases, sem executar nada)

**Fase 0.A — Fechar a queixa "Venda Completa = PDV comum" (P1)**
1. **Diagnóstico na máquina da RafaCell** (runbook): separar localStorage legado × PWA cache **antes** de codar.
2. `vendas-pdv.tsx`: tratar/sanear `"venda-completa"` (redirect p/ a página real **ou** normalizar sem degradar
   em silêncio).
3. Remover ambiguidade de raiz: tipo órfão, prop `classicLayoutKind`, duplicata, placeholder `/vendas/nova`.

**Fase 0.B — Segurança da venda offline (P0-cauda/P1)**
4. **Indicador persistente "N vendas pendentes"** no header do PDV (reuso de `flushPendingSales`/`retrySyncSale`).
5. (PWA) Avaliar `NetworkFirst`/versionamento do SW para rotas críticas + **prompt de "nova versão disponível"**;
   documentar "como atualizar o PDV" para a loja. Bloquear/avisar "Clear site data" com pendências.

**Fase 0.C — Operador real no comprovante (P1) `★`**
6. Passar o **nome da sessão** (já disponível no servidor; expor ao cliente via contexto/`useCurrentUser`) como
   `operador` nos 4 shells, mantendo `cashierId` só como id técnico/terminal. Alinha cupom × banco.

**Fase 1 — Equalização de atalhos (P1)**
7. Convergir `F2/F3/F4` do Supermercado p/ a semântica canônica (ou documentar+treinar). Atualizar `PDV_HOTKEYS.md`.

**Fase 2 — Paridade de busca e caixa (P2)**
8. Supermercado usar `filterPdvCatalogBySearch` (acento+multi-termo+ranking).
9. Gate visual de caixa fechado antes de montar carrinho (Supermercado).
10. `CaixaStatusBar`/"Abrir caixa" na Venda Completa.

**Fase 3 — Limpeza (P3)**
11. Remover `saleMode` morto; atualizar texto do PDV Next; remover duplicatas/placeholder restantes.

---

## 13. Próximo GOAL de implementação recomendado

**`PDV_FASE0_IMPL_1` (P1, cirúrgico, sem tocar o motor de venda):**

> Escopo fechado:
> 1. **Venda Completa**: `vendas-pdv.tsx` tratar/sanear `"venda-completa"` (Fase 0.A.2) + remover prop morta e
>    duplicata (0.A.3). Fecha a queixa de raiz, no código.
> 2. **Vendas pendentes**: badge persistente "N pendentes" + ação "reenviar" no header (Fase 0.B.4). Protege a
>    única "venda perdida" plausível; pré-requisito para qualquer orientação de limpeza de cache.
> 3. **Operador no comprovante**: usar o nome da sessão em vez do `cashierId` (Fase 0.C.6).
>
> Validação obrigatória: `npx tsc --noEmit` + `npm run build` + teste manual nos 3 shells **e** com
> `localStorage.omni-pdv-classic-layout="venda-completa"` **e** um ciclo de hard-reload do PWA.
> Deixar atalhos (Fase 1) e busca/caixa (Fase 2) como GOALs seguintes.

---

### Anexo — Evidências (arquivo:linha) — verificadas em 2026-06-10

- Único entry point Venda Completa: `VendasHub.tsx:45` (href) · demais menções = comentário/label
  (`caixa-status-bar.tsx:58`, `payment-modal.tsx:171`, `pdv-payments.ts:8`).
- Rota Venda Completa sem redirect: `app/dashboard/vendas/venda-completa/page.tsx` →
  `venda-completa-page-client.tsx:6-12`.
- Seleção de shell: `vendas-pdv.tsx:114-133` (normalização venda-completa→lovable `:118-123`).
- localStorage: `store-scoped-storage.ts:52-60` · `pdv-classic-layout.ts:24` · `ops-loja-id.ts:4` ·
  `loja-ativa.tsx:36` · `operations-store.tsx:405-407,446-453,521` · `pdv-operator-id.ts:1,15-25`.
- PWA: `next.config.mjs:3-12` · `proxy.ts:35`. Sem update UI (nenhum match de SW-update no app).
- Motor de venda: `operations-store.tsx` (gate caixa `:1204-1216` · estoque `:1218-1230` · baixa `:1267-1272` ·
  soma pagamentos `:1237-1248` · CPF à-prazo/crédito `:1251-1264` · `syncPending` `:1336` · POST `:1357` ·
  flush em online/foco/30s `:799-1083`).
- Operador: `ops-upsert-venda.ts:135-137` (`operadorLabel || cashierId`) · `venda-persist/route.ts:46-53`
  (`getOperatorLabelFromSession`) · `session-operator.ts:7-13` · impressão `pdv-print-runtime.ts:125` +
  `cupom-nao-fiscal.tsx:88,152,247-250` · shells passam `operador: cashierId` (`pdv-classic.tsx:912,1650`,
  `pdv-supermercado.tsx:1114`, `pdv-assistencia-enterprise.tsx:2105`, `venda-completa-enterprise.tsx:520`).
- Inventário sem `take` (sem limite de 1000): `app/api/ops/inventory/route.ts:138-139`.
- Hotkeys Supermercado: `pdv-supermercado.tsx:624-660` (F2/F3/F4 pagamento `:647-655`).
- Busca Supermercado própria: `pdv-supermercado.tsx:274-293` × canônica `lib/pdv-product-search.ts`.
- Código morto: tipo `store-settings-types.ts:14` · prop `pdv-classic.tsx:176,188` · `saleMode` `:205` ·
  duplicata `pdv-venda-completa-enterprise.tsx` · placeholder `lovable/routes/vendas.nova.tsx`.

> **Áreas com verificação parcial** (registradas por honestidade — não alteram as conclusões): **foco do leitor
> após a venda** por shell (recomendado teste manual nos 3 PDVs), internals de `payment-modal.tsx` e `escpos.ts`,
> e a **confirmação empírica do PWA cache** (exige sessão com DevTools na máquina da loja — ver runbook).

---

*Fim da Auditoria PDV Fase 0 v01. READ ONLY — nenhuma alteração de código. Não corrige nada; é insumo para o GOAL
de implementação.*
