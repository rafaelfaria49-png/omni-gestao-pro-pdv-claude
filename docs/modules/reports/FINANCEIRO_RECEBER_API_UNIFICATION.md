# Financeiro real — unificação da API de Contas a Receber

## 1. Objetivo

Centralizar a **escrita server-side** de `ContaReceberTitulo` no service:

- `lib/financeiro/services/contas-receber-service.ts`

sem alterar:

- schema/migrations Prisma,
- UI Financeiro V2 (Lovable / mock),
- painel legado (prioridade `localStorage`),
- fluxos de PDV,
- adapter OS → Contas a Receber.

## 2. Caminhos antigos (antes da unificação)

### 2.1 PDV / sync operacional

- `POST /api/ops/contas-receber-persist`  
  - Arquivo: `app/api/ops/contas-receber-persist/route.ts`  
  - Recebia `rows: ContaReceberRow[]` e fazia `prisma.contaReceberTitulo.upsert` diretamente, gravando:
    - escalares (`descricao`, `cliente`, `valor`, `vencimento`, `status`)
    - `payload` como o próprio `ContaReceberRow`.

- `lib/pdv-append-conta-receber.ts`  
  - Função `appendContaReceberTituloPdvAprazo`:
    - Atualiza **`localStorage`** por loja (`contasReceberStorageKey(lojaId)`).
    - Dispara `fetch("/api/ops/contas-receber-persist", { body: { rows: [row] } })` como espelho servidor.

### 2.2 Sync legado (import / migração)

- `POST /api/ops/sync-legacy-financeiro`  
  - Arquivo: `app/api/ops/sync-legacy-financeiro/route.ts`  
  - Similar à rota de persistência:
    - `rows: ContaReceberRow[]`
    - loop com `prisma.contaReceberTitulo.upsert` para cada linha.

### 2.3 Outros pontos

- `app/api/ops/contas-receber-list/route.ts`  
  - **Somente leitura** (`findMany` + mapeamento `payload` → `ContaReceberRow`).  
  - Mantido como está nesta entrega.

- `app/api/financeiro/contas-receber/estornar*`  
  - Rotas de **auditoria** em `logsAuditoria` (sem `prisma.contaReceberTitulo.*`).  
  - Não participam da unificação de escrita.

- `lib/financeiro/adapters/os-faturamento.ts`  
  - Adapter OS → `ContaReceberTitulo` com `prisma.contaReceberTitulo.*` direto (merge específico de `revisoes[]`).  
  - **Mantido direto** nesta entrega para não mexer na política de revisões.

## 3. Caminhos novos (após unificação)

### 3.1 Service central

O núcleo passa a ser o service já existente em:

- `lib/financeiro/services/contas-receber-service.ts`

APIs usadas pela unificação:

- `upsertContaReceber(input)` — agora com opção `replacePayload?: boolean` para caminhos legados que enviam **snapshot completo**.
- (demais funções — `cancel`, `liquidar`, `registrarPagamentoParcial`, `estornar`, `buildContaReceberSummary` — continuam disponíveis para usos futuros).
- Novo helper leve:
  - `buildContaReceberAuditTrail(titulos)` — gera lista com id, loja, localKey, status, valor, saldo em aberto e flag de vencido (somente leitura).

### 3.2 `/api/ops/contas-receber-persist`

Arquivo atualizado: `app/api/ops/contas-receber-persist/route.ts`

Comportamento preservado:

- Request continua aceitando `{ rows: ContaReceberRow[] }`.
- Resposta permanece `{ ok: true, count }` ou `{ error, status }` em caso de falha.
- Cada `ContaReceberRow` ainda é gravado como `payload` completo do título.

Mudança interna:

- Antes:
  - `prisma.contaReceberTitulo.upsert({ ..., payload: row, descricao, cliente, valor, vencimento, status })`
- Agora:
  - `upsertContaReceber({`
    - `storeId: lojaId,`
    - `localKey: String(row.id).trim(),`
    - `descricao/cliente/valor/vencimento/status` derivados de `rowToScalar`, 
    - `payloadPatch: row as Record<string, unknown>,`
    - `replacePayload: true`
    - `})`

`replacePayload: true` garante que o `payload` seja **substituído** (snapshot), sem merge incremental, preservando a semântica anterior.

### 3.3 `/api/ops/sync-legacy-financeiro`

Arquivo atualizado: `app/api/ops/sync-legacy-financeiro/route.ts`

Comportamento preservado:

- Request: `{ rows: ContaReceberRow[] }`.
- Resposta: `{ ok, lojaId, rowsReceived, rowsApplied, titulosNoBancoParaLoja, warnings? }` (mesma forma).

Mudança interna:

- Substituição do `prisma.contaReceberTitulo.upsert` em loop por chamadas a `upsertContaReceber` com `replacePayload: true`, idêntico ao caso anterior.

### 3.4 PDV à prazo

Arquivo **não alterado**: `lib/pdv-append-conta-receber.ts`

- Continua:
  - Atualizando `localStorage` do navegador.
  - Enviando `fetch` para `/api/ops/contas-receber-persist` com header de loja.

O que muda é só **a implementação interna** da rota, agora via service único.

## 4. Compatibilidade preservada

- **Status antigos / não canônicos**: continuam aceitos; a rota passa `status` do `ContaReceberRow` para o service, que normaliza via `normalizeReceberStatus` (ex.: `atrasado` → `vencido`) sem quebrar valores existentes.
- **Payloads antigos**: `payload` segue sendo o próprio `ContaReceberRow`; com `replacePayload: true`, o service não tenta mesclar com estruturas diferentes — substitui o snapshot como antes.
- **`localKey` antiga**: continua derivada de `row.id` (ex.: `pdv-aprazo-{saleId}`) tanto para PDV quanto para sync legado.
- **Adapter OS**: permanece escrevendo diretamente em `ContaReceberTitulo` com merge próprio de revisões; nenhuma alteração de comportamento.
- **Painel legado / localStorage**:
  - Leitura (`/api/ops/contas-receber-list`) não foi alterada.
  - Fluxo de priorização `localStorage` vs servidor segue igual.

## 5. APIs centralizadas

Hoje, os seguintes caminhos de **escrita** de `ContaReceberTitulo` são centrados no service:

- `POST /api/ops/contas-receber-persist` → `upsertContaReceber` (`replacePayload: true`).
- `POST /api/ops/sync-legacy-financeiro` → `upsertContaReceber` (`replacePayload: true`).

Mantidos fora (por enquanto):

- Adapter OS: `lib/financeiro/adapters/os-faturamento.ts` (`prisma.contaReceberTitulo.*` direto com merge específico).

## 6. Pontos ainda híbridos

- **Fonte de verdade**:
  - LocalStorage (`lib/financeiro-store.tsx` + painel legado) continua sendo a origem primária para várias telas.
  - Prisma `ContaReceberTitulo` é usado por APIs e adapters, mas não é ainda a única camada.

- **OS → Contas a Receber**:
  - Adapter continua escrevendo diretamente em Prisma com lógica própria de `revisoes[]`.
  - Service ainda não é usado neste fluxo para evitar alterar política de revisão.

- **Estornos / pagamentos**:
  - Rotas `app/api/financeiro/contas-receber/estornar*` escrevem apenas em `logsAuditoria` e deixam a atualização do título ao cliente/localStorage.
  - Integração futura com `registrarPagamentoParcial`, `liquidarContaReceber` e `estornarContaReceber` ainda não foi feita.

## 7. Próximos passos sugeridos

1. **Encapsular adapter OS**:
   - Introduzir caminho seguro para que o adapter OS passe a usar `upsertContaReceber`, preservando a lógica de `revisoes[]` (pode ser via `payloadPatch` + merge prévio).
2. **Baixas e estornos server-side**:
   - Levar `payment/estorno` do painel legado para rotas que usem `registrarPagamentoParcial` / `estornarContaReceber`, mantendo logs em `logsAuditoria`.
3. **Resumo server-side**:
   - Expor endpoint que use `buildContaReceberSummary` e/ou `buildContaReceberAuditTrail` para dashboards futuros.
4. **Convergência de fonte de verdade**:
   - Gradualmente mover o painel legado para ler `ContaReceberTitulo` como fonte principal, com localStorage apenas como cache/migração.

