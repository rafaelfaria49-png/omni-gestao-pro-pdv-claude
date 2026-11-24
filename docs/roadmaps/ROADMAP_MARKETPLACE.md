---
title: Roadmap — HUB Marketplace
hub: marketplace
status: vivo
owner: produto + Sonnet (técnico)
last_update: 2026-11-24
sprint_atual: M01 reconciliação e homologação de leitura (PR #399 draft)
---

# 🛍️ Roadmap — HUB Marketplace

> Estrutura conforme [`docs/roadmaps/INDEX.md §2.2`](./INDEX.md). 15 seções obrigatórias.
> Fonte da verdade do estado real: [`docs/ai/CURRENT_STATUS.md`](../ai/CURRENT_STATUS.md).
> **Status global:** HUB existente com catálogo e operações simuladas. M01 implementa OAuth e leitura Mercado Livre com opt-in privado e homologação externa pendente. [Relatório técnico](../modules/MARKETPLACE_MELI_OAUTH.md)

---

## 1. Visão

> **Vender em todos os canais com 1 cadastro, 1 estoque e 1 financeiro — Mercado Livre, Shopee, Amazon, Magalu integrados via adapter unificado.**

Marketplace é o **HUB de alcance** — permite ao SMB triplicar receita sem triplicar operação. Toda venda vinda de marketplace passa pelos mesmos adapters do PDV (Estoque + Financeiro), com origem rastreável.

---

## 2. Objetivos

1. **1 produto, N canais** — cadastro único + mapeamento por marketplace.
2. **Sincronização bidirecional de saldo** — venda em qualquer canal baixa estoque global em < 30s.
3. **Reconciliação de repasses** automática (taxas, fretes, parcelamento, comissão).
4. **Pedidos unificados** — Mercado Livre, Shopee, Amazon viram OS/Venda interna.
5. **Anúncio com IA** — descrição, título, preço sugerido por canal.

---

## 3. Concorrentes analisados

| Concorrente | O que aprendemos |
|---|---|
| **Mercado Turbo** | Reprice automático + análise concorrência — top tier. |
| **Bling** | Cobertura ampla de marketplaces — referência de breadth. |
| **Tiny** | UX simples de mapeamento — adoção. |
| **Ideris** | Conciliação de repasses detalhada — referência. |
| **Olist** | Fulfillment integrado — nicho avançado (Fase 5). |

---

## 4. Diferenciais (planejados)

- **Adaptador de leitura** com interface comum (`MarketplaceReadOnlyAdapter`). O Mercado Livre usa esse contrato. Os demais canais entram após o piloto.
- **Estoque virtual por canal** (opcional): reserva X% do saldo para cada canal.
- **Conciliação contábil** integrada ao Financeiro via adapter (`marketplace-conciliacao.ts`).
- **Anúncio com Marketing IA** — gera título/descrição otimizada por canal usando Omni Agent.
- **Sync event-driven** via webhook do marketplace → fila → adapter.

---

## 5. Gaps atuais

O HUB tem cadastro local por loja. A ativação do primeiro canal depende de configuração e validação no DevCenter.

| Gap | Severidade |
|---|---|
| **Homologação do OAuth e leitura Mercado Livre em conta oficial de teste** | 🔴 P0 |
| **OAuth para Shopee, Amazon e Magalu** | 🔴 P0 |
| **Sem adapter de estoque** Marketplace ↔ Estoque | 🔴 P0 |
| **Sem adapter financeiro** repasses → Financeiro | 🔴 P0 |
| **Sem importação de pedidos** | 🔴 P0 |
| **Sem mapeamento de SKU** por canal | 🔴 P0 |
| **Sem reprice nem análise concorrência** | 🟡 P1 |

---

## 6. Funcionalidades futuras

| # | Funcionalidade | Prioridade |
|---|---|---|
| 1 | **Homologar a primeira autorização e leitura Mercado Livre** na loja piloto | P0 |
| 2 | **Mapeamento SKU OmniGestão ↔ MLB/SKU canal** | P0 |
| 3 | **Sync de saldo bidirecional** | P0 |
| 4 | **Importação de pedidos** → Venda/OS interna | P0 |
| 5 | **Conciliação de repasses** (taxas, fretes, comissões) | P0 |
| 6 | **Geração de etiqueta** Mercado Envios / Shopee | P1 |
| 7 | **Reprice automático** (regras: piso, teto, concorrência) | P1 |
| 8 | **Anúncio com IA** (título, descrição, fotos otimizadas) | P1 |
| 9 | **Análise de concorrência** + sugestão de preço | P2 |
| 10 | **Estoque virtual por canal** (reserva %) | P2 |
| 11 | **Multi-conta por marketplace** (vários sellers numa loja) | P2 |
| 12 | **Fulfillment integrado** (ML Full, Shopee Logística) | P3 |

---

## 7. Backlog

| Item | Tamanho | Pré-req |
|---|---|---|
| Homologar OAuth e leitura Mercado Livre | M | Aplicação DevCenter, Preview isolado e vendedor oficial de teste |
| Vincular anúncio à variante com confirmação | L | Catálogo P02 e identificadores estáveis P03 |
| Sincronizar saldo disponível do canal | L | Ledger de estoque e reservas por variante no depósito |
| Registrar venda de pedido com variante | L | Idempotência do pedido, venda por variante no PDV e reserva/baixa canônicas |
| Adapter `marketplace-conciliacao` → Financeiro | L | Financeiro Fase 1 fechado |
| OAuth Shopee | M | OAuth ML provado |
| Reprice automático básico | M | Sync saldo funcionando |

---

## 8. Fases

| Etapa | Entrega |
|---|---|
| M01 | OAuth e leitura paginada por loja, com flag privada. Homologação com vendedor oficial de teste. |
| M02 | Importação e vinculação de produtos e variantes. Confirmar cada vínculo de produto, variante, oferta ou User Product. Reusar o catálogo P02 e os identificadores estáveis do Vestuário P03. |
| M03 | Publicação e gerenciamento de anúncios. Requer escopos de escrita separados, autorização e auditoria. |
| M04 | Pedidos e webhooks com validação do evento, leitura no canal e idempotência. Converter um pedido com variante em venda depende do contrato operacional de venda por variante no PDV. |
| M05 | Estoque, reservas e sincronização. Requer ledger por variante e depósito, compatibilidade com venda/cancelamento/devolução no PDV e regra de disponibilidade por canal. |
| M06 | Homologação e ativação comercial por loja. Requer evidência oficial dos fluxos habilitados, aceite do proprietário, rollback e opt-in. |

---

## 9. Dependências

| Depende de | Para quê |
|---|---|
| **Vestuário P03** | Identificação estável para M02. O SKU do canal ajuda a localizar candidatos e o vínculo usa a identidade interna confirmada. O P03 segue em draft. |
| **Estoque por variante** | M05 depende de saldo, reserva e baixa por variante e depósito. |
| **Venda por variante no PDV** | M04 e M05 dependem de venda, cancelamento e devolução da variante com o mesmo identificador. |
| **Financeiro** | Conciliação de repasses (adapter) |
| **Multi-loja** | Cada loja com suas próprias credenciais por canal |
| **Marketing IA** | Geração de conteúdo depois do piloto de publicação. |
| **Omni Agent** | Operações de escrita autorizadas em etapas comerciais futuras. |
| **BI** | Performance por canal (leitura) |

---

## 10. Riscos

| Risco | Categoria | Mitigação |
|---|---|---|
| **Oversell** (vendido em N canais > saldo) | Negócio — P0 | Estoque virtual + reserva otimista + webhook real-time |
| **Rate limit do marketplace** | Técnico — P1 | Leitura sob demanda, cooldown e `Retry-After` no M01. Dimensionar fila para fases de escrita. |
| **Token OAuth expira ou é revogado** | Técnico — P1 | Renovação sob demanda serializada e reconexão quando o grant for recusado. |
| **Conciliação errada** de repasses causa rombo financeiro | Negócio — P0 | Modo dry-run + revisão humana inicial |
| **API do marketplace muda** sem aviso | Técnico — P1 | Versioning do adapter + testes de integração |
| **Mistura de leitura com efeitos comerciais** | Operacional — P1 | Separar as entregas M01–M06 e a autorização de escrita. |

---

## 11. Sprint atual

**M01 · PR #399 em draft.** Reconciliada com a base PWA da #393. O aceite oficial depende do proprietário e da configuração isolada de homologação.

---

## 12. Status atual

O HUB existe e preserva a demonstração de catálogo, conexões e operações locais. O M01 acrescenta o fluxo oficial de OAuth e a consulta somente leitura do Mercado Livre, com ativação desligada por padrão. O aceite oficial segue pendente. [Configuração e evidências M01](../modules/MARKETPLACE_MELI_OAUTH.md)

---

## 13. Métricas de sucesso

| Métrica | Meta |
|---|---|
| Oversell | **< 0.1%** |
| Pedidos importados com sucesso | **> 99%** |
| Latência sync de saldo (venda → desconto no canal) | **< 30s** |
| Conciliação de repasses automática | **> 95%** |
| Reprice rodando sem violar piso configurado | **100%** |

---

## 14. Blockers

| Blocker | Bloqueia |
|---|---|
| Aplicação DevCenter, Preview isolado e vendedor oficial de teste | Aceite M01 |
| Vestuário P03 e confirmação do vínculo | Identificação operacional dos anúncios de variante no M02 |
| Estoque e venda por variante | Conversão de pedidos com variantes no M04 e sincronização no M05 |
| Aceite do proprietário e opt-in da loja | Ativação comercial M06 |

---

## 15. Referências

- [Módulo Marketplace](../modules/MARKETPLACE.md)
- [Relatório técnico M01](../modules/MARKETPLACE_MELI_OAUTH.md)
- [Vestuário P03 · Identificadores e etiquetas](../vestuario/P03_PROPOSTA_CODIGOS_ETIQUETAS.md)
