# Financeiro real — leitura server-side de Contas a Receber

## 1. Objetivo

Transformar o endpoint `/api/ops/contas-receber-list` na **fonte oficial de leitura** de títulos a receber (`ContaReceberTitulo`), usando o núcleo de domínio em `lib/financeiro/services/contas-receber-service.ts`, sem quebrar o painel legado que ainda prioriza `localStorage`.

## 2. Endpoints envolvidos

- `GET /api/ops/contas-receber-list`
  - Arquivo: `app/api/ops/contas-receber-list/route.ts`
  - Autenticação/autorização: `requireOpsSubscription` + resolução de loja via `opsLojaIdFromRequest(req)`.
  - Fonte de dados: Prisma `ContaReceberTitulo` filtrado por `storeId`.

## 3. Implementação atual (após unificação)

### 3.1 Consulta base

```ts
const titulos = await prisma.contaReceberTitulo.findMany({
  where: { storeId: lojaId },
  orderBy: { updatedAt: "desc" },
})
```

### 3.2 `rows` — compatível com `ContaReceberRow`

Para cada título:

1. Calcula `localKey`: `const lk = r.localKey?.trim() || r.id`.
2. Tenta reconstruir um `ContaReceberRow` completo a partir do `payload`:
   ```ts
   const fromPayload = rowFromPayload(lk, r.payload)
   if (fromPayload) out.push(fromPayload)
   ```
3. Caso o `payload` não traga um snapshot completo, monta um row simples a partir dos escalares:
   ```ts
   out.push({
     id: lk,
     descricao: r.descricao,
     cliente: r.cliente,
     valor: r.valor,
     vencimento: r.vencimento,
     status: r.status,
     tipo: "Manual",
   })
   ```

> **Compatibilidade:** esse comportamento é o mesmo usado antes — o painel legado continua enxergando `rows: ContaReceberRow[]` com o mesmo shape.

### 3.3 `summary` — agregados canônicos

Usa o helper do service:

- `buildContaReceberSummary(titulos)` retorna:
  - `quantidade`: número de títulos.
  - `totalAberto`: soma de saldos em aberto (pendente/parcial/vencido).
  - `totalVencido`: parte do aberto com vencimento atrasado ou status `vencido`.
  - `totalPago`: soma dos `valor` de títulos `pago`.
  - `totalParcial`: soma dos valores pagos de títulos `parcial`.
  - `porStatus`: contagem por status canônico (`pendente`, `parcial`, `pago`, `vencido`, `cancelado`, `estornado`).  

### 3.4 `audit` — trilha leve para relatórios

Usa:

- `buildContaReceberAuditTrail(titulos)` → `ContaReceberAuditItem[]`:
  - `id`: id Prisma do título.
  - `storeId`: loja.
  - `localKey`: chave de negócio (`localKey` ou `id`).
  - `status`: status canônico.
  - `valor`: valor bruto do título.
  - `saldoAberto`: saldo em aberto calculado server-side.
  - `vencido`: flag se o saldo aberto está em atraso.
  - `cliente`, `vencimento`: metadados textuais.

### 3.5 `metadata`

O endpoint adiciona metadados para debug e monitoramento:

- `source: "server"`
- `storeId`: loja em uso (vinda de `opsLojaIdFromRequest`).
- `generatedAt`: timestamp ISO da geração da resposta.
- `gateBypassedInDev`: indica se o gate de assinatura foi bypassado em ambiente de desenvolvimento.

## 4. Formato final da resposta

```json
{
  "ok": true,
  "rows": [ /* ContaReceberRow[] compatível com painel legado */ ],
  "summary": {
    "quantidade": 0,
    "totalAberto": 0,
    "totalVencido": 0,
    "totalPago": 0,
    "totalParcial": 0,
    "porStatus": {}
  },
  "audit": [
    {
      "id": "cr_...",
      "storeId": "loja-1",
      "localKey": "pdv-aprazo-...",
      "status": "pendente",
      "valor": 100,
      "saldoAberto": 100,
      "vencido": false,
      "cliente": "Cliente",
      "vencimento": "01/06/2026"
    }
  ],
  "metadata": {
    "source": "server",
    "storeId": "loja-1",
    "generatedAt": "2026-05-07T23:00:00.000Z",
    "gateBypassedInDev": false
  }
}
```

> **Painel legado:** continua usando apenas `rows`. A presença de `summary`, `audit` e `metadata` é transparente para o front atual.

## 5. Compatibilidade com o painel legado

- O componente `components/dashboard/financeiro/contas-receber.tsx` continua:
  - Carregando `localStorage` como fonte primária (`loadContasFromStorage(lojaId)`).
  - Chamando `GET /api/ops/contas-receber-list` e usando apenas `res.rows`.
  - Aplicando `mergeContasLocalWins(local, serverRows)` — **localStorage ainda tem prioridade** visual.
- Nenhuma mudança foi feita na lógica de cálculo de saldo/parcelas/histórico no cliente; apenas a resposta do servidor foi enriquecida.

## 6. Compatibilidade geral

- **Payload antigo:** se `payload` já guarda um snapshot completo (`ContaReceberRow`), continua sendo usado como antes.
- **Fallback simples:** se não houver snapshot compatível, o servidor monta rows simples com base em escalares, como no comportamento original.
- **Status antigos:** `buildContaReceberSummary` / `buildContaReceberAuditTrail` normalizam status via contratos (`normalizeReceberStatus`), mas o campo `status` em `rows` permanece com o valor original gravado, mantendo compatibilidade com a UI.
- **PDV / OS / demais rotas:** nenhuma alteração foi feita em `/api/ops/contas-receber-persist`, PDV (`appendContaReceberTituloPdvAprazo`) ou adapter OS; essas rotas apenas alimentam `ContaReceberTitulo`, que agora é lido de forma consolidada.

## 7. Próximos passos sugeridos

1. Gradualmente usar `summary` e `audit` em dashboards/relatórios para evitar recalcular tudo no cliente.
2. Evoluir o painel legado para confiar mais na leitura server-side (e menos em cálculos locais) à medida que o histórico de pagamentos estiver consolidado no servidor.
3. No futuro, usar essa base para alimentar um módulo único de relatórios financeiros (sem depender de `localStorage` para contas a receber).

