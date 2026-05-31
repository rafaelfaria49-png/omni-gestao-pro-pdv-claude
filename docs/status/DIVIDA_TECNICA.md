---
title: Dívida Técnica — Tracking vivo
status: vivo
owner: produto + Sonnet
last_update: 2026-05-31
fonte_overview: docs/ai/CURRENT_STATUS_OVERVIEW.md §5
---

# 🧾 Dívida Técnica — Tracking vivo

> **O que é dívida técnica aqui:** atalho consciente assumido para entregar antes, com custo de manutenção a pagar depois.
> **O que NÃO é dívida técnica:** bug em produção (vai para `BLOCKERS.md`), risco (vai para `RISCOS.md`), mock UI (vai para `MOCKS_TRACKING.md`).

> **Atualização obrigatória:** ao abrir/encerrar sprint que cria ou paga dívida.

---

## 1. Convenção

### 1.1 Severidade
- **P0** — bloqueia release / risco financeiro/fiscal / vazamento → pagar < 7 dias
- **P1** — alto custo de manutenção → pagar < 30 dias
- **P2** — incomoda, não trava → próximo ciclo
- **P3** — melhoria → quando der

### 1.2 Estados
- 🆕 nova · ⏳ pendente · 🔄 em pagamento (sprint ativa) · ✅ paga · 🚫 aceita (decisão consciente, não paga)

### 1.3 Naming
`DT-<NN>` sequencial. Não reordenar (id é estável).

---

## 2. Dívidas ativas

| # | Título | HUB | Severidade | Estado | Aberta em | Sprint alvo | Notas |
|---|---|---|---|---|---|---|---|
| DT-01 | PDV Next (Black Edition) sem persistência server-side | PDV | P0 | ⏳ | 2026-05-19 | SPRINT_NN_PDV | localStorage only; risco de venda perdida |
| DT-04 | Rota legada `/dashboard/os` paralela à oficial | Operações/OS | P1 | ⏳ | 2026-04-xx | SPRINT_NN_OS | ADR-0001 diz que oficial é `/operacoes-v2` |
| DT-05 | PIN supervisor contra `User.pin` (não `AdminUser`) | PDV / Auth | P1 | ⏳ | 2026-05-xx | a planejar | Memória `project_vendas_hub_correcao_operacional` |
| DT-06 | Item Avulso sem CFOP/categoria padrão | PDV | P2 | ⏳ | 2026-05-23 | bloqueia Fase 2 fiscal PDV | — |
| DT-07 | Webhook WhatsApp por env fixo (não por `phone_number_id`) | WhatsApp / Multi-loja | P1 | ⏳ | 2026-05-09 | SPRINT_NN_MULTI_LOJA (F-04) | = **F-04**. Vira **P0** quando loja-2 (Rafa Brinquedos, já ativa) ligar WhatsApp. Próxima sprint do HUB (J3) |
| DT-08 | Sem multi-depósito no Estoque | Estoque | P0 | ⏳ | herdada | SPRINT_NN_ESTOQUE | Bloqueia adapter Marketplace |
| DT-09 | budget-policy-service com regras hardcoded | OS | P1 | ⏳ | herdada | a planejar | Falta UI por loja |
| DT-10 | Pool de executores Omni Agent pequeno | Omni Agent | P1 | ⏳ | herdada | a planejar | Só `recebimentoFinanceiro` real |
| DT-11 | Painel inicial com mocks misturados | BI | P0 | ⏳ | herdada | SPRINT_NN_BI | Confunde decisão de negócio |
| DT-12 | Mocks no `lib/utils.ts` Lovable excluídos do tsc | Lovable | P3 | 🚫 | herdada | aceito | Decisão de isolamento documentada no CLAUDE.md |
| DT-15 | Resíduo `LEGACY_PRIMARY_STORE_ID` client-side (marketing/config/onboarding/cadastros) | Multi-loja | P2 | ⏳ | 2026-05-31 | a planejar | Mesma natureza do DT-13, outros módulos: `marketing/page.tsx:70`, `configuracoes-sistema.tsx:230/732/1147`, `centro-personalizacao-financeira-rafacell.tsx:102`, `importador-dados-externos.tsx:2602`, `first-access-wizard.tsx:24`, `CadastrosHub.tsx:77/248` (6 arq./9 sites). ⚠️ algumas telas de Config já têm `UnidadeAtivaRequiredBanner` — verificar guard por arquivo (não copiar cego). NÃO inclui F-11 (`lib/loja-ativa.tsx`, o provider-fonte) nem F-15 (server) |

---

## 3. Dívidas pagas (histórico — últimos 90 dias)

| # | Título | Paga em | Sprint que pagou |
|---|---|---|---|
| DT-02 | `/dashboard/financeiro-v2` "mock" — UI plugada a dados reais (FinanceiroRealProvider) | ~2026-05 (pré-baseline) | migração real-data (ef44def→417872b) |
| DT-03 | Fallback `storeId="loja-1"` silencioso — vetor **server-side** de leitura de API | 2026-05-29→30 | SPRINT_MULTI_LOJA-S-001 + S-002 · ADR-0003 |
| DT-14 | Fallback `?? "loja-1"` server-side em `carteiras/*` + `dre/route` (forma nullish que escapou da S-001) | 2026-05-30 | DT-14 (SAFE-lite reforçado) · ADR-0003 |
| DT-13 | Resíduo `LEGACY_PRIMARY_STORE_ID` client-side em **PDV/vendas** (4 telas) | 2026-05-31 | DT-13 (SAFE-lite) · ADR-0003 |

> **Nota DT-03 + DT-14 (server-side fechado — J4):** o vetor **server-side** de `loja-1` está **100% eliminado**. A S-001/S-002 cobriu a forma `|| "loja-1"`; **DT-14** fechou a forma **nullish** `?? "loja-1"` que havia escapado em `carteiras/*` + `dre/route.ts` (o teste/áudit da S-001 só varria `||`, e o resíduo era multi-linha). Hoje **zero** literal `"loja-1"` de código em `app/api/**` (resta só 1 comentário em `exportar/route.ts`).

> **Nota DT-13 (client PDV/vendas pago — J4) — ⚠️ client-side NÃO está 100% limpo:** o **DT-13** eliminou o fallback `LEGACY_PRIMARY_STORE_ID` nas **4 telas de PDV/vendas** (`vendas-arquivo-geral`, `venda-completa-enterprise`, `pdv-venda-completa-enterprise`, `pdv-assistencia-enterprise`) — agora `(lojaAtivaId ?? "").trim()`, guard estático em `lib/multi-loja-client-no-legacy-fallback.test.ts`. **Permanece resíduo client-side** em **marketing/config/onboarding/cadastros** (→ **DT-15**, P2, 6 arq.), no provider-fonte `lib/loja-ativa.tsx` (**F-11**) e em `lib/stores-api-access.ts` (**F-15**, server, onboarding-only). **Não declarar o client-side como 100% encerrado.** Pendente de integração: **webhook WhatsApp** single-store (→ DT-07/F-04, P1, vira P0 com loja-2). Multi-loja **não está 100% livre de `loja-1`** fora do servidor.

> **Nota DT-02 (R0-L5):** evidência code-structural (não runtime): hub lê de `/api/financeiro/*` via `FinanceiroRealProvider` (16 fetches; 0 dados hardcoded; sem fallback fake; init em arrays vazios). **Observação:** **DRE / Fluxo de caixa** têm dados reais conectados, mas **evolução visual/funcional ainda pendente** (`ROADMAP_FINANCEIRO` §6/§8) — maturidade de UI, **não** mock.

---

## 4. Dívidas aceitas (não pagar — decisão consciente)

| # | Título | Razão | ADR |
|---|---|---|---|
| DT-12 | Mocks Lovable excluídos do tsc | Isolamento intencional do hub; benefício > custo | — (decisão documentada no CLAUDE.md) |

---

## 5. Como abrir uma nova dívida

1. Identifique o atalho assumido **na própria sprint que cria** (não esquecer).
2. Adicione linha em §2 com próximo `DT-NN`.
3. Referencie no §7 do relatório de encerramento da sprint.
4. Atualize `CURRENT_STATUS_OVERVIEW.md §5` se for P0/P1.

---

## 6. Como pagar uma dívida

1. Sprint dedicada ou item dentro de sprint maior.
2. Mover da tabela §2 para §3 com data e sprint.
3. Atualizar roadmap do HUB (remover do "gaps").
4. Atualizar `CURRENT_STATUS_OVERVIEW.md §5`.

---

## 7. Fonte da verdade

- **Tracking de dívida:** este arquivo.
- **Overview:** `docs/ai/CURRENT_STATUS_OVERVIEW.md §5`.
- **Detalhe por HUB:** `docs/roadmaps/ROADMAP_<HUB>.md §5 (gaps)`.
