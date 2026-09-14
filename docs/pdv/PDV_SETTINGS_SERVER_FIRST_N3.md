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
| `omnigestao-pdv-modo::{storeId}` | Dispositivo | `UI_PREFERENCE_LOCAL` | **Não migra neste N3.** Runtime local e URL `?modo=` preservados. Sem backfill/cutover. |
| `omnigestao:pdv-shortcuts:{storeId}` | Loja | `SERVER_SETTING` | Persistido em `pdvParams.atalhosRapidos`. `[]` é valor explícito. |
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

## 4. Backfill atômico, first-writer-wins e provider (CORRECTION-01)

Todos os PUTs de `StoreSettings` da mesma loja (admin e backfill) passam por:

1. `prisma.$transaction(...)`
2. `SELECT pg_advisory_xact_lock(hashtext('store-settings:' || storeId))::text AS lock`
3. **re-read** de `StoreSettings` **depois** de adquirir o lock
4. merge (`backfill: true` = write-only-if-absent)
5. upsert na **mesma** transação

O lock é transacional: liberado automaticamente no commit/rollback. Sem schema/migration.

**First committed authoritative value wins.** Duas requisições que leem ausência antes de qualquer write são serializadas pelo lock. A segunda relê o valor já persistido e, em backfill, não sobrescreve. PUT administrativo posterior ao backfill altera normalmente; backfill posterior a admin preserva o admin.

**Atalhos:** `atalhosRapidos: []` no servidor é configuração explícita ("nenhum atalho"). Não é ausência. Dual-read usa o valor RAW (`undefined` ≠ `[]`) no `StoreSettingsProvider` antes dos defaults. Legacy só é fallback/backfill se o campo ainda não existe.

**Modo PDV:** `omnigestao-pdv-modo::{storeId}` **não** é SERVER_SETTING neste N3 (`UI_PREFERENCE_LOCAL`). URL `?modo=` e preferência local permanecem. `v3PdvClassicModoInicial` pode existir no JSON da UI V3, mas não há cutover server-first.

**Troca de loja:** `StoreSettingsProvider` usa geração/epoch monotônica (`requestedStoreId` + `requestGeneration`). Respostas de GET e backfill só chamam `setSettings` / `setHydrated` se a epoch ainda for a ativa. `setSettings(null)` ao trocar de loja não é a proteção única. Finally stale não altera `hydrated`; erro stale não apaga settings atuais.

**Resiliência:** 401/403/500/rede no backfill não entra em loop e não promove fallback a autoridade.

---

## 5. Itens Reservados ao N4 (Não implementados no N3)

- Runtime capability resolver (`resolveCapability()`);
- Tabela-verdade runtime e registry de módulos (`PdvRegistry`);
- Gates de capability nos botões e atalhos dos PDVs;
- Entitlement comercial e regras de plano (`N7`);
- Schema/migration de banco de dados;
- Nova UI comercial de settings (`N6`).
