# Relatório — PIN de Supervisor padrão (1234) + UI no Master Console

> Data: 23/05/2026 · Modelo: Claude Opus 4.7 · Goal 6: criar fluxo seguro de
> PIN supervisor padrão (1234) para bootstrap e UI no Master Console para
> trocar o PIN sem expor segredo.

## 1. Resumo

Antes deste goal o PIN de supervisor era exigido pelo PDV (modal "Senha do
Supervisor" em `payment-modal.tsx` e `pdv-supermercado.tsx`), mas:

- Não havia seed claro — o usuário tinha que criar o `User` no Prisma Studio.
- Não havia UI para trocar o PIN — só via Prisma Studio ou SQL direto.
- O PIN ficava em texto plano no banco (campo `User.pin @unique`).

Este goal entrega:

1. **Seed idempotente** `scripts/seed-supervisor-pin.ts` que cria um
   `User { role: "ADMIN", pin: "1234" }` apenas se NÃO existir admin algum.
   Nunca sobrescreve PIN existente.
2. **Endpoint protegido** `app/api/admin/supervisor-pin/route.ts` (GET status,
   POST troca) que valida sessão NextAuth com role SUPER_ADMIN/ADMIN, exige
   PIN atual correto, valida o novo PIN (4–12 dígitos numéricos) e atualiza o
   `User.pin`.
3. **UI no Master Console** (`/dashboard/master-console`) — `SupervisorPinCard`
   com aviso visível "Altere o PIN padrão" quando o atual ainda é "1234" + form
   de troca com PIN atual, novo PIN e confirmação.
4. **PDV inalterado** — `POST /api/auth/admin` continua sendo o validador do
   PIN; nenhum fluxo de cobrança/desconto/limpar carrinho foi mexido.

## 2. Como configurar amanhã

```bash
# Cria o supervisor inicial (idempotente — nada acontece se já houver ADMIN)
npm run db:seed-supervisor-pin

# Opcional: customizar o PIN inicial via env antes de rodar
SUPERVISOR_DEFAULT_PIN=4321 npm run db:seed-supervisor-pin
```

Depois do seed:

1. Login NextAuth (`/login`) como `SUPER_ADMIN` ou `ADMIN`.
2. Abrir `/dashboard/master-console`.
3. Card "PIN do Supervisor (PDV)" no rodapé da página exibe:
   - Estado (padrão inicial ⚠️ ou personalizado ✅).
   - Aviso destacado se PIN ainda for o padrão.
   - Formulário para trocar (PIN atual + novo + confirmar).
4. Operadores do PDV continuam usando o PIN para:
   - Confirmar desconto manual no modal de pagamento.
   - Limpar carrinho no Supermercado.
   - Remover linha no Supermercado.

## 3. Detalhes técnicos

### 3.1 Seed `scripts/seed-supervisor-pin.ts`

```bash
npx tsx scripts/seed-supervisor-pin.ts
```

Variáveis de ambiente (opcionais):

| Variável | Default | Observação |
|---|---|---|
| `SUPERVISOR_DEFAULT_PIN` | `"1234"` | Aceita 4–12 dígitos numéricos. |
| `SUPERVISOR_DEFAULT_NAME` | `"Supervisor Padrão"` | Nome exibido na UI. |

**Garantias:**

- Roda múltiplas vezes com segurança — se já existe `User` com role
  `ADMIN`/`admin`, sai com mensagem "Já existe…" sem mexer no banco.
- Se o PIN solicitado já estiver em uso por outro `User`, lança erro
  (`@unique` no schema).
- NÃO cria `AdminUser` (NextAuth). Esse continua sendo trabalho do
  `scripts/seed-admin.ts`.

### 3.2 Endpoint `app/api/admin/supervisor-pin/route.ts`

**Proteção:**

```ts
async function requireAdminNextAuth() {
  const session = await auth()
  if (!session?.user?.id) → 401
  const role = String(session.user.role).toUpperCase()
  if (role !== "SUPER_ADMIN" && role !== "ADMIN") → 403
}
```

**`GET /api/admin/supervisor-pin`** — somente flags, **nunca retorna o PIN**:

```json
{ "exists": true, "isDefault": false, "name": "Supervisor Padrão" }
```

**`POST /api/admin/supervisor-pin`** — troca atômica:

```ts
// Body: { currentPin: string, newPin: string (4–12 dígitos) }
1. Valida currentPin contra User.pin do primeiro ADMIN (orderBy createdAt asc)
2. Bloqueia se currentPin === newPin
3. Bloqueia colisão de @unique pin (outro User já tem esse PIN)
4. prisma.user.update({ pin: newPin })
5. → { ok: true, isDefault: newPin === "1234" }
```

Códigos HTTP:

| Status | Significado |
|---|---|
| 200 | PIN trocado |
| 401 | Sessão NextAuth ausente ou PIN atual incorreto |
| 403 | Usuário NextAuth sem role ADMIN |
| 404 | Nenhum supervisor configurado (rode o seed primeiro) |
| 409 | PIN novo colide com outro `User.pin` |
| 422 | JSON inválido / PIN novo fora do formato / igual ao atual |
| 503 | Falha de banco |

Validação Zod: `newPin` regex `/^\d{4,12}$/`.

### 3.3 UI `components/master-console/SupervisorPinCard.tsx`

- Componente cliente, plugado em `app/dashboard/master-console/page.tsx`
  abaixo do bloco de lojas.
- Faz `GET` ao montar e após troca; controla estado `{ loading | missing |
  ok | error }`.
- Form com 3 inputs (PIN atual / novo / confirmar) e botão toggle
  "Mostrar/Ocultar" (default oculto — `type="password"`).
- Aviso destacado em amber quando `isDefault === true`: **"Altere o PIN
  padrão após a primeira configuração"**.
- Validações client-side antes do submit: PIN atual não vazio, novo PIN
  bate regex `/^\d{4,12}$/`, confirmação === novo, novo ≠ atual.
- Mensagens de erro vêm do servidor via toast destrutivo — nunca expõem
  o PIN em si.
- Estado `missing` mostra comando do seed (`npm run db:seed-supervisor-pin`)
  diretamente para o admin.

### 3.4 Compatibilidade

- `POST /api/auth/admin` (validação do PIN pelo PDV) **inalterado**.
- Modais "Senha do Supervisor" no `payment-modal.tsx` e `pdv-supermercado.tsx`
  **inalterados**.
- O cookie `assistec_admin_session` (7 dias) **continua sendo emitido**
  pelo mesmo endpoint.

## 4. Segurança

| Item | Status |
|---|---|
| PIN nunca retornado em GET | ✅ — apenas flags `exists/isDefault/name` |
| PIN nunca aparece em log/toast | ✅ — mensagens são "Senha inválida" / "PIN atual incorreto" |
| Endpoint exige NextAuth role ADMIN | ✅ — `requireAdminNextAuth` em GET e POST |
| Novo PIN validado por regex | ✅ — `/^\d{4,12}$/` no servidor (Zod) e cliente |
| Unique constraint preservada | ✅ — verificada antes do update |
| Idempotência do seed | ✅ — abort se admin já existe |
| Default 1234 não é hardcoded | ✅ — validado contra `User.pin` real; pode ser sobrescrito por seed/POST a qualquer momento |

🟡 **Risco residual (pré-existente, NÃO corrigido):** PIN armazenado em
texto plano (`User.pin String @unique`). Hash bcrypt exigiria migration do
schema + adaptação de `app/api/auth/admin/route.ts` (POST) — fora do escopo
deste goal. Documentado como próximo passo.

🟡 **Risco residual:** cookie `assistec_admin_session` continua válido por
7 dias após troca de PIN. Se o admin trocar o PIN, sessões PDV anteriores
permanecem autorizadas até expirar. Para invalidar imediatamente, basta
chamar `DELETE /api/auth/admin` em cada caixa — fora do escopo deste goal.

## 5. Restrições respeitadas

- ❌ Auth principal NextAuth não tocada (`auth.ts`, `auth.config.ts` intactos).
- ❌ `proxy.ts` não tocado.
- ❌ Sidebar não tocada.
- ❌ Prisma schema não alterado (`User.pin` continua igual).
- ❌ Sem migration destrutiva.
- ❌ Exigência de PIN no PDV mantida (`payment-modal.tsx` e
  `pdv-supermercado.tsx` continuam exigindo supervisor).
- ❌ PIN nunca aparece em log, toast ou UI pública.
- ❌ `"1234"` não é hardcoded como única senha — é apenas o seed default e
  pode ser trocado a qualquer momento.
- ✅ Multi-loja: o `User` é global (sem `storeId`) — preserva o
  comportamento atual; troca afeta todos os caixas, como esperado.
- ✅ Design system: usa tokens semânticos (`bg-card`, `border-border`,
  `text-foreground`, `amber-500/30` mantido apenas no estado de aviso —
  consistente com outros avisos do projeto).

## 6. Arquivos alterados / criados

```
A  scripts/seed-supervisor-pin.ts                    (novo, 64 linhas)
A  app/api/admin/supervisor-pin/route.ts             (novo, 137 linhas)
A  components/master-console/SupervisorPinCard.tsx   (novo, 282 linhas)
A  docs/ai/SUPERVISOR_PIN_GOAL_REPORT.md             (novo — este arquivo)
M  package.json                                      (+1 npm script)
M  app/dashboard/master-console/page.tsx             (+2 import + 4 linhas de mount)
```

Nenhum arquivo removido. Nenhuma área protegida tocada (auth, `proxy.ts`,
sidebar, `prisma/schema.prisma`).

## 7. Validações

| Comando | Resultado |
|---|---|
| `npx tsc --noEmit` | ✅ **0 erros** |
| `npm run build` | ✅ **Compiled successfully** |
| `git status` | ✅ 5 arquivos novos + 2 modificados (esperado) |
| `git diff --stat` | ✅ ver §6 |

## 8. Teste manual (loja, amanhã)

> Roteiro para o admin que vai configurar o PIN antes do primeiro uso.

### 8.1 Bootstrap

1. No servidor, rodar uma única vez:
   ```bash
   npm run db:seed-supervisor-pin
   ```
2. **Esperado:** mensagem "✓ Supervisor criado…" ou "✓ Já existe um usuário
   supervisor… Nada a fazer." se já estiver configurado.

### 8.2 Trocar o PIN no Master Console

1. Login NextAuth como SUPER_ADMIN/ADMIN.
2. Acessar `/dashboard/master-console`.
3. Rolar até o card "PIN do Supervisor (PDV)".
4. **Esperado:** aviso amarelo "Altere o PIN padrão…" quando PIN atual ainda
   é "1234".
5. Preencher: PIN atual = `1234`, novo PIN = (de sua escolha, 4–12 dígitos),
   confirmar.
6. Clicar "Atualizar PIN".
7. **Esperado:** toast verde "PIN atualizado"; estado do card muda para
   "Personalizado ✅".

### 8.3 Validar no PDV

1. Em outra aba, abrir `/dashboard/vendas` (PDV Clássico) ou Supermercado.
2. Tentar uma ação que exige supervisor (ex.: aplicar desconto manual e
   confirmar venda).
3. **Esperado:** modal "Senha do Supervisor" → digitar o **novo** PIN →
   autorização concedida.
4. **Esperado:** PIN antigo ("1234") deixa de funcionar.

### 8.4 Casos de borda

- **Novo PIN igual ao atual:** UI bloqueia antes do submit; servidor
  retorna 422 caso ultrapasse.
- **Novo PIN < 4 dígitos:** UI desabilita botão; servidor retorna 422.
- **Novo PIN com letras:** UI já filtra `e.target.value.replace(/\D/g, "")`;
  servidor retorna 422 se for forçado.
- **PIN colide com outro `User`:** servidor retorna 409, toast destrutivo
  "Este PIN já está em uso por outro usuário".

## 9. Próximos goals sugeridos

| Prioridade | Goal | Justificativa |
|---|---|---|
| 🟡 Média | **Hash bcrypt do `User.pin`** | PIN em texto plano expõe credencial em leak. Migration + rewrite de POST `/api/auth/admin` + POST `/api/admin/supervisor-pin`. |
| 🟡 Média | **Invalidar cookie `assistec_admin_session` após troca de PIN** | Hoje sessão de 7 dias permanece válida. Limpar cookies de todos os caixas após troca exigiria coordenação extra. |
| 🟢 Baixa | **Auditoria de troca de PIN** | Registrar quem e quando trocou o PIN em `LogsAuditoria`. |
| 🟢 Baixa | **Suporte a múltiplos supervisores** | Hoje só o primeiro `User` ADMIN é considerado. Permitir múltiplos PINs distintos para diferentes gerentes. |

---

**Conclusão:** Sistema agora aceita PIN "1234" apenas se for explicitamente
configurado pelo seed inicial (`npm run db:seed-supervisor-pin`). Após o
bootstrap, o admin pode trocar o PIN diretamente pelo Master Console com
validação do PIN atual, sem expor segredo em UI/log/toast. PDV continua
exigindo supervisor para desconto manual, limpar carrinho e remover item,
sem nenhuma alteração no `POST /api/auth/admin` validado nos Goals 1–5.
