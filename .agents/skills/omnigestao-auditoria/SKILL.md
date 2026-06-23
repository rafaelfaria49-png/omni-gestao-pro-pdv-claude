# OmniGestão Auditoria

Skill de revisão, validação e prevenção de riscos no projeto OmniGestão Pro.

---

## Checklist de Auditoria — Antes de Finalizar Qualquer Tarefa

### 1. TypeScript
```bash
npx tsc --noEmit
```
- Zero erros obrigatório antes de considerar tarefa concluída
- Aliases em `tsconfig.json` — verificar antes de criar novo import

### 2. Prisma
- `npm run db:push` (dev) ou `npm run db:migrate` (prod)
- Schema alterado? Verificar impacto em `payload` (JSONB) e `localKey`
- Nunca remover campos sem migração segura
- `generated/prisma/` é gerado — nunca editar manualmente

### 3. ESLint
```bash
npm run lint
```
- Sem warnings suprimidos com `// eslint-disable` sem justificativa

---

## Validação de storeId

**Risco crítico:** dados de uma store vazando para outra.

Checklist:
- Todo query Prisma tem `where: { storeId }` ?
- Server Action recebe `storeId` de onde? (header, sessão, parâmetro?)
- `lib/store-id-from-request.ts` é o helper oficial para extrair do request
- API routes: validar `x-assistec-loja-id` antes de qualquer operação

```typescript
// Padrão correto
const storeId = await getStoreIdFromRequest(req) // nunca confiar em body direto
```

---

## Prevenção de Mock Indevido

Sinais de alerta:
- Dados hardcoded em Server Actions ou API routes
- `Math.random()`, `faker`, seed functions fora de `*.test.ts` / `*.seed.ts`
- Imports de `*/lovable/data/*Seed*` em código de produção
- `TODO: substituir por dados reais` em código merged

Regra: **mocks são permitidos apenas em arquivos de teste e componentes Lovable isolados.**

---

## Revisão de Módulos Críticos

Antes de alterar qualquer arquivo abaixo, confirmar com o usuário:

| Arquivo | Risco |
|---------|-------|
| `auth.ts` / `auth.config.ts` | Exposição de rotas |
| `proxy.ts` | Bypass de autenticação |
| `prisma/schema.prisma` | Perda de dados em prod |
| `lib/financeiro/contracts/local-key.ts` | Quebra de idempotência financeira |
| `lib/financeiro/adapters/os-faturamento.ts` | Duplicação de lançamentos |
| `components/painel-inicial/AppShell.tsx` | Regressão de layout global |

---

## Revisão de Server Actions

- Toda action deve validar `storeId` antes de qualquer operação Prisma
- Toda action que escreve deve ter `revalidatePath` ou `revalidateTag` se necessário
- Nunca expor `prisma` diretamente — usar services de `lib/`
- Error handling: retornar `{ error: string }` em vez de lançar exceção para o cliente

---

## Revisão de Componentes

- Sem `h-screen` / `overflow-auto` em wrappers de hub
- `min-w-0` presente em todo flex/grid item
- Sem cores hardcoded — apenas tokens semânticos
- Imports de `components/*/lovable/` não devem cruzar para fora do hub

---

## Segurança

- Secrets nunca em variáveis `NEXT_PUBLIC_*` — apenas server-side
- Toda rota sensível valida headers via `lib/api-auth.ts` ou `lib/require-admin.ts`
- Raw SQL queries: nunca interpolar input do usuário diretamente

---

## Flags de Risco Alto

Estas ações requerem confirmação explícita do usuário:

- Alterar `prisma/schema.prisma` com remoção de campos
- Alterar contratos em `lib/financeiro/contracts/`
- Alterar `proxy.ts` ou qualquer arquivo de auth
- Fazer `git push --force`
- Executar `db:migrate` em ambiente de produção
