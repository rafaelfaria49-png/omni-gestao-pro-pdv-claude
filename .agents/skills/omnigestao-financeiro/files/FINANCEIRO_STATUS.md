# Financeiro V2 — Check-in técnico (real vs mock)

**Data:** 2026-05-07  
**Tipo:** somente análise (sem alteração de código, migrações ou refactors).

Este documento consolida o que existe hoje no repositório para o núcleo **Financeiro**, com foco no **Financeiro HUB V2** (`/dashboard/financeiro-v2`), contraste com painéis **dashboard financeiro legado**, modelo **Prisma**, **integrações operacionais** já escritas e **riscos** na passagem para uma única fonte de verdade.

---

## 1. Metodologia

- Leitura de `components/financeiro/lovable/routes/financeiro.tsx`, `FinanceiroHubIsolated.tsx`, `app/dashboard/financeiro-v2/*`.
- Leitura de painéis `components/dashboard/financeiro/*`, `lib/financeiro-store.tsx`, APIs em `app/api/**` relacionadas.
- Leitura de `lib/financeiro/adapters/os-faturamento.ts`, `lib/operacoes/services/financeiro-sync-service.ts`, `lib/pdv-append-conta-receber.ts`.
- Varredura de `prisma/schema.prisma` para modelos financeiros e relacionamentos.

---

## 2. Estrutura do “Financeiro V2” (UI Next.js)

### 2.1 Entrada da rota

| Caminho | Arquivo | Função |
|--------|---------|--------|
| `/dashboard/financeiro-v2` | `app/dashboard/financeiro-v2/page.tsx` → `FinanceiroV2Client.tsx` | Carrega o hub via `dynamic(..., { ssr: false })`. |

### 2.2 Isolamento Lovable

- **`FinanceiroHubIsolated.tsx`**: extrai apenas o componente da “rota” TanStack (`routes/financeiro.tsx`), sem montar `__root.tsx` completo do Lovable e sem bundle CSS global do Lovable — evita `<html>`/`<body>` duplicados no Next.js.
- Sincroniza **tema** com `document.documentElement[data-theme]` e injeta paleta local para Recharts.

### 2.3 Monólito principal (`financeiro.tsx`)

**Importante:** o arquivo `components/financeiro/lovable/routes/financeiro.tsx` concentra praticamente **todo** o Financeiro V2:

- Constantes **`// ----- MOCK DATA -----`** para carteiras, títulos a receber/pagar, fluxo mensal, movimentações, origens de receita etc.
- **Tabs internas** (não há pasta `tabs/` dedicada): `Visão geral`, `A receber`, `A pagar`, `Fluxo de caixa`, `Carteiras`, `Relatórios`, `Configurações` — definidas em `useMemo` dentro de `FinanceiroHub`.
- **Modais** declarados no mesmo arquivo (`NovoRecebimentoModal`, etc.).
- **Gráficos** via **Recharts** inline nos componentes de cada tab.
- **Estado local** apenas com `useState`/`useMemo`; **não** há uso de `useFinanceiro()` / `financeiro-store`.
- **“Integrações”** na UI de Configurações: `Switch defaultChecked` — comportamento **ilustrativo**, sem chamadas a APIs ou Server Actions.

Não existem, neste módulo V2, subpastas `tabs/*`, `modals/*`, `utils/*`, `charts/*` como pacotes separados: o equivalente está **dentro** de `financeiro.tsx` + `components/ui/*` (cópia shadcn no subtree `lovable/components/ui`).

### 2.4 Divergência com `docs/modules/FINANCEIRO.md`

A documentação do módulo descreve recursos “locais avançados” para o V2; no código atual o **V2 Lovable usa apenas dados mock estáticos e estado efêmero de formulários**, **sem** `FinanceiroProvider` nem persistência. Os fluxos locais avançados de carteiras / contas / fluxo citados no doc correspondem em grande parte ao **painel legado** (`components/dashboard/financeiro/*` + `lib/financeiro-store.tsx`), não ao arquivo `financeiro.tsx` do hub isolado.

---

## 3. O que é mock hoje

### 3.1 Financeiro HUB V2 (`financeiro.tsx`)

| Área | Evidência |
|------|-----------|
| Carteiras | Array `carteiras` hardcoded com saldos fixos |
| Contas a receber | Array `receber`; tabs/dialogos não persistem em LS/API |
| Contas a pagar | Array `pagar` |
| Fluxo de caixa | `fluxoMensal`, `movimentacoes` estáticos |
| Relatórios | KPIs/gráficos alimentados pelos mesmos mocks |
| Exportações | Ações típicas de “exportar” são UI/toasts ou placeholders (sem blob/backend auditável neste arquivo) |
| Integrações (PDV/OS) | Switches de configuração sem wiring |

### 3.2 Rotas dashboard “financeiro” clássicas

| Rota | Estado |
|------|--------|
| `app/dashboard/financeiro/page.tsx` | Placeholder “em construção” |
| `app/dashboard/financeiro/contas-a-receber/page.tsx` | Placeholder “em construção” |

Ou seja: o uso **operável** de Contas a Receber rico está em **`components/dashboard/financeiro/contas-receber.tsx`** (quando montado por outra rota), não nestas páginas stub.

### 3.3 Painel legado `financeiro-store` (carteiras / movimentos / a pagar)

- **`lib/financeiro-store.tsx`**: carteiras iniciais `CARTEIRAS_INICIAIS`, movimentações e **contas a pagar** em **`localStorage`** por loja (`assistec-pro-financeiro-v2-{lojaId}`).
- **Fluxo de caixa** (`fluxo-caixa.tsx`): derivado **somente** desses movimentos locais — não há ledger Prisma.
- **Contas a pagar** (`contas-pagar.tsx`): apenas estado do provider/localStorage — **não** há uso encontrado de `ContaPagarTitulo` no código TS da aplicação (vide secção 4).

---

## 4. O que já é real (servidor / contratos)

### 4.1 Prisma — títulos e vendas

- **`ContaReceberTitulo`**: `storeId`, `localKey` único por loja, campos escalares (`descricao`, `cliente`, `valor`, `vencimento`, `status`), **`payload` Json** para snapshot rico, relação `vendas`.
- **`ContaPagarTitulo`**: idem padrão multi-loja, opcional `fornecedorId` → `Fornecedor`, `payload` Json.
- **`Fornecedor`**: cadastro por `storeId`.
- **`Venda`** / **`ItemVenda`**: `pedidoId` único, `payload` Json, vínculo opcional `contaReceberTituloId`.

### 4.2 Prisma — operação / catálogo (integração indireta)

- **`OrdemServico`**, **`OrdemServicoItem`**, **`Produto`**, **`Cliente`**, **`Store`**: base para OS e estoque; faturamento e revisões são refletidos no adapter financeiro via **payload da OS** (camada Operações), não via enum financeiro dedicado.

### 4.3 `LedgerSnapshot`

- Modelo existe (`storeId` + `date` PK, `payload` texto).
- **Sem uso aplicativo localizado** no código TS além do schema/migrations — tabela **potencialmente inerte** para produto atual (“ledger” ainda não é motor oficial).

### 4.4 APIs e persistência Contas a Receber

| Caminho | Papel |
|---------|--------|
| `POST /api/ops/contas-receber-persist` | Upsert idempotente de **`ContaReceberTitulo`** por `storeId` + `localKey` a partir de linhas compatíveis com `ContaReceberRow`. |
| `app/api/financeiro/contas-receber/estornar/*` | Rotas de estorno (integração com fluxo de recebíveis no servidor/painel). |

### 4.5 Adapter OS → Contas a Receber (real)

- **`lib/financeiro/adapters/os-faturamento.ts`**  
  - `localKey` determinística: `os-faturamento:{storeId}:{os.id}`  
  - `upsertContaReceberFromOS` / `cancelContaReceberFromOS`  
  - Mescla `payload` com histórico de revisões (`revisoes[]`) quando aplicável.

### 4.6 Serviço de sincronização (Operações)

- **`lib/operacoes/services/financeiro-sync-service.ts`**: após atualização de payload da OS, decide criar/atualizar título ou cancelar; registra eventos na **timeline** (`financeiro_conta_receber_*`, `financeiro_sync_erro`).

### 4.7 PDV → Contas a Receber (híbrido)

- **`lib/pdv-append-conta-receber.ts`**: escreve título **à prazo** no **localStorage** e dispara **`fetch`** para `/api/ops/contas-receber-persist` com header de loja — espelho servidor **real** quando a API responde.

### 4.8 Painel legado Contas a Receber (híbrido)

- **`components/dashboard/financeiro/contas-receber.tsx`**: política explícita — **localStorage tem prioridade** na mescla; acrescenta do servidor o que ainda não existe no browser (`mergeContasLocalWins`).  
- Comentários em `lib/contas-receber-prisma-queries.ts`: consultas Prisma prontas para **APIs/jobs**; painel “ainda usa localStorage por padrão” em parte do fluxo.

### 4.9 Contas a Pagar no servidor

- **`ContaPagarTitulo`** e **`Fornecedor`** existem no schema e são adequados a multi-loja.
- **Gap:** não foi encontrado código TypeScript da app que execute `prisma.contaPagarTitulo.*` — risco de **schema à espera de UI/API** enquanto o produto usa só LS no provider legado.

---

## 5. Schema Prisma relevante (resumo)

| Modelo | storeId | Status / payload | Notas |
|--------|---------|------------------|-------|
| `ContaReceberTitulo` | Sim (`default` legado `loja-1`) | `status` string; `payload` Json | `@@unique([storeId, localKey])`; `vendas` |
| `ContaPagarTitulo` | Sim | idem | `fornecedorId` opcional |
| `Venda` | Sim | `payload` Json; `total`; `at` | Ligação opcional ao título |
| `ItemVenda` | via `vendaId` | valores snapshot | |
| `OrdemServico` | Sim | `payload` Json | Faturamento OS vive no payload + adapter |
| `OrdemServicoItem` | — | liga `Produto` | |
| `Produto` | Sim | `stock`, custos/preço | Estoque real afeta OS; sem lançamento financeiro automático mapeado aqui |
| `LedgerSnapshot` | Sim | `date` + `payload` string | Sem uso app evidente |

---

## 6. Integrações existentes (mapa)

```text
Operações HUB V2 (payload OS + faturamento*)
        │
        ▼
financeiro-sync-service  ──►  upsertContaReceberFromOS / cancelContaReceberFromOS
        │
        ▼
Prisma ContaReceberTitulo (+ timeline na OS)

PDV (à prazo)
        │
        ├──► localStorage (contas-receber por loja)
        │
        └──► POST /api/ops/contas-receber-persist  ──► Prisma ContaReceberTitulo

Estoque (Produto.stock)
        │
        └──► OS entregue / restauração / delta (Operações) — sem escritura direta em ContaPagar/Ledger neste fluxo

Financeiro V2 UI (lovable financeiro.tsx)
        │
        └──► (isolado) mocks — sem Prisma, sem financeiro-store
```

**Timeline / auditoria:** eventos financeiros ligados à OS na camada Operações; **`LogsAuditoria`** existe no schema para ações genéricas — não foi mapeado neste check-in cada escrita financeira para essa tabela.

---

## 7. Riscos

| Risco | Descrição |
|-------|-----------|
| **Múltiplas fontes de verdade** | Três camadas paralelas: mock V2; LS `financeiro-store`; Prisma `ContaReceberTitulo` (+ LS prioritário no painel legado de receber). |
| **Carteira / movimento “fake” no V2** | Saldo exibido no hub V2 não reflete Prisma nem `financeiro-store`. |
| **Conta a pagar só no cliente** | Provider legado vs `ContaPagarTitulo` sem writes TS encontrados — divergência futura garantida se dois sistemas coexistirem. |
| **LedgerSnapshot ocioso** | Expectativa de “ledger” no schema sem pipeline único — risco de duplicar lógica ou abandonar a tabela. |
| **Duplicidade conceitual de títulos** | `localKey` cobre OS e PDV se convenções forem respeitadas; risco se novos fluxos criarem IDs diferentes para o mesmo negócio. |
| **Saldo divergente** | Sem movimentação unificada carteira ↔ título ↔ venda, conciliação e fechamento são **impossíveis** com rigor. |
| **Multi-loja** | `storeId` está nos modelos; UI V2 menciona “Multi-loja” como badge sem binding real; LS legado depende de `lojaAtiva`. |
| **Fechamento contábil** | Sem período fechado, sem amarração entrada/saída a documentos, sem idempotência global financeira. |

---

## 8. Arquitetura recomendada (diretrizes — sem implementação)

1. **Fonte de verdade única por domínio**  
   - Títulos (receber/pagar): Prisma + regras de status e `payload` versionado.  
   - Movimentação de caixa/banco: eventos imutáveis (futuro ledger ou fila) derivados de baixas, não saldos editáveis diretamente na UI final.

2. **Camada de serviços**  
   - Ex.: `TituloReceberService`, `TituloPagarService`, `BaixaService` — únicos pontos que fazem `prisma.*` e validam invariantes (loja, valor, estado).

3. **Adapters**  
   - Manter padrão **idempotente** (`localKey` ou idempotency-key explícita) para OS, PDV, importações, NF futura.

4. **Ledger / saldo derivado**  
   - Saldos de carteira = **projeção** de eventos (ou snapshots diários em `LedgerSnapshot` **com contrato claro**), nunca segunda digitação manual concorrente.

5. **Fluxo de caixa**  
   - Agregações por período a partir dos **mesmos eventos** que alimentam conciliação; eliminar arrays mock no V2 quando integrar.

6. **Integração operacional**  
   - OS e PDV apenas **emit intents**; persistência financeira centralizada nos services.

7. **Idempotência**  
   - Repetição de webhook, retry de `fetch`, ou duplo clique não deve duplicar título ou movimento (unique constraints + upsert ou transações).

8. **Auditoria**  
   - Correlacionar `LogsAuditoria` ou trilha dedicada com `userLabel`, `storeId`, referência ao documento (OS id, `pedidoId`, `localKey`).

---

## 9. Ordem recomendada de consolidação

Ordem pensada para **reduzir retrabalho** e **fechar gaps de verdade** antes de relatórios bonitos:

1. **Contrato de dados** — Definir enums/canônicos de `status` receber/pagar alinhados ao Prisma e aos payloads OS/PDV.  
2. **Persistência real de Contas a Receber no fluxo principal** — Uma UI oficial consumindo API/Server Actions; política clara LS × servidor (evitar “local sempre ganha” em produção).  
3. **Contas a Pagar** — Implementar writes em `ContaPagarTitulo` + migração/import do LS legado (se necessário).  
4. **Carteiras reais** — Modelar conta financeira (nova tabela ou uso disciplinado de entidades existentes) + movimentos como eventos.  
5. **Conciliação PDV/OS** — Garantir que toda venda/OS gere **no máximo um** título coerente ou parcelas explícitas no `payload`.  
6. **Fluxo de caixa derivado** — Substituir agregações mock/LS por queries sobre eventos/títulos baixados.  
7. **Relatórios reais** — KPIs sobre dados persistidos; exportações auditáveis.  
8. **Automação / event bus (opcional)** — Para integrações assíncronas e retries sem bloquear Operações/PDV.  
9. **Fechamento financeiro** — Períodos, travas, reconciliação multi-loja.

**Renovar UI V2 (`financeiro.tsx`)** deve vir **depois** dos contratos (1–3) ou em paralelo strictamente consumindo os mesmos hooks/services — senão o mock continuará competindo com o real.

---

## 10. Referências internas

- `docs/modules/FINANCEIRO.md` — visão de produto (requer alinhamento com código V2 atual).  
- `docs/modules/reports/FINANCEIRO_V2_*` — relatórios por área mock/polimento.  
- `docs/modules/reports/OPERACOES_HUB_V2_OS_CONTAS_RECEBER_ADAPTER.md` — adapter OS → receber.  
- `docs/ai/CURRENT_STATUS.md` — estado macro do projeto.

---

## 11. Conclusão executiva

| Camada | Real | Mock / local-only |
|--------|------|-------------------|
| Financeiro V2 UI (`financeiro.tsx`) | Isolamento/tema | **100% dados mock** neste arquivo |
| `financeiro-store` + dashboard fluxo/pagar | Persistência LS por loja | Sem Prisma |
| `contas-receber.tsx` | Mescla LS + servidor + APIs | Regras complexas; LS pode obscurecer servidor |
| Prisma `ContaReceberTitulo` | OS adapter + persist PDV + queries helpers | — |
| Prisma `ContaPagarTitulo` | Schema pronto | **Sem uso TS encontrado** |
| `LedgerSnapshot` | Tabela | **Sem pipeline** evidenciado |

O próximo núcleo ERP **Financeiro V2** não é “implementar mais UI”: é **substituir mocks por services/adapters únicos** e **colapsar fontes de verdade** antes de escalar relatórios e fechamento.
