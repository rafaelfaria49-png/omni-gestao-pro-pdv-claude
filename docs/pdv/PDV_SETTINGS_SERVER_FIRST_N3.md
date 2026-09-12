# PDV Settings Server-First (N3)

> GOAL `PDV-SETTINGS-SERVER-FIRST-N3`
> Eliminação do split-brain de configurações do PDV.
> Autoridade de verdade: `StoreSettings` no servidor.
> Persistência de capabilities v1 em `StoreSettings.printerConfig.capabilities`.

---

## 1. Precedência Server-First

A resolução de configurações de loja segue a seguinte ordem estrita:

1. **Servidor explícito (StoreSettings)**: Valor presente e válido retornado pelo banco de dados. Autoridade máxima.
2. **Fallback legado scoped**: Permitido exclusivamente se o servidor ainda não possuir valor explícito, e desde que a chave em `localStorage` possua escopo comprovável para a mesma unidade ativa (`key::storeId` ou `key:storeId`).
3. **Default canônico**: Utilizado quando nem o servidor nem o fallback local possuem valor válido, ou em caso de dados legados malformados.

**Regra inegociável**: Jamais `localStorage > servidor explícito`. Stale cache local é descartado em favor do servidor.

---

## 2. Matriz de Classificação de Chaves (PARTE A)

| Chave / Padrão | Escopo | Classificação | Destino / Tratamento no N3 |
|---|---|---|---|
| `@omnigestao:pdv-layout::{storeId}` | Loja | `SERVER_SETTING` | Migrado para `printerConfig.pdvMainLayout` / `v3PdvSectionCard`. Server-first. |
| `omni-pdv-classic-layout::{storeId}` | Loja | `SERVER_SETTING` | Migrado para `printerConfig.pdvParams.pdvClassicLayout`. Server-first. |
| `omnigestao-pdv-modo::{storeId}` | Loja | `SERVER_SETTING` | Default de loja em `printerConfig.v3PdvClassicModoInicial`. URL `?modo=` prevalece na sessão. |
| `omnigestao:pdv-shortcuts:{storeId}` | Loja | `SERVER_SETTING` | Persistido em `pdvParams.atalhosRapidos`. Servidor vence fast-path local. |
| `printerConfig.capabilities` | Loja | `SERVER_SETTING` | Persistido no JSON de `StoreSettings`. Version 1 com validação estrita. |
| `assistec-pdv-ui-mode` | Dispositivo | `UI_PREFERENCE_LOCAL` | **Não migra**. Preferência visual local (`omni-smart`, `compact`, `expand`). |
| `omnigestao-pdv-rapido-beep` | Dispositivo | `UI_PREFERENCE_LOCAL` | **Não migra**. Preferência de feedback sonoro local. |
| `@omnigestao:deviceId` | Dispositivo | `OPERATIONAL_LOCAL` | **Não migra**. Identidade de hardware local. Jamais usado como autoridade de migração. |
| `@omnigestao:pdv-terminal:{storeId}` | Loja+Dev | `OPERATIONAL_LOCAL` | **Não migra**. Terminal selecionado neste dispositivo. |
| `@omnigestao:pdv-black-turno:{s}:{t}` | Loja+Term | `OPERATIONAL_LOCAL` | **Não migra**. Turno de caixa operacional. |
| `@omnigestao:pdv-black-cupom:{s}:{t}` | Loja+Term | `OPERATIONAL_LOCAL` | **Não migra**. Sequencial local de cupom. |
| `assistec-pdv-operator-id-v1` | Dispositivo | `OPERATIONAL_LOCAL` | **Não migra**. Sessão de operador local. |
| `assistec-pdv-operador-nome:{storeId}` | Loja+Dev | `OPERATIONAL_LOCAL` | **Não migra**. Nome de operador local. |
| `assistec-controle-consumo-mesas-v1` | Global | `OPERATIONAL_LOCAL` | **Não migra** (`MESAS_CHANGED=NO`). Código intacto no N3. |
| `@omnigestao:pdv-holds:{s}:{t}` | Loja+Term | `QUEUE_OR_CACHE` | **Não migra**. Fila de vendas em espera local. |
| `omnigestao:pdv-assistencia-cart:{s}` | Loja | `QUEUE_OR_CACHE` | **Não migra**. Rascunho de carrinho local. |
| `omnigestao:venda-completa-ent-v2:{s}` | Loja | `QUEUE_OR_CACHE` | **Não migra**. Rascunho de venda completa. |
| `assistec-pdv-import-comanda` | SessionTab | `QUEUE_OR_CACHE` | **Não migra**. Ponte de comanda em sessionStorage. |
| `@omnigestao:pdv-layout` (global) | Global | `AMBIGUOUS_NOT_MIGRATED` | **Não migra**. Chave global ambígua quarentenada. |
| `omni-pdv-classic-layout` (global) | Global | `AMBIGUOUS_NOT_MIGRATED` | **Não migra**. Chave global ambígua quarentenada. |
| `omnigestao-pdv-modo` (global) | Global | `AMBIGUOUS_NOT_MIGRATED` | **Não migra**. Chave global ambígua quarentenada. |
| `@omnigestao:ramo-atuacao:{storeId}` | Loja | `AMBIGUOUS_NOT_MIGRATED` | **Não migra**. Heurística histórica. Servidor usa `Store.profile`. |

---

## 3. Capabilities Persistence V1

Persistido dentro de `StoreSettings.printerConfig.capabilities`:

```json
{
  "capabilities": {
    "version": 1,
    "overrides": {
      "pdv.tables": true,
      "sales.paymentMethods": { "enabled": true }
    }
  }
}
```

### Validações Obrigatórias no PUT:
1. `version`: Estritamente `1` (numérico). Rejeitado com HTTP 400 se ausente ou diferente de 1.
2. `KNOWN_CAPABILITY_KEYS_V1`: Allowlist fechada baseada em superfícies reais documentadas:
   - `pdv.tables`, `sales.paymentMethods`, `pdv.filmLookup`, `pdv.accessoryModelColor`, `pdv.quickServices`, `pdv.osLookup`, `pdv.discounts`, `pdv.customerStoreCredit`, `pdv.heldSales`, `pdv.multiplePayments`, `pdv.customerSearch`.
3. Capacidades bloqueadas: `pdv.scale`, `pdv.scale.*` e `sale.fractionalQty` são explicitamente rejeitadas com HTTP 400.
4. Campos de autoridade do servidor: Tentativa de escrever `available`, `entitled`, `plan`, `license` (na raiz ou dentro de overrides) é rejeitada com HTTP 400 (sem sanitização silenciosa).
5. Merge não-destrutivo: Preserva campos irmãos de `printerConfig` (`impressao`, `pdvParams`, namespaces customizados).

---

## 4. Backfill Idempotente e Concorrência

- **Write only if absent**: Implementado no lado servidor (`app/api/stores/[id]/settings/route.ts`).
- Se o payload contiver `backfill: true`, o servidor revalida o registro no momento da escrita. Se um campo já estiver definido no banco, ele **não é sobrescrito**.
- **Cenário de múltiplos dispositivos**: Se o Device A backfillou `supermercado` no servidor vazio, quando o Device B carregar com legado antigo `classic`, o servidor já possui valor explícito. O write de B é ignorado pelo servidor e `supermercado` prevalece.
- **Autoridade**: A autoridade é a presença de valor no banco (`DEVICE_ID_AUTHORITY=NO`).
- **Resiliência do Provider**: Tentativa de backfill sem permissão (403) ou falha de rede é registrada no ref da sessão e não entra em loop infinito de retry.

---

## 5. Itens Reservados ao N4 (Não implementados no N3)

- Runtime capability resolver (`resolveCapability()`);
- Tabela-verdade runtime e registry de módulos (`PdvRegistry`);
- Gates de capability nos botões e atalhos dos PDVs;
- Entitlement comercial e regras de plano (`N7`);
- Schema/migration de banco de dados;
- Nova UI comercial de settings (`N6`).
