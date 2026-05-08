# Operações HUB V2 — Check-in técnico de Estoque/Peças da OS (read-only)

**Escopo:** análise estática do repositório.  
**Objetivo:** mapear como **peças/estoque** funcionam hoje no Operações HUB V2 e definir um caminho seguro para torná-las **reais** (Prisma) sem duplicidade/baixas erradas.  
**Restrições:** não alterar código nesta etapa; não mexer em Prisma; não mexer em PDV/Financeiro.

---

## 1) Onde peças são usadas hoje na OS (HUB V2)

### 1.1 Orçamento (peças no orçamento)

- **Arquivo**: `components/operacoes/lovable/components/operacoes/OrcamentoPanel.tsx`
- **Como funciona**:
  - peças do orçamento são `Orcamento.pecas: PecaUsada[]` (linhas com `id`, `nome`, `quantidade`, `valorUnitario`, etc.)
  - o orçamento é persistido no **payload JsonB** da OS via `updateOSPayload(..., { orcamento })` em `components/operacoes/lovable/api/os.ts`

Observação: a UI trata o orçamento como “editável” apenas em `rascunho`, mas o backend aceita patches com `orcamento` (logo, é importante haver política e auditoria server-side — já existe para orçamento aprovado).

### 1.2 Peças “na OS” (fora do orçamento)

- **Arquivo**: `components/operacoes/lovable/api/os.ts`
- **Função**: `addPecaFromEstoque(osId, peca, autor)`
  - grava `pecas: PecaUsada[]` no payload da OS (array raiz `payload.pecas`)
  - registra evento de timeline: `peca_adicionada` com `metadata.pecaId`
  - antes de persistir, chama `reservarPeca(...)`

### 1.3 Reserva e baixa (camada “estoque” do HUB)

- **Arquivo**: `components/operacoes/lovable/api/estoque.ts`
  - `reservarPeca(pecaId, quantidade, osId)`:
    - **não baixa estoque**
    - cria um `MovimentoEstoque` com `tipo: "reserva"` em um DB em memória
  - `baixarPeca(pecaId, quantidade, origem, origemId)`:
    - baixa `peca.estoqueAtual = Math.max(0, estoqueAtual - quantidade)`
    - cria `MovimentoEstoque` com `tipo: "saida"`

### 1.4 Modo Bancada

- **Arquivo**: `components/operacoes/lovable/components/operacoes/ModoBancadaModal.tsx`
- **Estado atual**:
  - “Adicionar peça” é **placeholder** (`toast("Adicionar peça (em breve)")`)
  - não chama `addPecaFromEstoque` nem persiste peças/estoque

### 1.5 Checklist técnico

- **Arquivo**: `components/operacoes/lovable/pages/OSDetalhe.tsx`
- **Estado atual**:
  - checklist é patch em `payload.checklist` (sem relação direta com peças)

### 1.6 Timeline

- **Arquivo**: `components/operacoes/lovable/types/os.ts` + `components/operacoes/lovable/components/operacoes/Timeline.tsx`
- Evento existente: `peca_adicionada` (renderizado no Timeline)

---

## 2) O que é real vs o que é mock

### 2.1 O que é real (Prisma)

No schema Prisma (`prisma/schema.prisma`) existe infraestrutura real para estoque em nível de produto e itens de OS:

- **Produto**: campo `Produto.stock` (int) por `storeId`
- **OrdemServicoItem**: itens ligados a uma OS e a um Produto:
  - `ordemServicoId`, `produtoId`, `quantidade`, `precoUnitario`

Existe também lógica server-side que **baixa/restaura estoque de verdade**:

- **Arquivo**: `lib/os-itens-stock.ts`
  - valida estoque (`somaPecasEValidaEstoque`)
  - restaura antes de regravar (`restaurarEstoqueItensOrdem`)
  - baixa e cria itens (`baixarEstoqueECriarItens`)
- **Rotas API “OS clássica”**:
  - `app/api/ordens-servico/route.ts` (POST cria OS e baixa estoque real)
  - `app/api/ordens-servico/[id]/route.ts` (PATCH restaura e re-baixa; DELETE restaura e apaga OS)

### 2.2 O que é mock (Operações HUB V2 Lovable)

O Operações HUB V2 usa um DB em memória para:

- peças (`PecaEstoque` em `components/operacoes/lovable/api/_db.ts`)
- movimentos (`MovimentoEstoque` em memória)
- vendas (`Venda` mock em `components/operacoes/lovable/api/vendas.ts`)

Consequência: a “reserva/baixa” do HUB hoje **não afeta** `Produto.stock` do Prisma nem cria `OrdemServicoItem`.

### 2.3 Vendas e baixa de estoque no HUB

No HUB:

- `criarVendaDeOS(os)` em `components/operacoes/lovable/api/vendas.ts`
  - baixa estoque chamando `baixarPeca(item.id, item.quantidade, "venda", venda.id)`
  - mas isso baixa o **estoqueAtual do mock**, não o `Produto.stock` real

---

## 3) Schema Prisma relevante (resumo)

- **Produto**
  - `storeId`, `stock`, `price`, `precoCusto`, `sku/barcode` etc.
- **OrdemServico (Prisma)**
  - `payload JsonB` + relação `itens: OrdemServicoItem[]`
- **OrdemServicoItem**
  - item de estoque consumido pela OS (real)
- **Venda / ItemVenda**
  - venda real (PDV/import), com `ItemVenda.inventoryId?` (ponte possível) e snapshot via payload
- **ContaReceberTitulo**
  - título real de contas a receber (já usado pelo adapter OS→CR)

---

## 4) Riscos (lista objetiva)

### 4.1 Baixa duplicada / baixa em dois mundos

Hoje coexistem:
- baixa “mock” no HUB (`PecaEstoque.estoqueAtual`)
- baixa “real” no legado (`Produto.stock` + `OrdemServicoItem`)

Risco: quando for “tornar real”, é fácil acabar baixando duas vezes se não houver **idempotência** e um único “source of truth”.

### 4.2 Baixa antes do momento correto

Se baixar no momento “errado” (ex.: ao adicionar peça ou ao aprovar orçamento):
- pode consumir estoque de OS que será cancelada/recusada
- pode gerar estornos complexos em revisões pós-aprovação

### 4.3 Orçamento alterado depois da baixa

Com política de revisão, o orçamento pode mudar após aprovado. Se estoque já tiver sido consumido:
- precisa de regra clara para “diferença de consumo” (increment/decrement por delta)

### 4.4 Estorno/cancelamento/OS cancelada

Precisa restaurar:
- reservas (se existirem)
- consumo (se já baixado)

### 4.5 Peça sem produto real

No HUB, `PecaUsada.id` pode não corresponder a `Produto.id` real (porque vem do mock seed).
Isso quebra qualquer tentativa direta de decrementar `Produto.stock`.

### 4.6 Estoque negativo

No mock, baixa faz clamp `Math.max(0, ...)`.
No real, deve ser transação com validação (falhar com erro de negócio).

### 4.7 Multi-loja (storeId)

É obrigatório validar `storeId` em todas as operações de estoque para evitar cross-tenant.

### 4.8 Concorrência

Baixas reais precisam ser transacionais:
- duas OS consumindo o mesmo item ao mesmo tempo
- reprocessamento idempotente

---

## 5) Proposta de arquitetura segura (sem implementar)

### 5.1 Princípio: um único “estoque real”

Escolha recomendada:
- **Fonte de verdade do estoque**: `Produto.stock` (Prisma)
- **Ledger mínimo de consumo por OS**: `OrdemServicoItem` (Prisma)

### 5.2 Adapter OS → Estoque (idempotente)

Criar (futuro) um service server-side, análogo ao adapter financeiro:

- `lib/operacoes/services/estoque-sync-service.ts` (nome sugerido)
- chave idempotente por unidade + OS:
  - `os-estoque:{storeId}:{osId}`

Responsabilidades:
- validar se `payload.pecas` está apto para consumo real
- mapear `pecas[]` para `Produto` (exigirá migrar para usar `produtoId` real, ou manter um “lookup” seguro)
- aplicar delta de consumo de forma transacional
- registrar eventos na timeline

### 5.3 Momento certo para baixa (recomendação)

Sugestão (reduz risco):

- **Reserva** quando a peça é adicionada na OS (opcional, se for implementar reserva real)
- **Baixa/consumo real** somente em um “ponto final” estável:
  - opção mais segura: na transição para `entregue` (ou no “faturar/entregar”)
  - alternativa: ao iniciar execução (risco maior; exige estorno robusto)

Motivo: reduz necessidade de estornos em OS que não concluem.

### 5.4 Como registrar no payload (estado proposto)

Sem migration, usar payload como trilha/auditoria e idempotência:

- `payload.pecasReservadas?: boolean`
- `payload.pecasReservadasEm?: string`
- `payload.pecasConsumidas?: boolean`
- `payload.pecasConsumidasEm?: string`
- `payload.estoqueMovimentos?: Array<{ id: string; tipo: "reserva" | "consumo" | "estorno"; produtoId: string; quantidade: number; at: string; origem: string }>`
- `payload.estoqueSyncErro?: { at: string; message: string }`

### 5.5 Timeline (eventos sugeridos)

Novos eventos (futuro):
- `peca_reservada`
- `peca_consumida`
- `peca_estornada`
- `estoque_sync_erro`

---

## 6) Ordem segura de implementação (futuro)

1. **Unificar IDs**: garantir que as “peças” usadas no HUB referenciem `Produto.id` real (ou criar um mapping explícito).
2. **Implementar consumo real em transação** usando `OrdemServicoItem` + decrement de `Produto.stock`.
3. **Idempotência**: guardar `payload.pecasConsumidas*` e/ou um hash/versão do consumo aplicado.
4. **Delta em revisões**: comparar estado anterior vs novo para consumir/estornar apenas a diferença.
5. **Reserva real (opcional)**: se necessário, criar modelo/estratégia (pode ficar em payload inicialmente).
6. **UX/observabilidade**: timeline + erros de sync no payload.

---

## 7) Conclusão (estado atual)

- **HUB V2**: peças/estoque são majoritariamente **mock** (DB em memória) e persistem no payload apenas como `pecas: PecaUsada[]` + eventos.
- **Legado OS (API routes)**: já existe caminho **real** (Prisma) com `Produto.stock` + `OrdemServicoItem` + transação e validação.
- Maior risco: **convergir os dois mundos** sem duplicidade; a recomendação é materializar consumo real em um único ponto (preferencialmente `entregue/faturar`) com idempotência e trilha no payload.

