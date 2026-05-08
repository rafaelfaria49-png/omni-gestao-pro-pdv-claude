# Financeiro real — Contas a Pagar — Painel legado híbrido (server + localStorage)

Data: 2026-05-07

## Objetivo

Adaptar o painel legado **Contas a Pagar** para operar de forma **híbrida**:

- **Servidor (Prisma) como núcleo**: leitura e mutações via APIs reais
- **`localStorage` como espelho/fallback**: UX não trava quando backend falhar

Restrições desta entrega:

- Sem mexer no **Financeiro V2 Lovable**
- Sem migrations / sem alteração de schema Prisma
- Sem remover `localStorage`
- Sem alterar Contas a Receber
- Sem ledger/fluxo de caixa persistente
- Sem mudança visual pesada

## Arquivos alterados

- `components/dashboard/financeiro/contas-pagar.tsx`

## Mapeamento do painel legado (antes)

O painel era 100% local:

- Fonte: `useFinanceiro()` (`lib/financeiro-store.tsx`) com persistência por loja em `localStorage`
- Tipos: `ContaPagarItem` (`lib/financeiro-types.ts`)
- Ações existentes: **criar** e **editar** (sem baixas/estornos server-side)
- KPIs: calculados no client (total a pagar, vencendo hoje/amanhã, atrasados, pagos)

## Leitura híbrida (carregamento)

Ao abrir o painel (ou trocar loja):

1. O estado inicial continua vindo do `localStorage` via `FinanceiroProvider`
2. Em seguida, o painel chama:
   - `GET /api/ops/contas-pagar-list` com header `x-assistec-loja-id`
3. Se a resposta vier com `rows`, o painel:
   - normaliza `rows` (compat com `ContaPagarItem`)
   - substitui `contasPagar` pelo resultado do servidor
4. Se o servidor falhar, o painel **mantém o `localStorage`** (fallback)

KPIs:

- `Total a pagar`: usa `summary.totalAberto` quando disponível, senão cálculo local
- `Pago (marcados)`: usa `summary.totalPago` quando disponível, senão cálculo local
- `Vencem hoje/amanhã` e `Atrasados`: continuam cálculo local (compat/UX)

## Persistência híbrida (criar/editar)

Ao salvar uma conta (criar/editar):

1. O painel atualiza `contasPagar` local (mesmo fluxo UX)
2. Em paralelo, tenta sincronizar com:
   - `POST /api/ops/contas-pagar-persist`
   - body `{ lojaId, rows: [...] }` (snapshot compatível; inclui `localKey = id`)
3. Se falhar:
   - mostra toast “Servidor indisponível”
   - **não quebra** a UX (dados ficam no `localStorage`)

## Baixas e estornos (server-first + espelho local)

Foi adicionada uma ação leve por linha (menu “...”):

- **Pagamento parcial** → `POST /api/financeiro/contas-pagar/pagamento-parcial`
- **Liquidar** → `POST /api/financeiro/contas-pagar/liquidar`
- **Estornar (título)** → `POST /api/financeiro/contas-pagar/estornar`
- **Estornar último pagamento** → `POST /api/financeiro/contas-pagar/estornar-ultimo-pagamento`

Após sucesso:

- O painel atualiza a linha local (`status`) usando `titulo.status` + `audit.restante` (se `restante <= eps` → `pago`)
- O `localStorage` é atualizado automaticamente pelo `FinanceiroProvider` (espelho)

Se o servidor falhar:

- exibe toast de erro
- **não trava** nem remove dados locais

## Compatibilidade garantida

- Itens antigos do `localStorage` continuam abrindo (`ContaPagarItem` inalterado)
- `localKey`: quando não existe, o painel deriva `localKey = id` na persistência (snapshot)
- `fornecedor` string segue como fonte de exibição (payload do servidor pode ter `fornecedorNome`, mas o painel mantém a string)
- Status legado do servidor (`vencido`, `parcial`, `estornado`, etc.) é normalizado para o conjunto legado do painel (`pendente | atrasado | pago`)

## Riscos remanescentes

- O painel legado não tem status dedicado para `parcial`/`estornado`/`cancelado`; eles são normalizados para `pendente` por compatibilidade visual.
- A persistência via `/api/ops/contas-pagar-persist` é “upsert-only” (não apaga no servidor). Exclusão/cancelamento server-side é etapa futura (sem criar rota extra nesta entrega).

## Próximos passos sugeridos

- Introduzir status visuais adicionais no painel legado (ex.: “Parcial”, “Estornado”) sem redesign pesado.
- Criar rotas oficiais de **cancelamento** e/ou **reabertura** de título (mantendo regra “nunca deletar”).
- Unificar o painel legado com a leitura server-side (`summary` + `audit`) em mais KPIs/filtros.

