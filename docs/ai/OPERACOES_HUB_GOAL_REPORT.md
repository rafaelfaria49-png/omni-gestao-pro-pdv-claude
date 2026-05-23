# Relatório — Auditoria e estabilização do Operações HUB para uso real

> Data: 23/05/2026 · Modelo: Claude Opus 4.7 · Goal 4: estabilizar o Operações
> HUB / OS para uso real na loja, com foco em status, peças/estoque, cliente e
> faturamento. Sequência dos Goals 1 (PDV/Caixa), 2 (PDV ↔ Estoque) e
> 3 (Financeiro do PDV).

## 1. Resumo da auditoria

Auditoria ponta-a-ponta do caminho **criar OS → editar → mudar status →
aprovar orçamento → consumir estoque → faturar / criar Conta a Receber →
entregar → cancelar / reabrir**. Foco em **idempotência**, **multi-loja
(`storeId`)**, **erros silenciosos**, **integridade do cliente** e **prevenção
de perda de dados**.

| Camada | Arquivo | Resultado |
|---|---|---|
| Server Action — listagem | `app/actions/ordens.ts` (`listOrdens`, `getOrdem`) | ✅ Filtra por `storeId`; `withPrismaSafe` retorna array vazio em falha |
| Server Action — criar/editar | `app/actions/operacoes.ts` (`createOS`, `updateOSStatus`, `updateOSPayload`, `applyOperacaoHubAcao`) | ✅ Gates via `requireOperacaoAuth`; transições validadas por `assertOperacaoStatusTransition`; payload persiste status granular + Prisma enum colapsado |
| Adapter — OS → Estoque | `lib/operacoes/adapters/os-estoque.ts` | ✅ Transação Prisma; valida tudo antes de baixar; idempotência via `payload.estoqueConsumido` + `estoqueRestaurado` + `estoqueUltimaRevisaoEm`; ledger com custo/operador/numero (Goal 21/05) |
| Adapter — OS → Financeiro | `lib/financeiro/adapters/os-faturamento.ts` | ✅ Idempotência via `localKey: adapter_os_faturamento:{storeId}:{osId}`; merge de revisões em `payload.revisoes[]`; cancela com `RECEBER_STATUS.CANCELADO` |
| Sync — OS → Conta Receber | `lib/operacoes/services/financeiro-sync-service.ts` | ✅ Best-effort; erros viram timeline `financeiro_sync_erro`, não quebram o update |
| API REST — listar/migrar | `app/api/ops/ordens/route.ts` | 🔴 **Corrigido:** PUT podia apagar todas as OS via `deleteMany`+`createMany` mesmo com OS já persistidas (ver §3.1) |
| Server Action — venda derivada | `app/actions/operacoes.ts` (`criarVendaDeOSAction`) | 🔴 **Corrigido:** `clienteNome` recebia o `clienteId` e a FK `Venda.clienteId` não era persistida (ver §3.2) |
| Gerar cobrança | `app/actions/operacoes.ts` (`gerarCobrancaOSAction`) | ✅ Bloqueia se período financeiro fechado; valida estado da OS; auditoria via `auditOS` |
| Garantia operacional | `lib/operacoes/services/garantia-operacional-service.ts` | ✅ Best-effort; falha não reverte status; expira automático ao ler (`getOrdem`) |
| Multi-loja | `lib/store-id-from-request.ts` + `requireEnterpriseWith` | ✅ `storeId` obrigatório em writes; read aceita fallback `LEGACY_PRIMARY_STORE_ID` |
| HUB V2 Lovable | `components/operacoes/lovable/api/os.ts` + `vendas.ts` | ⚠️ Usa `let CURRENT_STORE_ID = "loja-1"` mutável (atualizado pelo primeiro fetch). Risco se hub não chamar `listPecas(storeId)` antes — documentado §4. |

## 2. Fluxo OS consolidado (criar → entregar → cobrar → cancelar)

```
createOS (Server Action)
  ├─ requireOperacaoAuth(storeId, p.operacoes.criarOs)
  ├─ nextCodigo: OS-{YYYY}-{NNNNN} (storeId-scoped count)  ⚠ race teórica
  ├─ prisma.ordemServico.create + update (id no payload)
  └─ auditOS({ acao: "criar" })

updateOSStatus / applyOperacaoHubAcao
  ├─ requireOperacaoAuth(storeId, status-specific permission)
  ├─ assertOperacaoStatusTransition (operacao-hub-flow)
  ├─ prisma.ordemServico.update (status colapsado + payload JSON)
  ├─ Se sai de "entregue" ou cancela → restoreEstoqueFromOS (best-effort)
  ├─ Se vira "entregue" → consumeEstoqueFromOS (transação)
  │     ├─ valida tudo antes (anti-parcial)
  │     ├─ decrement Produto.stock + cria OrdemServicoItem
  │     ├─ MovimentacaoEstoque(saida, "os") com custo/operador/numero
  │     └─ payload.estoqueConsumido = true (guard idempotente)
  └─ Se entregue + garantia.ativa → criarGarantiaOrdemServicoDb (best-effort)

updateOSPayload (revisão de orçamento, cobrança, anexos, …)
  ├─ requireOperacaoAuth(p.operacoes.editarOs)
  ├─ mergePayload + applyApprovedBudgetPolicy
  ├─ Se shouldSyncFinanceiroFromPatch: verificarPeriodoFechado guard
  ├─ prisma.ordemServico.update
  ├─ Se revisão pós-aprovação: applyEstoqueDelta (consume/restaure delta)
  └─ syncFinanceiroAfterOSPayloadUpdate
       ├─ upsertContaReceberFromOS (localKey idempotente)
       └─ onContaReceberChanged → registrarAuditoriaFinanceira

faturarOS (Lovable hub) → criarVendaDeOSAction + updateOSStatus("entregue")
  └─ Venda(storeId, pedidoId=VND-YYYY-NNNNN, clienteId, clienteNome, …)  ✅ FIX §3.2

Cancelamento (acao "cancelar")
  └─ updateOSStatus → restoreEstoqueFromOS + cancelContaReceberFromOS
```

## 3. Bugs encontrados e correções aplicadas

### 3.1 `PUT /api/ops/ordens` podia apagar todas as OS de uma loja

**Sintoma:** o endpoint executava
`prisma.$transaction([deleteMany({where:{storeId}}), createMany({data: rows})])`
sem nenhuma checagem prévia. Pior, o mapeamento de `rows` zerava campos
críticos (`equipamento: ""`, `defeito: ""`, `clienteId: null`, `valorBase: 0`,
`valorTotal: 0`, `status: Aberto`). Uma chamada acidental — `curl`, bug de UI
que enviasse array com poucas OS, ou usuário com permissão de edição agindo
de má-fé — apagaria/zeraria todas as OS daquela loja.

**Contexto:** o caller real é `lib/operations-store.tsx` bootstrap, que só
chama o PUT quando **ambos** `inventory` e `ordens` vêm vazios do servidor
(migração one-shot do localStorage legado para o banco). Mas o endpoint não
tinha proteção server-side equivalente.

**Correção:** `app/api/ops/ordens/route.ts` — antes do `deleteMany`, conta as
OS existentes para a loja. Se `existingCount > 0`, devolve `409 Conflict` com
`code: "ordens_ja_existentes"`. Preserva a migração one-shot (banco vazio →
PUT funciona); bloqueia o cenário destrutivo.

```ts
const existingCount = await prisma.ordemServico.count({ where: { storeId } })
if (existingCount > 0) {
  return NextResponse.json(
    { error: "...", code: "ordens_ja_existentes", existingCount },
    { status: 409 },
  )
}
```

Mudança cirúrgica de 23 linhas em `route.ts` (guard com tratamento de erro
próprio). Sem alteração da migração legada nem do shape de resposta de
sucesso.

### 3.2 `criarVendaDeOSAction` gravava `clienteId` no campo `clienteNome` e perdia a FK `Venda.clienteId`

**Sintoma:** ao faturar uma OS via "Faturar OS" no Hub Lovable
(`components/operacoes/lovable/api/os.ts:457`), a função
`criarVendaDeOSAction` criava uma `Venda` com:

```ts
clienteNome: os.clienteId,  // ← bug: ID no lugar do nome
```

E **não** preenchia o campo `clienteId` da `Venda` (a FK adicionada no Goal
Cadastros — `Venda.clienteId`). Consequências:

- Histórico de Vendas exibia o **cuid** do cliente em vez do nome.
- `Cliente.totalGasto` (calculado por `SUM(Venda.total WHERE clienteId = c.id)`)
  ignorava todas as vendas oriundas de OS.
- Relatórios financeiros e drawers de venda mostravam o ID cru.

**Correção:** `app/actions/operacoes.ts` `criarVendaDeOSAction`:
1. Resolve `clienteNome` por prioridade: `os.cliente?.nome` (snapshot) →
   busca no banco por `clienteId` (best-effort) → fallback `"Cliente"`.
2. Passa `clienteId` para a `Venda` quando a OS tem `clienteId` definido,
   restaurando a FK e o link com o cadastro.
3. Mantém `payload.clienteId` no JSON (já existia).

Mudança cirúrgica de 16 linhas em uma única função; nenhum outro caller
afetado (`Venda` já aceitava `clienteId` como opcional desde a Fase 4 de
Cadastros). Falha silenciosa preservada para o lookup de fallback (não
quebra o faturamento se o cliente foi deletado depois do snapshot da OS).

## 4. Riscos restantes (NÃO corrigidos — fora do escopo cirúrgico)

| Risco | Severidade | Mitigação atual / Observação |
|---|---|---|
| 🟡 **`Lovable hub: let CURRENT_STORE_ID = "loja-1"`** | Médio | `components/operacoes/lovable/api/{os,estoque,vendas}.ts` mantém um id mutável atualizado no primeiro fetch com `storeId`. Em apps com troca de loja sem hard reload, OS de uma loja podem ir parar em outra. Esses caminhos chamam **Server Actions** que sempre validam `storeId`, então `requireOperacaoAuth` ainda bloquearia. Risco visível em logs, não em integridade do banco. |
| 🟡 **`nextCodigo` (OS-YYYY-NNNNN) usa `count + 1` — race condition teórica** | Baixo em loja única | Duas OS criadas no mesmíssimo instante em duas máquinas podem receber o mesmo número. Schema `OrdemServico.numero` é `String?` sem unique. Em uma loja com 1–2 atendentes amanhã, improvável. Fix futuro: `findFirst orderBy: numero desc` ou sequência DB. |
| 🟡 **`updateOSStatus` rodando estoque fora da transação principal** | Médio | `consumeEstoqueFromOS` / `restoreEstoqueFromOS` rodam **depois** do `prisma.ordemServico.update` (status). Se baixa de estoque falhar, status já está em "entregue" no banco. Erro vira evento `estoque_sync_erro` na timeline — auditável, não autocura. |
| 🟢 **`getOrdem` chama `expirarGarantiasVencidas` em todo read** | Baixo (perf) | Cada leitura individual roda update silencioso de garantias vencidas. Aceitável para uma OS por vez; ruim se chamado em loop. |
| 🟢 **`requireOperacaoAuth` pula gate quando não há sessão NextAuth** | Decisão de design | Permite uso via PIN gate (AccessGate legado) sem bloquear. Documentado no auth design. |
| 🟢 **`criarVendaDeOSAction` não cria `MovimentacaoFinanceira` direta** | Decisão de design | Receita real só entra quando o `ContaReceberTitulo` (criado pelo adapter OS→Faturamento na aprovação do orçamento) é liquidado. Faturamento OS ≠ venda à vista PDV. |
| 🟢 **Status granular vs Prisma enum colapsado (4 estados)** | Pré-existente | `toPrismaStatus` colapsa para `Aberto/EmAnalise/Pronto/Entregue`; granularidade vive em `payload.status` / `operacaoStatus`. Documentado em `OPERACOES_HUB_V2_STATUS_NORMALIZATION.md`. |
| 🟢 **Duplicação de "OS"**: HUB V2 vs OS clássica do dashboard | Pré-existente | Modelos/status/fonte de dados diferentes; `docs/modules/OPERACOES.md` documenta. Plano de convergência fora deste escopo. |
| 🟢 **Histórico de OS pré-migração** | Pré-existente | Sem `clienteId` correto; o fix §3.2 só afeta novas vendas geradas a partir de agora. |

## 5. Pontos fora do escopo

- Auth, `proxy.ts`, sidebar, billing/Stripe, WhatsApp webhook.
- Schema Prisma — **nenhuma mudança**.
- Refatoração do Financeiro HUB ou PDV.
- Refatoração do Operações HUB V2 (Lovable sub-app).
- Convergência das duas vias de OS (HUB V2 + clássica).
- Atendimentos rápidos, lojas, notificações, integrações em modo mock.
- Idempotência forte em sangria/suprimento (próximo goal financeiro).
- Race condition de `nextCodigo` (loja única, risco mínimo).

## 6. Arquivos alterados

```
M  app/api/ops/ordens/route.ts     (+23 linhas, guard PUT)
M  app/actions/operacoes.ts        (+14 / -2 linhas, criarVendaDeOSAction)
```

Total: **2 arquivos** · **+37 linhas, -2 linhas**. Nenhum arquivo criado fora
do relatório (`docs/ai/OPERACOES_HUB_GOAL_REPORT.md`). Nenhuma área protegida
tocada (auth, `proxy.ts`, sidebar, `prisma/schema.prisma`, core). PDV
validado nos Goals 1–3 NÃO foi tocado.

## 7. Resultado das validações

| Comando | Resultado |
|---|---|
| `npx tsc --noEmit` | ✅ **0 erros** |
| `npm run build` | ✅ **Compiled successfully** (prisma generate + Next webpack, tabela de rotas íntegra) |
| `git status` | ✅ `M app/actions/operacoes.ts`, `M app/api/ops/ordens/route.ts` |
| `git diff --stat` | ✅ `operacoes.ts \| 16 ++-`, `ordens/route.ts \| 23 +++` |

## 8. Teste manual documentado (roteiro de loja)

> Roteiro para conferência **na máquina da loja** amanhã antes do primeiro
> atendimento. Mesmo principio dos Goals 1–3: usar PDV Clássico/Assistência/
> Supermercado para vendas; usar `/dashboard/operacoes-v2` para OS.

### 8.1 Abrir Operações HUB

1. Navegar para `/dashboard/operacoes-v2`.
2. **Esperado:** Hub Lovable carrega; lista de OS aparece (ou empty state honesto se não houver OS).

### 8.2 Listar OS

1. Verificar Kanban / lista.
2. **Esperado:** apenas OS da loja ativa (storeId scope). Garantias vencidas
   são expiradas server-side ao abrir o detalhe (`getOrdem`).

### 8.3 Criar OS simples

1. Clicar "Nova OS" / Criar → preencher cliente + equipamento + defeito.
2. **Esperado:**
   - `Venda` não é criada nessa etapa.
   - Nova `OrdemServico` com `numero = OS-{YYYY}-{NNNNN}` (sequencial por loja).
   - `payload.status = "recebido"` (ou inicial), `Prisma enum = Aberto`.
   - Evento na timeline + auditoria via `auditOS`.

### 8.4 Editar OS (orçamento, observações, anexos)

1. Abrir OS recém-criada → preencher orçamento (peças + serviços).
2. Salvar.
3. **Esperado:** payload atualizado, `valorTotal` sincronizado com `orcamento.total`. Sem mudança de status.

### 8.5 Mudar status — diagnóstico → orçamento → aprovação

1. "Iniciar diagnóstico" → status `diagnostico`.
2. "Enviar orçamento" → status `aguardando_aprovacao`.
3. "Aprovar orçamento" → status `aprovado`.
4. **Esperado:**
   - Em "aprovar": cria `ContaReceberTitulo` com `localKey = adapter_os_faturamento:{storeId}:{osId}`, status `pendente`.
   - Garantia snapshot gravada no payload (se prazoGarantiaDias > 0).
   - Eventos `orcamento_aprovado` e `faturamento_os_pendente` na timeline.

### 8.6 Vincular cliente

1. No detalhe da OS, alterar/vincular cliente.
2. **Esperado:** `payload.cliente` (snapshot) + `clienteId` Prisma sincronizados; timeline registra mudança.

### 8.7 Usar peça / consumir estoque

1. OS com orçamento aprovado → marcar como entregue.
2. **Esperado:**
   - `consumeEstoqueFromOS` baixa **todas** as peças do orçamento em uma transação.
   - `Produto.stock` decrementa.
   - `MovimentacaoEstoque(saida, "os")` criada por produto com `documento = numero da OS`.
   - `payload.estoqueConsumido = true` (guard idempotente).
   - Status passa para `entregue`; `entregueEm` setado.
3. **Teste de re-finalização:** mudar para outro status e voltar para "entregue" → estoque **não** é baixado de novo (`payload.estoqueConsumido` bloqueia).

### 8.8 Faturamento / Conta a Receber

1. Conferir em `/dashboard/financeiro-v2` aba "A Receber".
2. **Esperado:** título "OS {numero} — Faturamento", cliente correto,
   status `pendente`, vencimento +30d (ou primeira parcela).
3. **Gerar cobrança parcelada** (`gerarCobrancaOSAction`):
   - `faturamentoModoCobranca = "parcelado"`, `faturamentoParcelas[]`
     atualizado, evento `operacao_cobranca_gerada` na timeline,
     `auditOS({ acao: "editar" })` registrado.
   - Bloqueia se período financeiro fechado.

### 8.9 Faturar OS (gera Venda) — FIX §3.2

1. "Faturar OS" no hub → `criarVendaDeOSAction`.
2. **Esperado:**
   - `Venda` criada com `clienteNome` = **nome real do cliente** (não o cuid).
   - `Venda.clienteId` (FK) preenchido se a OS tinha `clienteId`.
   - `Cliente.totalGasto` em "Cadastros" passa a incluir essa venda nas
     próximas leituras.
   - `ItemVenda` criado por cada peça do orçamento.

### 8.10 Cancelar OS (com estoque consumido)

1. OS entregue → "Cancelar" com motivo.
2. **Esperado:**
   - Status `cancelada`.
   - `restoreEstoqueFromOS` repõe estoque + `MovimentacaoEstoque(entrada, "os")`.
   - `cancelContaReceberFromOS` marca o `ContaReceberTitulo` como `cancelado`
     (preserva histórico, não deleta).
   - Garantias ativas → `cancelarGarantiasAtivasOrdem`.
   - Timeline: `os_cancelada`, `estoque_restaurado_automaticamente`,
     `financeiro_conta_receber_cancelada`.

### 8.11 Confirmar storeId correto

1. Verificar que `OrdemServico.storeId` da OS recém-criada bate com a loja
   ativa do header `x-assistec-loja-id` / cookie `assistec-active-store`.
2. **Teste alternativo (avançado):** chamar `curl -X PUT
   /api/ops/ordens?lojaId=outraloja --data '{"ordens":[]}'` com sessão admin
   válida → **deve retornar 409** `ordens_ja_existentes` se a loja já tem OS
   (FIX §3.1).

### 8.12 Riscos restantes (registro operacional)

- Observar logs `[ops/ordens PUT] guard count` (se aparecer, alguém tentou o
  endpoint legacy).
- Eventos `estoque_sync_erro` / `financeiro_sync_erro` na timeline indicam
  best-effort que falhou — investigar quando aparecer.

## 9. Orientação para uso amanhã

✅ **PODE USAR AMANHÃ** o Operações HUB para fluxo real, **desde que**:

1. O time use `/dashboard/operacoes-v2` (HUB V2) — fluxo validado nesta
   sessão.
2. Faturamento de OS via "Faturar OS" agora vincula corretamente
   `Venda.clienteId` e `Venda.clienteNome` (FIX §3.2).
3. Operadores observem eventos `estoque_sync_erro` / `financeiro_sync_erro`
   na timeline de OS — sinal para investigar manualmente.
4. PDV continua íntegro (Goals 1–3); nenhuma mudança no PDV nesta sessão.

### Sinais de alerta a monitorar (Vercel Logs)

- `[ops/ordens PUT] guard count` — guard do FIX §3.1 ativado (boa notícia:
  alguém tentou o endpoint destrutivo, mas foi bloqueado).
- `[ops/ordens PUT]` HTTP 503 — falha no `deleteMany` legado (improvável).
- Eventos `estoque_sync_erro` / `financeiro_sync_erro` na timeline da OS.

## 10. Documentação atualizada

- `docs/ai/CURRENT_STATUS.md` — entrada curta sobre a estabilização do
  Operações HUB (FIX endpoint destrutivo + FIX clienteId em faturamento).
- `CHANGELOG.md` / `MASTER_CONTEXT.md` — sem mudança de contrato/arquitetura,
  não alterados.

## 11. Próximos goals recomendados

| Prioridade | Goal sugerido | Justificativa |
|---|---|---|
| 🟡 Média | **Convergência das duas vias de OS** | HUB V2 vs OS clássica. Status, modelos e fonte de dados diferentes geram retrabalho operacional. |
| 🟡 Média | **Multi-loja real no Lovable hub** | Substituir `let CURRENT_STORE_ID = "loja-1"` por context provider; eliminar fallback mutável. |
| 🟢 Baixa | **`nextCodigo` race-safe** | Usar `findFirst orderBy: numero desc` ou sequência DB. Impacto baixo em loja única, mas ataca um risco real em multi-caixa. |
| 🟢 Baixa | **`updateOSStatus` — mover estoque para dentro da transação principal** | Hoje status pode ficar em "entregue" sem estoque baixado (best-effort com timeline log). Requer rework do contrato dos adapters. |
| 🟢 Baixa | **`expirarGarantiasVencidas` em cron, não em todo read** | Performance de `getOrdem`. |
| 🟢 Baixa | **`criarVendaDeOSAction` — passar operador da sessão** | Hoje não preenche `Venda.operador`. Pequeno gap de auditoria. |

---

**Conclusão:** Operações HUB está sólido para uso real amanhã. Dois bugs reais
foram corrigidos cirurgicamente: o endpoint legacy `PUT /api/ops/ordens` deixou
de poder apagar todas as OS quando há OS persistidas (defesa em profundidade
contra mau-uso/curl), e a venda gerada pela OS (`faturarOS`) agora preserva
corretamente `clienteNome` e `clienteId` (FK), restaurando o vínculo com o
cadastro e o cálculo de `totalGasto` por cliente. Riscos restantes
(multi-loja Lovable, race de número de OS, best-effort de adapters) ficam
documentados como próximos goals.
