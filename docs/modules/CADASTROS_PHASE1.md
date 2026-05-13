# Cadastros HUB — Fase 1 (produtos reais na UI)

## Onde está o hub

| Peça | Caminho |
|------|---------|
| Shell Next.js | `app/dashboard/cadastros-v2/` |
| HUB Lovable (MemoryRouter) | `components/cadastros/lovable/CadastrosHubIsolated.tsx` |
| UI principal | `components/cadastros/lovable/components/cadastros/CadastrosHub.tsx` |
| Modal produto / score | `components/cadastros/lovable/components/cadastros/produto-ia.tsx` |
| Dados demo (não usados na lista de produtos Fase 1) | `components/cadastros/lovable/data/cadastros-mock.ts` |

## O que já é Prisma real (Fase 1)

- **Produtos**: `listProdutos` / `upsertProduto` em `app/actions/cadastros.ts` → modelo `Produto` (`estoque_produtos`), multiloja por `storeId`.
- **Clientes, serviços, fornecedores, técnicos, equipamentos, categorias**: já mapeados nas mesmas actions (fora do escopo desta fase de produto, mas reais onde implementado).
- **Dashboard cadastros**: `getCadastrosDashboardStats` agrega contagens reais (incl. alertas de produto).

## APIs `/api/produtos`

| Método | Rota | Gate | Escrita / loja |
|--------|------|------|----------------|
| GET | `/api/produtos` | `requireCadastrosHubApi` (read) | `storeId` via header/query/cookie/legado leitura |
| POST | `/api/produtos` | idem (write) | **Obrigatório** header/query de loja (sem fallback loja-1 em escrita) |
| PATCH | `/api/produtos/[id]` | idem (write) | Atualização **parcial** (ex.: só `active`) |
| DELETE | `/api/produtos/[id]` | idem (write) | Escopo por `storeId` |

Helper: `lib/cadastros/hub-api-gate.ts` (assinatura verificada + vencimento, alinhado ao padrão enterprise usado no Marketing HUB).

## Integração com outros módulos (somente leitura / modelo)

- **Estoque / PDV / OS / Marketplace**: usam o mesmo registro `Produto` por `storeId` (ex.: `OrdemServicoItem.produtoId`, `MarketplaceListing`). Não foi feito refactor de leitura global; a lista do Cadastros HUB reutiliza as **server actions** existentes.
- **Camada extra de leitura HTTP**: `GET /api/produtos` retorna campos enriquecidos para consumidores que já buscam por API (OS, estúdio, etc.) — devem enviar cookies de sessão + selo de assinatura como no restante do painel.

## Preparação IA (sem motor)

- Coluna **`metadata` JSONB** em `Produto` para `cadastroIa`, foto, voz, WhatsApp, etc., no futuro.
- Ao salvar pelo modal de ficha, grava-se `metadata.cadastroIa` com `phase: "fase1-stub"` (apenas rastreio).
- **Score de qualidade** na grade: heurística local `catalogQualityScore` (`lib/cadastros/produto-quality-score.ts`), sem chamada a modelo de IA.

## O que não entra nesta fase

Importador massivo, OCR, scanner real, IA multimodal, sync avançado de marketplace, upload complexo de mídia.
