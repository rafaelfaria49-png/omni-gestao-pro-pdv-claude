# Módulo de Compras e Fornecedores — Plano Técnico

> **Data:** 21 Mai 2026  
> **Objetivo:** Auditoria do estado atual e plano de implementação futura.  
> **Restrições:** Este documento NÃO altera código, schema, migrations nem nenhum módulo existente.

---

## 1. O Que Já Existe

### 1.1 Model Prisma — `Fornecedor` ✅ Real

```
prisma/schema.prisma (linhas 965–1014)
tabela: fornecedores
```

Campos presentes: `id`, `storeId`, `name` (fantasia), `legalName` (razão social), `contactName`, `document` (CNPJ/CPF), `email`, `phone`, `whatsapp`, `address` (texto livre), `productsProvided`, `avgLeadTime`, `paymentTerms`, `notes`, `active`.

Relacionamento existente: `contasPagar ContaPagarTitulo[]` — FK opcional em `ContaPagarTitulo.fornecedorId`.

Banco tem **15 fornecedores** reais importados do GestaoClick (via importador avançado em 17/05/2026).

---

### 1.2 Server Actions — CRUD de Fornecedor ✅ Real

```
app/actions/cadastros.ts
```

- `listFornecedores(storeId)` — lista até 500, ordenado por updatedAt desc, retorna `FornecedorDTO`.
- `upsertFornecedor(storeId, input)` — cria ou edita, validação de nome obrigatório.
- KPI "Fornecedores ativos" e "Fornecedores com CNPJ" já calculados no dashboard de cadastros.

---

### 1.3 UI — Painel de Fornecedores (Cadastros HUB) ✅ Real

```
components/cadastros/lovable/components/cadastros/CadastrosHub.tsx
```

Tab "Fornecedores" com ícone Truck. Exibe tabela com nome, CNPJ, contato, prazo, pagamento, última compra (placeholder "—"), status. Modal de edição completo. Botão Ativar/Inativar. Coluna "Categoria" é placeholder — retorna sempre "—".

---

### 1.4 Model Prisma — `ContaPagarTitulo` ✅ Real

```
prisma/schema.prisma (linhas 1063–1096)
tabela: contas_pagar_titulos
```

FK opcional `fornecedorId → Fornecedor`. Tem `localKey` (idempotência), `payload` JSONB (parcelas, histórico), `numeroDocumento` (campo para NF/boleto/referência), status completo (pendente/pago/atrasado/parcial/cancelado/estornado).

---

### 1.5 Serviço Financeiro — Contas a Pagar ✅ Real

```
lib/financeiro/services/contas-pagar-service.ts
```

Funções: `listContasPagarByStore`, `upsertContaPagar`, `liquidarContaPagar`, `registrarPagamentoParcialContaPagar`, `estornarPagamentoContaPagar`, `buildContaPagarSummary`, `buildContaPagarAuditTrail`. Suporte a parcelas em `payload.historico`, cálculo de saldo, audit trail.

---

### 1.6 API Routes — Contas a Pagar ✅ Reais

```
app/api/ops/contas-pagar-list/route.ts        GET  — lista + summary + audit
app/api/ops/contas-pagar-persist/route.ts     POST — persiste do localStorage
app/api/financeiro/contas-pagar/liquidar/route.ts
app/api/financeiro/contas-pagar/pagamento-parcial/route.ts
app/api/financeiro/contas-pagar/estornar/route.ts
app/api/financeiro/contas-pagar/estornar-ultimo-pagamento/route.ts
```

---

### 1.7 Model Prisma — `MovimentacaoEstoque` ✅ Real

```
prisma/schema.prisma (linhas 746–785)
tabela: movimentacoes_estoque
```

Livro-razão append-only. Campos relevantes para compras: `tipo` ("entrada"), `origem` ("manual" ou futuro "compra"), `documento`, `fornecedor` (string snapshot), `custoUnitario`, `custoMedioAntes/Depois`, `valorTotal`, `usuario`. Já usado pelas origens `os` e `pdv`.

---

### 1.8 Server Actions — Entrada de Estoque ✅ Real

```
app/actions/estoque.ts
```

- `registrarEntradaEstoque(storeId, input)` — transação Prisma que recalcula custo médio ponderado e atualiza `Produto.stock` + `Produto.precoCusto`. Recebe `documento`, `fornecedor`, `observacao`, `usuario`.
- `registrarAjusteEstoque(storeId, input)` — ajuste de inventário.
- `listMovimentacoesEstoque(storeId, filters)` — histórico filtrado.
- `getEstoqueResumo(storeId)` — KPIs de valor de custo, venda potencial, margem.

---

### 1.9 UI — Modal de Movimentação de Estoque ✅ Real

```
components/cadastros/lovable/components/cadastros/MovimentacaoEstoqueModal.tsx
```

Modal com abas: Entrada (campos quantidade, custo, fornecedor, documento NF, observação, preview custo médio), Ajuste, Histórico (últimas 50 movimentações). Funciona via `registrarEntradaEstoque()`.

---

### 1.10 Planejamento de Compras ✅ Real (client-side, localStorage)

```
lib/purchase-planning.ts          — cálculo de cobertura e sugestão
lib/purchase-planning-pdf.ts      — gerador de PDF
lib/purchase-planning.test.ts     — testes Vitest
components/dashboard/estoque/planejamento-compras.tsx — UI da lista
```

Calcula cobertura de estoque em dias (venda líquida 30d), sugere reposição quando cobertura < 7 dias ou estoque zerado. Opera sobre `InventoryItem[]` e `SaleRecord[]` do localStorage — **não persiste pedido de compra no banco**.

---

### 1.11 Auditoria de Estoque ✅ Real

```
components/dashboard/estoque/auditoria-estoque.tsx
```

Página com tabela filtrada de `MovimentacaoEstoque`, incluindo campos de fornecedor, documento, usuário.

---

### 1.12 Importador — Campo de Frete ⚠️ Parcial

```
lib/importador-avancado/detector.ts (linha 165–166)
```

Detecta colunas "valor frete" / "frete" e mapeia para `financeiro.frete`, mas sem model ou serviço específico. Dado passa pela importação mas não é gerenciado.

---

## 2. O Que Não Existe

| Funcionalidade | Status |
|---|---|
| **Pedido de Compra (PO)** | ❌ Inexistente — sem model, sem rota, sem UI |
| **Itens do Pedido de Compra** | ❌ Inexistente |
| **Cotação de Fornecedor** | ❌ Inexistente — sem model, sem rota |
| **Recebimento formal de mercadoria** | ⚠️ Parcial — existe entrada manual por produto, mas sem vínculo com PO |
| **Lançamento automático de Conta a Pagar na compra** | ❌ Inexistente |
| **Importação de XML / NF-e** | ❌ Inexistente — zero rotas, models ou serviços para XML/SEFAZ |
| **Transportadora / Frete (entidade)** | ❌ Inexistente — sem model, sem CRUD |
| **Rastreamento de pedido / entrega** | ❌ Inexistente |
| **Histórico de preços do fornecedor** | ❌ Inexistente |
| **Avaliação de fornecedor** | ❌ Inexistente |
| **Aprovação de compra (workflow)** | ❌ Inexistente |
| **Vínculo Fornecedor → Produto** | ⚠️ Parcial — `Produto.supplierName` é string livre, sem FK |

---

## 3. Modelo Operacional Futuro

### 3.1 Fluxo Completo de Compras

```
Planejamento de Compras
       │
       ▼
 Pedido de Compra (PO)
       │ inclui
       ▼
 ItemPedidoCompra (produto, qtd, custo unitário, desconto)
       │
       ▼
 Recebimento de Mercadoria
       │ gera automaticamente
       ├──▶ MovimentacaoEstoque (tipo:"entrada", origem:"compra", documento:PO.numero)
       │       └── recalcula custo médio ponderado (já implementado em registrarEntradaEstoque)
       │
       └──▶ ContaPagarTitulo (valor=total recebido, fornecedorId, numeroDocumento=NF/PO)
               └── payload.historico para rastreamento de pagamentos
```

---

### 3.2 Models Prisma Futuros

#### `PedidoCompra`

```prisma
model PedidoCompra {
  id           String   @id @default(cuid())
  storeId      String
  store        Store    @relation(...)
  numero       String   // PC-2026-0001
  fornecedorId String?
  fornecedor   Fornecedor? @relation(...)
  // "rascunho" | "enviado" | "parcialmente_recebido" | "recebido" | "cancelado"
  status       String   @default("rascunho")
  valorTotal   Float    @default(0)
  prazoEntrega String   @default("")   // "5 dias úteis" ou data ISO
  frete        Float    @default(0)
  observacao   String?  @db.Text
  payload      Json?    @db.JsonB      // histórico de status, aprovações
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt

  itens           ItemPedidoCompra[]
  recebimentos    RecebimentoCompra[]
  contasPagar     ContaPagarTitulo[]  // FK futura opcional

  @@unique([storeId, numero])
  @@index([storeId])
  @@index([storeId, status])
  @@index([fornecedorId])
  @@map("pedidos_compra")
}
```

#### `ItemPedidoCompra`

```prisma
model ItemPedidoCompra {
  id              String        @id @default(cuid())
  pedidoCompraId  String
  pedidoCompra    PedidoCompra  @relation(...)
  produtoId       String?
  produto         Produto?      @relation(...)
  descricao       String        @default("")     // snapshot do nome (não FK pura)
  quantidade      Int
  qtdRecebida     Int           @default(0)
  custoUnitario   Float         @default(0)
  desconto        Float         @default(0)      // % de desconto
  lineTotal       Float         @default(0)

  @@index([pedidoCompraId])
  @@index([produtoId])
  @@map("itens_pedido_compra")
}
```

#### `RecebimentoCompra`

```prisma
model RecebimentoCompra {
  id             String        @id @default(cuid())
  storeId        String
  store          Store         @relation(...)
  pedidoCompraId String?
  pedidoCompra   PedidoCompra? @relation(...)
  // NF-e key (futuro) | número manual de NF
  numeroNF       String        @default("")
  chaveNFe       String?       @unique       // 44 dígitos — fase XML
  valorTotal     Float         @default(0)
  frete          Float         @default(0)
  operador       String?
  payload        Json?         @db.JsonB     // itens recebidos com qtd e custo
  createdAt      DateTime      @default(now())

  @@index([storeId])
  @@index([pedidoCompraId])
  @@map("recebimentos_compra")
}
```

#### `Transportadora` (fase posterior)

```prisma
model Transportadora {
  id       String  @id @default(cuid())
  storeId  String
  store    Store   @relation(...)
  name     String
  cnpj     String  @default("")
  phone    String  @default("")
  active   Boolean @default(true)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@index([storeId])
  @@map("transportadoras")
}
```

> Adicionar `transportadoraId String?` em `RecebimentoCompra` quando Transportadora existir.

---

### 3.3 Campos Adicionais em Modelos Existentes

| Model | Campo a adicionar | Justificativa |
|---|---|---|
| `Fornecedor` | `fornecedorId: String?` em `Produto` (FK) | Substituir `supplierName` livre por FK real |
| `ContaPagarTitulo` | `pedidoCompraId String?` | Rastreabilidade compra → financeiro |
| `MovimentacaoEstoque` | `pedidoCompraId String?` | Rastreabilidade compra → ledger |

> **Atenção:** Qualquer adição ao schema exige autorização explícita do usuário e migration controlada.

---

### 3.4 APIs / Server Actions Futuras

```
Domínio Pedido de Compra:
  app/actions/compras.ts
    - listPedidosCompra(storeId, filters?)
    - createPedidoCompra(storeId, input)
    - updatePedidoCompra(storeId, id, input)
    - cancelarPedidoCompra(storeId, id)
    - receberMercadoria(storeId, pedidoId, itensRecebidos) → chama registrarEntradaEstoque + cria ContaPagarTitulo

  app/api/compras/pedidos/route.ts    GET | POST
  app/api/compras/recebimento/route.ts  POST

Domínio XML / NF-e (fase longa):
  app/api/compras/nfe-import/route.ts
    - POST multipart/form-data com XML
    - Parsear: emitente (fornecedor), itens (produto+qtd+valor), totais, chave NF-e
    - Preview: retorna PO proposto sem persistir (modo=preview)
    - Confirmar: modo=importar → cria PO + recebimento + MovimentacaoEstoque[] + ContaPagarTitulo

Domínio Transportadora (fase posterior):
  app/actions/transportadoras.ts
    - listTransportadoras / upsertTransportadora
```

---

### 3.5 Importação XML NF-e — Estratégia Futura

A NF-e de entrada tem estrutura XML bem definida. O parser precisaria extrair:

| Tag XML NF-e | Campo destino |
|---|---|
| `emit/CNPJ` + `emit/xNome` | `Fornecedor.document` + `Fornecedor.name` (upsert por CNPJ + storeId) |
| `infNFe/@Id` (chave 44 dígitos) | `RecebimentoCompra.chaveNFe` (idempotência) |
| `ide/nNF` | `RecebimentoCompra.numeroNF` |
| `det/prod/xProd` | `ItemPedidoCompra.descricao` (match fuzzy com `Produto.name`) |
| `det/prod/cProd` / `det/prod/cEAN` | Match com `Produto.sku` / `Produto.barcode` |
| `det/prod/NCM` | Guardar em `Produto.metadata.ncm` |
| `det/prod/qCom` + `det/prod/vUnCom` | `quantidade` + `custoUnitario` |
| `total/ICMSTot/vNF` | `RecebimentoCompra.valorTotal` |
| `total/ICMSTot/vFrete` | `RecebimentoCompra.frete` |
| `transp/transporta/CNPJ` | `Transportadora.cnpj` (upsert futuro) |

**Fluxo de importação XML:**
1. Upload do XML (DOMParser client ou xmldom server-side).
2. Preview: mostra fornecedor, itens com match de produto, total, frete.
3. Confirmação: cria RecebimentoCompra + PedidoCompra automático (status:"recebido") + `MovimentacaoEstoque` por item + `ContaPagarTitulo`.
4. Idempotência: `chaveNFe` unique em `RecebimentoCompra` — reimport não duplica.

---

## 4. Dependências com Módulos Existentes

### 4.1 Dependências Lidas (sem alterar)

| Módulo | Integração | Tipo |
|---|---|---|
| `Produto` (Cadastros) | FK para vincular produto ao item do PO | Leitura — busca por SKU/barcode/nome |
| `MovimentacaoEstoque` | `registrarEntradaEstoque()` já existe e funciona | Chamada direta sem alteração |
| `ContaPagarTitulo` + serviço | `upsertContaPagar()` já existe | Chamada direta sem alteração |
| `Fornecedor` | CRUD já existe | Leitura + FK no PO |
| `LogsAuditoria` | Registrar criação/recebimento de PO | Append-only, sem risco |

### 4.2 Pontos de Conflito Potencial

| Risco | Descrição | Mitigação |
|---|---|---|
| **Financeiro** | `ContaPagarTitulo` gerado pela compra pode colidir com o importador GestaoClick se usar `localKey` igual | Prefixo distinto: `compra:{storeId}:{pedidoCompraId}` |
| **Estoque (PDV/OS)** | `registrarEntradaEstoque()` já é usado pelo modal de Movimentação; adicionar origem `"compra"` não quebra nada | Apenas novo valor para o campo `origem` |
| **Importador Avançado** | XML NF-e precisará match de produto por SKU/barcode; se produto não existir, precisa criar ou ignorar | Definir política explícita: preview honesto, nunca criar produto silenciosamente |
| **Schema Prisma** | Novos models exigem migration com `DIRECT_URL` e `db:migrate` (não `db:push`) | Usar `npm run db:migrate` em branch isolada |
| **Fornecedor → Produto FK** | Adicionar `fornecedorId` em `Produto` é breaking change no importador | Manter `supplierName` legado, adicionar FK como campo opcional |
| **NF-e chave duplicada** | Mesmo XML re-importado deve ser idempotente | Unique constraint em `chaveNFe` em `RecebimentoCompra` |

---

## 5. O Que Não Seria Tocado

Por regras de governança, a implementação de Compras **nunca deve tocar**:

- `auth.ts`, `auth.config.ts`, `proxy.ts`
- `prisma/schema.prisma` (sem autorização explícita a cada adição)
- Módulo PDV (rotas `/dashboard/vendas`, `/dashboard/pdv-next`)
- Módulo Operações/OS (fluxos de `app/actions/operacoes.ts`)
- Contratos financeiros existentes (`lib/financeiro/contracts/`)
- Adapter OS→Financeiro (`lib/financeiro/adapters/os-faturamento.ts`)
- Importador Avançado (apenas estender `detector.ts` para XML, nunca alterar parsers existentes)

---

## 6. Arquivos que Seriam Tocados Futuramente

### Novos (criar do zero)

```
prisma/schema.prisma                      — adicionar PedidoCompra, ItemPedidoCompra, RecebimentoCompra, Transportadora
prisma/migrations/YYYYMMDD_compras/       — migration controlada

app/actions/compras.ts                    — Server Actions de PO e Recebimento
app/api/compras/pedidos/route.ts
app/api/compras/recebimento/route.ts
app/api/compras/nfe-import/route.ts       — fase XML

lib/compras/services/po-service.ts        — criar PO + idempotência
lib/compras/services/recebimento-service.ts — receber + lançar estoque + financeiro
lib/compras/parsers/nfe-xml-parser.ts     — DOMParser/xmldom para NF-e

app/dashboard/compras/page.tsx            — rota Next.js
app/dashboard/compras/layout.tsx          — opcional, se hub isolado

components/compras/                       — HUB de Compras (Lovable ou nativo)
  ComprasHub.tsx
  PedidoCompraModal.tsx
  RecebimentoModal.tsx
  NFeImportPreview.tsx
```

### Modificados (cirúrgico)

```
prisma/schema.prisma                      — add campos a Produto (fornecedorId?), ContaPagarTitulo (pedidoCompraId?)
app/dashboard/layout.tsx                  — adicionar isCompras para noPadding se hub isolado
components/cadastros/.../CadastrosHub.tsx — coluna "Última compra" usa dado real de PedidoCompra
lib/importador-avancado/detector.ts       — adicionar domínio "nfe_xml" para arquivos .xml
lib/importador-avancado/persistidor.ts    — suporte a modo "recebimento_nfe" (fase XML)
```

---

## 7. Riscos de Conflito com PDV / OS / Financeiro / Produtos

| Área | Risco | Nível | Mitigação |
|---|---|---|---|
| **PDV** | Nenhum — compras são entrada, PDV é saída | Baixo | Nenhuma ação necessária |
| **OS/Operações** | OS consome estoque (saída). Compra repõe (entrada). Sem conflito de fluxo | Baixo | Usar `origem:"compra"` vs `origem:"os"` já diferenciados |
| **Financeiro** | `ContaPagarTitulo` gerado por compra pode duplicar se importador GestaoClick re-rodar | Médio | `localKey` com prefixo `compra:` distinto de `imp-gc:` |
| **Financeiro** | `MovimentacaoFinanceira` de saída (pagamento) ainda é manual — não há auto-lançamento em `ContaPagarTitulo.liquidar` | Baixo | Comportamento atual mantido; compra gera ContaPagar, liquidação é manual como sempre |
| **Produtos** | Match produto ↔ item NF-e pode falhar por nome diferente | Alto | Modo preview obrigatório antes de confirmar; nunca criar produto silenciosamente |
| **Importador Avançado** | XML tem estrutura diferente de XLSX — risco de quebrar detector.ts | Médio | Criar domínio `nfe_xml` separado com extensão `.xml`, sem alterar lógica XLSX |
| **Schema** | Adicionar FKs em Produto e ContaPagarTitulo requer migration com dados existentes | Alto | FK opcional (nullable), migration `DEFAULT NULL` segura em produção |
| **Multi-loja** | `PedidoCompra` e `RecebimentoCompra` precisam de `storeId` em todo query | Alto | Padrão já estabelecido — seguir o mesmo padrão de `Fornecedor` |

---

## 8. Recomendação de Ordem de Implementação

### Fase C1 — Fundação (Pré-requisito de tudo)

> Nenhum conflito com PDV/OS/Financeiro em andamento.

1. **Adicionar `fornecedorId` (nullable) em `Produto`** — permite vincular produto ao fornecedor principal sem quebrar nada existente. Migration segura.
2. **Adicionar `pedidoCompraId` (nullable) em `ContaPagarTitulo`** — vínculo rastreável sem breaking change.
3. **Criar `PedidoCompra` + `ItemPedidoCompra`** — models limpos, sem tocar outros.
4. **`app/actions/compras.ts`** — CRUD básico de PO: criar, listar, cancelar.

**Quando implementar:** Após consolidação completa do fluxo PDV→Caixa→Financeiro→Estoque (sessão paralela atual).

---

### Fase C2 — Recebimento de Mercadoria

> Depende de C1.

5. **Criar `RecebimentoCompra`** — vincula PO ao recebimento real.
6. **`receberMercadoria()`** — transação que chama `registrarEntradaEstoque()` (já existe) + `upsertContaPagar()` (já existe) + atualiza `PedidoCompra.status`.
7. **UI — Modal de Recebimento** — lista itens do PO, campos de qtd recebida e custo real (pode diferir do PO), número da NF manual.

**Quando implementar:** 1–2 semanas após C1, sem interferência com outros módulos.

---

### Fase C3 — HUB de Compras (UI Completa)

> Depende de C2.

8. **Rota `/dashboard/compras`** — página Next.js com lista de POs.
9. **`ComprasHub.tsx`** — tabela de POs com filtros (status, fornecedor, data), botão "Novo Pedido", botão "Receber".
10. **`PedidoCompraModal.tsx`** — formulário com seleção de fornecedor (busca real), adição de itens (busca de produto por SKU/nome), cálculo de total.
11. **Integração com Planejamento de Compras** — botão "Criar PO" na lista de sugestão do `planejamento-compras.tsx`.
12. **Coluna "Última compra"** em `CadastrosHub.tsx` — substitui placeholder "—" por data real do último PO recebido.

**Quando implementar:** Após C2, pode ser desenvolvido em paralelo ao Marketplace HUB.

---

### Fase C4 — Transportadora / Frete

> Independente de C2, mas naturalmente vem depois.

13. **Model `Transportadora`** — CRUD simples.
14. **Campo `transportadoraId` em `RecebimentoCompra`**.
15. **Campo `frete` surfacado no recebimento** — já existe em `MovimentacaoEstoque.fornecedor` e no importador, mas sem entidade própria.

**Quando implementar:** P2 — conforto de uso, não bloqueia nada.

---

### Fase C5 — Importação XML / NF-e

> Depende de C2 (recebimento) e é risco médio-alto.

16. **`lib/compras/parsers/nfe-xml-parser.ts`** — DOMParser (client-side) ou `xmldom` (server-side) para extrair emitente, itens, totais, chave NF-e.
17. **`app/api/compras/nfe-import/route.ts`** — upload + preview (nunca persiste sem confirmação).
18. **Match produto → NF-e** — busca por `barcode` (EAN) > `sku` (cProd) > nome fuzzy. Nunca criar produto silenciosamente.
19. **Idempotência por `chaveNFe`** — unique em `RecebimentoCompra`.
20. **UI — `NFeImportPreview.tsx`** — preview honesto com banner "Confirmar antes de salvar", botão Confirmar habilitado só após revisão.

**Quando implementar:** P1 futuro, requer testes extensivos com XMLs reais antes de ir para produção. Dependência de `xmldom` ou similar a instalar.

---

## 9. Resumo Final

| Item | Status Atual | Caminho para Real |
|---|---|---|
| Cadastro de Fornecedor | ✅ Real e funcional | Nenhuma ação |
| Contas a Pagar (financeiro) | ✅ Real e funcional | Nenhuma ação |
| Entrada de estoque (manual) | ✅ Real e funcional | Nenhuma ação |
| Planejamento de compras | ✅ Funcional (localStorage) | Persistir sugestões em banco (Fase C3) |
| Pedido de Compra formal | ❌ Inexistente | Fase C1 |
| Recebimento de mercadoria | ⚠️ Parcial (manual por produto) | Fase C2 |
| Lançamento automático conta a pagar | ❌ Inexistente | Fase C2 |
| HUB de Compras (UI completa) | ❌ Inexistente | Fase C3 |
| Transportadora | ❌ Inexistente | Fase C4 |
| Importação XML / NF-e | ❌ Inexistente | Fase C5 |
| Avaliação de fornecedor | ❌ Inexistente | Fase C3+ |
| Cotação de fornecedor | ❌ Inexistente | Fase C3+ |

---

*Documento gerado em sessão de planejamento paralela — nenhum arquivo de código foi alterado.*
