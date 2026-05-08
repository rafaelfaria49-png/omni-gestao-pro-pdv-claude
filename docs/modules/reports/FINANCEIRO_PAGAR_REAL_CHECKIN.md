# Financeiro real — Contas a Pagar (check-in 2026-05-07)

## 1. Objetivo do check-in

Mapear o **estado atual** de **Contas a Pagar** no OmniGestão Pro:

- O que existe no **Prisma** (`ContaPagarTitulo`, `Fornecedor`, `Store`).
- O que está em **uso real** na UI / `localStorage`.
- Ausência ou presença de **APIs/services** para pagar.
- Riscos de manter `ContaPagarTitulo` apenas como schema.
- Sequência recomendada para torná-lo **núcleo real**, análogo ao que foi feito para Contas a Receber.

Nenhuma alteração de código foi feita neste arquivo; é apenas documentação.

---

## 2. Schema Prisma — Contas a Pagar

### 2.1 Modelos relevantes

Trechos de `prisma/schema.prisma` (resumido):

- `Store`:
  - Tem relação `contasPagar ContaPagarTitulo[]`.
  - É multi-loja (campo `storeId` em quase todos os modelos financeiros).

- `Fornecedor`:
  - Campos principais:
    - `id`, `storeId`, `store` (relação com `Store`).
    - `name`, `legalName`, `document`, `email`, `phone`, `whatsapp`.
    - `address`, `productsProvided`, `paymentTerms`, `avgLeadTime`, `notes`.
  - Relação:
    - `contasPagar ContaPagarTitulo[]`.
  - Índices:
    - `@@index([storeId])`, `@@index([name])`.
  - Modelo pronto para multi-loja como cadastro de fornecedor.

- `ContaPagarTitulo`:
  - Campos principais:
    - `id: String @id @default(cuid())`.
    - `storeId: String @default("loja-1")` + relação `store` (`onDelete: Restrict`).
    - `fornecedorId: String?` + relação opcional `fornecedor` (`onDelete: SetNull`).
    - `localKey: String?` — id estável no cliente (localStorage / sync) por unidade.
    - `payload: Json? @db.JsonB` — snapshot rico (parcelas, anexos, histórico de pagamento, etc.).
    - `descricao: String @default("")`.
    - `valor: Float @default(0)`.
    - `vencimento: String @default("")`.
    - `status: String @default("pendente")`.
    - `numeroDocumento: String @default("")` — NF, número de boleto ou referência externa.
    - `createdAt`, `updatedAt` padrão.
  - Constraints / índices:
    - `@@unique([storeId, localKey])`.
    - `@@index([storeId])`.
    - `@@index([fornecedorId])`.
    - `@@index([status])`.
    - `@@map("contas_pagar_titulos")`.

### 2.2 Contratos de status / valores

Em `lib/financeiro/contracts/status.ts`:

- `PAGAR_STATUS` espelha `RECEBER_STATUS`:
  - `pendente`, `parcial`, `pago`, `vencido`, `cancelado`, `estornado`.
- `normalizePagarStatus` converte aliases (`atrasado` → `vencido`, etc.).
- Helpers comuns:
  - `isPagarPago`, `isStatusCancelado`, `getFinanceiroStatusLabel` / `getFinanceiroStatusMeta`.

> **Conclusão schema:** `ContaPagarTitulo` está modelado de forma **simétrica** a `ContaReceberTitulo` (multi-loja, `localKey`, `payload`, `status` string), com vínculo opcional a `Fornecedor`. Não há lacunas de schema óbvias para um primeiro núcleo de Contas a Pagar.

---

## 3. UI e estado atual — Contas a Pagar

### 3.1 Painel legado (Next clássico)

- Componente principal:
  - `components/dashboard/financeiro/contas-pagar.tsx`.
  - Usa:
    - `useFinanceiro()` de `lib/financeiro-store.tsx`.
    - Tipo `ContaPagarItem` de `lib/financeiro-types.ts`.
  - Estado:
    - `contasPagar` vem do `FinanceiroProvider` e é **persistido em `localStorage`** por loja (`assistec-pro-financeiro-v2-{lojaId}`).

- Comportamento da tela de Contas a Pagar:
  - Calcula `status` efetivo no cliente:
    - `"pago"` se marcado pago.
    - `"atrasado"` se `dataVencimento < hoje`.
    - Senão `"pendente"`.
  - KPIs locais:
    - `totalPagar`: soma de `valor` das contas com status pendente/atrasado.
    - `vencendo`: contas que vencem hoje/amanhã.
    - `atrasados`: contagem de atrasados.
    - `pagoMes`: soma de `valor` de contas com status `pago`.
  - CRUD:
    - `Nova Conta`, `Editar`, `Marcar como pago`, etc. — **tudo apenas em estado React + `localStorage`**, sem qualquer chamada a Prisma/API.

- `FinanceiroProvider` (`lib/financeiro-store.tsx`):
  - Estrutura de estado:
    - `carteiras`, `movimentos`, `transferencias`, `contasPagar`.
  - Leitura:
    - Tenta ler `financeiroStorageKey(lojaId)` (`assistec-pro-financeiro-v2-{lojaId}`).
    - Pode importar de um storage legado `v1`, mas sempre populando `contasPagar` em memória.
  - Escrita:
    - A cada mudança: grava `FinanceiroState` completo em `localStorage` (incluindo `contasPagar`).
  - Não há qualquer referência a `ContaPagarTitulo` aqui.

### 3.2 Financeiro V2 Lovable (isolado)

- Arquivo `components/financeiro/lovable/routes/financeiro.tsx`:
  - Tab “A pagar” com **dados mock** (`const pagar = [...]` etc.).
  - UI com tabela, filtros, modais de criar/editar/estornar, mas **sem** ligação com:
    - `FinanceiroProvider`,
    - `localStorage`,
    - APIs Prisma.
  - Fornecedores na V2 são apenas textos mock em selects/datalists.

> **Conclusão UI:** Para Contas a Pagar, o produto em uso real é **o painel legado** (`contas-pagar.tsx` + `financeiro-store`) totalmente em `localStorage`. O Financeiro V2 Lovable é protótipo mock sem persistência. Não há hoje UI ligada a `ContaPagarTitulo` Prisma.

---

## 4. APIs e serviços existentes (Pagar)

### 4.1 Busca por `ContaPagarTitulo` / Prisma

- Varredura `prisma.contaPagarTitulo`:
  - **Nenhuma ocorrência** encontrada no código TypeScript.

- Varredura `ContaPagarTitulo` em imports/types:
  - Apenas em documentação (`FINANCEIRO_V2_REAL_CHECKIN.md`, `FINANCEIRO_ANALISE_MASTER.md`) e referência geral a schema.

### 4.2 Rotas / Services

- Não há rotas `app/api/financeiro/contas-pagar/*` definidas no projeto atual.
- Não há service em `lib/financeiro/services/*` específico para pagar:
  - A pasta hoje contém `carteira-service`, `movimento-service`, `saldo-service`, `ledger-service` e o novo `contas-receber-service`, **mas não** algo como `contas-pagar-service`.

> **Conclusão APIs:** `ContaPagarTitulo` é hoje um **schema pronto mas inerte**: não há writes/reads TS utilizando Prisma para Contas a Pagar; toda a experiência de pagar está no cliente/localStorage.

---

## 5. Comparação com Contas a Receber

### 5.1 Semelhanças de contrato

- Ambos os modelos (`ContaReceberTitulo` e `ContaPagarTitulo`) compartilham:
  - `storeId` multi-loja.
  - `localKey` opcional com `@@unique([storeId, localKey])`.
  - `payload` JsonB como snapshot rico (parcelas, anexos, histórico).
  - `descricao`, `valor`, `vencimento`, `status` string, `createdAt`, `updatedAt`.
  - Status canônicos em `lib/financeiro/contracts/status.ts` com normalizadores.

### 5.2 Diferenças

- Receber já tem:
  - Service dedicado (`contas-receber-service.ts`) com:
    - `upsert`, `cancel`, `liquidar`, `registrarPagamentoParcial`, `estornar`.
    - `buildContaReceberSummary`, `buildContaReceberAuditTrail`.
  - Rotas e integração:
    - Persistência (`/api/ops/contas-receber-persist`, `/api/ops/sync-legacy-financeiro`) já usam o service.
    - Baixas/estornos server-side (`/api/financeiro/contas-receber/*`) chamando o service.
    - Endpoint de leitura consolidado (`/api/ops/contas-receber-list`) com `rows + summary + audit + metadata`.
    - Painel legado de receber usando `summary` server-side para KPIs.

- Pagar não tem:
  - Service análogo (`contas-pagar-service`).
  - Rotas `/api/ops/contas-pagar-*` ou `/api/financeiro/contas-pagar/*`.
  - Qualquer ligação de `contas-pagar.tsx` com Prisma.
  - Qualquer summary/audit server-side.

> **Conclusão comparação:** Contas a Receber já foi avançada para núcleo server-side com service + APIs + painel híbrido. Contas a Pagar ainda está **100% local** (FinanceiroProvider) e **0% Prisma**, mesmo já tendo schema pronto.

---

## 6. Riscos atuais

1. **Duas realidades para Contas a Pagar:**
   - `localStorage` (`financeiro-store`) é a única fonte de verdade para pagar hoje.
   - `ContaPagarTitulo` existe no banco, mas **sem usos TS** → risco de schema “fantasma” que não reflete o que o usuário vê.

2. **Multi-loja parcial:**
   - `ContaPagarTitulo` e `Fornecedor` são multi-loja no schema, mas o painel legado depende de `lojaAtiva` e chaves de LS (`assistec-pro-financeiro-v2-{lojaId}`).
   - Sem integração, mudanças multi-loja em Prisma não impactam o painel (e vice-versa).

3. **Status divergente futuro:**
   - Hoje pagar só usa `status` local (`pendente`, `atrasado`, `pago`), calculando vencido no cliente.
   - Se um dia houver writes em `ContaPagarTitulo` sem uma camada de normalização similar a receber, status podem divergir entre LS e DB.

4. **Fornecedores:** 
   - `Fornecedor` existe em Prisma com campos ricos, mas o painel legado de pagar usa apenas `string fornecedor` em `ContaPagarItem`.
   - V2 Lovable mostra listas de fornecedores mock (strings), sem usar o cadastro real.

5. **Parcelas / histórico:**
   - O painel legado de pagar hoje não possui a mesma profundidade de parcelas/histórico estruturado que receber (não há `pagamentos`/`parcelas` análogos em `ContaPagarItem`).
   - O campo `payload` em `ContaPagarTitulo` está livre para ser usado, mas ainda sem contratos claros.

6. **Fluxo de caixa / ledger:**
   - Fluxo de caixa (`fluxo-caixa.tsx`) é derivado de **movimentos locais** (`movimentos` no `FinanceiroProvider`), não de `ContaPagarTitulo`.
   - Isso dificulta conciliação futura entre caixa (saídas efetivas) e títulos a pagar.

---

## 7. Sequência recomendada para tornar Contas a Pagar “real”

1. **Service oficial de Contas a Pagar (server-side)**  
   Criar `lib/financeiro/services/contas-pagar-service.ts` inspirado em `contas-receber-service.ts`:
   - Funções básicas:
     - `listContasPagarByStore(storeId)`.
     - `getContaPagarById(storeId, id)` + `getContaPagarByLocalKey`.
     - `upsertContaPagar` (idempotente por `(storeId, localKey)`).
     - `cancelarTituloPagar`, `liquidarTituloPagar`, `registrarPagamentoParcialPagar`, `estornarTituloPagar/ultimo_pagamentoPagar` com contratos análogos a receber.
   - Reutilizar contratos:
     - `PAGAR_STATUS` / `normalizePagarStatus`.
     - `safeMoney`, `isOverdueDateString` para vencidos.
     - `payload` JSONB com histórico (`historicoPagamentosFornecedor` etc., definir contrato leve).

2. **APIs de persistência / leitura**
   - `POST /api/ops/contas-pagar-persist` (futuro):
     - Upsert Prisma `ContaPagarTitulo` por `storeId + localKey` a partir de linhas compatíveis com um `ContaPagarRow` simples (similar a `ContaReceberRow`).
   - `GET /api/ops/contas-pagar-list`:
     - Fonte oficial de leitura para V2/relatórios, com `rows + summary + audit + metadata`, inspirado em receber.

3. **Baixas/estornos Contas a Pagar**
   - Criar rotas:
     - `POST /api/financeiro/contas-pagar/pagamento-parcial`.
     - `POST /api/financeiro/contas-pagar/liquidar`.
     - `POST /api/financeiro/contas-pagar/estornar`.
     - `POST /api/financeiro/contas-pagar/estornar-ultimo-pagamento`.
   - Todas chamando o service de pagar, auditando em `LogsAuditoria` e **sem deletar** títulos.

4. **Integração gradual com painel legado**
   - Primeira fase:
     - Manter `contas-pagar.tsx` usando `localStorage`, mas espelhar operações de CRUD em `ContaPagarTitulo` via APIs novas (como foi feito em receber).
   - Segunda fase:
     - Trazer KPIs (totais, vencidos, pagos) da API server-side (`summary`) para o header do painel, mantendo lista LS (local-wins) como fallback.
   - Terceira fase:
     - Opcionalmente migrar lista principal para servidor (LS como cache), alinhando contas a pagar e receber no mesmo padrão.

5. **Conexão com fluxo de caixa (futuro)**  
   - Quando o ledger/movimentos reais forem implementados, fazer com que:
     - Baixas de `ContaPagarTitulo` gerem movimentos de saída (`Movimento`) consistentes.
     - Painel de fluxo de caixa passe a ler de eventos, não apenas de LS.

---

## 8. Atualizações sugeridas em docs vivos

> **Nota:** Esta seção é recomendação; as alterações em `docs/modules/FINANCEIRO.md`, `docs/ai/CURRENT_STATUS.md`, `docs/changelog/CHANGELOG.md` devem refletir o estado real após implementação futura de pagar.

Hoje, os docs já mencionam:

- `ContaPagarTitulo` como schema pronto mas sem uso TS (gap explícito).
- `contas-pagar.tsx` como tela baseada em `FinanceiroProvider`/`localStorage`.

Assim que o núcleo de pagar (service + APIs) for implementado, recomenda-se:

1. **`docs/modules/FINANCEIRO.md`**  
   - Adicionar seção “Contas a pagar — service real (Prisma)” análoga à de receber.
2. **`docs/ai/CURRENT_STATUS.md`**  
   - Atualizar a tabela para marcar “Contas a Pagar — service Prisma” como em andamento ou concluído.
3. **`docs/changelog/CHANGELOG.md`**  
   - Registrar a data em que `ContaPagarTitulo` passou a ser usado por services/APIs reais.

---

## 9. Resumo

- **Real no server (schema):** `ContaPagarTitulo`, `Fornecedor` já existem e suportam multi-loja com `payload` JsonB e `localKey` única por loja.
- **Real na UI (produto):** Contas a Pagar hoje é **somente localStorage** via `FinanceiroProvider` + `contas-pagar.tsx`.
- **Gap crítico:** nenhum uso de `prisma.contaPagarTitulo.*` foi localizado em TypeScript; `ContaPagarTitulo` é um modelo **não utilizado**.
- **Risco:** se o produto evoluir em pagar apenas no cliente, divergirá de qualquer uso futuro de `ContaPagarTitulo`. A simetria com receber ficará quebrada.
- **Sequência recomendada:** seguir o mesmo caminho bem-sucedido de Contas a Receber — service dedicado, APIs de persistência/lista, baixas/estornos server-side, depois integração gradual do painel legado e, por fim, fluxo de caixa/ledger.

