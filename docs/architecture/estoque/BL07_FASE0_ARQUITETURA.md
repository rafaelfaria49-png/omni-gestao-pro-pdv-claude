---
title: BL-07 · Estoque Multi-Depósito — Dossiê de Arquitetura (Fase 0)
hub: estoque / multi_loja
status: proposta (Fase 0 — arquitetura e planejamento)
tipo: read-only / planejamento — NÃO contém implementação
owner_humano: Rafael
owner_ia: Opus (arquitetura)
data: 2026-06-02
adrs_relacionados: [ADR-0007, ADR-0003, ADR-0004, ADR-0006]
blockers_relacionados: [BL-07, BL-12 (resolvido), BL-03]
divida_relacionada: [DT-08, DT-06]
roadmap: docs/roadmaps/ROADMAP_ESTOQUE.md
---

# 📦 BL-07 · Estoque Multi-Depósito — Dossiê de Arquitetura (Fase 0)

> **O que é este documento:** o pacote de **arquitetura e planejamento** (Fase 0) do
> blocker **BL-07 — Estoque multi-depósito**. Consolida **estado atual**, **gap analysis**,
> **modelo-alvo**, **fluxos obrigatórios** e **riscos**. A proposta de execução vive em
> [`docs/sprints/proposals/SPRINT_BL07_FASE1.md`](../../sprints/proposals/SPRINT_BL07_FASE1.md).
>
> **⚠️ Escopo desta entrega:** **somente arquitetura, análise e plano.** Nenhuma linha de
> código de produção, nenhuma migração, nenhuma mudança em `prisma/schema.prisma`, APIs ou
> services. A decisão de modelo já foi tomada e aceita em **[ADR-0007](../../decisions/ADR-0007-modelo-depositos.md)**
> (Gate #1, 01/06/2026); este dossiê **detalha e estende** essa decisão até o ponto de
> abertura da Sprint Fase 1 (que segue exigindo autorização explícita para tocar áreas
> protegidas).

## Índice

| Parte | Conteúdo | Entregável |
|---|---|---|
| **[Parte 1](#parte-1--estado-atual)** | Como o estoque funciona hoje (modelo, ledger, entrada, saída, PDV, OS, Marketplace) | D1 |
| **[Parte 2](#parte-2--gap-analysis)** | Comparativo vs Tiny, Bling, GestãoClick, Smart Genius, AvantPro, Linx, NetSuite | D2 |
| **[Parte 3](#parte-3--modelo-multi-depósito-alvo)** | Modelo-alvo: Depósito, saldo por depósito, transferência, reserva, comprometido, disponível, em trânsito | D3 |
| **[Parte 4](#parte-4--fluxos-obrigatórios)** | Fluxos: PDV, OS, Marketplace, Compras, Transferências, Inventário | D4 |
| **[Parte 5](#parte-5--riscos)** | Riscos multi-loja, fiscais, LGPD, concorrência, performance (P0–P3) | D5 |

---

# Parte 1 — Estado Atual

> **Fonte:** leitura direta do código (`prisma/schema.prisma`, `app/actions/estoque.ts`,
> `lib/ops-upsert-venda.ts`, `lib/operacoes/adapters/os-estoque.ts`,
> `app/api/ops/venda-persist/route.ts`, `app/api/marketplace/**`) + `docs/modules/ESTOQUE.md`
> + `ROADMAP_ESTOQUE.md`. Estado em 02/06/2026.

## 1.1 Visão de uma frase

O estoque hoje é **single-depósito implícito**: cada par `(storeId, produto)` tem **um único
saldo** em `Produto.stock`, e `MovimentacaoEstoque` é o **livro-razão append-only** que registra
*como* o saldo chegou ali. Não existe dimensão de depósito, nem reserva, nem estoque
comprometido/disponível/em trânsito. A loja inteira é "um depósito só".

## 1.2 Modelo de dados (Prisma)

### `Produto` (`estoque_produtos`) — `prisma/schema.prisma:727`

| Campo | Tipo | Papel |
|---|---|---|
| `id` | cuid | PK |
| `storeId` | String `@default("loja-1")` | **scoping multi-loja** (FK → `stores`, `onDelete: Restrict`) |
| `sku` | String? | código interno; `@@unique([storeId, sku])` |
| `barcode` | String? | EAN/GTIN; `@@unique([storeId, barcode])` |
| `name`, `brand`, `supplierName`, `category` | String | cadastrais |
| **`stock`** | **Int `@default(0)`** | **saldo único do produto na loja (a "fonte da verdade" de leitura)** |
| **`precoCusto`** | **Float (`price_cost`)** | **custo médio ponderado** (recalculado nas entradas) |
| `price` | Float | preço de venda |
| `warrantyDays`, `status`, `active`, `metadata` | — | demais |

Índices: `@@index([storeId])`. Sem qualquer noção de localização/depósito.

### `MovimentacaoEstoque` (`movimentacoes_estoque`) — `prisma/schema.prisma:776`

Livro-razão **append-only** (imutável). Documentado no schema como: *"O saldo atual vive em
`Produto.stock`; este modelo é a trilha auditável de COMO o saldo chegou ali, com custo médio
ponderado."*

| Campo | Papel |
|---|---|
| `storeId` (FK, `onDelete: Cascade`) | scoping |
| `produtoId` (FK?, `onDelete: SetNull`) | produto (nullable — sobrevive à exclusão) |
| `produtoSku`, `produtoNome` | **snapshot** para auditoria |
| `tipo` | `"entrada" \| "ajuste" \| "saida"` |
| `origem` | `"manual" \| "importacao" \| "os" \| "pdv"` |
| `quantidade` | **delta assinado** (+ entrada, +/− ajuste, − saída) |
| `estoqueAntes`, `estoqueDepois` | saldo antes/depois (auditoria) |
| `custoUnitario`, `custoMedioAntes`, `custoMedioDepois`, `valorTotal` | custeio |
| `documento`, `fornecedor`, `motivo`, `observacao`, `usuario` | rastreabilidade |

Índices: `[storeId]`, `[storeId, produtoId]`, `[storeId, createdAt]`. **Não há `depositoId`** — é exatamente a coluna que o ADR-0007 adiciona.

### Adjacências relevantes

- `MarketplaceListing` (`prisma/schema.prisma:879`): `channel`, `status`, `price`, `externalId`, `publishedAt` — **não tem campo de saldo nem reserva**. É anúncio, não estoque.
- `OrdemServicoItem`: peças consumidas por OS (usado como base de restauração).
- Migrações: histórico real em `prisma/migrations/` (10 migrações; última `0010_whatsapp_phone_number`). A próxima de estoque seria **`0011_deposito`** (nomenclatura do ADR-0007 §4.4).

## 1.3 Como funciona cada operação hoje

### Entrada (compra/recebimento manual) — `app/actions/estoque.ts:registrarEntradaEstoque`
- `quantidade > 0` obrigatória; recalcula **custo médio ponderado**:
  `novoCM = (estoqueAntes·CMantes + qtd·custoUnit) / (estoqueAntes + qtd)`.
- **Transação única:** cria `MovimentacaoEstoque(tipo=entrada, origem=manual)` **e** atualiza
  `Produto.stock` + `Produto.precoCusto`. Atômico.
- Sem conferência de NF-e XML (entrada 100% manual).

### Ajuste de inventário — `app/actions/estoque.ts:registrarAjusteEstoque`
- Define **saldo absoluto novo**; grava o **delta assinado**; **motivo obrigatório**; **não altera
  custo médio** (correção de contagem, não compra). `tipo=ajuste, origem=manual`. Transação única.
- Não há "tela de inventário cíclico" — é ajuste avulso por produto.

### Saída — PDV — `lib/ops-upsert-venda.ts:upsertVendaInTransaction`
Chamado por `app/api/ops/venda-persist/route.ts:53` com **`enforceStock: true`**.
- Resolve produto via `OR(id | sku | barcode)` scoped por `storeId`.
- **Agrega** quantidade por `produtoId` (2 linhas do mesmo SKU → 1 decremento).
- **Idempotência:** pula se já existe `MovimentacaoEstoque(storeId, documento=pedidoId, produtoId, origem=pdv)`.
- **Anti-negativo atômico (DT-B):** com `enforceStock`, a baixa é
  `updateMany where { id, storeId, stock: { gte: qty } } → decrement`. O predicado vive **no WHERE
  do UPDATE**, reavaliado sob *row-lock* do Postgres → dois caixas no mesmo SKU **serializam**; a
  2ª transação sem saldo retorna `count=0` e lança `InsufficientStockError` → **rollback da venda
  inteira**. Sem `enforceStock` (replay/sync legado) decrementa direto (pode ir a negativo — preserva histórico).
- **Item Avulso** (`__avulso__`, `isVirtualSaleLine`) **pula estoque** (venda sem cadastro não corrompe ledger).

### Saída/Restauração — OS — `lib/operacoes/adapters/os-estoque.ts`
- **Baixa só quando a OS vira `entregue`** (não na aprovação do orçamento) — `consumeEstoqueFromOS`.
- **Idempotência:** `payload.estoqueConsumido` + `localKey = os-estoque:{storeId}:{osId}`.
- **Valida tudo antes** de aplicar (`p.stock < qty` → erro "Estoque insuficiente") para evitar baixa
  parcial — porém usa *validar-então-decrementar* dentro da transação, **não** o predicado atômico
  `gte` no WHERE que o PDV usa.
- Decrementa `Produto.stock`, cria `OrdemServicoItem`, e registra o ledger via `registrarLedgerOS`.
- ⚠️ **`registrarLedgerOS` é best-effort:** está dentro de `try/catch` que **engole o erro** (comentário:
  *"o estoque já é a fonte da verdade; a trilha é complementar"*). Ou seja, **para OS, a linha de
  `MovimentacaoEstoque` pode faltar** mesmo com a baixa de saldo aplicada — vetor de **drift
  ledger×saldo** (ver Parte 5, P0-CONC-02).
- **Restauração** (`restoreEstoqueFromOS`) ao reabrir/cancelar; **delta pós-revisão de orçamento**
  (`applyEstoqueDelta`) aplica só a diferença. Ambos idempotentes (`estoqueRestaurado` / `estoqueUltimaRevisaoEm`).

### Saída — Marketplace
- **Inexistente.** Não há adapter `marketplace-estoque`. `app/api/marketplace/produtos` apenas **lista
  catálogo** (`listMarketplaceCatalog`). Marketplace **não baixa nem reserva** saldo. É o gap **P0**
  do roadmap (oversell) e o consumidor que o BL-07 destrava (BL-03).

## 1.4 Custo, auditoria e multi-loja

- **Custeio:** apenas **custo médio ponderado** (`Produto.precoCusto`), recalculado nas entradas
  manuais. Sem FIFO/PEPS, sem custo padrão, sem camadas.
- **Auditoria:** `getAuditoriaEstoque` (read-only) entrega KPIs do dia + alertas (saldo negativo,
  custo zerado, sem barcode, ajustes excessivos) + filtros. Sólida.
- **Multi-loja:** `storeId` em **todas** as queries; **zero fallback `loja-1`** (server e client) após
  S-001/S-002/DT-13/DT-14/DT-15/DT-16. O `@default("loja-1")` em `Produto.storeId` é *default de
  coluna* (não fallback de query). Doutrina **ADR-0003** respeitada.

## 1.5 Anti-negativo — estado real

Não é configurável por loja (apesar do Objetivo 3 do roadmap). É um **flag de fluxo** (`enforceStock`):
- **PDV ao vivo (`venda-persist`):** `true` → bloqueio atômico. ✅
- **OS:** valida-e-lança (não atômico no WHERE). ⚠️
- **Entrada/ajuste manual:** não se aplica (entrada soma; ajuste só aceita saldo ≥ 0).
- **PDV Next / replay legado:** sem `enforceStock` → pode ir a negativo.

## 1.6 Resumo do estado atual (tabela)

| Capacidade | Estado hoje | Evidência |
|---|---|---|
| Saldo materializado por produto | ✅ `Produto.stock` | schema:742 |
| Ledger append-only auditável | ✅ `MovimentacaoEstoque` | schema:776 |
| Custo médio ponderado | ✅ | `estoque.ts:101` |
| Anti-negativo PDV atômico | ✅ (só PDV ao vivo) | `ops-upsert-venda.ts:295` |
| Idempotência PDV/OS | ✅ | `documento`+`origem` / `payload.estoqueConsumido` |
| Adapter OS↔Estoque (consumo/restauração/delta) | ✅ | `os-estoque.ts` |
| Ledger da OS atômico com a baixa | ⚠️ **best-effort** (try/catch) | `os-estoque.ts:215` |
| **Multi-depósito** | ❌ **inexistente** | schema (sem `Deposito`/`depositoId`) |
| Reserva / comprometido / disponível / em trânsito | ❌ inexistente | grep: nenhum modelo |
| Transferência (intra-loja / entre lojas) | ❌ inexistente | — |
| Sync Marketplace ↔ estoque | ❌ inexistente | `marketplace/produtos` só lista |
| Inventário cíclico | ❌ (só ajuste avulso) | `estoque.ts` |
| NF-e XML → entrada | ❌ inexistente | — |
| Curva ABC / cost layering FIFO | ❌ inexistente | — |
| Múltiplos códigos de barras / lote / variações | ❌ inexistente | schema (1 sku + 1 barcode) |

---

# Parte 2 — GAP Analysis

> **Método e honestidade:** o comparativo abaixo está no nível **benchmark contextual** (capacidades
> consolidadas de mercado + posicionamento já registrado em `ROADMAP_ESTOQUE §3` e
> `SKILL_BENCHMARK_ESTOQUE`). **Não** é uma auditoria fresca por plano/tier de cada concorrente —
> isso é follow-up de `SKILL_BENCHMARK_ESTOQUE` em modo `deep`. Os concorrentes pedidos no goal
> foram todos incluídos. Legenda: ✅ tem · 🟡 parcial/plano alto · ❌ não tem (ou n/d).

## 2.1 Matriz de capacidades

| Capacidade | Tiny | Bling | GestãoClick | Smart Genius | AvantPro | Linx | NetSuite | **OmniGestão hoje** |
|---|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|
| Multi-depósito / multi-local | ✅ | ✅ | ✅ | 🟡 | ✅ | ✅ | ✅ | ❌ |
| Transferência entre depósitos | ✅ | ✅ | ✅ | 🟡 | ✅ | ✅ | ✅ | ❌ |
| Transferência entre lojas/filiais | 🟡 | ✅ | ✅ | ❌ | 🟡 | ✅ | ✅ | ❌ |
| Reserva de estoque (pedido/carrinho) | 🟡 | ✅ | 🟡 | ❌ | ✅ | ✅ | ✅ | ❌ |
| Estoque comprometido vs disponível | 🟡 | ✅ | 🟡 | ❌ | ✅ | ✅ | ✅ | ❌ |
| Estoque em trânsito | ❌ | 🟡 | ❌ | ❌ | 🟡 | ✅ | ✅ | ❌ |
| Sync de saldo p/ marketplace (anti-oversell) | ✅ | ✅ | 🟡 | ❌ | ✅ | ✅ | 🟡 | ❌ |
| Entrada via NF-e XML c/ conferência | ✅ | ✅ | ✅ | 🟡 | ✅ | ✅ | ✅ | ❌ |
| Inventário cíclico/rotativo | ✅ (app) | ✅ | 🟡 | 🟡 | 🟡 | ✅ | ✅ | ❌ (só ajuste avulso) |
| Curva ABC | 🟡 | ✅ | 🟡 | ❌ | 🟡 | ✅ | ✅ | ❌ |
| Cost layering FIFO/PEPS | 🟡 | 🟡 | 🟡 | ❌ | ❌ | ✅ | ✅ | ❌ (só médio) |
| Custo médio ponderado | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Múltiplos códigos de barras por SKU | 🟡 | 🟡 | 🟡 | ❌ | 🟡 | ✅ | ✅ | ❌ (1 sku + 1 barcode) |
| Lote / validade (perecíveis) | 🟡 | ✅ | 🟡 | ❌ | ❌ | ✅ | ✅ | ❌ |
| Variações (grade cor/tamanho) | ✅ | ✅ | 🟡 | ❌ | ✅ | ✅ | ✅ | ❌ |
| Kit / composição / produção | 🟡 | ✅ | 🟡 | ❌ | 🟡 | ✅ | ✅ | ❌ |
| Ponto de pedido / sugestão de compra | 🟡 | ✅ | 🟡 | ❌ | 🟡 | ✅ | ✅ | ❌ (só alerta mínimo) |
| **Ledger imutável auditável (usuário+custo+doc)** | 🟡 | 🟡 | 🟡 | ❌ | 🟡 | ✅ | ✅ | **✅ (diferencial)** |
| **Multi-loja nativo com isolamento estrito** | 🟡 | 🟡 | 🟡 | ❌ | 🟡 | ✅ | ✅ | **✅ (diferencial)** |
| **Anti-oversell atômico no PDV (row-lock)** | n/d | n/d | n/d | ❌ | n/d | ✅ | ✅ | **✅ (diferencial)** |

## 2.2 Leitura por concorrente (o que aprendemos)

- **Bling / Tiny** — referência **SMB-primária** (mesmos clientes-alvo do OmniGestão). Multi-depósito
  + transferência + NF-e XML + sync marketplace em planos acessíveis. **Padrão a igualar.**
- **GestãoClick** — origem de boa parte dos dados importados (backups GC). Tem estoque por local e
  NF-e; bom referencial de **fluxo de entrada**.
- **Smart Genius** — ERP de **assistência técnica** (também importado no projeto). Estoque mais
  simples; reforça que o OmniGestão **já supera** a baseline de assistência no quesito ledger.
- **AvantPro** — forte em **marketplace + PDV**; valida a urgência do **sync de saldo anti-oversell**.
- **Linx** — **teto enterprise** brasileiro: códigos de barras múltiplos, cost layering, em trânsito.
  Referência de "para onde escalar", não de MVP.
- **NetSuite** — **teto global**: multi-location com reserva/commit/in-transit de primeira classe e
  cost layering completo. Define o vocabulário-alvo (disponível = saldo − reservado − comprometido).

## 2.3 Classificação dos gaps

> Critério: **Obrigatório (Fase 1–3)** = paridade SMB + destrava Marketplace/BL-03. **Fase 2+** =
> inteligência/escala. **Diferencial** = já temos, **proteger**.

### 🔴 Obrigatório — núcleo do BL-07
| Gap | Por quê | Fase-alvo (proposta) |
|---|---|---|
| Multi-depósito (modelo `Deposito` + saldo por depósito) | Fundação; destrava todo o resto | **Fase 1** (= ADR-0007 Fase 0) |
| Seleção de depósito em PDV/OS/entrada/ajuste | Operar de verdade com N depósitos | **Fase 2** |
| Transferência intra-loja auditada | Mover saldo entre depósitos sem furar ledger | **Fase 2** |
| Reserva + comprometido + disponível | Pré-requisito do anti-oversell | **Fase 3** |
| Sync Marketplace ↔ estoque (anti-oversell) | Gap P0 do roadmap; destrava BL-03 | **Fase 3** |

### 🟡 Importante — Fase 2/4
| Gap | Fase-alvo |
|---|---|
| Inventário cíclico (tela + ajuste por depósito) | Fase 2/4 |
| Entrada via NF-e XML com conferência | Fase 4 |
| Curva ABC por depósito | Fase 4 |
| Cost layering FIFO opcional por loja | Fase 4 (exige ADR próprio — custo retroativo afeta DRE) |
| Estoque em trânsito (transferência com status) | Fase 3 |
| Ponto de pedido / sugestão de compra | Fase 4 |

### 🟢 Pode ficar para depois (Fase 5 / fora do BL-07)
| Gap | Nota |
|---|---|
| Múltiplos códigos de barras por SKU | Linx-like; baixa urgência SMB |
| Lote / validade | Só se entrar vertical de perecíveis |
| Variações (grade) | Vertical de moda/calçados |
| Etiquetas ZPL automatizadas | UX, não estrutura |

### 🛡️ Diferenciais a proteger (não regredir)
- **Ledger imutável** com `usuario`/`documento`/`custo` — **superior** à maioria dos SMBs.
- **Multi-loja com isolamento estrito** (sem `loja-1`) — diferencial defensável (MASTER_PLAN).
- **Anti-oversell atômico (row-lock)** no PDV — o multi-depósito **deve estender**, não substituir.
- **Importador defensivo** (chave forte/fraca, defesa 3 camadas) — regressão é P0.

---

# Parte 3 — Modelo Multi-Depósito (alvo)

> **Base:** [ADR-0007](../../decisions/ADR-0007-modelo-depositos.md) (aceito) define a **fundação**
> (Depósito + `EstoqueSaldo` materializado + `depositoId` nullable + `Produto.stock` como cache
> agregado, **alternativa C**, aditiva, *zero mudança de comportamento na fundação*). Esta Parte 3
> **detalha a fundação e estende** o modelo até reserva/comprometido/disponível/em trânsito —
> conceitos que o ADR-0007 conscientemente **adiou** para fases posteriores. **Tudo aqui é desenho;
> nada implementado.**

## 3.1 Princípios inegociáveis (herdados)

1. **Estoque só por ledger.** Saldo nunca é escrito por edição direta de campo — nem o saldo por
   depósito. (`project_import_nao_sobrescreve_estoque`)
2. **Aditivo, não-quebrante.** Nenhuma coluna existente é alterada/dropada na fundação.
3. **Multi-loja inegociável.** Todo registro novo carrega `storeId`; `where storeId` em toda query
   (ADR-0003).
4. **Materializado + cache.** Mantém o padrão atual (`ledger` + saldo materializado) — apenas
   adiciona a dimensão depósito; leitura continua O(1).

## 3.2 Camada A — Fundação (ADR-0007, decidida)

### `Deposito` — tabela nova `depositos`
| Coluna | Papel |
|---|---|
| `id` | cuid |
| `storeId` (FK → `stores`, cascade) | **loja dona** |
| `nome` | "Depósito Padrão", "Full ML", "Bancada" |
| `tipo` | `padrao \| marketplace \| transito \| assistencia \| outro` |
| `isDefault` (Bool) | **exatamente um por loja**; destino de todo consumo até a Fase 2 |
| `active` (Bool) | só ativos recebem movimento |
| `metadata` (JsonB) | extensível |

Invariantes: `@@unique([storeId, nome])`; **um único** `isDefault=true` por `storeId` (índice
parcial + guard de serviço); **default não-deletável** e **não-deletável com saldo ≠ 0** (RT-10).

### `EstoqueSaldo` — tabela nova `estoque_saldos` (saldo materializado por depósito)
| Coluna | Papel |
|---|---|
| `produtoId` (FK), `depositoId` (FK), `storeId` (denormalizado) | chave |
| `saldo` (Int) | saldo do produto **naquele depósito** |
| `custoMedio` (Float) | custo médio **por depósito** |

Invariante: `@@unique([produtoId, depositoId])`. **Mantido na mesma transação do ledger.**
`Produto.stock` permanece como **cache agregado derivado** (`= Σ saldo` dos depósitos da loja),
atualizado transacionalmente → **toda leitura atual (PDV/listagens/relatórios) continua intacta**.

### `MovimentacaoEstoque.depositoId` — coluna **nullable** (Fase 1)
FK → `depositos`. Toda movimentação passa a registrar **de/para qual depósito**. Vira **NOT NULL**
em passo posterior, após confirmar 0 nulos em produção (dívida deliberada, DT-08 §NOT-NULL).

### Sequência de migração (fundação) — `0011_deposito`
1. DDL aditiva (`CREATE TABLE depositos`, `CREATE TABLE estoque_saldos`, `ALTER … ADD COLUMN depositoId NULL`).
2. Seed: 1 `Deposito isDefault=true` ("Depósito Padrão") por `Store` ativa.
3. Backfill saldo: `EstoqueSaldo(produto, depositoDefault, saldo=Produto.stock, custoMedio=precoCusto)`.
4. Backfill ledger: `UPDATE movimentacoes_estoque SET depositoId = <default da store>`.
5. **Gate de invariante:** por loja, `Σ EstoqueSaldo.saldo == Produto.stock`; `count(Produto)==count(saldo default)`; nenhum `depositoId` nulo.
6. (Pós-fundação) `depositoId` → NOT NULL.

## 3.3 Camada B — Operação multi-depósito (Fase 2, desenho)

- **Resolução de depósito por contexto:** cada fluxo resolve o `depositoId` de destino/origem
  (PDV terminal→depósito; OS bancada; entrada→depósito de recebimento). Default = `isDefault` da loja
  (mantém compat).
- **Baixa atômica por (produto, depósito):** estende o padrão DT-B — predicado `saldo >= qty` no
  WHERE do `updateMany` sobre `EstoqueSaldo`, na mesma transação que atualiza o cache `Produto.stock`.
- **Transferência intra-loja** — modelo `TransferenciaEstoque` (header) + **par de lançamentos**:
  saída no depósito origem + entrada no destino, ligados por `localKey = transfer:{storeId}:{uuid}`,
  **atômicos**. Custo: saída ao custo médio da origem; entrada ao **mesmo** custo (RT-06 — transferência
  não cria valor).

```
TransferenciaEstoque
  id, storeId, depositoOrigemId, depositoDestinoId,
  status: rascunho | em_transito | recebida | cancelada,
  itens: [{ produtoId, quantidade, custoUnitario }],
  localKey (unique), criadoPor, recebidoPor, criadoEm, recebidoEm
```

## 3.4 Camada C — Reserva, comprometido, disponível, em trânsito (Fase 3, desenho)

> Este é o vocabulário pedido no goal. Aqui o OmniGestão alcança o nível NetSuite/Linx de
> **estoque virtual**. **Adiado pelo ADR-0007 para depois da fundação.**

### Definições (contrato)
```
disponivel = saldo − reservado − comprometido            (por produto, por depósito)
```
| Conceito | Significado | Quando entra | Quando sai |
|---|---|---|---|
| **saldo** | físico presente no depósito | entrada/transferência/ajuste | baixa real (venda/OS/saída) |
| **reservado** | *soft hold* — separado mas não vendido | carrinho marketplace, orçamento OS aprovado, pedido pendente | confirma (→ comprometido/baixa), expira ou cancela |
| **comprometido** | *hard commit* — vendido, aguardando expedição/baixa | pedido confirmado (marketplace/venda futura) | baixa real (expedição) ou cancelamento |
| **em trânsito** | saiu da origem, não chegou ao destino | transferência `em_transito` | recebimento no destino |
| **disponivel** | o que pode ser vendido **agora** | derivado | derivado |

### Modelagem proposta (mínima e consistente com a fundação)
1. **`EstoqueSaldo` ganha contadores** `reservado Int` e `comprometido Int` (aditivo). `disponivel` é
   **derivado** (não materializado — evita 3ª fonte a sincronizar).
2. **`ReservaEstoque`** (tabela nova) — ledger de reservas para auditoria + expiração:
```
ReservaEstoque
  id, storeId, produtoId, depositoId,
  quantidade, tipo: reserva | comprometido,
  origem: marketplace | os | pdv | manual,
  status: ativa | consumida | expirada | cancelada,
  expiraEm?, localKey (unique, idempotência), referenciaId, criadoEm
```
3. **Em trânsito** = `TransferenciaEstoque.status = em_transito` (saldo já saiu da origem; o destino
   só credita no recebimento). Opcionalmente, um **depósito `tipo=transito`** materializa o "limbo"
   para relatórios — decisão de UX da Fase 3.

### Invariantes da Camada C
- `reservado ≥ 0`, `comprometido ≥ 0`, `disponivel ≥ 0` sempre.
- Reserva **não** decrementa `saldo` — só `disponivel` (derivado). Baixa real (commit) **converte**
  reserva→comprometido→baixa, decrementando `saldo` e `comprometido` juntos.
- Toda reserva tem `localKey` (idempotência — padrão do projeto) e, quando aplicável, `expiraEm`
  (job de expiração devolve ao disponível).

## 3.5 Mapa visual do modelo-alvo

```
Store (loja)
 └─ Deposito[]  (1..N por loja; exatamente 1 isDefault)
      tipo: padrao | marketplace | transito | assistencia | outro
      │
      ├─ EstoqueSaldo (produto × depósito)        ← materializado, fonte por-depósito
      │     saldo · custoMedio
      │     reservado · comprometido (Fase 3)     ← disponivel = saldo − reservado − comprometido
      │
      └─ MovimentacaoEstoque (+depositoId)        ← ledger append-only (a verdade do "como")
                                                     entrada/saida/ajuste + transferência (par)

Produto.stock  = Σ EstoqueSaldo.saldo (da loja)   ← CACHE agregado (leitura O(1) intacta)

TransferenciaEstoque  → 2 lançamentos no ledger (saída origem + entrada destino), atômicos
ReservaEstoque        → trilha de reserva/commit (Fase 3), idempotente por localKey
```

## 3.6 O que o modelo **não** muda na fundação (Fase 1)
- PDV, OS e importador continuam operando no **Depósito Padrão** — saldo idêntico ao de hoje.
- **Nenhuma** UI de seleção de depósito, transferência ou reserva na Fase 1.
- **Sem** transferência entre lojas (cross-tenant) — explicitamente fora de todo o BL-07 inicial.
- **Sem** cost layering FIFO — custo segue médio ponderado, agora **por depósito**.

---

# Parte 4 — Fluxos Obrigatórios

> Para cada fluxo: **gatilho → resolução de depósito → efeito no ledger → efeito no saldo →
> idempotência/anti-negativo → fase de entrega**. "Hoje" = comportamento atual; "Alvo" = com depósito.

## 4.1 PDV — venda baixa o depósito correto
| Aspecto | Hoje | Alvo |
|---|---|---|
| Gatilho | `venda-persist` (`enforceStock:true`) | idem |
| Depósito | n/a (saldo único) | resolve `depositoId` do **terminal** (`PdvTerminal`→depósito) ou `isDefault`; Fase 1 = sempre default |
| Ledger | `MovimentacaoEstoque(saida, origem=pdv)` | + `depositoId` |
| Saldo | `Produto.stock` decrement atômico | `EstoqueSaldo(produto,depósito).saldo` decrement atômico (`saldo>=qty` no WHERE) + cache `Produto.stock` na mesma tx |
| Idempotência | `documento=pedidoId`+`origem=pdv` | idem, agora por (produto, depósito) |
| Anti-negativo | atômico (row-lock) | **mantém** o predicado, agora sobre `EstoqueSaldo` |
| Fase | — | Fase 1 (default) → Fase 2 (seleção por terminal) |

## 4.2 OS — consumo de peça baixa o depósito correto
| Aspecto | Hoje | Alvo |
|---|---|---|
| Gatilho | OS → `entregue` (`consumeEstoqueFromOS`) | idem |
| Depósito | n/a | depósito da **bancada** (`tipo=assistencia`) ou default |
| Ledger | `origem=os`, **best-effort** (try/catch) | + `depositoId`; **promover a atômico** (não best-effort) p/ não driftar por depósito (P0-CONC-02) |
| Saldo | `Produto.stock` decrement (valida-então-baixa) | `EstoqueSaldo` decrement, **com predicado atômico** alinhado ao PDV |
| Idempotência | `payload.estoqueConsumido` + delta por revisão | idem |
| Fase | — | Fase 1 (default) → Fase 2 (bancada) |

## 4.3 Marketplace — sincronização de saldo por depósito
| Aspecto | Hoje | Alvo |
|---|---|---|
| Gatilho | **inexistente** | pedido externo (ML/Shopee) + push de saldo |
| Depósito | — | depósito `tipo=marketplace` ("Full") ou o que abastece o canal |
| Reserva | — | **reserva otimista** ao receber pedido → `ReservaEstoque`; baixa no faturamento/expedição (commit) |
| Disponível publicado | — | publica `disponivel` (= saldo − reservado − comprometido) do depósito do canal |
| Anti-oversell | — | reserva + fila + retry (risco R-05); nunca publica > disponível |
| Fase | — | **Fase 3** (destrava BL-03) |

## 4.4 Compras — entrada em depósito específico
| Aspecto | Hoje | Alvo |
|---|---|---|
| Gatilho | `registrarEntradaEstoque` (manual) | manual **+** NF-e XML (Fase 4) |
| Depósito | n/a | depósito de **recebimento** escolhido (default na Fase 1) |
| Ledger | `entrada, origem=manual`, recalc custo médio | + `depositoId`; custo médio **por depósito** |
| Saldo | `Produto.stock` increment | `EstoqueSaldo.saldo` increment + cache |
| Conferência | nenhuma | NF-e XML item-a-item com quarentena de divergência (Fase 4) |
| Fase | — | Fase 1 (default) → Fase 2 (escolha) → Fase 4 (XML) |

## 4.5 Transferências — origem → destino
| Aspecto | Alvo |
|---|---|
| Gatilho | usuário cria `TransferenciaEstoque` (intra-loja) |
| Efeito | **par de lançamentos**: `saida` no `depositoOrigem` + `entrada` no `depositoDestino`, mesmo `localKey` |
| Custo | saída ao custo médio da origem; entrada ao **mesmo** custo (não cria valor — RT-06) |
| Status | `rascunho → em_transito → recebida` (em trânsito = saiu, não chegou) |
| Atomicidade | transação única; `localKey` único bloqueia double-submit (RT-07) |
| Anti-negativo | predicado `saldo>=qty` no depósito origem |
| Escopo | **intra-loja apenas**; cross-loja explicitamente fora (RT-05) |
| Fase | Fase 2 (transferência simples) → Fase 3 (em trânsito com recebimento) |

## 4.6 Inventário — ajuste por depósito
| Aspecto | Hoje | Alvo |
|---|---|---|
| Gatilho | `registrarAjusteEstoque` (avulso) | contagem cíclica + ajuste por depósito |
| Depósito | n/a | depósito contado |
| Ledger | `ajuste, origem=manual`, motivo obrigatório, não muda custo | + `depositoId`; idem |
| Saldo | define saldo absoluto | define saldo absoluto **do depósito** |
| Fase | — | Fase 2 (ajuste por depósito) → Fase 4 (tela de inventário cíclico) |

## 4.7 Invariante transversal de todos os fluxos
Após **qualquer** fluxo, para todo produto da loja:
`Produto.stock == Σ EstoqueSaldo.saldo` (drift = 0). Garantido por: (a) saldo por depósito e cache
agregado **na mesma transação**; (b) job de reconciliação periódico; (c) ledger **atômico** (corrige
o best-effort atual da OS).

---

# Parte 5 — Riscos

> Severidade: **P0** (bloqueia release / risco financeiro-fiscal / vazamento) · **P1** (alto custo) ·
> **P2** (incomoda) · **P3** (melhoria). Referências cruzadas: ADR-0007 RT-01..RT-12; `ROADMAP_ESTOQUE §10`;
> registro de riscos do projeto (R-02 vazamento cross-loja, R-05 oversell marketplace).

## 5.1 Multi-loja
| # | Risco | Sev | Mitigação | Ref |
|---|---|:--:|---|---|
| MLOJA-01 | `Deposito`/`EstoqueSaldo` sem `storeId` → vazamento cross-tenant | **P0** | `storeId` FK + `@@unique([storeId,nome])` + `where storeId` em toda query (ADR-0003) | RT-04, R-02 |
| MLOJA-02 | Transferência intra-loja confundida com cross-loja | **P0** | Fase 0–3 **só intra-loja**; validar `depositoOrigem.storeId == depositoDestino.storeId` | RT-05 |
| MLOJA-03 | `depositoId` nullable reabre baixa "sem depósito" | P1 | guard de teste estático + plano NOT NULL (passo 6) | RT-03 |
| MLOJA-04 | Backfill atribui depósito de **outra** loja por engano | **P0** | backfill scoped por `storeId`; gate de invariante por loja (passo 5) | RT-02 |

## 5.2 Concorrência (corrida)
| # | Risco | Sev | Mitigação | Ref |
|---|---|:--:|---|---|
| CONC-01 | 2 baixas no mesmo (produto, depósito) → *lost update* / negativo | **P0** | predicado `saldo>=qty` **no WHERE** do `updateMany` (estende DT-B) + transação | RT-08 |
| CONC-02 | **Drift** `EstoqueSaldo` × `Produto.stock` (cache) — agravado pelo **ledger best-effort da OS de hoje** | **P0** | atualizar saldo+cache **na mesma transação**; **promover o ledger da OS a atômico** (remover o engole-erro); invariante testada + job de reconciliação | RT-01; §1.3 OS |
| CONC-03 | Double-submit de transferência duplica saldo | P1 | `localKey` único por transferência | RT-07 |
| CONC-04 | Reserva concorrente vende o mesmo "disponível" 2× (oversell virtual) | P1 | reserva sob lock de linha em `EstoqueSaldo`; `reservado`/`comprometido` atualizados na mesma tx | Fase 3 |

## 5.3 Performance
| # | Risco | Sev | Mitigação | Ref |
|---|---|:--:|---|---|
| PERF-01 | Somar saldo por depósito a cada leitura degrada listagens/PDV | P1 | `EstoqueSaldo` materializado + `@@unique([produtoId,depositoId])` + **cache `Produto.stock`** (leitura O(1) intacta) | RT-12 |
| PERF-02 | Backfill de N produtos × M depósitos trava em loja grande | P1 | migração em janela; backfill em lote; gate de invariante pós-backfill | RT-02 |
| PERF-03 | Job de reconciliação (Σ saldo == cache) custoso em catálogo grande | P2 | rodar incremental/por loja; índice `[storeId, produtoId]` | — |
| PERF-04 | Sync Marketplace de alta frequência satura o saldo | P1 | reserva **otimista** + fila + retry (não bloquear venda PDV) | R-05 |

## 5.4 Fiscal
| # | Risco | Sev | Mitigação | Ref |
|---|---|:--:|---|---|
| FISC-01 | Confundir **depósito** (lógico) com **estabelecimento fiscal** (CNPJ/IE) | P1 | depósito é **localização lógica intra-loja**; transferência intra-loja **não** emite NF; documentar explicitamente | — |
| FISC-02 | Custo médio **por depósito** altera CMV/DRE vs custo único | P1 | custo de transferência espelhado (não cria valor); validar DRE antes de habilitar | RT-06 |
| FISC-03 | Entrada NF-e XML (Fase 4) sem casar depósito de recebimento | P1 | conferência item-a-item + depósito explícito na entrada | roadmap Fase 3 |
| FISC-04 | Item Avulso sem CFOP/categoria (dívida pré-existente) contamina relatórios fiscais de saída | P2 | **DT-06** já rastreado; fora do escopo BL-07, mas registrar | DT-06 |
| FISC-05 | Cost layering FIFO retroativo recalcularia custos passados (afeta DRE fechado) | P1 | aplicar **só prospectivo** + **ADR dedicado** antes da Fase 4 | roadmap §10 |
| — | **Nota:** a **Fundação (Fase 1) tem impacto fiscal nulo** (zero mudança de comportamento) → fiscal é **P3 na Fase 1**, sobe a P1 nas fases de operação/entrada. | P3→P1 | — | — |

## 5.5 LGPD
| # | Risco | Sev | Mitigação | Ref |
|---|---|:--:|---|---|
| LGPD-01 | Estoque carrega **poucos** dados pessoais (`fornecedor`, `usuario` operador no ledger) → exposição limitada | P3 | manter `usuario` para rastreabilidade; sem novo dado pessoal na fundação | — |
| LGPD-02 | Transferência **cross-loja** (fora de escopo) tocaria dados de 2 tenants | P2 | cross-loja **explicitamente fora** do BL-07; reabrir só com ADR multi-tenant | RT-05 |
| LGPD-03 | Auditoria de "quem moveu entre depósitos" precisa sobreviver (rastreabilidade) | P3 | `usuario`+`createdAt` em todo lançamento (já é padrão do ledger) | — |

## 5.6 Migração / Negócio (transversais)
| # | Risco | Sev | Mitigação | Ref |
|---|---|:--:|---|---|
| MIG-01 | Migração quebra/corrompe ledger histórico | **P0** | DDL **aditiva** (nada alterado/dropado) + backfill transacional + gate de invariante (passo 5) | roadmap §10, RT-02 |
| MIG-02 | Produto novo pós-migração sem linha de saldo no default | P1 | criar `EstoqueSaldo` *lazy* no create do produto **ou** no 1º movimento (default 0) | RT-09 |
| MIG-03 | Importador/edição cadastral escreve `stock` direto e fura o ledger por-depósito | P1 | `Produto.stock` vira **read-only derivado**; estender "saldo só por ledger" ao por-depósito | RT-11 |
| NEG-01 | Adapter Marketplace com latência alta → **oversell** | **P0** | reserva otimista + fila + retry; só Fase 3 com fundação estável | R-05, roadmap §10 |
| OPS-01 | Delete de depósito com saldo > 0 perde estoque | P1 | default **não-deletável**; bloquear delete com `saldo ≠ 0` (analogia `PROTECTED_STORE_IDS`) | RT-10 |

## 5.7 Top riscos a vigiar (resumo executivo)
1. **MIG-01 / MLOJA-04 (P0):** migração aditiva + backfill com **gate de invariante por loja** é a
   condição de aceite da Fase 1.
2. **CONC-02 (P0):** o **ledger best-effort da OS de hoje** vira risco de drift quando o saldo for
   por depósito — **corrigir junto** (promover a atômico).
3. **CONC-01 (P0):** estender o anti-negativo atômico (DT-B) do PDV para `EstoqueSaldo`.
4. **NEG-01 / R-05 (P0):** oversell de Marketplace só é endereçado com **reserva** (Fase 3) — não
   antecipar o adapter sem a Camada C.

---

## Apêndice A — Referências

- **Decisão:** [`ADR-0007 · Modelo de Depósitos`](../../decisions/ADR-0007-modelo-depositos.md) (aceito 01/06/2026).
- **Roadmap:** [`ROADMAP_ESTOQUE.md`](../../roadmaps/ROADMAP_ESTOQUE.md) (§5 gaps, §6 funcionalidades, §8 fases, §10 riscos, §14 blockers).
- **Blockers:** BL-07 (este), BL-12 (resolvido por ADR-0007), BL-03 (Marketplace) — [`BLOCKERS.md`](../../status/BLOCKERS.md).
- **Dívida:** DT-08 (sem multi-depósito), DT-06 (Item Avulso sem CFOP) — [`DIVIDA_TECNICA.md`](../../status/DIVIDA_TECNICA.md).
- **Skills:** [`SKILL_BENCHMARK_ESTOQUE`](../../skills/executoras/research/SKILL_BENCHMARK_ESTOQUE.md), [`SKILL_AUDIT_ESTOQUE`](../../skills/executoras/research/SKILL_AUDIT_ESTOQUE.md), [`SKILL_AUDIT_MULTI_LOJA`](../../skills/executoras/research/SKILL_AUDIT_MULTI_LOJA.md).
- **Código-fonte mapeado:** `prisma/schema.prisma` (727 `Produto`, 776 `MovimentacaoEstoque`, 879 `MarketplaceListing`), `app/actions/estoque.ts`, `lib/ops-upsert-venda.ts`, `lib/operacoes/adapters/os-estoque.ts`, `app/api/ops/venda-persist/route.ts`.
- **Memórias:** `project_import_nao_sobrescreve_estoque`, `project_sku_gc_saneamento`, `project_importador_produtos_match_seguro`.

## Apêndice B — Glossário

| Termo | Definição neste projeto |
|---|---|
| **Depósito** | Localização **lógica** de estoque **dentro de uma loja** (não é estabelecimento fiscal). |
| **Saldo** | Quantidade física presente no depósito. |
| **Reservado** | *Soft hold* — separado, ainda não vendido (expira/cancela). |
| **Comprometido** | *Hard commit* — vendido, aguardando expedição/baixa. |
| **Disponível** | `saldo − reservado − comprometido` (derivado; o que pode vender agora). |
| **Em trânsito** | Saiu da origem em transferência, ainda não recebido no destino. |
| **Cache agregado** | `Produto.stock` = Σ saldos dos depósitos da loja (mantém leitura O(1)). |
| **Ledger** | `MovimentacaoEstoque` — trilha append-only imutável do "como o saldo chegou ali". |

---

*Documento de Fase 0 — arquitetura e planejamento. Nenhuma implementação, migração ou alteração de
schema/APIs/produção foi realizada. Abertura da Sprint de implementação exige autorização explícita
para áreas protegidas (`prisma/schema.prisma` + services de estoque core), conforme CORE_RULES / ADR-0007 §5.*
