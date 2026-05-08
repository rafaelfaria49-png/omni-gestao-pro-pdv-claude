# Operações HUB V2 — Check-in do Faturamento (OS → Contas a Receber)

**Escopo:** análise estática (read-only).  
**Objetivo:** mapear o fluxo atual **OS/orçamento aprovado → faturamento pendente (payload) → caminho para Contas a Receber real**.  
**Restrições desta etapa:** não implementar, não alterar Prisma/schema, não tocar Financeiro V2 mock, nem PDV/estoque/IA/anexos.

---

## 1) Onde o orçamento da OS é salvo

### 1.1 Arquivos envolvidos

- **UI**: `components/operacoes/lovable/components/operacoes/OrcamentoPanel.tsx`
  - Mantém um `draft` local e persiste via `useOS().salvarOrcamento(...)`, `enviarOrcamentoAoCliente(...)`, `approveOrcamento(...)`, `rejectOrcamento(...)`.
- **API (Lovable → Server Actions)**: `components/operacoes/lovable/api/os.ts`
  - Implementa `criarOrcamentoRascunho`, `salvarOrcamento`, `enviarOrcamentoAoCliente`, `approveOrcamento`, `rejectOrcamento`.
  - Persiste no **payload JsonB da OS** via `updateOSPayload(...)` (Server Action).
- **Tipos do domínio**: `components/operacoes/lovable/types/os.ts`
  - Define `Orcamento`, `Servico`, `PecaUsada`, `OrdemServico` e `OrcamentoStatus`.

### 1.2 Estrutura do payload (shape efetivo do orçamento)

O orçamento é persistido em `payload.orcamento` (JsonB), com o shape do tipo `Orcamento` do HUB:

- **serviços**: `orcamento.servicos: Servico[]`
  - `Servico`: `{ id, descricao, valor, desconto?, observacao?, prazoGarantiaDias?, termoGarantia? }`
- **peças**: `orcamento.pecas: PecaUsada[]`
  - `PecaUsada`: `{ id, nome, sku?, quantidade, valorUnitario, desconto?, observacao?, prazoGarantiaDias? }`
- **desconto**: `orcamento.desconto: number` (valor em R$ aplicado no total)
- **total**: `orcamento.total: number` (recalculado por `recalcularTotalOrcamento`)
- **status**: `orcamento.status: "rascunho" | "enviado" | "aprovado" | "recusado" | "expirado"`
- **aprovado/recusado**:
  - Aprovação/recusa é refletida **pelo status** e pela data `orcamento.respondidoEm`.
  - Não existe campo boolean `aprovado`/`recusado` separado no modelo atual.
- **validade**: `orcamento.validoAte?: string` (campo existe no tipo, mas não é preenchido explicitamente no fluxo atual)
- **cliente**:
  - O orçamento em si **não carrega cliente** no modelo atual.
  - A OS tem `clienteId` + `cliente` (snapshot) em `OrdemServico` (domínio do HUB), mas no Prisma `OrdemServico.clienteId` é opcional e `payload` é livre.
- **observações**:
  - `orcamento.observacao?: string` (preenchido no rascunho como `""`).
  - `orcamento.observacoes?: string` também existe no tipo (legado/duplicado de naming).

### 1.3 Eventos/timeline gerados pelo orçamento

Persistência do orçamento também anexa eventos em `payload.timeline`:

- `orcamento_criado`
- `orcamento_atualizado`
- `orcamento_item_adicionado`
- `orcamento_item_removido`
- `orcamento_enviado`
- `orcamento_aprovado`
- `orcamento_recusado`

Fonte: `components/operacoes/lovable/api/os.ts` + `components/operacoes/lovable/types/os.ts`.

---

## 2) Onde o faturamento pendente é criado

### 2.1 Arquivos envolvidos

- **Helper (canon do “slice” de faturamento)**: `lib/os/faturamento.ts`
  - Define tipos e builders do bloco de faturamento da OS:
    - `FaturamentoOSCampos`
    - `buildFaturamentoFromOrcamento(...)`
    - `buildFaturamentoRecusadoOrcamento()`
    - `isFaturamentoOS(...)`
- **Ponto de escrita no payload**: `components/operacoes/lovable/api/os.ts`
  - `approveOrcamento(...)` escreve `...buildFaturamentoFromOrcamento(...)` no payload.
  - `rejectOrcamento(...)` escreve `...buildFaturamentoRecusadoOrcamento()` no payload.

### 2.2 Payload usado (campos `faturamento*` no JsonB da OS)

O “slice” atual é **flat no payload da OS** (não é um objeto `faturamento{...}`), com os campos:

- `faturamentoPendente?: boolean`
- `faturamentoStatus?: "pendente" | "cancelado"`
- `faturamentoOrigem?: "orcamento_os"`
- `faturamentoTotal?: number`
- `faturamentoCriadoEm?: string`
- `faturamentoReferencia?: string` (ex.: `${os.codigo} · ${os.id}`)

Quando **pendente**, o helper exige coerência mínima:

- `faturamentoPendente === true`
- `faturamentoStatus === "pendente"`
- `faturamentoOrigem === "orcamento_os"`
- `faturamentoTotal` finito
- `faturamentoCriadoEm` string
- `faturamentoReferencia` string não vazia

### 2.3 Eventos/timeline criados

Na aprovação do orçamento:

- `orcamento_aprovado` (autorTipo `cliente`)
- `faturamento_os_pendente` (autor “Sistema”, autorTipo `sistema`)

Na recusa do orçamento:

- `orcamento_recusado`
- `faturamento_os_cancelado`

Além disso, o Timeline UI já tem ícone/cor para estes eventos em:

- `components/operacoes/lovable/components/operacoes/Timeline.tsx`

### 2.4 Status do faturamento

Hoje existem apenas dois estados no payload:

- `pendente`
- `cancelado`

Não há ainda:

- “gerado no financeiro”
- “parcialmente recebido”
- “recebido”
- “estornado”
- “invalido por alteração de orçamento”

Isso precisa ser planejado para não gerar duplicidade nem divergência (ver Seção 6/7).

---

## 3) Como isso poderia virar `ContaReceberTitulo` real (Prisma)

### 3.1 Modelos Prisma relevantes (estado atual do schema)

Em `prisma/schema.prisma`:

- **`ContaReceberTitulo`**
  - Campos principais: `storeId`, `localKey?`, `payload JsonB`, `descricao`, `cliente` (string), `valor`, `vencimento` (string), `status` (string)
  - Relação: `vendas: Venda[]`
  - Constraint: `@@unique([storeId, localKey])` → base para **upsert idempotente por unidade**
- **`Venda`**
  - Campos: `storeId`, `pedidoId` (unique), `payload JsonB`, `total`, `clienteNome?`
  - FK opcional: `contaReceberTituloId` → `ContaReceberTitulo`
- **`Cliente`**
  - Existe modelo de cliente importado (com `storeId`, `name`, etc.).
- **`OrdemServico` (Prisma)**
  - Tem `payload JsonB` e `clienteId?` (FK opcional).
  - Status Prisma é um enum **reduzido** (`StatusOrdemServico`), então a granularidade do HUB já depende do `payload` (coerente com a estratégia já adotada).
- **`Store`**
  - `storeId` está presente em tudo (requisito forte para evitar cross-tenant).

### 3.2 O que já existe para Contas a Receber (legado/infra)

Já existe um “domínio Contas a Receber” **clássico** que mistura `localStorage` + espelho opcional em Prisma:

- **Persistência server (upsert)**:
  - `POST /api/ops/contas-receber-persist` → `app/api/ops/contas-receber-persist/route.ts`
  - Upsert em `prisma.contaReceberTitulo` por `(storeId, localKey)`
  - Salva `payload` com o JSON completo do título
- **PDV → Conta a receber “à prazo”**:
  - `lib/pdv-append-conta-receber.ts` cria um `ContaReceberRow` e chama `/api/ops/contas-receber-persist`
- **Consultas Prisma prontas**:
  - `lib/contas-receber-prisma-queries.ts` (list/find com include de vendas/itens)
- **Sync legado**:
  - `POST /api/ops/sync-legacy-financeiro` + script `scripts/migrate-legacy-financeiro.mjs`

### 3.3 Implicações para OS → financeiro

O caminho mais seguro para transformar o faturamento pendente em financeiro real é aproveitar o “padrão idempotente por storeId+localKey” já existente em `ContaReceberTitulo`:

- Definir uma `localKey` **derivada da OS** (ex.: `os-${os.id}` ou `os-${os.id}-orc-${orcamento.id}`).
- Fazer **upsert** (nunca create simples) para evitar duplicidade.
- Guardar um `payload` rico (snapshot) com:
  - referência da OS (`osId`, `osCodigo`)
  - snapshot do orçamento aprovado (serviços/peças/desconto/total)
  - cliente (se existir id + nome)
  - regras de vencimento e parcelamento (se houver)
  - trilha de auditoria/integração

Observação importante: no schema atual, `ContaReceberTitulo` tem `cliente` como string e não `clienteId`. Portanto, **preservar `clienteId` no `payload`** é o caminho natural para manter a ligação sem migration.

---

## 4) Duplicações (o que já existe / risco de criar “2 jeitos”)

### 4.1 Já existe helper OS → “faturamento pendente”

Existe e está ativo:

- `lib/os/faturamento.ts` + escrita no payload em `components/operacoes/lovable/api/os.ts`

### 4.2 Já existe evento financeiro ligado à OS

Existe (timeline do HUB):

- `faturamento_os_pendente`
- `faturamento_os_cancelado`

### 4.3 Já existe lógica “contas a receber” com persistência server

Existe (fluxo clássico, usado por PDV e pelo painel de Contas a Receber):

- `/api/ops/contas-receber-persist` (upsert Prisma)
- `lib/pdv-append-conta-receber.ts` (cliente-side + POST)
- `lib/contas-receber-prisma-queries.ts` (server-side)

### 4.4 Já existe “Venda” e vínculo opcional com ContaReceberTitulo

Existe no Prisma, mas **o HUB de Operações ainda não usa o Prisma Venda**:

- `components/operacoes/lovable/api/vendas.ts` cria venda em um `_db` local (mock), e no `faturarOS(...)` apenas adiciona timeline e muda status, sem criar ContaReceberTitulo.

### 4.5 Conclusão de duplicações

Hoje existem **dois mundos**:

- **Operações HUB**: OS real (Prisma/payload) + orçamento real (payload) + faturamento pendente (payload) + venda **mock**.
- **Financeiro clássico/PDV**: contas a receber (localStorage) + persist opcional (Prisma) + venda (Prisma) no universo do PDV/importação.

Qualquer implementação futura deve evitar:

- criar um “terceiro caminho” de contas a receber sem reaproveitar `ContaReceberTitulo` e o padrão idempotente;
- usar “Venda mock” como base para financeiro real.

---

## 5) Proposta de arquitetura segura (sem implementar)

### Opção A — Aprovação da OS cria `ContaReceberTitulo` diretamente

**Prós**
- UX imediata: ao aprovar orçamento já aparece no Contas a Receber (server).
- Menos estados intermediários para gerenciar.

**Contras**
- Forte acoplamento: aprovação (operacional) vira side-effect financeiro “hard”.
- Se houver mudança/reatribuição/recusa posterior, exige lógica de reversão no financeiro.
- Se aprovação acontecer sem `clienteId`/cliente consistente, o título nasce “órfão”.

### Opção B — Aprovação grava evento/slice no payload e o financeiro consome depois

**Prós**
- Payload da OS vira “source of truth” do *intent* de faturamento.
- Evita side-effect financeiro se a operação ainda estiver instável (ex.: validações futuras).
- Permite consumir de forma assíncrona e idempotente (job, action, rota ops).

**Contras**
- Precisa de um “consumidor” (job/ação) e estado extra para “já materializado”.
- Se não houver rotina, o pendente fica eternamente no payload.

### Opção C — Criar um adapter/service (recomendado)

Criar um adapter que mapeie **OS payload → `ContaReceberTitulo`** e que possa ser chamado de:

- Server Action de Operações (sincronamente), **ou**
- API route de ops (assíncrono), **ou**
- Job manual (botão “Gerar título” / “Sincronizar com financeiro”)

Sugestões de localização (uma escolha, não ambas):

- `components/operacoes/lovable/services/faturamento/` (mais próximo do HUB), **ou**
- `lib/financeiro/adapters/os-faturamento.ts` (mais neutro, “domínio financeiro”)

**Recomendação:** combinar **B + C**.

- **B** já existe: o slice `faturamento*` no payload é o “evento de intenção”.
- **C** cria um adapter idempotente para materializar no Prisma quando for seguro.

O adapter deve:

- validar `storeId`
- validar `faturamentoPendente === true` e `orcamento.status === "aprovado"`
- gerar `localKey` determinística
- montar `descricao/cliente/valor/vencimento/status` e um `payload` rico
- fazer `upsert` em `ContaReceberTitulo` (idempotência)
- opcionalmente gravar no payload um marcador de materialização (sem migration; ex.: `faturamentoFinanceiroTituloId` no payload **ou** `faturamentoMaterializadoEm`)

---

## 6) Regras desejadas (mapeamento)

### 6.1 Regra: OS aprovada gera conta a receber

**Pré-condições sugeridas (para evitar lixo financeiro):**
- `faturamentoPendente === true` e `faturamentoStatus === "pendente"`
- `orcamento.status === "aprovado"`
- `faturamentoTotal > 0`
- `storeId` coerente

**Idempotência:**
- `ContaReceberTitulo.localKey` determinística por OS/orçamento (ver 6.6).

### 6.2 Regra: OS recusada cancela faturamento pendente

Hoje já cancela no payload:
- `faturamentoPendente: false`
- `faturamentoStatus: "cancelado"`
- timeline: `faturamento_os_cancelado`

No futuro, se já tiver materializado no Prisma:
- definir política: “cancelar título” (status) vs “deletar” vs “manter histórico”.
  - **Sugestão:** não deletar; atualizar `status` do título para algo como `"cancelado"` (string livre no schema atual).

### 6.3 Regra: alteração de orçamento aprovado atualiza ou invalida faturamento

Hoje não existe mecanismo de “invalidar” materialização.

Sugestão (sem migration):
- manter no payload:
  - `faturamentoTotal` (snapshot aprovado)
  - `faturamentoCriadoEm`
  - e um `orcamento.atualizadoEm`
- se `orcamento.atualizadoEm > faturamentoCriadoEm`, considerar **divergente** e exigir ação explícita:
  - atualizar título (upsert) e registrar auditoria/timeline, **ou**
  - invalidar materialização e pedir “regerar”.

### 6.4 Regra: OS entregue pode marcar recebimento pendente

Hoje `faturarOS(...)` muda OS para `entregue` e cria uma “Venda” mock.

Sugestão:
- “entregue” **não deve** automaticamente marcar “recebido”, mas pode:
  - reforçar que o título está “pronto para cobrança”,
  - ou criar um lembrete/flag no payload (não financeiro) para cobrança/recebimento.

### 6.5 Evitar duplicidade

Obrigatório:
- `upsert` por `(storeId, localKey)`.
- `localKey` derivada de OS/orçamento.
- usar `faturamentoReferencia` como referência humana, não como key.

### 6.6 Respeitar `storeId` e `clienteId`

- `storeId`: sempre do registro da OS.
- `clienteId`: se existir no Prisma OS e/ou no payload, salvar dentro do `payload` do título.
- Campo `ContaReceberTitulo.cliente` é string → usar `os.cliente.nome` (snapshot), com fallback seguro.

### 6.7 Preservar payload da OS + registrar timeline/auditoria

Hoje já registra timeline no payload.

No futuro, ao materializar no financeiro:
- adicionar um evento novo na timeline do HUB (ex.: `faturamento_os_titulo_gerado`) **ou** reusar `mudanca_status` com metadata.
- manter “auditoria financeira” no payload do título (campo `payload` do Prisma) para rastreabilidade.

---

## 7) Riscos (lista objetiva)

- **Duplicidade de contas**: se criar título por “create” sem `localKey` determinística / sem upsert.
- **OS sem cliente**:
  - no Prisma `OrdemServico.clienteId` é opcional;
  - no domínio do HUB, `clienteId` é obrigatório → risco de descompasso em dados legados.
- **Cliente string vs `clienteId`**:
  - `ContaReceberTitulo` tem `cliente` string; sem migration, `clienteId` precisa ir no `payload`.
- **Valor alterado após aprovação**:
  - orçamento pode ser editado depois se UI permitir (status/fluxo); sem regra clara, haverá divergência entre OS e título.
- **Integração com Financeiro V2 mock (Lovable)**:
  - Financeiro V2 mock não deve ser “destino” de dados reais.
  - Risco: tentar “espelhar” OS lá e criar um segundo sistema.
- **Integração futura com backend real**:
  - se o adapter não for idempotente e multi-store, migração futura vira retrabalho.
- **Conflitos com Venda/PDV**:
  - já existe `Venda` Prisma e também venda mock no HUB; misturar causará inconsistências.
  - PDV já cria títulos “à prazo” com `localKey=pdv-aprazo-${saleId}`; OS deve ter namespace próprio.

---

## 8) Recomendação técnica (decisão)

**Escolha recomendada:** **Opção C (adapter) implementando Opção B (payload como intenção)**.

Motivo: o projeto já possui o slice de faturamento no payload e já possui um padrão pronto de persistência idempotente para `ContaReceberTitulo`. O adapter permite evoluir incrementalmente sem acoplar Operações HUB ao Financeiro V2 mock e sem exigir migration.

---

## 9) Ordem segura de implementação (futuro, fora do escopo desta etapa)

1. **Adapter puro (sem side-effects)**: função que recebe `OrdemServico` (payload) e retorna um “draft” de `ContaReceberTitulo` (scalars + payload + localKey).
2. **Upsert idempotente server-side**:
   - via Server Action nova (financeiro/ops) **ou** via API ops existente (novo endpoint).
3. **Sinalização no payload** (opcional, sem migration):
   - guardar `contaReceberLocalKey` ou `contaReceberTituloId` dentro do payload da OS.
4. **UI/UX mínimo**:
   - botão “Gerar título no financeiro” na OS (somente quando `faturamentoPendente`).
   - feedback via timeline (novo evento).
5. **Política de atualização/cancelamento**:
   - recusa após materialização → atualizar status do título.
   - alteração de orçamento após aprovação → invalidar ou atualizar (regra definida).

---

## 10) Achados finais (o que existe hoje)

- **Fluxo atual encontrado**:
  - Aprovação de orçamento grava `orcamento.status="aprovado"` + `faturamento*` no payload e eventos na timeline.
  - Recusa grava `orcamento.status="recusado"` + `faturamentoStatus="cancelado"` e evento de cancelamento.
- **Estrutura atual do payload**:
  - `payload.orcamento` (itens + total + status + datas)
  - `payload.faturamentoPendente`, `payload.faturamentoStatus`, `payload.faturamentoTotal`, etc. (flat)
- **Helper reaproveitável**:
  - `lib/os/faturamento.ts` já é o “canon” do slice de faturamento.
  - Infra de contas a receber já tem `ContaReceberTitulo` + upsert por `storeId+localKey` e rotas ops de persist/sync.
- **Recomendação**:
  - Adapter idempotente OS→ContaReceberTitulo (Opção C) consumindo o slice do payload (Opção B).

