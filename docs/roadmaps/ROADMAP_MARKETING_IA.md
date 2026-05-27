---
title: Roadmap — HUB Marketing IA
hub: marketing_ia
status: vivo
owner: produto + Sonnet (técnico)
last_update: 2026-05-27
sprint_atual: nenhuma (a iniciar)
---

# 📣 Roadmap — HUB Marketing IA

> Estrutura conforme [`docs/roadmaps/INDEX.md §2.2`](./INDEX.md). 15 seções obrigatórias.
> Fonte da verdade do estado real: [`docs/ai/CURRENT_STATUS.md`](../ai/CURRENT_STATUS.md).

---

## 1. Visão

> **Marketing operacional onde o cliente já está (WhatsApp) — campanhas personalizadas, segmentação dinâmica do CRM, criativos gerados por IA, ROI medido por venda.**

Marketing IA não é "fazer post bonito". É **gerar pedido**: aniversariante recebe cupom, inativo recebe oferta, comprador frequente recebe novidade — tudo medindo conversão real via venda registrada no PDV.

---

## 2. Objetivos

1. **Conversão medida em R$** — campanha → cliente → venda no PDV (atribuição rastreada).
2. **Segmentação dinâmica** via tags/filtros do CRM.
3. **Criativos por IA** — copy, imagem, descrição via Omni Agent.
4. **Multi-canal** — WhatsApp primário, e-mail e SMS secundários.
5. **Régua de cobrança/recompra** automática.

---

## 3. Concorrentes analisados

| Concorrente | O que aprendemos |
|---|---|
| **RD Station Marketing** | Automação de fluxos + scoring — referência. |
| **Mailchimp** | Editor visual de e-mail — referência para Fase 2. |
| **ActiveCampaign** | Régua de automação cross-canal — referência. |
| **Maddie / Take Blip** | WhatsApp marketing com IA — concorrente direto. |
| **Bling Marketing** | Funcionalidades simples no ERP — referência baseline. |

---

## 4. Diferenciais (planejados)

- **IA nativa** via OpenRouter/OpenAI — gera copy e imagens (gerador de imagens já operacional em `components/ia-mestre/views/GeradorImagensView.tsx`).
- **Atribuição de venda** — cupom usado no PDV vincula venda à campanha.
- **Segmentação CRM dinâmica** — segmento é filtro vivo, não lista estática.
- **Templates Meta integrados** — campanhas em massa respeitam compliance.
- **Régua de recompra** baseada em ticket médio + frequência do cliente.
- **Custo por crédito** já modelado (`src/lib/ai/credit-costs.ts`, `lib/ia-mestre/credit-costs.ts`).

---

## 5. Gaps atuais

| Gap | Severidade |
|---|---|
| **Sem orquestrador de campanha** (fluxo, agendamento, batch) | 🔴 P0 |
| **Sem atribuição de venda** (cupom → venda) | 🔴 P0 |
| **Sem segmentação dinâmica** (depende CRM Fase 2) | 🟡 P1 |
| **Gerador de imagens** existe mas não integrado a campanhas | 🟡 P1 |
| **Sem editor visual** de mensagem | 🟢 P2 |
| **Sem A/B teste** | 🟢 P2 |
| **Sem régua de recompra** automática | 🟡 P1 |
| **Sem ROI dashboard** | 🟡 P1 |
| **E-mail / SMS** inexistentes | 🟢 P2 |

---

## 6. Funcionalidades futuras

| # | Funcionalidade | Prioridade |
|---|---|---|
| 1 | **Orquestrador** (campanha = segmento + criativo + canal + agendamento) | P0 |
| 2 | **Atribuição** cupom → venda no PDV | P0 |
| 3 | **Régua aniversário** (gatilho automático) | P1 |
| 4 | **Régua recompra** (cliente comprou há X dias) | P1 |
| 5 | **Criativos IA** integrados (copy + imagem por canal) | P1 |
| 6 | **ROI dashboard** (R$ gerado / campanha) | P1 |
| 7 | **Editor visual** de mensagem | P2 |
| 8 | **A/B teste** (2 variações, mede conversão) | P2 |
| 9 | **E-mail SMTP** | P2 |
| 10 | **SMS** (Twilio/Zenvia) | P3 |
| 11 | **Push** (PWA) | P3 |
| 12 | **Programa de indicação** (cliente indica, ganha crédito) | P2 |

---

## 7. Backlog

| Item | Tamanho | Pré-req |
|---|---|---|
| Modelar `Campanha`, `CampanhaExecucao`, `CampanhaAtribuicao` | M | ADR de modelo |
| Orquestrador (cron + batch + retry) | L | WhatsApp Fase 2 (orquestrador compartilhado?) |
| Atribuição cupom no PDV | M | Validar fluxo de desconto/cupom |
| Régua aniversário | S | Orquestrador pronto |
| Régua recompra | M | Definir lógica (ticket médio × frequência) |
| Integrar gerador imagens à criação de campanha | M | Gerador atual já operacional |
| ROI dashboard | M | Atribuição funcional |

---

## 8. Fases

### Fase 1 — Fundação
**Objetivo:** orquestrador básico + 1 régua (aniversário) + atribuição.
**Saída:** loja-piloto enviando aniversário e medindo conversão.

### Fase 2 — Réguas múltiplas + IA criativa
**Objetivo:** recompra, inativos, novidades + integração gerador imagens.
**Saída:** 5+ réguas ativas; criativos gerados em 1 clique.

### Fase 3 — ROI + A/B
**Objetivo:** dashboard ROI por campanha; A/B teste padrão.
**Saída:** decisão de campanha baseada em dado, não opinião.

### Fase 4 — Multi-canal
**Objetivo:** e-mail e SMS além de WhatsApp.
**Saída:** mesma campanha, 3 canais, atribuição unificada.

### Fase 5 — Avançado
**Objetivo:** push PWA, programa de indicação, scoring de lead.

---

## 9. Dependências

| Depende de | Para quê |
|---|---|
| **CRM** | Segmentação dinâmica — bloqueante se segmentos não existem |
| **WhatsApp** | Canal primário — orquestrador pode ser compartilhado |
| **PDV** | Atribuição (cupom usado vincula venda à campanha) |
| **Omni Agent** | Gerador de criativos (copy/imagem) |
| **Financeiro** | Custo da campanha vs receita gerada |
| **BI** | Visualização agregada de ROI |

---

## 10. Riscos

| Risco | Categoria | Mitigação |
|---|---|---|
| **Disparar para opt-out** = banimento Meta | Negócio — P0 | Checagem obrigatória contra `OptOut` antes de enviar |
| **Atribuição errada** infla ROI falsamente | Negócio — P1 | Janela de atribuição clara (ex: 7 dias do cupom) |
| **Custo IA descontrolado** (créditos OpenAI) | Negócio — P1 | Limite por loja + alerta em `credit-costs` |
| **Campanha disparada em produção sem teste** | Operacional — P0 | Modo dry-run obrigatório + aprovação humana |
| **Concorrência entre régua aniversário + manual** envia duplicado | Técnico — P1 | Dedup por cliente + janela |

---

## 11. Sprint atual

**Nenhuma.** Próxima sugerida: **SPRINT_NN_MARKETING_IA — Orquestrador básico + régua aniversário + atribuição cupom**.

---

## 12. Status atual

Marketing IA tem **gerador de imagens funcional** (em `ia-mestre`), modelo de custo por crédito (`credit-costs.ts`), mas **nenhum orquestrador de campanha** — não existe ainda o "enviar para segmento X com criativo Y agendado para amanhã". Atribuição de conversão também está zero. É **HUB de alto ROI quando pronto**, mas exige antes: WhatsApp Fase 2 (massa), CRM Fase 2 (segmentação), PDV cupom validado.

---

## 13. Métricas de sucesso

| Métrica | Meta |
|---|---|
| Campanhas com atribuição rastreada | **100%** |
| Envios para opt-out | **0** |
| ROI médio das campanhas (R$ gerado / R$ custo) | **> 5x** |
| Taxa de abertura WhatsApp | **> 80%** |
| Conversão das réguas automáticas | **> 5%** |
| Custo IA / campanha vs orçamento aprovado | **< 100%** |

---

## 14. Blockers

| Blocker | Bloqueia |
|---|---|
| WhatsApp Fase 2 (orquestrador) | Disparo em massa |
| CRM Fase 2 (segmentação) | Segmentos dinâmicos |
| Fluxo cupom PDV documentado | Atribuição |

---

## 15. Referências

- **ADRs relacionados:** ADR modelo de campanha + atribuição (a criar)
- **Sprints relacionadas:** entradas "IA Mestre", "Gerador de Imagens" em `CURRENT_STATUS.md`
- **Docs de módulo:** [`docs/ai/CURRENT_STATUS.md`](../ai/CURRENT_STATUS.md) (IA Mestre)
- **Código atual relevante:**
  - `components/ia-mestre/views/GeradorImagensView.tsx` (gerador imagens)
  - `src/lib/ai/credit-costs.ts`, `lib/ia-mestre/credit-costs.ts` (modelo de custo)
  - `lib/ia-mestre/debit-turn-credits.ts`
- **Memórias persistentes:** — (nenhuma específica ainda)
- **Governança:** custo de IA exige monitoramento — sempre logar consumo de tokens/créditos por execução.
