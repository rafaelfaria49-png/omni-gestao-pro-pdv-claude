---
adr_id: ADR-0007
title: Modelo de Depósitos (multi-depósito por loja) — fundação de saldo segmentado
status: aceita
data: 2026-06-01
sprint: ESTOQUE-S-00x (Fase 0 — a abrir)
aprovado_por: Rafael (Gate #1)
hub: estoque / multi_loja
related_blockers: [BL-12, BL-07, BL-03]
related_debt: [DT-08]
substitui: null
superado_por: null
---

# ADR-0007 · Modelo de Depósitos (multi-depósito por loja)

> **Status:** aceita (Gate #1 aprovado por Rafael em 2026-06-01).
>
> **Decisão em uma frase:** introduzir o conceito de **Depósito** (N por loja) como
> dimensão de segmentação do saldo, com **saldo materializado por depósito**
> (`EstoqueSaldo`) mantido pelo ledger e `depositoId` no `MovimentacaoEstoque` —
> **aditivo, não-quebrante, com Fase 0 de ZERO mudança de comportamento** (tudo
> opera num "Depósito Padrão" por loja).

> **Nota de governança:** este ADR é **decisão** (Gate #1). A **implementação** vai
> para a Sprint Fase 0 (`ESTOQUE-S-00x`), que **ainda não foi aberta** e exige
> autorização explícita para tocar `prisma/schema.prisma` e os services de estoque
> core (áreas protegidas — CORE_RULES / GOVERNANCA §4).

---

## 1. Contexto

`BL-12` (ADR multi-depósito) é a **maior alavanca do projeto** (`BLOCKERS.md` §5):
destrava `BL-07` (Estoque Fase 2), que destrava `BL-03` (adapter Marketplace) e toda a
Fase 1 do Marketplace. Hoje o estoque é **single-depósito implícito**:

- `Produto.stock` (Int) guarda **um** saldo por `(storeId, produto)` — a loja inteira é
  um único depósito.
- `MovimentacaoEstoque` é o **ledger append-only** (origem, usuário, documento,
  `custoUnitario`, custo médio ponderado, `estoqueAntes/Depois`) — **sem** noção de
  depósito.
- Não há separação entre "loja física", "estoque online/Marketplace Full", "trânsito"
  ou "bancada de assistência". O Marketplace não consegue **reservar saldo real** nem
  evitar oversell (R-Estoque P0).

**Restrições:**
- **Não-quebrante:** o ledger histórico e o saldo atual não podem ser corrompidos pela
  migração (R-Estoque P0 — "migração quebra ledger histórico").
- **Multi-loja inegociável:** todo saldo segue scoped por `storeId`; nenhum vetor
  `loja-1` ou vazamento cross-tenant (doutrina ADR-0003).
- **Estoque só por ledger:** saldo nunca é escrito por edição direta de campo
  (Objetivo 1 do ROADMAP_ESTOQUE; memória `project_import_nao_sobrescreve_estoque`).
- **Áreas protegidas:** `prisma/schema.prisma` e os services de estoque core afetam
  PDV+OS+Marketplace — exigem **autorização explícita** (esta é só a *decisão*; a
  implementação vai para sprint sob autorização).

**Estado atual relevante:**
- `docs/ai/CURRENT_STATUS.md` (01/06/2026): Estoque com ledger profissional; maior gap
  estrutural é a ausência de multi-depósito.
- `docs/roadmaps/ROADMAP_ESTOQUE.md` (Fase 2 — Multi-depósito): "modelar `Deposito`,
  migrar saldos, suportar transferência". Backlog §7: "Modelar `Deposito` + migração
  de saldos — pré-req: **ADR de modelo**" (este ADR).

---

## 2. Decisão

### 2.1 Modelo (3 peças, todas aditivas)

**a) `Deposito`** — tabela nova `depositos`:

| Coluna | Papel |
|---|---|
| `id` | cuid |
| `storeId` (FK → `stores`, cascade) | **loja dona** — scoping multi-loja |
| `nome` | rótulo ("Depósito Padrão", "Full ML", "Bancada") |
| `tipo` | `"padrao" \| "marketplace" \| "transito" \| "assistencia" \| "outro"` |
| `isDefault` (Boolean) | **um por loja**; o destino de todo consumo até as fases de seleção |
| `active` (Boolean) | só depósitos ativos recebem movimento |
| `metadata` (JsonB) | extensível |

Invariantes: `@@unique([storeId, nome])` e **exatamente um** `isDefault=true` por
`storeId` (garantido por índice parcial + guard de serviço).

**b) `EstoqueSaldo`** — tabela nova `estoque_saldos` (**saldo materializado por
depósito**):

| Coluna | Papel |
|---|---|
| `produtoId` (FK), `depositoId` (FK), `storeId` (denormalizado p/ scoping) | chave |
| `saldo` (Int) | saldo do produto **naquele depósito** |
| `custoMedio` (Float) | custo médio ponderado **por depósito** |

Invariante: `@@unique([produtoId, depositoId])`. Mantido **na mesma transação** do
ledger. `Produto.stock` permanece como **cache agregado derivado** (= Σ `saldo` dos
depósitos da loja), atualizado transacionalmente — preserva toda a leitura atual
(PDV/listagens/relatórios) sem reescrita.

**c) `MovimentacaoEstoque.depositoId`** — coluna **nullable** (Fase 0), FK →
`depositos`. Toda movimentação passa a registrar **de/para qual depósito**. Transferência
entre depósitos = **par de lançamentos** (saída origem + entrada destino) ligados por
`localKey` único (`transfer:{storeId}:{...}`), atômicos.

### 2.2 Migração (sequência fechada, transacional)

1. **DDL aditiva:** `CREATE TABLE depositos`, `CREATE TABLE estoque_saldos`,
   `ALTER movimentacoes_estoque ADD COLUMN depositoId NULL`. Nenhuma coluna existente é
   alterada/dropada.
2. **Seed default:** para cada `Store` ativa → 1 `Deposito` `isDefault=true`
   ("Depósito Padrão").
3. **Backfill saldo:** para cada `Produto` → `EstoqueSaldo(produtoId, depositoDefault,
   saldo = Produto.stock, custoMedio = custo médio atual)`.
4. **Backfill ledger:** `UPDATE movimentacoes_estoque SET depositoId = <default da
   store>` (toda a história fica atribuída ao depósito padrão).
5. **Verificação de invariante (gate de migração):** por loja, Σ `EstoqueSaldo.saldo` ==
   `Produto.stock`; `count(Produto)` == `count(EstoqueSaldo default)`; nenhuma
   movimentação com `depositoId` nulo.
6. **(Fase posterior, não-Fase-0):** tornar `depositoId` **NOT NULL** após confirmar 0
   nulos em produção.

### 2.3 O que esta decisão **NÃO** inclui (escopo fechado da Fase 0)

- **Sem mudança de comportamento:** PDV, OS e importador continuam operando no
  **Depósito Padrão** — saldo idêntico ao de hoje. Nenhuma UI de seleção de depósito.
- **Sem UI de transferência** (o modelo a suporta; a tela é Fase 2.x).
- **Sem transferência entre lojas** (cross-tenant) — explicitamente fora; Fase 0 só
  modela transferência **intra-loja**.
- **Sem adapter Marketplace / reserva** — é o *consumidor* desbloqueado (BL-03), não
  parte da Fase 0.
- **Sem cost layering FIFO** — custo segue médio ponderado, agora por depósito.

---

## 3. Alternativas consideradas

| Alternativa | Prós | Contras | Veredito |
|---|---|---|---|
| **A)** Só `depositoId` no ledger; saldo por depósito derivado on-the-fly do ledger | Mínimo schema; sem cache a sincronizar | Leitura de saldo O(ledger); listagens/PDV degradam; contraria padrão atual (`Produto.stock` materializado) | ❌ performance (RT-12) |
| **B)** Substituir `Produto.stock` por saldo só em `EstoqueSaldo` (quebrante) | Modelo "puro" | Reescreve PDV/OS/relatórios/Marketplace listing; alto blast radius; viola "não-quebrante" | ❌ risco P0 |
| **C)** `Deposito` + `EstoqueSaldo` materializado + `depositoId` nullable no ledger + `Produto.stock` como cache agregado (**escolhida**) | Aditivo; ZERO mudança de comportamento na Fase 0; leitura intacta; multi-loja preservado; caminho incremental para NOT NULL | Exige manter 2 saldos coerentes (cache + por depósito) na mesma transação | ✅ |

---

## 4. Consequências

### 4.1 Positivas
- **Destrava BL-12 → BL-07 → BL-03** (Marketplace pode reservar saldo num depósito
  dedicado, sem oversell).
- **Fundação não-quebrante:** nada no comportamento atual muda na Fase 0.
- **Multi-loja preservado:** `Deposito.storeId` + scoping em todas as queries; coerente
  com ADR-0003 (sem fallback silencioso).
- **Custo por depósito** habilita custeio realista de "Full" vs "loja física".

### 4.2 Negativas / custos
- **Dois saldos a manter coerentes** (`EstoqueSaldo` por depósito + `Produto.stock`
  agregado) — exige transação + job de reconciliação.
- **`depositoId` nullable temporário** é um vetor de regressão até virar NOT NULL.
- **Área protegida tocada** (schema + services core) na sprint de implementação — exige
  autorização explícita.

### 4.3 Riscos introduzidos → mitigação (Red Team RT-01..RT-12)

| # | Risco | Mitigação |
|---|---|---|
| RT-01 | Drift entre `Produto.stock` (cache) e Σ `EstoqueSaldo` | Atualização na **mesma transação** + invariante testada + job de reconciliação periódico |
| RT-02 | Backfill não-atômico → produto sem linha de saldo default | Migração transacional + verificação `count(Produto)==count(saldo default)` (passo 5) |
| RT-03 | `depositoId` nullable reabre baixa sem depósito (regressão) | Guard de teste estático + plano de NOT NULL (passo 6) |
| RT-04 | `Deposito` sem scoping → vazamento cross-tenant | `Deposito.storeId` FK + `@@unique([storeId,nome])` + `where storeId` em toda query (doutrina ADR-0003) |
| RT-05 | Transferência intra-loja confundida com cross-loja | Fase 0 só intra-loja; cross-loja explicitamente fora; destino validado `storeId` igual |
| RT-06 | Transferência "cria" valor (custo médio) | Saída ao custo médio do depósito origem; entrada ao **mesmo** custo; `valorTotal` espelhado |
| RT-07 | Double-submit de transferência duplica saldo | `localKey` único por transferência (idempotência — padrão do projeto) |
| RT-08 | Concorrência: 2 baixas no mesmo (produto,depósito) → lost update/negativo | Transação + lock (otimista via `estoqueAntes/Depois` ou `SELECT … FOR UPDATE` no saldo) |
| RT-09 | Produto novo pós-migração sem linha de saldo no default | Criar `EstoqueSaldo` lazy no create do produto **ou** no 1º movimento (default 0) |
| RT-10 | Delete de depósito com saldo > 0 perde estoque | Default depósito **não-deletável** (analogia `PROTECTED_STORE_IDS`); bloquear delete com saldo≠0 |
| RT-11 | Importador/edição cadastral escreve `stock` direto e fura o ledger | `Produto.stock` vira **read-only derivado**; regra "saldo só por ledger" estendida ao por-depósito |
| RT-12 | Somar saldo por depósito a cada leitura degrada listagens | `EstoqueSaldo` materializado + índice `@@unique([produtoId,depositoId])` + cache agregado mantido |

### 4.4 O que muda imediatamente (na sprint de implementação — não agora)
- **Schema:** + `Deposito`, + `EstoqueSaldo`, + `MovimentacaoEstoque.depositoId` (migração aditiva, ex.: `0011_deposito`).
- **Services core de estoque:** ledger passa a escrever em `EstoqueSaldo` + atualizar `Produto.stock` agregado na mesma transação.
- **Docs a atualizar:** `ROADMAP_ESTOQUE` (Fase 2 → Fase 0 em execução), `BLOCKERS` (BL-12 destravado), `decisions/INDEX` (linha ADR-0007), `DIVIDA_TECNICA` (DT-08).

### 4.5 Longo prazo
- Habilita seleção de depósito no PDV/OS (Fase 2.x), transferência com UI, reserva
  Marketplace (BL-03), curva ABC e cost layering por depósito.

---

## 5. Plano de implementação

**Esta decisão é só decisão — implementação vai para a Sprint Fase 0.**

- **Sprint sugerida:** `ESTOQUE-S-00x` — *Fundação multi-depósito (Fase 0)*.
- **Owner humano:** Rafael · **Executor:** Sonnet (técnico) sob SAFE-lite reforçado
  (área protegida autorizada — ADR-0004).
- **Pré-requisitos:** Gate #1 deste ADR (aceito) + **autorização explícita** para tocar
  `schema.prisma` e services de estoque core (ainda não concedida — sprint não aberta).
- **Critério de pronto:** migração aditiva aplicada em dev (`db:push`), backfill com
  invariante 100% verde, `tsc`/build/vitest verdes, **zero mudança de comportamento**
  observável (PDV/OS/import idênticos).

---

## 6. Validação / como saberemos que deu certo

- Σ `EstoqueSaldo.saldo` por loja == `Produto.stock` para 100% dos produtos (drift = 0).
- 0 movimentações com `depositoId` nulo após backfill.
- PDV/OS/importador: comportamento idêntico ao pré-migração (suite de regressão verde).
- Cada loja com exatamente 1 `Deposito` `isDefault=true`.
- Janela de observação: 1 sprint + smoke em loja-piloto antes de habilitar Fase 2.x.

---

## 7. Referências

- **Blockers:** BL-12 (este ADR), BL-07 (Estoque Fase 2), BL-03 (Marketplace) — `docs/status/BLOCKERS.md`
- **Dívida:** DT-08 (sem multi-depósito) — `docs/status/DIVIDA_TECNICA.md`
- **Roadmap:** `docs/roadmaps/ROADMAP_ESTOQUE.md` §6/§7/§8 (Fase 2), §10 (riscos), §14 (blockers)
- **ADR-0003** (eliminar fallback `loja-1`) — doutrina de scoping multi-loja
- **ADR-0004** (SAFE-lite modo padrão) — perfil da sprint de implementação
- **ADR-0006** (WhatsApp router multi-loja) — precedente de migração aditiva + área protegida autorizada
- **Memórias:** `project_import_nao_sobrescreve_estoque`, `project_sku_gc_saneamento`
- **Red Team:** RT-01..RT-12 (consolidado em §4.3)

---

## 8. Notas / discussão

- A alternativa C vence por ser a **única não-quebrante** que ainda dá performance de
  leitura — segue o mesmo padrão "ledger + saldo materializado" que o projeto já adotou
  em `MovimentacaoEstoque` + `Produto.stock`, apenas adicionando a dimensão depósito.
- O `depositoId` nullable é uma **dívida deliberada e rastreada** (DT-08 §NOT-NULL): a
  Fase 0 entrega tudo populado; a virada para NOT NULL é um passo separado de baixo risco.
- Cross-loja (transferência entre lojas) foi conscientemente adiado: mistura o tema
  depósito com o tema multi-tenant e ampliaria o blast radius da fundação.
- Gate #1 aprovado por Rafael em 2026-06-01 com a diretriz explícita: **persistir o ADR
  e atualizar a documentação relacionada, sem abrir a Sprint Fase 0** (sem implementação,
  sem schema, sem services, sem commit de código operacional).

---

## 9. Adendo — Reconciliação com a implementação (Fase 1 · 02/06/2026)

> A **Fase 1 (Fundação)** foi implementada em `SPRINT_BL07_FASE1` (autorização explícita de área
> protegida). Validação **verde**: `prisma generate` · `npx tsc --noEmit` · `npm run build` · Vitest
> 14/14 (núcleo) / 279 passed | 2 expected fail (suíte). **Aditiva, não-quebrante e dormente** —
> nenhum consumidor (PDV/OS/relatórios) alterado; `Produto.stock` intacto. A decisão da §2 **permanece
> válida**; este adendo apenas registra o *as-built* e o que foi **conscientemente diferido**.

### 9.1 Mapeamento de nomes (as-built ↔ ADR)
| ADR-0007 (§2) | Implementado (Fase 1) | Nota |
|---|---|---|
| `EstoqueSaldo` (saldo materializado por depósito) | **`ProdutoDeposito`** (`produto_depositos`) | mesmo papel; nome alinhado ao domínio Produto↔Depósito |
| `Deposito.isDefault` | **`Deposito.principal`** | semântica idêntica (1 por loja) |
| `EstoqueSaldo.saldo` | `ProdutoDeposito.quantidade` | saldo físico |
| `Deposito` (`depositos`), scoping `storeId` | igual | `@@unique([storeId, codigo])`, FK→`stores` cascade |

### 9.2 Diferido conscientemente (vs §2 do ADR) — diretriz "somente saldo físico"
- **`EstoqueSaldo.custoMedio` por depósito** — **não** implementado na Fase 1. Custo médio segue
  global em `Produto.precoCusto`. Reintroduzir quando o custeio por depósito for necessário (Fase 2+).
- **`Deposito.tipo` / `metadata`** — não implementados (modelo mínimo). Adicionar na Fase 2 (seleção
  de depósito: `marketplace`/`transito`/`assistencia`).
- **`MovimentacaoEstoque.depositoId` (nullable)** — **não** adicionado na Fase 1 (ledger intocado).
  É a peça da **Fase 2** que cabeia os write-paths (PDV/OS) ao depósito; até lá `ProdutoDeposito`
  é fundação dormente.
- **`storeId` em `ProdutoDeposito`** é escalar **indexado** (sem FK direta a `Store`); integridade
  via FKs de produto e depósito + `assertStoreId` (sem fallback `loja-1`, ADR-0003).

### 9.3 Invariante e dívida
- Guard "1 principal/loja": `ensureDepositoPrincipal` idempotente (índice parcial único na migração
  `0011` é reforço; `db:push` não cria índices parciais).
- Invariante de migração (§2.2 passo 5): `Σ ProdutoDeposito.quantidade == Σ Produto.stock` por loja —
  verificada pelo `scripts/backfill-deposito.mjs`.
- **Dívida nova `DT-17` (P2):** `ProdutoDeposito` pode driftar de `Produto.stock` até a Fase 2 cabear
  os write-paths (mitigado: camada dormente + backfill re-runnable).

### 9.4 Artefatos
- Schema: `prisma/schema.prisma` (`Deposito`, `ProdutoDeposito`). Migração: `0011_deposito_produto_deposito`.
- Services: `lib/estoque/deposito-core.ts` (puro) + `lib/estoque/estoque-deposito-service.ts` (dormente).
- Backfill: `scripts/backfill-deposito.mjs` (`npm run db:backfill-deposito`). Bootstrap: hook em `app/api/stores/route.ts`.
- Arquitetura: [`docs/architecture/estoque/BL07_FASE0_ARQUITETURA.md`](../architecture/estoque/BL07_FASE0_ARQUITETURA.md) · Sprint: [`docs/sprints/proposals/SPRINT_BL07_FASE1.md`](../sprints/proposals/SPRINT_BL07_FASE1.md).
- **Cutover pendente** (não executado): `npm run db:push` (aplica `0011`) → `npm run db:backfill-deposito --exec` → observar.
