# Marketplace HUB — Fase 1 (contas reais)

## Mapeamento do hub Lovable (`components/marketplace/lovable/`)

| Área | O que existe | Mock / preparação |
|------|----------------|-------------------|
| `MarketplaceLayout.tsx` | Shell principal: resumo, alertas, **conexões (agora reais)**, produtos, pedidos, SAC, NF-e, relatórios, automações | Resumo parcial, alertas, catálogo, pedidos, SAC e demais seções seguem dados locais para UI (fora do escopo desta fase). |
| `MarketplaceSettingsDrawer.tsx` | Preferências visuais / toggles | Controles majoritariamente desabilitados (“em preparação”). |
| `tabs/*` (`DashboardTab`, `EstudioTab`, `PrecificadorTab`, `FabricaTab`, `EstoqueTab`, `ExpedicaoTab`, `RelatoriosTab`) | Módulos isolados | Não referenciados pelo layout atual; conteúdo mock. |
| `ConexoesTab.tsx` | Aba de conexões | Passou a reutilizar `MarketplaceConnectionsReal` + API real. |
| `AppSidebar.tsx` | Navegação lateral do sub-layout | Item único “Marketplace”; footer promocional genérico. |
| `ThemeProvider` / `ThemeSwitcher` | Tema local do hub | Funcional. |
| `StatusPill.tsx` | Pills de status | Reutilizado nas conexões reais. |

**Prisma pré-existente:** modelo `MarketplaceListing` (anúncios por produto/canal) em `prisma/schema.prisma` — não alterado nesta fase; continua disponível para fases de catálogo.

## Fase 1 entregue

1. **Modelos** `MarketplaceConnection` e `MarketplaceSyncLog` (multiloja, `storeId` obrigatório, tokens placeholder).
2. **API** `GET|POST /api/marketplace/connections`, `PATCH|DELETE /api/marketplace/connections/[id]` com gate de assinatura (`getVerifiedSubscriptionFromCookies`) e **unidade explícita** (`x-assistec-loja-id` ou query `storeId` / `lojaId`), sem fallback para cookie sozinho em escrita.
3. **UI** lista conexões, status, última sincronização, conectar (modal), desconectar, sincronizar (simulação), badges por provedor, empty state.
4. **Sincronização simulada** grava quatro mensagens em `MarketplaceSyncLog` e atualiza `lastSyncAt` / `lastSyncMessage` na conexão.

## Provedores suportados (Fase 1)

- Mercado Livre (`MERCADO_LIVRE`)
- Shopee (`SHOPEE`)
- Amazon (`AMAZON`)
- Magalu (`MAGALU`)

OAuth real fica para fase seguinte.

## Arquivos principais

- `prisma/schema.prisma` — enums + modelos + relações em `Store`.
- `lib/marketplace/api-gate.ts` — guarda assinatura + loja.
- `lib/marketplace/providers.ts` — metadados de UI por provedor.
- `lib/marketplace/services/marketplace-connections-service.ts` — CRUD + simulação de sync.
- `app/api/marketplace/connections/route.ts` e `[id]/route.ts`.
- `components/marketplace/use-marketplace-connections.ts` — hook cliente.
- `components/marketplace/MarketplaceConnectionsReal.tsx` — painel de conexões.
- `components/marketplace/lovable/MarketplaceLayout.tsx` — integração do hook e painel.
