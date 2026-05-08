# Financeiro — Contratos oficiais (status, localKey, payload)

**Data:** 2026-05-08  
**Escopo:** camada `lib/financeiro/contracts/*` + uso seguro no adapter OS → `ContaReceberTitulo`.  
**Sem:** alteração de Prisma, migrations, UI Financeiro V2, PDV, nem mudança de merge/regras de negócio no adapter além de centralizar constantes.

---

## 1. Problema: três fontes financeiras

Conforme `docs/modules/reports/FINANCEIRO_V2_REAL_CHECKIN.md`:

1. **Financeiro V2 Lovable** — mock / estado local no arquivo `routes/financeiro.tsx`.  
2. **Painel legado** — `lib/financeiro-store.tsx` (carteiras, movimentos, contas a pagar em localStorage).  
3. **Prisma parcial** — `ContaReceberTitulo`, `ContaPagarTitulo`, `Venda`, integrações OS/PDV.

Sem contratos explícitos, **status**, **localKey**, **payload** e **origem** divergem entre telas, storage e banco.

---

## 2. Status oficiais (canônicos)

Arquivo: `lib/financeiro/contracts/status.ts`

### Conta a receber

| Canônico   | Notas |
|-----------|--------|
| `pendente` | Inclui aliases: `em_aberto`, `aberto` |
| `parcial` | |
| `pago` | `paga`, `quitado`, `liquidado` |
| `vencido` | **`atrasado` normaliza para `vencido`** |
| `cancelado` | |
| `estornado` | |

### Conta a pagar

Mesmo conjunto de valores; `atrasado` → `vencido`.

### Movimento financeiro

| Canônico   | Notas |
|-----------|--------|
| `previsto` | `planejado`, `prevista` |
| `confirmado` | `realizado` |
| `cancelado` | |
| `estornado` | |

### Helpers

- `normalizeReceberStatus`, `normalizePagarStatus`, `normalizeMovimentoStatus`  
- `isReceberPago`, `isPagarPago`, `isStatusCancelado`  
- `getFinanceiroStatusLabel`, `getFinanceiroStatusMeta` (rótulo + `tone` sugerido para UI futura)

**Compatibilidade:** valores já gravados como `pendente`, `cancelado`, `atrasado` continuam legíveis via normalização.

---

## 3. Origens oficiais

Arquivo: `lib/financeiro/contracts/origem.ts`

Constantes: `os`, `pdv`, `manual`, `marketplace`, `ajuste`, `importacao`, `sistema`, `legado`.

- `normalizeFinanceiroOrigem`  
- `getFinanceiroOrigemLabel`  
- `FINANCEIRO_CREATED_FROM_OPERACOES_HUB_V2` = `"operacoes-hub-v2"` (valor estável usado no adapter OS)

---

## 4. Local keys oficiais

Arquivo: `lib/financeiro/contracts/local-key.ts`

### Compatibilidade obrigatória (adapter OS)

O Prisma e o adapter **`NÃO** usam** o prefixo `receber:os:` para faturamento de OS.

Chave **líder** hoje:

```text
os-faturamento:{storeId}:{ordemServicoId}
```

Constante exportada: `LOCAL_KEY_PREFIX_OS_FATURAMENTO` + `buildContaReceberLocalKey({ kind: "adapter_os_faturamento", ... })`.

**Não alterar** esse formato sem migração de dados e coordenação com `financeiro-sync-service`.

### Contrato para novos fluxos (evolução)

| Builder | Formato |
|---------|---------|
| `receber_os` | `receber:os:{storeId}:{ordemServicoId}` |
| `receber_pdv` | `receber:pdv:{storeId}:{pedidoId}` |
| `receber_manual` | `receber:manual:{storeId}:{uuid}` |
| `pagar_manual` | `pagar:manual:{storeId}:{uuid}` |
| `pagar_fornecedor` | `pagar:fornecedor:{storeId}:{fornecedorId}:{referencia}` |
| `buildVendaLocalKey` | `venda:{storeId}:{pedidoId}` |
| `buildMovimentoLocalKey` | `movimento:{storeId}:{origem}:{referencia}` |

`parseFinanceiroLocalKey` entende `os-faturamento`, `receber:*`, `pagar:*`, `venda:`, `movimento:`.

---

## 5. Payload oficial (JSONB)

Arquivo: `lib/financeiro/contracts/payload.ts`

Tipos base:

- **`ContaReceberPayload`** — `origem`, `referencia`, `clienteId`, `clienteNome`, `ordemServicoId`, `pedidoId`, parcelas/histórico/revisões/metadata, além de campos de integração OS (`ordemNumero`, `faturamentoReferencia`, `orcamento`, `statusOperacional`, …).  
- **`ContaPagarPayload`** — espelho para pagar.

Helpers:

- `buildContaReceberPayload` / `buildContaPagarPayload` — omitem chaves `undefined`.  
- `mergeFinanceiroPayload` — merge profundo de objetos (arrays substituídos pelo patch).  
- `appendFinanceiroHistorico` — acrescenta entrada com `at` ISO8601.

---

## 6. Valores e datas

Arquivo: `lib/financeiro/contracts/valores.ts`

- `safeMoney`, `sumMoney`, `formatMoneyBR`  
- `calculatePaidRemaining`  
- `isOverdueDateString` (vencimento string vs hoje local)  
- `parseDateStringSafe` — ISO `yyyy-mm-dd` ou `dd/mm/yyyy`

---

## 7. Adapter OS atualizado (seguro)

Arquivo: `lib/financeiro/adapters/os-faturamento.ts`

- Passa a usar **apenas** helpers de `local-key`, `payload`, `origem`, `status` para montar a **mesma** `localKey`, o **mesmo** conjunto de chaves no JSON e os mesmos literais `"pendente"` / `"cancelado"` (via constantes).  
- **Mantido:** merge **raso** `{ ...prevPayload, ...nextPayload }` + lógica de `revisoes[]` (não foi trocada por `mergeFinanceiroPayload` profundo, para evitar mudança silenciosa em objetos aninhados).

---

## 8. Próximos passos sugeridos

1. **PDV à prazo** — alinhar `localKey`/payload ao contrato (`receber:pdv` ou política explícita com `pdv-aprazo-*` legado).  
2. **Contas a pagar** — writes Prisma usando `buildContaPagarLocalKey` + `normalizePagarStatus`.  
3. **UI legado** — chamar `normalize*` na exibição e gradualmente gravar só canônicos.  
4. **Migração futura** — se unificar `os-faturamento:` com `receber:os:`, plano de dados + dual-read.

---

## 9. Referências

- `docs/modules/reports/FINANCEIRO_V2_REAL_CHECKIN.md`  
- `docs/modules/FINANCEIRO.md`  
- `docs/architecture/BACKEND.md`
