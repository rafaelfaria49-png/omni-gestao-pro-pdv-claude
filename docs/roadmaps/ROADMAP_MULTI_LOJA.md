---
title: Roadmap — HUB Multi-loja (camada transversal)
hub: multi_loja
status: vivo
owner: produto + Sonnet (técnico)
last_update: 2026-05-30
sprint_atual: nenhuma em curso · S-001/S-002 concluídas · próxima = F-04 (webhook por phone_number_id)
---

# 🏬 Roadmap — HUB Multi-loja

> Estrutura conforme [`docs/roadmaps/INDEX.md §2.2`](./INDEX.md). 15 seções obrigatórias.
> Fonte da verdade do estado real: [`docs/ai/CURRENT_STATUS.md`](../ai/CURRENT_STATUS.md).

---

## 1. Visão

> **Camada transversal de isolamento e organização — `storeId` em toda query, header `x-assistec-loja-id` confiável, permissões granulares por loja, transferência entre lojas, e organização ("franquia/matriz") agrupando N lojas.**

Multi-loja **não é um módulo** — é uma **propriedade** do banco e da aplicação. Toda mudança em qualquer HUB tem que respeitar `storeId`; é a regra mais quebrada em ERPs SMB.

---

## 2. Objetivos

1. **Isolamento absoluto** — 0 vazamento de dados entre lojas.
2. **`storeId` confiável** em 100% das queries, mutations, jobs, webhooks.
3. **Permissão granular** — usuário pode ter acesso a 1, N ou todas as lojas com roles diferentes por loja.
4. **Organização (matriz/franquia)** — agrupador de N lojas com relatórios consolidados.
5. **Transferência entre lojas** auditada (estoque, cliente, OS migrada).

---

## 3. Concorrentes analisados

| Concorrente | O que aprendemos |
|---|---|
| **Bling** | Plano "rede" com N lojas — referência. |
| **TinyERP** | Multi-empresa simples — baseline. |
| **Linx Microvix** | Vertical varejo com matriz/filial robusta — referência. |
| **SAP Business One** | Tenant + sub-tenant — referência enterprise. |
| **Conta Azul** | Multi-empresa por usuário — UX simples. |

---

## 4. Diferenciais

- **`storeId` everywhere** — convenção já estabelecida em queries, header `x-assistec-loja-id`, contexto de loja.
- **Idempotência via `localKey` composto com `storeId`** — defesa adicional.
- **Defesa multi-loja em 3 camadas** (importador de produtos) — modelo replicável a outros HUBs.
- **`PdvTerminal` por loja** (multi-terminais Fase 1 ✅) — cada loja tem N PDVs distintos.
- **`AdminUser` separado de `User`** — auth multi-camada por loja.

---

## 5. Gaps atuais

| Gap | Severidade |
|---|---|
| **Resíduo `loja-1` client-side** (PDV/vendas) — vetor **server-side eliminado** (S-001/S-002, ADR-0003) | 🟡 P2 (DT-13) |
| **Sem organização (matriz)** modelada | 🟡 P1 |
| **Permissão por loja granular** ainda incipiente | 🟡 P1 |
| **Transferência entre lojas** inexistente (estoque, OS, cliente) | 🟡 P1 |
| **Auditoria de cross-loja** ausente | 🟡 P1 |
| **Painel matriz** (consolidado N lojas) inexistente | 🟡 P1 |
| **Jobs/cron** sem garantia de `storeId` (alguns globais) | 🟡 P1 |
| **Webhook Meta** usa `WHATSAPP_WEBHOOK_STORE_ID` env fixo (não `phone_number_id`) — **F-04/DT-07**, próxima sprint | 🟡 P1 (→P0 c/ loja-2) |
| **Cliente compartilhado** entre lojas indefinido (CRM Roadmap §10) | 🟡 P1 |

---

## 6. Funcionalidades futuras

| # | Funcionalidade | Prioridade |
|---|---|---|
| 1 | **Auditoria automática** que detecta query sem filtro `storeId` | P0 |
| 2 | **Eliminar fallback `loja-1`** silencioso — ✅ **feito server-side** (S-001/S-002); resta resíduo client-side (DT-13) | ✅ / P2 |
| 3 | **Modelar `Organizacao`** + FK em `Store` | P1 |
| 4 | **Permissão granular** por loja (matriz `User × Store × Role`) | P1 |
| 5 | **Transferência de estoque** entre lojas | P1 |
| 6 | **Transferência de OS** entre lojas | P2 |
| 7 | **Painel matriz** consolidado | P1 |
| 8 | **Webhook routing por `phone_number_id`** | P1 |
| 9 | **Cliente cross-loja** (decisão via ADR) | P1 |
| 10 | **Plano de contas consolidado** por organização | P2 |
| 11 | **SSO entre lojas** da mesma matriz | P2 |
| 12 | **Migração de loja** (export completo + import outra instância) | P3 |

---

## 7. Backlog

| Item | Tamanho | Pré-req |
|---|---|---|
| Lint/linter customizado que detecta `prisma.x.findMany` sem `where.storeId` | M | Decisão de ferramenta |
| Remover resíduo `loja-1` **client-side** (server já lança 400) | S | DT-13 (P2) |
| Modelar `Organizacao` (FK Store→Org) | L | ADR aprovada |
| Tabela `UserStoreRole` (N:N com role por loja) | M | Decisão de roles |
| Rota `/api/ops/stock-transfer` (transferência auditada) | M | Estoque Fase 2 (multi-depósito) |
| Painel matriz (rota `/dashboard/matriz`) | M | Org modelada |
| Webhook router por `phone_number_id` | S | — |

---

## 8. Fases

### Fase 1 — Higiene de isolamento (quase fechada)
**Objetivo:** zero vazamento; zero fallback silencioso; auditoria automática.
**Saída:** sem `loja-1` **server-side** ✅ + (pendente) webhook por `phone_number_id` (F-04) + resíduo client-side (DT-13) + lint customizado (BL-08, hoje P2) + alerta em jobs globais.
**Status:** vetor server-side eliminado (S-001/S-002, ADR-0003). Falta F-04 + resíduo client-side para fechar.

### Fase 2 — Permissão granular + organização
**Objetivo:** `Organizacao` modelada + permissão por loja.

### Fase 3 — Transferências e consolidado
**Objetivo:** transferência estoque/OS + painel matriz.

### Fase 4 — Cross-loja avançado
**Objetivo:** cliente cross-loja, SSO matriz, plano de contas consolidado.

### Fase 5 — Migração / portabilidade
**Objetivo:** export/import completo de uma loja (LGPD, troca de instância).

---

## 9. Dependências

| Depende de | Para quê |
|---|---|
| **Todos os HUBs** | Multi-loja é regra transversal — todo HUB deve respeitar |
| **Estoque** | Transferência entre lojas (Fase 3) — serial |
| **CRM** | Cliente cross-loja (Fase 4) — decisão ADR |
| **WhatsApp** | Roteamento `phone_number_id` (Fase 1) |
| **BI** | Painel matriz consolidado (Fase 3) |

**Bloqueia todos** quando muda regra de isolamento — sprint dedicada obrigatória (matriz §4 do INDEX).

---

## 10. Riscos

| Risco | Categoria | Mitigação |
|---|---|---|
| **Query sem `storeId`** vaza dado entre tenants | Negócio/legal — P0 | Lint + revisão de PR + auditoria automática |
| **`loja-1` fallback** silencioso grava em loja errada | Negócio — P0 | **Mitigado server-side** (erro 400; S-001/S-002). Resta resíduo client-side (DT-13, P2) |
| **Migração de schema** (FK Org→Store, UserStoreRole) impacta tudo | Técnico — P0 | Janela + rollback testado + backfill atômico |
| **Performance multi-loja** consolidada cai com volume | Técnico — P1 | Materialized views por org |
| **Permissão errada** dá acesso à loja errada | Segurança — P0 | Testes E2E por persona |
| **Webhook Meta** continuar com env fixo após N lojas | Operacional — P0 | Router por `phone_number_id` antes da 2ª loja com WhatsApp |

---

## 11. Sprint atual

**Nenhuma em curso.** **Concluídas:** SPRINT_MULTI_LOJA-S-001 (F-01/F-02/F-05/F-06/F-07/F-14 — fallback server eliminado + ACL; ADR-0003) e SPRINT_MULTI_LOJA-S-002 (F-03 proxy cookie + F-02-anchor exportar).

**Próxima sugerida (J3):** **SPRINT_NN_MULTI_LOJA — F-04: webhook routing por `phone_number_id`** (P1→P0 antes de loja-2 ativar WhatsApp). Depois: resíduo client-side (DT-13), F-08 (sync-legacy-financeiro), F-10 (auditoria de dados em produção — pré-req da 2ª loja real).

---

## 12. Status atual

Multi-loja tem **convenção sólida** + **isolamento server-side fechado**: o fallback silencioso `loja-1` em leituras de API foi **eliminado** (S-001/S-002, ADR-0003), com guard `400` e ACL `canAccessStore` nas rotas sensíveis; proxy cookie corrigido (F-03). **Não está 100% livre de `loja-1`**: resta (a) resíduo `LEGACY_PRIMARY_STORE_ID` **client-side** em PDV/vendas (DT-13, P2, risco menor) e (b) **webhook WhatsApp** single-store por env fixo (F-04/DT-07, P1 → P0 quando loja-2 ativar WhatsApp). Organização (matriz/franquia) e permissão granular ainda não modeladas. Continua o HUB de maior risco de incidente legal — **resolver F-04 antes de habilitar WhatsApp na loja-2**.

---

## 13. Métricas de sucesso

| Métrica | Meta |
|---|---|
| Queries sem filtro `storeId` em código de produção | **0** |
| Ocorrências de fallback `loja-1` em produção | server-side **0 ✅** · client-side **pendente** (DT-13) · webhook **pendente** (F-04) |
| Vazamentos detectados (registro de loja A visto na loja B) | **0** |
| Tempo de execução do lint customizado | **< 30s** |
| Cobertura de testes E2E de isolamento | **100%** das rotas de leitura sensível |

---

## 14. Blockers

| Blocker | Bloqueia |
|---|---|
| Mapeamento de ocorrências `loja-1` — ✅ feito (auditoria + R0); server eliminado, resíduo em DT-13 | — (destravado) |
| ADR `Organizacao` (modelo) | Fase 2 |
| Decisão "cliente cross-loja" (cross-ref CRM) | Fase 4 |

---

## 15. Referências

- **ADRs relacionados:** **ADR-0003** (eliminar fallback `LEGACY_PRIMARY_STORE_ID` — aceito); ADR organização matriz (a criar); ADR cliente cross-loja (a criar; ver CRM §14)
- **Sprints relacionadas:** SPRINT_MULTI_LOJA-S-001 + S-002 (concluídas; ADR-0003) · próxima: F-04
- **Memórias persistentes:**
  - `project_importador_produtos_match_seguro` (defesa 3 camadas — modelo replicável)
  - `project_pdv_multi_terminais_fase1` (terminalId por loja)
  - `project_pdv_multi_terminais_fase2_lock` (lock per loja)
- **Governança:** multi-loja toca **todos** os HUBs — mudança em isolamento exige sprint dedicada (matriz §4 do INDEX).
