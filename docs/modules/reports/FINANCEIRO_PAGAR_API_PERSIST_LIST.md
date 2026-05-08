# Financeiro real — APIs Contas a Pagar (persistência + listagem)

## Objetivo

Criar rotas oficiais server-side para **persistir** e **listar** Contas a Pagar (`ContaPagarTitulo`) usando o service real `lib/financeiro/services/contas-pagar-service.ts`, **sem** conectar UI ainda (painel legado e Financeiro V2 Lovable permanecem inalterados).

## Rotas criadas

### 1) `POST /api/ops/contas-pagar-persist`

- Arquivo: `app/api/ops/contas-pagar-persist/route.ts`
- Entrada:

```json
{
  "lojaId": "opcional (deve bater com header)",
  "rows": [ { /* ContaPagarRow[] ou ContaPagarItem[] */ } ]
}
```

- Regras:
  - Resolve `storeId` via header/query (`opsLojaIdFromRequestForWrite`).
  - Se `lojaId` vier no body, valida que é igual ao `storeId`.
  - Para cada row:
    - `localKey` = `row.localKey` ou `row.id`.
    - Se não houver `localKey`, gera **warning** e pula o item.
    - Upsert via `upsertContaPagar` com:
      - `replacePayload: true` (snapshot legado preservado),
      - `payloadPatch` = row completo,
      - escalares: `descricao`, `valor`, `vencimento` (ou `dataVencimento`), `status`, `numeroDocumento`,
      - fornecedor: `fornecedorId` + `fornecedorNome` (a partir de `fornecedorNome` ou `fornecedor`).
  - Nunca deleta títulos.

- Saída:

```json
{
  "ok": true,
  "count": 123,
  "warnings": ["row_sem_localKey: id/localKey ausente"]
}
```

### 2) `GET /api/ops/contas-pagar-list`

- Arquivo: `app/api/ops/contas-pagar-list/route.ts`
- Fonte: `listContasPagarByStore(storeId)` (Prisma via service).
- Retorno:

```json
{
  "ok": true,
  "rows": [],
  "summary": {},
  "audit": [],
  "metadata": {
    "source": "server",
    "storeId": "loja-1",
    "generatedAt": "2026-05-07T00:00:00.000Z"
  }
}
```

#### `rows` (compatibilidade)

- Primeiro tenta reutilizar `payload` se ele já for um snapshot compatível (shape do painel legado).
- Caso contrário, monta fallback:
  - `id` = `localKey` (ou `id` Prisma)
  - `descricao`, `valor`, `status`, `numeroDocumento`, `vencimento`
  - `fornecedor` (string) a partir de `payload.fornecedorNome`/`payload.fornecedor`
  - `dataVencimento` normalizado para ISO `YYYY-MM-DD` quando possível
  - `categoria` default `"Outros"` (ou `payload.categoria`)

## Summary / Audit

- `summary`: `buildContaPagarSummary(titulos)`
  - `totalAberto`, `totalVencido`, `totalPago`, `totalParcial`, `quantidade`, `porStatus`
- `audit`: `buildContaPagarAuditTrail(titulos)`
  - trilha leve com pago/restante/vencido, fornecedor e documento

## Compatibilidade e invariantes

- Status legado é normalizado no service (`normalizePagarStatus`).
- Payload simples/antigo funciona (histórico pode estar vazio).
- `localKey` ausente não quebra a rota: vira warning e o item é ignorado.
- Fornecedor string simples (`fornecedor`) é aceito e vai para `payload.fornecedorNome`.
- `fornecedorId` real é preservado quando existir.

## Próximos passos sugeridos

1. Criar endpoints de baixa/estorno oficiais para pagar (`/api/financeiro/contas-pagar/*`) usando o service.
2. Integrar painel legado gradualmente (primeiro KPIs via `summary`, depois espelho LS↔Prisma, sem reescrever UI).
3. Só depois discutir fluxo de caixa/ledger persistente.

