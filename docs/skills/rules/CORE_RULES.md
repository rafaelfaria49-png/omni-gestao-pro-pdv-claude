# CORE_RULES.md — Regras inegociáveis do OmniGestão Pro

Estas regras valem para **qualquer IA** que trabalhe neste repositório
(Claude Code / Cursor / Antigravity / Claude Chat / ChatGPT / Gemini).
São inegociáveis. Em caso de conflito, **estas regras vencem**.

## 1. Pensar antes de codar

- Entenda o pedido **antes** de abrir o editor.
- Localize os arquivos reais envolvidos. Não suponha caminhos.
- Se o escopo estiver ambíguo, **pergunte** — não preencha lacunas com suposição.
- Formule mentalmente o "critério de pronto" antes de começar.

## 2. Escopo claro e fechado

- Faça **apenas o que foi pedido**. Nada além.
- Não refatore código vizinho "de brinde".
- Não renomeie, não reorganize, não "melhore" o que não foi solicitado.
- Se encontrar um problema fora do escopo, **relate** — não corrija sem autorização.

## 3. Mudanças cirúrgicas

- Altere o **mínimo** de linhas necessário.
- Prefira `Edit` pontual a reescrever arquivos inteiros.
- Mantenha o estilo, naming e densidade de comentários do código vizinho.
- Um commit / uma entrega = uma intenção.

## 4. Sem overengineering

- Não adicione abstrações, camadas ou config que ninguém pediu.
- Não antecipe requisitos futuros.
- A solução mais simples que satisfaz o critério vence.

## 5. Áreas protegidas — NÃO tocar sem autorização explícita

Nunca altere os itens abaixo sem o usuário pedir **explicitamente** essa mudança:

- **Autenticação**: `auth.ts`, `auth.config.ts`, `app/actions/auth.ts`
- **Proxy / middleware**: `proxy.ts`
- **Schema do banco**: `prisma/schema.prisma` e migrations
- **Módulos funcionais em produção**: PDV, Financeiro, Operações (código que já funciona)
- **Core de infraestrutura**: `lib/prisma.ts`, `next.config.mjs`, `tsconfig.json`
- **Financeiro (idempotência)**: `lib/financeiro/contracts/local-key.ts`, `lib/financeiro/adapters/os-faturamento.ts`
- **Layout global**: `components/painel-inicial/AppShell.tsx` (único scroll owner do dashboard)

Se a tarefa exigir tocar nesses pontos, **pare e confirme** antes.

## 6. Sem mocks enganosos

- Não crie dado falso que **pareça** persistência real.
- HUBs Lovable usam mock para UI — isso é esperado e documentado.
- Persistência real passa por **Server Actions** ou **API routes**.
- Se entregar algo mockado, deixe **explícito** no relatório final.

## 7. Tokens visuais do OmniGestão

- Use somente tokens semânticos Tailwind: `bg-background`, `text-foreground`,
  `border-border`, `text-primary`, etc.
- **Nenhuma cor decorativa hardcoded** (`#fff`, `bg-blue-500` arbitrário, etc.).
- **Exceção documentada:** cores semânticas de domínio são permitidas quando intencionais
  e documentadas (ex.: `text-emerald-500` para evento de sucesso em Timeline,
  `text-rose-500` para erro). Mencionar no relatório final quando usadas.
- `min-w-0` é obrigatório em todo item flex/grid.
- `AppShell` é o único dono do scroll — não adicione `h-screen`/`overflow-auto`
  em wrappers de HUB.

## 8. Critérios verificáveis

- Toda entrega tem um critério objetivo de "pronto".
- Mudança em código TypeScript → `npx tsc --noEmit` precisa passar.
- Mudança que afeta build → `npm run build` quando aplicável.
- Não declare "pronto" sem o critério ter sido verificado de fato.

## 9. Documentação e status ao final

- Atualize `docs/ai/CURRENT_STATUS.md` **apenas** quando houver mudança
  relevante de estado de módulo (real vs mock, feature nova, etc.).
- Não inche o status com edições triviais.
- Siga `DELIVERY_CHECKLIST.md` antes de encerrar qualquer tarefa.

## 10. Honestidade no relatório

- Reporte o que foi feito **como realmente foi feito**.
- Se um teste falhou, diga. Se um passo foi pulado, diga.
- Não invente status, não arredonde resultado, não esconda pendência.

## 11. Multi-loja (storeId)

- Todo query Prisma deve filtrar por `storeId`. Nunca cruzar dados entre lojas.
- `storeId` vem do header `x-assistec-loja-id` ou do contexto de loja — nunca do body direto.
- Helper oficial server-side: `lib/store-id-from-request.ts`.
- Server Actions recebem e validam `storeId` antes de qualquer operação Prisma.

## 12. Arquitetura interna

- **Mutations internas:** preferir **Server Actions** (`app/actions/`) em vez de novas
  API routes, salvo integração externa ou necessidade de legado.
- **Hubs Lovable:** cada HUB tem wrapper `*Isolated.tsx`, React Router `MemoryRouter`,
  tema via `applyGlobalTheme()` / `data-studio-theme`. O código interno do Lovable pode
  estar excluído do `tsconfig.json` — usar aliases `@/` que apontam para as pastas
  oficiais do hub, não para o código interno Lovable.

## Documentação de referência

- `docs/ai/CURRENT_STATUS.md` — estado atual de cada módulo (real vs mock)
- `docs/memory/OMNIGESTAO_MASTER_MEMORY.md` — onboarding e histórico por módulo
- `docs/modules/reports/AUDITORIA_GERAL_OMNIGESTAO_PRO.md` — auditoria consolidada
- `docs/START_HERE.md` — ponto de entrada do projeto

---

Ver também: [`DELIVERY_CHECKLIST.md`](./DELIVERY_CHECKLIST.md) ·
[`AI_WORKFLOW.md`](./AI_WORKFLOW.md) ·
[`FRONTEND_IMPORT_RULES.md`](./FRONTEND_IMPORT_RULES.md)
