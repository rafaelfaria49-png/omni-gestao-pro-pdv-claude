# Operações HUB V2 — Adapter OS → Contas a Receber (Prisma)

**Escopo:** implementação do adapter + integração server-side no funil de atualização do payload da OS.  
**Objetivo:** materializar de forma **idempotente** um `ContaReceberTitulo` real a partir do **faturamento pendente** já existente no payload da OS, sem migration e sem quebrar o fluxo operacional.

---

## 1) O que foi criado

### 1.1 Adapter

- **Arquivo**: `lib/financeiro/adapters/os-faturamento.ts`
- **Responsabilidade**:
  - Validar se a OS está “faturável” com base no slice `faturamento*` no payload
  - Construir um draft de `ContaReceberTitulo` (scalars + payload)
  - Fazer **upsert idempotente** por `(storeId, localKey)`
  - Cancelar idempotentemente (sem deletar) quando o faturamento for cancelado/recusado

### 1.2 Integração server-side

- **Arquivo**: `app/actions/operacoes.ts`
- **Ponto de integração**: `updateOSPayload(storeId, osId, patch)`
- **Estratégia**:
  - Depois de persistir `payload` da OS, roda um sync seguro:
    - Se `faturamentoPendente=true` e `faturamentoStatus="pendente"` → upsert `ContaReceberTitulo`
    - Se `faturamentoStatus="cancelado"` ou `faturamentoPendente=false` → atualiza `ContaReceberTitulo.status="cancelado"`
  - **Se falhar**, não quebra a atualização da OS; registra erro na timeline.

---

## 2) Regras e idempotência

### 2.1 Quando cria/atualiza título

O adapter só materializa quando:

- `payload.faturamentoPendente === true`
- `payload.faturamentoStatus === "pendente"`
- `payload.faturamentoTotal > 0`

### 2.2 `localKey` idempotente

Chave do título (determinística):

`os-faturamento:{storeId}:{ordemServicoId}`

Isso garante que:

- aprovar duas vezes não cria duplicidade
- “aprovar novamente” (com patch) apenas atualiza o mesmo título

### 2.3 Upsert por unidade

O upsert é feito por `where: { storeId_localKey: { storeId, localKey } }`, respeitando multiloja e evitando cross-tenant.

---

## 3) Campos gravados em `ContaReceberTitulo`

### 3.1 Scalars (para busca/listagem rápida)

- `storeId`
- `localKey`
- `descricao`: `OS <numero> — Faturamento`
- `cliente`: nome (string; fallback `"Cliente"`)
- `valor`: `faturamentoTotal` arredondado a 2 casas
- `vencimento`: hoje + 30 dias (baseado em `faturamentoCriadoEm` quando existir)
- `status`: `"pendente"` (na criação/atualização), `"cancelado"` (no cancelamento)

### 3.2 Payload (snapshot rico)

O `payload` do título contém:

- `origem: "os"`
- `ordemServicoId`
- `ordemNumero`
- `clienteId` (quando existir; guardado no payload pois o schema atual usa `cliente` string)
- `clienteNome`
- `faturamentoReferencia`
- `orcamento` (snapshot)
- `createdFrom: "operacoes-hub-v2"`
- `statusOperacional`

No cancelamento:

- mantém payload anterior
- adiciona `canceladoEm`
- adiciona `motivo` (quando enviado)
- define `status: "cancelado"` dentro do payload também

---

## 4) Timeline da OS (auditoria)

Eventos adicionados à `timeline` da OS:

- `financeiro_conta_receber_criada`
- `financeiro_conta_receber_atualizada`
- `financeiro_conta_receber_cancelada`
- `financeiro_sync_erro`

E a UI `Timeline` já renderiza esses eventos com ícones.

---

## 5) Tratamento de erros e loop de sync

- **Erros**: qualquer erro do Prisma no adapter é capturado no `updateOSPayload` e vira evento `financeiro_sync_erro` na timeline.
- **Sem loop**: o evento de timeline é anexado via update direto no Prisma (não chama `updateOSPayload`), evitando recursão.

---

## 6) Riscos e próximos passos

### 6.1 Riscos remanescentes

- `vencimento` é regra fixa (+30 dias): precisa virar regra/config no futuro.
- `ContaReceberTitulo` não tem `clienteId` no schema: a ligação é via payload.
- Não existe (ainda) estado “recebido/parcial/estornado” integrado ao ciclo da OS.
- Convivência com PDV: `localKey` foi namespaced (`os-faturamento:*`) para evitar colisão com `pdv-aprazo-*`.

### 6.2 Próximos passos sugeridos (futuro)

- Opcional: persistir no payload da OS um marcador de materialização (`contaReceberLocalKey` ou `contaReceberTituloId`) para rastreio.
- Definir política de atualização quando orçamento aprovado muda depois.
- Conectar recebimentos/baixas do financeiro ao ciclo operacional (sem misturar com Financeiro V2 mock).

