# Financeiro — Ledger, carteiras e movimentos (fundação)

**Data:** 2026-05-08  
**Escopo:** camada de domínio **sem migration Prisma**, **sem UI**, **sem persistência nova** — apenas tipos, serviços puros e preparação para integração futura.

---

## 1. Schema Prisma atual — o que existe

| Recurso | Existe? | Observação |
|---------|---------|------------|
| **Carteira** (tabela dedicada) | **Não** | Carteiras hoje só no legado `lib/financeiro-types.ts` + `localStorage`. |
| **Movimento financeiro** (tabela dedicada) | **Não** | Movimentos idem legado (`MovimentoFinanceiro` no LS). |
| **`LedgerSnapshot`** | **Sim** | `storeId` + `date` (PK composta), `payload` **texto** — pensado para snapshot diário/agregado, não linha a linha de movimento. |
| **`ContaReceberTitulo` / `ContaPagarTitulo` / `Venda`** | **Sim** | Fonte parcial “real” já em uso. |

### Gap (sem migration nesta etapa)

- Falta modelo **Carteira** multi-loja alinhado ao contrato (`storeId`, `saldoInicial`, `saldoAtual` materializado ou derivado).
- Falta modelo **MovimentoFinanceiro** (ou **LedgerEntry**) imutável com `localKey`, `correlacao`, status canônico.
- **`LedgerSnapshot`** pode no futuro armazenar **rollup** diário (saldo por carteira, KPIs), não substituir o detalhe de movimentos até decisão de arquitetura.

**Documentado aqui; nenhuma migration criada.**

---

## 2. Camada criada no código

### Tipos (`lib/financeiro/types/`)

| Arquivo | Conteúdo |
|---------|-----------|
| `carteira.ts` | `Carteira`, `CarteiraTipoDominio` |
| `movimento.ts` | `Movimento`, `MovimentoTipo`, `MovimentoBuildInput` |
| `ledger.ts` | `LedgerEvent`, `LedgerEventoTipo`, `FinanceiroAuditEntry` |

**Não** substituem os tipos legados de `lib/financeiro-types.ts` (convivência até migração).

### Serviços (`lib/financeiro/services/`)

| Arquivo | Funções principais |
|---------|-------------------|
| `carteira-service.ts` | `normalizeCarteiraDraft`, `validateCarteiraBelongsToStore`, `applySaldoDerivadoCarteira`, `isCarteiraOperacional` |
| `movimento-service.ts` | `buildMovimentoInput`, `normalizeMovimento`, `canReverseMovimento`, `isMovimentoConfirmado`, `finalizeMovimentoDraft`, **`buildMovimentoFromContaReceber`** (sem gravar) |
| `saldo-service.ts` | `calculateSaldo`, `calculateSaldoCarteira`, `calculateFluxoPeriodo`, `calculateReceberPrevisto`, `calculatePagarPrevisto`, `calculateSaldoConsolidadoCarteiras` |
| `ledger-service.ts` | `buildLedgerEvent`, `buildCorrelacaoId`, `buildFinanceiroAuditTrail` |

Reutiliza contratos em `lib/financeiro/contracts/` (`MOVIMENTO_STATUS`, `FINANCEIRO_ORIGEM`, `safeMoney`, `buildMovimentoLocalKey`).

---

## 3. Arquitetura alvo (documentada, não implementada end-to-end)

### Source of truth (futuro)

1. **Títulos** (`ContaReceberTitulo`, `ContaPagarTitulo`) — obrigações; status via contratos.
2. **Movimentos** (futura tabela) — fatos de caixa **confirmados** ou **previstos**, imutáveis após confirmação (estorno = novo evento).
3. **Saldo de carteira** — **derivado**: `saldoInicial + Σ(movimentos confirmados)` (e política clara para previstos em D+0).
4. **`LedgerSnapshot`** (opcional) — agregado por `storeId` + **data** para performance e fechamento, não como única fonte de linha.

### Ledger derivado

- Cada confirmação gera `LedgerEvent` lógico (`saldoAnterior` → `saldoPosterior`) e `correlacao` estável (`buildCorrelacaoId`).
- Trilha de auditoria (`buildFinanceiroAuditTrail`) pode alimentar `LogsAuditoria` ou storage dedicado **depois**.

### Conciliação e fechamento (futuro)

- Conciliação: bater movimento ↔ extrato ↔ título.
- Fechamento: travar período, gerar snapshot em `LedgerSnapshot` + relatório.

**Nada disso foi automatizado nesta entrega.**

---

## 4. Integração leve com recebíveis (OS / PDV)

- **`buildMovimentoFromContaReceber`**: monta um `Movimento` **previsto** (padrão) com `origem` configurável (`os` ou `pdv`), `localKey` via `buildMovimentoLocalKey`, **sem** `prisma` e **sem** alterar `os-faturamento.ts`.
- Próximo passo (futuro): na **baixa** ou na confirmação de recebimento, promover status para `confirmado` e persistir movimento.

---

## 5. Riscos evitados / remanescentes

**Evitados nesta fase:**

- Migration antecipada sem modelo de negócio fechado.
- Duplicar saldo editável na UI ao mesmo tempo que movimentos inconsistentes.
- Acoplar Financeiro V2 mock ao backend antes dos contratos de escrita.

**Remanescentes:**

- **`calculateReceberPrevisto` / `calculatePagarPrevisto`**: linhas com `status` não reconhecido pelo normalizador são **ignoradas** (conservador — pode subestimar; ajustar quando os writers gravarem só status canônicos).
- **Duas famílias de tipos “Carteira”** até migração do legado.
- **`LedgerSnapshot`payload** é string — se for JSON, padronizar formato ao implementar snapshot real.

---

## 6. Referências

- `docs/modules/reports/FINANCEIRO_V2_REAL_CHECKIN.md`
- `docs/modules/reports/FINANCEIRO_CONTRACTS_STATUS_BASE.md`
- `docs/modules/FINANCEIRO.md`
