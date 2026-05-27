---
title: Roadmap — HUB CRM / Cadastros
hub: crm
status: vivo
owner: produto + Sonnet (técnico)
last_update: 2026-05-27
sprint_atual: nenhuma (próxima a planejar)
---

# 👥 Roadmap — HUB CRM / Cadastros

> Estrutura conforme [`docs/roadmaps/INDEX.md §2.2`](./INDEX.md). 15 seções obrigatórias.
> Fonte da verdade do estado real: [`docs/ai/CURRENT_STATUS.md`](../ai/CURRENT_STATUS.md).

---

## 1. Visão

> **O cliente único — PF/PJ, com histórico 360° (vendas, OSs, créditos, conversas WhatsApp, segmentação), alimentando todos os outros HUBs.**

CRM é o **fundo do funil** que alimenta tudo: PDV, OS, Marketing IA, WhatsApp. É o HUB mais lido e menos escrito do ERP — precisa ser **muito rápido para consultar** e **muito rigoroso para criar/alterar** (duplicidade arruína todos os relatórios).

---

## 2. Objetivos

1. **Cliente único** — anti-duplicidade por CPF/CNPJ + telefone + e-mail.
2. **Histórico 360°** — vendas, OS, recebimentos, crédito, conversas WhatsApp num só lugar.
3. **Segmentação real** — tags + filtros para Marketing IA disparar campanhas.
4. **Crédito persistente** — `ClienteCredito` + `UsoCreditoCliente` no DB (já implementado).
5. **Importação resiliente** — migrar 10k+ clientes sem duplicar nem corromper.

---

## 3. Concorrentes analisados

| Concorrente | O que aprendemos |
|---|---|
| **HubSpot** | Timeline 360° do cliente — referência. |
| **RD Station** | Segmentação dinâmica + automação — referência para Fase 3. |
| **Pipedrive** | Pipeline visual simples — útil para vendas B2B (Fase 4). |
| **GestaoClick** | Pivot de plano de contas no importador — adotado. |
| **Sankhya** | Cadastro PF/PJ unificado — referência. |

---

## 4. Diferenciais

- **Modal PF/PJ unificado** com máscara automática (CPF/CNPJ).
- **`totalGasto` real** somando OS + Venda (FK `Venda.clienteId` adicionada ao schema).
- **Crédito de cliente persistente** com transações atômicas (devolução/venda).
- **HUB Cadastros Lovable** com UX premium (`/dashboard/cadastros-v2`).
- **Importador defensivo** com chave forte/fraca, defesa multi-loja em 3 camadas, modo "criar" padrão.

---

## 5. Gaps atuais

| Gap | Severidade |
|---|---|
| **Sem deduplicação automática** retroativa | 🟡 P1 |
| **Tags / segmentação** sem UI | 🟡 P1 |
| **Histórico 360° em uma tela só** ainda parcial | 🟡 P1 |
| **Sem campos customizáveis** por loja | 🟢 P2 |
| **Aniversário, datas comemorativas** sem trigger | 🟡 P1 |
| **Sem score / NPS** | 🟢 P2 |
| **Sem timeline de contatos** (ligações, conversas, atendimentos) | 🟡 P1 |
| **Endereço sem CEP→logradouro** automático (alguns telas) | 🟢 P2 |
| **Importador clientes** existe mas sem matching avançado (similaridade nome) | 🟢 P2 |

---

## 6. Funcionalidades futuras

| # | Funcionalidade | Prioridade |
|---|---|---|
| 1 | **Tags + segmentação dinâmica** (UI + backend) | P1 |
| 2 | **Tela 360°** consolidada (vendas, OS, crédito, conversas) | P1 |
| 3 | **Deduplicação assistida** (sugestão de merge) | P1 |
| 4 | **Aniversário + datas** com trigger Marketing IA | P1 |
| 5 | **Campos customizáveis** por loja | P2 |
| 6 | **Score / NPS** automático | P2 |
| 7 | **Timeline de contatos** (chamada, WhatsApp, e-mail) | P2 |
| 8 | **Pipeline B2B** (lead → oportunidade → cliente) | P2 |
| 9 | **CEP → logradouro** automático em todos formulários | P2 |
| 10 | **Exportação LGPD** (cliente pede dados → 1 clique) | P1 |

---

## 7. Backlog

| Item | Tamanho | Pré-req |
|---|---|---|
| Modelar `Tag` + relação N:N com Cliente | M | — |
| UI de tags + filtros | M | Backend pronto |
| Tela 360° (consolidada) | M | FK `Venda.clienteId` ✅ |
| Deduplicação assistida (sugere merges) | L | Algoritmo de similaridade |
| Aniversário → trigger Marketing IA | S | WhatsApp HUB Fase 2 |
| Exportação LGPD (1 clique) | M | Mapeamento completo de dados pessoais |
| Campos custom por loja (`payload` JSONB) | M | Decisão de schema |

---

## 8. Fases

### Fase 1 — Base estabilizada (~80% feita)
**Objetivo:** modal PF/PJ, FK Venda→Cliente, crédito persistente, importador defensivo.
**Saída:** ✅ todos os marcos cumpridos; gap restante = tela 360°.

### Fase 2 — Segmentação
**Objetivo:** tags + filtros + segmentos salvos.
**Saída:** Marketing IA dispara campanha para "segmento X".

### Fase 3 — Inteligência relacional
**Objetivo:** deduplicação assistida, aniversário automático, score.

### Fase 4 — B2B
**Objetivo:** pipeline de oportunidades para clientes corporativos.

### Fase 5 — Compliance e custom
**Objetivo:** LGPD (export/delete), campos customizáveis, integração CRM externo.

---

## 9. Dependências

| Depende de | Para quê |
|---|---|
| **PDV** | FK `Venda.clienteId` (já cumprido) |
| **OS** | Cliente na OS (já cumprido) |
| **Financeiro** | Crédito + receivable do cliente |
| **WhatsApp** | Conversas no histórico 360° |
| **Marketing IA** | Consome segmentos |
| **Multi-loja** | Cliente pode ser por loja ou por organização (decisão pendente) |

---

## 10. Riscos

| Risco | Categoria | Mitigação |
|---|---|---|
| **Merge de duplicados** corrompe histórico (vendas órfãs) | Técnico — P0 | Merge transacional + auditoria + reversível |
| **Cliente compartilhado entre lojas** vaza dados entre tenants | Negócio — P0 | Decisão clara via ADR antes de implementar |
| **Importador massivo** cria duplicidade | Técnico — P0 | ✅ Travado por defesa de 3 camadas + modo "criar" |
| **LGPD: delete sem auditoria** quebra integridade referencial | Legal — P0 | Soft-delete + retenção legal de notas fiscais |
| **Sync com CRM externo** (futuro) bidirecional cria conflitos | Técnico — P1 | Adoção de adapter unidirecional inicialmente |

---

## 11. Sprint atual

**Nenhuma.** Próxima sugerida: **SPRINT_NN_CRM — Tela 360° do cliente** (consolidar vendas + OS + crédito + conversas).

---

## 12. Status atual

CRM tem **base sólida**: modal PF/PJ, FK Venda→Cliente, crédito persistente atômico, HUB Lovable premium, importador defensivo com modo "criar" e 3 camadas de defesa multi-loja. Gaps principais são de **inteligência relacional**: tags/segmentação, tela 360°, deduplicação assistida, gatilhos por data. Cliente é alimentado por PDV/OS corretamente — falta extrair valor consultando esse dado para Marketing IA e WhatsApp.

---

## 13. Métricas de sucesso

| Métrica | Meta |
|---|---|
| Clientes duplicados (mesmo CPF/CNPJ) | **0** |
| Vendas órfãs (sem `clienteId`) | **0** |
| `totalGasto` divergente da soma real | **R$ 0** |
| Tempo de carregamento da tela 360° | **< 800 ms** |
| Campanhas Marketing IA por segmentação ativa | **> 5/mês** (pós-Fase 2) |
| Solicitações LGPD atendidas em < 7 dias | **100%** |

---

## 14. Blockers

| Blocker | Bloqueia |
|---|---|
| Decisão "cliente por loja vs por organização" | Multi-loja avançado |
| WhatsApp HUB Fase 2 | Conversas no histórico 360° |
| Algoritmo de similaridade | Deduplicação assistida |

---

## 15. Referências

- **ADRs relacionados:** ADR cliente-por-loja-vs-organização (a criar)
- **Sprints relacionadas:** entradas "Cadastros", "Cliente" em `CURRENT_STATUS.md`
- **Memórias persistentes:** `project_cadastros_ux_e_venda_cliente`, `project_credito_cliente_persistente`, `project_importador_produtos_match_seguro` (mesma defesa multi-loja aplicada a produtos)
- **Governança:** dados de cliente caem sob LGPD — qualquer mudança em retenção/exportação exige consulta legal.
