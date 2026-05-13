# Marketing IA HUB — Fase 1 (posts reais)

## Mapeamento do hub atual

| Área | Local principal | Mock / local | Fase 1 |
|------|-----------------|--------------|--------|
| Rota do hub | `app/dashboard/marketing-ia/` | — | UI ligada a `MarketingPost` |
| Preview e CRUD de posts | `app/dashboard/marketing-ia/components/studio-preview-context.tsx` | Antes: `localStorage` para posts | **API** `GET/POST/PATCH/DELETE` em `/api/marketing/posts` + header `x-assistec-loja-id` |
| Editor / geração texto | `components/studio/marketing-content-editor.tsx` | Geração de legenda/CTA **simulada** (sem orchestrate) | Mesmo fluxo; `metadata.iaSimulated` ao persistir |
| Lista de posts | `components/PostGeneratorTab.tsx` | Texto “gravado no navegador” | Lista do banco, loading skeleton, badges **IA simulada** / **Erro** |
| Calendário | `components/CalendarTab.tsx` | “Gerar mês” só em memória | `seedMonthDemoPosts` → **POST** reais (IA simulada) |
| Distribuição | `components/DistributionTab.tsx` | Contas em `marketing-ia-storage` (LS), inbox fixo | Contas/inbox **continuam mock**; “Publicar agora” chama `publishNowSimulated` → **PATCH** `publicado` |
| Estúdio legado “marketing” (pack) | `app/dashboard/marketing/page.tsx` | IA real para pack | Continua em **`MarketingIaPost`**: `/api/marketing/studio-ia-posts` (não conflita com `MarketingPost`) |

## Prisma

- Modelo `MarketingPost` (`marketing_posts`): `storeId`, `titulo`, `canal`, `status`, `conteudo`, `legenda`, `hashtags`, `cta`, `imagemUrl`, `scheduledAt`, `publishedAt`, `metadata`, timestamps.
- Canais (API): `instagram`, `facebook`, `whatsapp`, `google`, `geral`.
- Status (API): `rascunho`, `agendado`, `publicado`, `erro`.

## APIs

- `GET/POST` `app/api/marketing/posts/route.ts`
- `PATCH/DELETE` `app/api/marketing/posts/[id]/route.ts`
- Gate: `lib/marketing/hub-api-gate.ts` (leitura com fallback de leitura onde aplicável; **escrita** exige loja no header — sem fallback “loja 1” em escrita).

## Não implementado (Fase 1)

Publicação real em redes, OAuth Meta, upload avançado, analytics real, IA paga plugada ao editor do hub.
