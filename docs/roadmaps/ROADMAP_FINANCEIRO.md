---
title: Roadmap — HUB Financeiro
hub: financeiro
status: vivo
owner: produto + Sonnet (técnico)
last_update: 2026-05-30
sprint_atual: nenhuma (próxima a planejar)
---

# 💰 Roadmap — HUB Financeiro

> Estrutura conforme [`docs/roadmaps/INDEX.md §2.2`](./INDEX.md). 15 seções obrigatórias.
> Fonte da verdade do estado real: [`docs/ai/CURRENT_STATUS.md`](../ai/CURRENT_STATUS.md).

---

## 1. Visão

> **A engrenagem de reconciliação do ERP: Contas Receber, Contas Pagar, Carteira, Movimento, Ledger — alimentada por PDV, OS e Marketplace via adapters, com auditoria imutável e idempotência por `localKey`.**

Financeiro **não tem UI primária para criar receita** — recebe via adapters de outros HUBs. Sua função é garantir que cada centavo entra com origem rastreável, sai com motivo registrado, e que o saldo bate ao fim do dia.

---

## 2. Objetivos

1. **Idempotência total** — toda materialização (PDV/OS/Marketplace → receivable) pode ser refeita sem duplicar.
2. **Auditoria imutável** — registros nunca são deletados; mudança = `status` novo + `payload.historico[]` apendado.
3. **Saldo bate sempre** — soma de movimentos = saldo de carteira em qualquer instante.
4. **Multi-loja isolado** — toda query escopada por `storeId`; nada vaza entre lojas.
5. **Adapters versionados** — contrato `localKey` estável; mudanças via ADR.

---

## 3. Concorrentes analisados

| Concorrente | O que aprendemos |
|---|---|
| **Conta Azul** | Conciliação bancária OFX simples — referência para Fase 3. |
| **Omie** | Plano de contas hierárquico maduro — adotado parcialmente no importador. |
| **Bling** | Boleto/PIX integrado nativo — referência para Fase 2. |
| **QuickBooks** | DRE/Fluxo de caixa visual — inspiração para BI. |
| **Asaas** | API de cobrança simples — candidato a integração de boleto/PIX. |

---

## 4. Diferenciais

- **`localKey` único por origem** (`os-faturamento:{storeId}:{osId}`, `receber:{storeId}:{localKey}`) — refazer operação não duplica.
- **`payload.historico[]`** apendado em toda mudança de status — auditoria nativa, zero retrabalho.
- **Adapters por origem** (`os-contas-receber.ts`, futuro `marketplace-conciliacao.ts`) — financeiro core não conhece detalhes do que origina o título.
- **Importador de parcelas** com pivot GestaoClick (`Plano_de_contas_1..9`) + `localKey` por parcela + idempotência via `replacePayload`.
- **Crédito de cliente persistente** (`ClienteCredito` + `UsoCreditoCliente`) atômico com devolução/venda.
- **À Prazo Enterprise** com N parcelas + vencimento + entrada — vendido pelo PDV, materializado aqui.

---

## 5. Gaps atuais

| Gap | Severidade | Origem |
|---|---|---|
| **Sem emissão de boleto/PIX** real (cobrança ativa) | 🔴 P0 | gap de produto |
| **Conciliação bancária OFX/CSV** inexistente | 🟡 P1 | gap de produto |
| **DRE / Fluxo de caixa** — dados reais conectados; evolução visual/funcional pendente | 🟡 P1 | gap de UI (não é mock de dados) |
| **Plano de contas hierárquico configurável** parcial — só via importador | 🟡 P1 | inspeção |
| **Contas a Pagar** menos maduro que Receber (sem boleto pago via leitor) | 🟡 P1 | gap de produto |
| **Carteira multi-conta bancária** não modelada explicitamente | 🟢 P2 | gap de modelo |
| **Régua de cobrança** (WhatsApp + e-mail por atraso) ausente | 🟡 P1 | gap de produto |
| **Recibo PDF** estilizado ainda manual | 🟢 P2 | gap de UX |
| **Adapter Marketplace → conciliação** inexistente (HUB Marketplace nem começou) | 🟡 P1 | dependência |
| **Sem fechamento mensal travado** (período pode ser editado retroativamente) | 🟡 P1 | gap de processo |

---

## 6. Funcionalidades futuras

| # | Funcionalidade | Prioridade |
|---|---|---|
| 1 | **Boleto/PIX** via Asaas ou similar (cobrança ativa) | P0 |
| 2 | **Conciliação bancária** OFX/CSV + match automático | P1 |
| 3 | **DRE + Fluxo de caixa** — evoluir UI/UX (dados reais já conectados) | P1 |
| 4 | **Régua de cobrança** automática (X dias antes, no vencimento, em atraso) | P1 |
| 5 | **Plano de contas hierárquico** configurável via UI | P1 |
| 6 | **Fechamento mensal** travado com aprovação | P1 |
| 7 | **Múltiplas contas bancárias** + saldos por conta | P2 |
| 8 | **Recibo PDF** estilizado + envio WhatsApp automático | P2 |
| 9 | **Adapter Marketplace** (conciliação repasses ML/Shopee) | P1 (depende Bloco 13) |
| 10 | **Centro de custos** | P2 |
| 11 | **Forecast IA** (previsão de caixa próximos 30/60/90 dias) | P3 |
| 12 | **Integração contábil** (export Domínio/Alterdata) | P2 |

---

## 7. Backlog

| Item | Tamanho | Pré-req |
|---|---|---|
| Spike Asaas vs Iugu vs PagarMe para boleto/PIX | M | Decisão de provedor (ADR) |
| Modelar `ContaBancaria` + FK em `Movimento` | M | Decisão de modelo |
| Implementar régua de cobrança (cron + templates) | M | WhatsApp HUB Fase 2 |
| UI de plano de contas hierárquico | M | Backend já cobre |
| Tela de fechamento mensal + lock | M | Decisão de quem aprova |
| Parser OFX (importação extrato) | M | Definir bancos suportados |
| DRE — evolução visual/funcional (dados já reais) | L | Plano de contas pronto |
| Adapter `marketplace-conciliacao.ts` | L | Bloco 13 iniciado |
| Recibo PDF + envio WhatsApp | S | Template definido |

---

## 8. Fases

### Fase 1 — Núcleo estável (~80% feita)
**Objetivo:** Receber/Pagar/Carteira/Movimento idempotentes + adapter OS funcional.
**Saída:** ✅ adapters PDV e OS reconciliando · ✅ importador parcelado · ✅ crédito cliente persistente · ✅ À Prazo Enterprise · ✅ financeiro-v2 sobre dados reais (DT-02 paga) · falta: evolução de UI em DRE/Fluxo.

### Fase 2 — Cobrança ativa
**Objetivo:** boleto/PIX + régua de cobrança automática.
**Saída:** título a receber gera boleto em 1 clique; cliente recebe WhatsApp em atraso.

### Fase 3 — Conciliação bancária
**Objetivo:** importar OFX, match automático com movimentos, sugestão para divergências.
**Saída:** > 90% dos lançamentos conciliados automaticamente.

### Fase 4 — Governança financeira
**Objetivo:** fechamento mensal travado, plano de contas hierárquico, multi-conta.
**Saída:** período fechado não permite edição; balancete por centro de custo.

### Fase 5 — Inteligência
**Objetivo:** DRE em tempo real, forecast IA, integração contábil.
**Saída:** dashboard financeiro vivo; export Domínio/Alterdata funcional.

---

## 9. Dependências

| Depende de | Para quê |
|---|---|
| **PDV** | Materialização de receita (adapter compartilhado) |
| **OS** | Faturamento gera receivable (adapter compartilhado) |
| **Marketplace** | Conciliação de repasses (Fase futura) |
| **WhatsApp** | Régua de cobrança (Fase 2) |
| **Multi-loja** | Todo movimento escopado por `storeId` |
| **BI** | Consome dados financeiros agregados (leitura, não bloqueia) |

---

## 10. Riscos

| Risco | Categoria | Mitigação |
|---|---|---|
| **Mudança em `localKey`** quebra idempotência histórica | Técnico — P0 | Versionar via ADR; nunca renomear |
| **Provedor boleto único** = ponto de falha | Negócio — P1 | Arquitetar adapter de cobrança antes de escolher |
| **OFX malformado** de banco específico quebra parser | Técnico — P1 | Validador robusto + fallback CSV manual |
| **Fechamento travado** sem rollback admin gera bloqueio operacional | Operacional — P1 | Liberação com PIN supervisor + auditoria |
| **Drift entre movimento e saldo** sob alta concorrência | Técnico — P0 | Transações atômicas + reconciliação noturna |
| **Régua de cobrança disparando errado** estraga relacionamento | Negócio — P0 | Modo dry-run antes de produção |

---

## 11. Sprint atual

**Nenhuma.** Último marco: importador contas_receber/pagar parcelado (memória registrada).

Próxima sugerida (itens do §6): **Boleto/PIX** (P0) e **evolução de UI DRE/Fluxo** — financeiro-v2 já opera sobre dados reais (DT-02 paga; R0-L5).

---

## 12. Status atual

Financeiro tem **backend sólido** (services + adapters + contracts), idempotência via `localKey`, auditoria via `payload.historico[]`, importador de parcelas funcional, crédito de cliente persistente e À Prazo Enterprise materializando corretamente. A **UI `/dashboard/financeiro-v2`** (Lovable) **opera sobre dados reais** (FinanceiroRealProvider; DT-02 paga) — resta **evolução visual/funcional de DRE/Fluxo**. Cobrança ativa (boleto/PIX) e conciliação bancária são gaps de funcionalidade críticos para sair de "ERP de registro" para "ERP de operação financeira ativa".

---

## 13. Métricas de sucesso

| Métrica | Meta |
|---|---|
| Duplicidade de receivable (mesmo `localKey`) | **0/mês** |
| Drift entre soma de movimentos e saldo de carteira | **R$ 0,00** |
| Vazamento entre lojas (registro com `storeId` errado) | **0/mês** |
| Cobertura de testes unitários adapters | **> 80%** |
| Boletos emitidos com sucesso (pós-Fase 2) | **> 99%** |
| Lançamentos conciliados automaticamente (pós-Fase 3) | **> 90%** |

---

## 14. Blockers

| Blocker | Bloqueia |
|---|---|
| Decisão de provedor de cobrança (ADR) | Fase 2 |
| Modelagem multi-conta bancária | Fase 4 |
| Evolução de UI DRE/Fluxo (financeiro-v2 já sobre dados reais) | Onda 1 considerada completa |

---

## 15. Referências

- **ADRs relacionados:** ADR de provedor de cobrança (a criar)
- **Sprints relacionadas:** entradas "Financeiro", "Contas a Receber", "À Prazo" em `CURRENT_STATUS.md`
- **Docs de módulo:** [`docs/modules/FINANCEIRO.md`](../modules/FINANCEIRO.md)
- **Backend:** [`docs/architecture/BACKEND.md`](../architecture/BACKEND.md)
- **Memórias persistentes:** `project_importador_contas_receber_parcelas`, `project_credito_cliente_persistente`, `project_aprazo_enterprise`, `project_cancelamento_venda_fechamento`, `project_fechamento_caixa_erp_premium`
- **Governança:** `lib/financeiro/*` é área protegida — exige autorização explícita.
