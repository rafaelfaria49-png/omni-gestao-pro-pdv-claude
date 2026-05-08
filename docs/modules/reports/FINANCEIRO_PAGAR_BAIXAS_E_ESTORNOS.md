# Financeiro real — Contas a Pagar — Baixas e estornos (server-side)

Data: 2026-05-07

## Objetivo

Criar rotas oficiais server-side para mutações de **Contas a Pagar** (Prisma `ContaPagarTitulo`) sem mexer no Financeiro V2 (Lovable), sem migrations, sem remover `localStorage` e sem alterar PDV/OS/Receber.

## Rotas criadas (API Financeiro)

> Todas as rotas:
>
> - **Método**: `POST`
> - **Autenticação**: assinatura válida via cookies + `requireAdmin()`
> - **Loja**: resolvida por `storeIdFromAssistecRequestForWrite` (header `x-assistec-loja-id` ou query `storeId`/`lojaId`)
> - **Validação**: `lojaId` opcional no body (se enviado, precisa bater com o header)
> - **Referência do título**: aceita `tituloId` **ou** `localKey`
> - **Persistência**: nunca deleta título (apenas muda `status` e registra histórico no `payload.historico` via service)
> - **Auditoria**: registra `logsAuditoria` leve e devolve `audit` (via `buildContaPagarAuditTrail`)

### 1) Pagamento parcial

- **Path**: `POST /api/financeiro/contas-pagar/pagamento-parcial`
- **Contrato**:

```json
{
  "lojaId?": "string",
  "tituloId?": "string|number",
  "localKey?": "string",
  "valor": 123.45,
  "formaPagamento?": "string",
  "observacao?": "string"
}
```

- **Service**: `registrarPagamentoParcialContaPagar({ valorPago, observacao })`
- **Logs**: `action = "pagamento_parcial_conta_pagar"`

### 2) Liquidação total

- **Path**: `POST /api/financeiro/contas-pagar/liquidar`
- **Contrato**:

```json
{
  "lojaId?": "string",
  "tituloId?": "string|number",
  "localKey?": "string",
  "formaPagamento?": "string",
  "observacao?": "string"
}
```

- **Service**: `liquidarContaPagar({ observacao })`
- **Logs**: `action = "liquidacao_conta_pagar"`

### 3) Estorno completo do título

- **Path**: `POST /api/financeiro/contas-pagar/estornar`
- **Contrato**:

```json
{
  "lojaId?": "string",
  "tituloId?": "string|number",
  "localKey?": "string",
  "motivo?": "string"
}
```

- **Service**: `estornarContaPagar({ modo: "titulo_completo", motivo })`
- **Logs**: `action = "estorno_conta_pagar"`

### 4) Estorno do último pagamento

- **Path**: `POST /api/financeiro/contas-pagar/estornar-ultimo-pagamento`
- **Contrato**:

```json
{
  "lojaId?": "string",
  "tituloId?": "string|number",
  "localKey?": "string",
  "motivo?": "string"
}
```

- **Service**: `estornarContaPagar({ modo: "ultimo_pagamento", motivo })`
- **Logs**: `action = "estorno_ultimo_pagamento_conta_pagar"`

## Resposta (shape compatível com frontend futuro)

As rotas retornam:

- `ok: true|false`
- quando `ok: true`:
  - `titulo`: campos mínimos do Prisma (id/storeId/localKey/status/valor/vencimento/numeroDocumento/fornecedorId)
  - `audit`: item leve (saldo pago/restante, vencido, fornecedorNome quando existir no payload) derivado via `buildContaPagarAuditTrail([titulo])`

Quando `ok: false`, retornam `error` (string) e status HTTP coerente (400/401/403/404).

## Compatibilidade (garantias)

- **Títulos antigos**: busca aceita `tituloId` (Prisma `id`) ou `localKey` (idempotência por `(storeId, localKey)` já no schema).
- **Payload simples**: o service trata `payload` como record; histórico é append-only em `payload.historico`.
- **Status legado**: normalização ocorre no service (`normalizePagarStatus`) — evita quebrar aliases.
- **localKey**: não é regenerada nas rotas; apenas usada para localizar o título.
- **Fornecedor**: `fornecedorId` (Prisma) é preservado; `fornecedorNome` continua podendo estar apenas no payload (audit expõe quando existe).

## Riscos remanescentes

- **Forma de pagamento**: capturada no contrato/auditoria, mas ainda não é persistida como entidade/movimento (ledger/fluxo persistente ainda não existe por design).
- **UI legado / Financeiro V2**: ainda não consomem essas rotas; integração planejada em etapa própria para não quebrar o produto.

## Próximos passos sugeridos

- Conectar o painel legado de Contas a Pagar (localStorage) a essas rotas, mantendo `localStorage` como espelho (mesmo padrão usado em Receber).
- Adicionar rotas de leitura “oficial” para o painel legado, reaproveitando `buildContaPagarSummary`/`audit`.
- Definir persistência de “movimentos de caixa” (ledger/movimentos) sem migration nesta etapa (ou com migration em ciclo futuro).

