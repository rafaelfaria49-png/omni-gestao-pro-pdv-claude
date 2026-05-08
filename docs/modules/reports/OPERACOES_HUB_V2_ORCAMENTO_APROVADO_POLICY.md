# Operações HUB V2 — Política de Orçamento Aprovado (sem migration)

**Objetivo:** definir e implementar uma política segura para alterações em **orçamentos já aprovados**, preservando histórico, mantendo idempotência do faturamento e evitando duplicidade em Contas a Receber.

**Restrições:** sem alterar Prisma schema, sem mexer em UX/Frontend, sem criar novas contas, sem deletar contas.

---

## 1) Problema

O HUB já criava `faturamento*` no payload ao aprovar orçamento e o adapter OS → `ContaReceberTitulo` é idempotente por `localKey`.

Quando um orçamento aprovado era alterado:
- a mesma `ContaReceberTitulo` era atualizada (bom: idempotência)
- mas não havia política explícita para:
  - registrar “edição pós-aprovação”
  - preservar versão anterior do orçamento
  - marcar revisão no payload do título (auditoria financeira)

---

## 2) Política implementada

### 2.1 Se orçamento NÃO está aprovado

- Comportamento permanece como antes.

### 2.2 Se orçamento está aprovado e alteração NÃO muda `total`

- Permite alteração.
- Registra timeline:
  - `orcamento_aprovado_editado_sem_valor`

### 2.3 Se orçamento está aprovado e alteração MUDA `total`

- Mantém orçamento aprovado, mas marca revisão.
- Preserva histórico:
  - adiciona item em `payload.orcamentoHistorico[]` contendo snapshot do orçamento anterior + metadados
  - grava `payload.orcamentoRevisaoAtual`
- Marca faturamento revisado (para auditoria e sync):
  - `payload.faturamentoRevisadoEm`
  - `payload.faturamentoValorAnterior`
  - `payload.faturamentoValorAtual`
  - atualiza `payload.faturamentoTotal` para o novo total (mantém Conta a Receber alinhada)
- Registra timeline:
  - `orcamento_aprovado_revisado`
  - `faturamento_os_revisado`

### 2.4 Se orçamento aprovado for recusado/cancelado

- Continua cancelando o título (status `"cancelado"`) como já ocorria via fluxo existente.

---

## 3) Onde foi implementado

### 3.1 Service de política

- `lib/operacoes/services/orcamento-policy-service.ts`
  - `detectApprovedBudgetMutation`
  - `buildOrcamentoRevision`
  - `applyApprovedBudgetPolicy`
  - `shouldInvalidateFaturamento` (nesta fase: não invalida automaticamente)
  - `getOrcamentoPolicySummary`

### 3.2 Aplicação no backend operacional

- `app/actions/operacoes.ts`
  - aplica `applyApprovedBudgetPolicy(...)` dentro do `updateOSPayload`, antes de persistir o payload.

---

## 4) Payload novo (compatível)

Campos adicionados quando aplicável:

- `payload.orcamentoHistorico[]`
- `payload.orcamentoRevisaoAtual`
- `payload.faturamentoRevisadoEm`
- `payload.faturamentoValorAnterior`
- `payload.faturamentoValorAtual`

Compatibilidade:
- campos são opcionais; OS antigas continuam funcionando.

---

## 5) Timeline / eventos novos

Eventos adicionados:

- `orcamento_aprovado_editado_sem_valor`
- `orcamento_aprovado_revisado`
- `faturamento_os_revisado`

Render:
- `components/operacoes/lovable/components/operacoes/Timeline.tsx` atualizado com ícones/cores.

---

## 6) Adapter financeiro (auditoria no título)

- `lib/financeiro/adapters/os-faturamento.ts`
  - mantém a mesma `localKey` (sem duplicidade)
  - quando houver revisão (`faturamentoRevisadoEm`), marca no payload do título:
    - `revisadoAposAprovacao`, `valorAnterior`, `valorNovo`, `revisadoEm`
  - preserva histórico em `payload.revisoes[]` (dedupe por `revisadoEm`)

---

## 7) Riscos remanescentes

- A UI atual permite edição só em rascunho, mas o backend agora protege/audita caso alguma edição pós-aprovação ocorra via patch.
- A política atual atualiza `faturamentoTotal` para manter Conta a Receber alinhada; se no futuro existir “faturamento travado”, a regra pode mudar para “invalidação” ao invés de atualização.

