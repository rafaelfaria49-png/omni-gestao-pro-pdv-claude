# Módulo — Operações (HUB V2)

## Resumo executivo

O **Operações HUB V2** roda em `/dashboard/operacoes-v2` como **sub-app Lovable isolado** (React Router `MemoryRouter`) dentro do Next.js.

## O que já funciona

- Kanban de OS + mudança de status
- Detalhe da OS com timeline e painéis (orçamento, observações, anexos, modais)
- Parte **real** de OS: status + payload persistidos via **Server Actions + Prisma**
- Cadastros reais alimentando: clientes, técnicos, serviços, produtos/modelos (leitura)
- Faturamento (ponte): aprovação/recusa de orçamento grava intenção no payload e **adapter server-side** materializa Conta a Receber real de forma idempotente (Prisma)

## O que ainda é mock (no HUB)

- Estoque/peças (DB em memória + seeds)
- Vendas/faturamento do hub (DB em memória)
- Atendimentos rápidos, lojas, notificações, integrações (ex.: WhatsApp) em modo mock/placeholder

## Riscos atuais

- **Duplicação de “OS”**: HUB V2 vs OS clássica do dashboard (modelos/status/fonte de dados diferentes)
- **Duas vias backend**: Server Actions (usadas pelo HUB) vs API routes `/api/ordens-servico/*` (automations/event bus)
- **Status (granularidade)**: pipeline do HUB é mais rico que o enum Prisma (4 estados). Foi criada uma camada de normalização que preserva o status operacional no payload (ver relatórios).
- Tema: sincronização via `<html>` + tokens locais; risco de side effects e inconsistências por cores fixas pontuais

## Próximo passo recomendado

- Check-in painel por painel (o que dispara mutação real vs UI/toast)
- Plano de convergência: uma “fonte de verdade” para OS e eventos (evitar duplicações)

## Relatório técnico

Ver:

- `docs/modules/reports/OPERACOES_HUB_V2_CHECKIN.md`
- `docs/modules/reports/OPERACOES_HUB_V2_STATUS_NORMALIZATION.md`
- `docs/modules/reports/OPERACOES_HUB_V2_ANEXOS_REAL.md`
- `docs/modules/reports/OPERACOES_HUB_V2_FATURAMENTO_CHECKIN.md`
- `docs/modules/reports/OPERACOES_HUB_V2_OS_CONTAS_RECEBER_ADAPTER.md`
- `docs/modules/reports/OPERACOES_BACKEND_MODULARIZATION.md`
- `docs/modules/reports/OPERACOES_HUB_V2_ORCAMENTO_APROVADO_POLICY.md`
- `docs/modules/reports/OPERACOES_HUB_V2_ESTOQUE_CHECKIN.md`
- `docs/modules/reports/OPERACOES_HUB_V2_OS_ESTOQUE_ADAPTER.md`
- `docs/modules/reports/OPERACOES_HUB_V2_PECAS_PRODUTO_REAL.md`
- `docs/modules/reports/OPERACOES_HUB_V2_ESTOQUE_RESTORE_DELTA.md`

