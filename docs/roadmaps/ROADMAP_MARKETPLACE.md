---
title: Roadmap — HUB Marketplace
hub: marketplace
status: vivo
owner: produto + Sonnet (técnico)
last_update: 2026-05-27
sprint_atual: nenhuma (não iniciado)
---

# 🛍️ Roadmap — HUB Marketplace

> Estrutura conforme [`docs/roadmaps/INDEX.md §2.2`](./INDEX.md). 15 seções obrigatórias.
> Fonte da verdade do estado real: [`docs/ai/CURRENT_STATUS.md`](../ai/CURRENT_STATUS.md).
> **Status global:** HUB ainda **não iniciado** no código (pasta `lib/marketplace*` a criar).

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

- **Adapter unificado** com interface comum (`MarketplaceAdapter`); ML, Shopee, Amazon implementam o mesmo contrato.
- **Estoque virtual por canal** (opcional): reserva X% do saldo para cada canal.
- **Conciliação contábil** integrada ao Financeiro via adapter (`marketplace-conciliacao.ts`).
- **Anúncio com Marketing IA** — gera título/descrição otimizada por canal usando Omni Agent.
- **Sync event-driven** via webhook do marketplace → fila → adapter.

---

## 5. Gaps atuais

**Todo o HUB é gap.** Nada implementado ainda. Estado:

| Gap | Severidade |
|---|---|
| **Sem código** em `lib/marketplace*` | 🔴 P0 |
| **Sem cadastro de canais** no schema | 🔴 P0 |
| **Sem credenciais OAuth** por loja para cada marketplace | 🔴 P0 |
| **Sem adapter de estoque** Marketplace ↔ Estoque | 🔴 P0 |
| **Sem adapter financeiro** repasses → Financeiro | 🔴 P0 |
| **Sem importação de pedidos** | 🔴 P0 |
| **Sem mapeamento de SKU** por canal | 🔴 P0 |
| **Sem reprice nem análise concorrência** | 🟡 P1 |

---

## 6. Funcionalidades futuras

| # | Funcionalidade | Prioridade |
|---|---|---|
| 1 | **Cadastro de canais** + OAuth ML, Shopee, Amazon, Magalu | P0 |
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
| ADR: arquitetura do adapter unificado | M | Discussão Opus |
| Modelar `MarketplaceConta`, `MarketplaceProduto`, `MarketplacePedido` | L | ADR aprovada |
| OAuth Mercado Livre (mais maduro) | M | Conta dev ML |
| Sync saldo ML → Estoque | L | Multi-depósito (Estoque Fase 2) |
| Importação pedidos ML → Venda | L | Adapter pronto |
| Adapter `marketplace-conciliacao` → Financeiro | L | Financeiro Fase 1 fechado |
| OAuth Shopee | M | OAuth ML provado |
| Reprice automático básico | M | Sync saldo funcionando |

---

## 8. Fases

### Fase 1 — Fundação (greenfield)
**Objetivo:** arquitetura do adapter + cadastro de canais + OAuth ML.
**Saída:** ADR aprovada; OAuth ML conectando; tela de "canais conectados" funcional.

### Fase 2 — ML completo (1 marketplace fim-a-fim)
**Objetivo:** Mercado Livre operando 100% — saldo sincronizado, pedidos importados, repasses conciliados.
**Saída:** loja-piloto vendendo no ML pelo OmniGestão.

### Fase 3 — Multi-canal
**Objetivo:** Shopee + Amazon + Magalu na mesma arquitetura.
**Saída:** 4 canais ativos simultâneos.

### Fase 4 — Inteligência
**Objetivo:** reprice automático, anúncio IA, análise concorrência.
**Saída:** preços ajustando automaticamente; novos anúncios gerados em 1 clique.

### Fase 5 — Fulfillment + avançado
**Objetivo:** ML Full, Shopee Logística, multi-conta por canal.

---

## 9. Dependências

| Depende de | Para quê |
|---|---|
| **Estoque** | Sync de saldo — **serial obrigatório** (proibido paralelo per matriz §4) |
| **Financeiro** | Conciliação de repasses (adapter) |
| **Multi-loja** | Cada loja com suas próprias credenciais por canal |
| **Marketing IA** | Geração de anúncios (Fase 4) |
| **Omni Agent** | "Republicar produto X com 10% off" (Fase 4) |
| **BI** | Performance por canal (leitura) |

---

## 10. Riscos

| Risco | Categoria | Mitigação |
|---|---|---|
| **Oversell** (vendido em N canais > saldo) | Negócio — P0 | Estoque virtual + reserva otimista + webhook real-time |
| **Rate limit do marketplace** | Técnico — P1 | Queue + retry exponencial + cache local |
| **Token OAuth expira** sem renovação automática | Técnico — P0 | Refresh token + cron + alerta para humano |
| **Conciliação errada** de repasses causa rombo financeiro | Negócio — P0 | Modo dry-run + revisão humana inicial |
| **API do marketplace muda** sem aviso | Técnico — P1 | Versioning do adapter + testes de integração |
| **Greenfield grande** com escopo aberto vira pântano | Operacional — P0 | Sprint cap: 1 marketplace por vez |

---

## 11. Sprint atual

**Nenhuma.** Próxima sugerida: **SPRINT_NN_MARKETPLACE — ADR + cadastro de canais + OAuth ML** (Fase 1, item 1 do backlog).

---

## 12. Status atual

Marketplace é **greenfield total** — nenhum código escrito. Vai ser um dos maiores HUBs do projeto e exige arquitetura cuidadosa antes de qualquer linha. Tem dependência crítica em Estoque multi-depósito (Fase 2 do Estoque) e em Financeiro com adapter de conciliação. Recomendação: **só iniciar após Onda 1 estar com Fase 1 fechada nos 3 HUBs do núcleo transacional**.

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
| ADR de arquitetura adapter | Tudo |
| Estoque multi-depósito (Fase 2) | Sync de saldo realista |
| Credenciais dev de cada marketplace | OAuth |

---

## 15. Referências

- **ADRs relacionados:** ADR Marketplace Adapter Interface (a criar — alta prioridade)
- **Sprints relacionadas:** — (nenhuma)
- **Docs de módulo:** — (a criar `docs/modules/MARKETPLACE.md`)
- **Memórias persistentes:** — (nenhuma ainda)
- **Governança:** quando iniciado, `lib/marketplace*` core entra na lista de áreas protegidas.
