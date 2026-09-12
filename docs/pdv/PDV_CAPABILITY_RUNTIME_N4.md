# PDV Capability Runtime (N4)

> GOAL `PDV-CAPABILITY-RUNTIME-N4`
> Contrato + runtime de capabilities. Sem UI comercial (N6) e sem entitlement (N7).

Este documento **não** declara ADR aprovada por Rafael. Não há ADR-P em
`docs/decisions/` para este eixo; a taxonomia segue o roadmap canônico
`PDV_CAPABILITIES_ROADMAP_REDUCED_002_003.md` e o código vivo.

## 1. Taxonomia de superfícies

| ID | Status | Notas |
|---|---|---|
| `classic` | oficial | MOTOR default (`/dashboard/vendas`) |
| `assistencia` | oficial | `pdvClassicLayout=services` |
| `supermercado` | oficial | `pdvMainLayout=supermercado` |
| `venda-completa` | oficial | rota própria; não é sub-layout do Classic |
| `next` | experimental + gated | `NEXT_PUBLIC_OG_EXPERIMENTAL=1`; rota `/dashboard/pdv-next` |

**Black** é SHELL do Next (`PdvBlackShell` / `PdvBlackEdition`). Não é quinta
superfície oficial. `HeldSale.pdvType = "black"` permanece como valor legado.

Storage legado (`PdvMainLayout`, `PdvClassicLayoutKind`, `pdvType`) **não** foi
renomeado. Adapters: `lib/pdv/surface-ids.ts`.

## 2. Oficial vs experimental

- Conjunto oficial padrão: as quatro IDs acima.
- Next **não** entra no conjunto oficial e **não** muda a feature flag.
- `PdvRegistry` lista Next só como `status: experimental`, `gated: true`.

## 3. Support matrix (code-owned)

Fonte: `lib/pdv/capability-support-matrix.ts`.

Allowlist V1 (N3, sem duplicar): `pdv.tables`, `sales.paymentMethods`,
`pdv.filmLookup`, `pdv.accessoryModelColor`, `pdv.quickServices`, `pdv.osLookup`,
`pdv.discounts`, `pdv.customerStoreCredit`, `pdv.heldSales`,
`pdv.multiplePayments`, `pdv.customerSearch`.

Unsupported de propósito (sem implementação real na superfície):

- `pdv.filmLookup` — backend existe; modal PDV não.
- `pdv.osLookup` — hidratação de OS via comanda ≠ lookup.
- `pdv.quickServices` — só Assistência.
- `pdv.tables` — switcher Classic/Assistência/Supermercado; não Venda Completa.

Override persistido **nunca** transforma unsupported em supported.

## 4. Precedência do resolver

`resolveCapability()` em `lib/pdv/resolve-capability.ts` (puro):

1. `pdv.scale` / `pdv.scale.*` / `sale.fractionalQty` → `blocked`, `enabled=false`.
2. Não suportada pela superfície → `unsupported`, `enabled=false`.
3. Suportada + override V1 explícito → `override`.
4. Suportada sem override → default canônico (paridade com o comportamento atual).

Overrides vêm de `StoreSettings.printerConfig.capabilities` (N3).

Sem campos `entitled`, `plan`, `license`, `billing`.

`sales.paymentMethods` **não** substitui `formasPagamento`.

## 5. Snapshot em vendas em espera

Holds novos (`lib/pdv-hold.ts`):

- `capabilitiesVersion: 1`
- `capabilitiesSnapshot` imutável (estado resolvido no momento do hold)

Holds antigos sem snapshot continuam válidos.

Ao retomar: o runtime vivo vence. Snapshot histórico **não** reativa capability
hoje unsupported, blocked ou desabilitada (`applySnapshotAgainstRuntime`).

## 6. Fila offline

Não há fila offline de venda em produção distinta dos holds locais e do
`pending` do motor. **Nenhuma fila nova foi criada.**

## 7. Multi-loja

`usePdvCapabilities(surfaceId)` lê a loja ativa via `StoreSettingsProvider`.
Overrides da Loja A não contaminam a Loja B. Troca de loja recalcula o snapshot
(epoch já existente no N3).

## 8. Adiado (N6 / N7)

- N6: UI de settings / painel de toggles comercial.
- N7: mapa feature→plano, entitlement, billing, gates de navegação por plano.
- Ativação oficial do Next; Black como superfície; balança/fracionado;
  películas/OS lookup/quick-services extra-Assistência.

## 9. Integração nas bordas

Um único resolver. Hook compartilhado `usePdvCapabilities(surfaceId)`.

- Classic (piloto): `pdv.tables` (com `moduloControleConsumo`) + `sales.paymentMethods`.
- Assistência / Supermercado / Venda Completa: mesmo contrato nas capabilities
  realmente suportadas.
- `vendas-pdv.tsx` escolhe a superfície via `resolveSwitcherSurface`.
