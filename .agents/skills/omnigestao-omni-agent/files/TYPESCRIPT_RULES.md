# OmniGestão Pro — TypeScript

## Configuração

- **TypeScript 5 strict** — evitar `any`; preferir tipos de domínio e Zod em formulários.
- Antes de considerar uma tarefa concluída em código: `npx tsc --noEmit`.

## Path aliases

- Muitos aliases apontam para sub-apps Lovable (ex.: Operações). **Consultar `tsconfig.json`** antes de criar novos imports.
- O catch-all `@/*` → raiz pode ser precedido por aliases **mais específicos** (tipos/API do hub).

## Hubs Lovable

- Pastas internas de UI/hooks duplicados no Lovable podem estar em **`exclude`** do `tsconfig.json`** para não poluir o typecheck do monólito.
- Componentes de produção do app devem importar `@/components/ui/*` da raiz, não cópias internas do hub.

## Testes

- Framework: **Vitest** (`npm run test`).
