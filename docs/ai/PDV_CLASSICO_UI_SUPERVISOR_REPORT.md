# Relatório — PDV Clássico: cards de produto + origem da senha de supervisor

> Data: 23/05/2026 · Modelo: Claude Opus 4.7 · Goal 5: ajuste cirúrgico
> visual no PDV Clássico (`/dashboard/vendas`) + documentação da origem do
> PIN de supervisor.

## 1. Ajuste visual nos cards de produto

### 1.1 Localização

- Componente: `components/dashboard/vendas/pdv-classic.tsx`, linhas 1849–1880.
- Acesso: rota `/dashboard/vendas` → `VendasPDV` →
  `PdvClassic` (layout `omni-smart`). É a grade exibida abaixo do campo de
  busca quando o usuário pesquisa produtos no PDV Clássico.

### 1.2 Causa do corte ("BATERIA PORTATIL…", "capinha de 15,00… transparente")

O nome usava `line-clamp-2` (até 2 linhas) em uma grade de até 5 colunas
(`xl:grid-cols-5`). Em telas grandes cada card fica com ~200px de largura, o
que truncava nomes longos como `"BATERIA PORTATIL ..."` na primeira ou
segunda linha. Não havia `title` para tooltip em hover.

### 1.3 Correção (1 arquivo, 1 bloco)

`components/dashboard/vendas/pdv-classic.tsx` linhas 1849–1860:

| Antes | Depois |
|---|---|
| `min-h-[118px]` | `min-h-[140px]` (compensa a 3ª linha) |
| `line-clamp-2` no nome | `line-clamp-3` no nome (até 3 linhas) |
| sem `title` | `title={product.name}` no `<button>` (tooltip no hover) |

Diff (3 linhas alteradas):

```tsx
<button
  key={product.id}
  type="button"
  title={product.name}                                  // ← novo
  onClick={() => addToCart(product)}
  className="min-h-[140px] w-full rounded-xl ..."        // ← 118 → 140
>
  <div className="flex flex-col gap-1.5">
    <span className="line-clamp-3 min-h-0 break-words ..."> // ← 2 → 3
      {product.name}
    </span>
```

Preserva: design system (tokens semânticos, `text-foreground`/`bg-card`),
responsividade (grid 2→3→4→5 colunas), preço/categoria/estoque embaixo
inalterados, `break-words` mantém quebra correta para palavras curtas, hover
mantido, badge de estoque mantida.

### 1.4 Limitações

- Para nomes extremamente longos (>3 linhas) o `line-clamp-3` ainda trunca
  com `…`. Nesse caso o `title` mostra o nome completo em tooltip via hover
  do mouse (também acessível por leitor de tela). Solução estrutural seria
  reduzir o número de colunas em telas grandes, mas isso muda a densidade da
  grade — fora de escopo cirúrgico.
- Cards no carrinho lateral (linhas 1949 e 1954) já usavam `line-clamp-2` e
  **não foram alterados** — escopo só pediu os cards do grid de catálogo.

## 2. Origem da senha de supervisor

### 2.1 Endpoint de validação

`app/api/auth/admin/route.ts`:

- **`POST /api/auth/admin`** — recebe `{ pin: string }` no body.
- Busca: `prisma.user.findFirst({ where: { pin, OR: [{ role: "ADMIN" }, { role: "admin" }] } })`.
- Se válido: seta cookie httpOnly `assistec_admin_session` com `user.id`,
  `maxAge: 60*60*24*7` (7 dias), `sameSite: "lax"`, `secure` em produção.
- Resposta de sucesso: `{ ok: true, admin: { id, name } }`.
- **`GET /api/auth/admin`** — verifica se o cookie `assistec_admin_session`
  corresponde a um usuário ADMIN no banco. Devolve `{ authenticated, admin }`.
- **`DELETE /api/auth/admin`** — limpa o cookie.

### 2.2 Onde a senha está persistida

- **Modelo Prisma:** `User` (`prisma/schema.prisma:1376`), tabela `users`.
- **Campo:** `pin String @unique @map("pin")`.
- **Tipo de armazenamento:** **texto plano**. Não há hash bcrypt.
- **Roles aceitos como "supervisor":** `"ADMIN"` ou `"admin"` (string
  case-sensitive para o discriminador, mas o `OR` aceita ambas).
- **Sessão:** cookie httpOnly `assistec_admin_session` — válido por 7 dias.

### 2.3 NÃO é hardcoded e NÃO vem de env

Não há fallback em variável de ambiente. O PIN está exclusivamente no banco.
A variável `ASSISTEC_MASTER_PASSWORD` (em CLAUDE.md) e
`ADMIN_DEFAULT_PASSWORD` (usada por `scripts/seed-admin.ts`) servem ao
**login email+senha do `AdminUser`** (NextAuth v5) — fluxo diferente, sem
relação com o PIN do PDV.

### 2.4 Onde mudar a senha

Como não existe UI para gerenciar `User.pin` no app principal (busca por
`prisma.user.create|update|upsert` retorna **zero** ocorrências no `app/`
ativo), o PIN só pode ser criado/atualizado por:

1. **Prisma Studio** (`npx prisma studio`) → tabela `users` → editar `pin`
   onde `role = "ADMIN"`.
2. **SQL direto** no Supabase:
   ```sql
   UPDATE users SET pin = 'NOVO_PIN_AQUI' WHERE role = 'ADMIN';
   ```
3. **Script ad-hoc** com `prisma.user.update`.

**Cuidado:** `pin` é `@unique` — não pode haver duas linhas com mesmo PIN.

### 2.5 Onde o PIN é exigido na UI

- `payment-modal.tsx` linha 946–1000: "Desconto manual exige supervisor"
  (modal `Senha do Supervisor` antes de confirmar venda com desconto).
- `pdv-supermercado.tsx` linha 1070+: confirmação para `clear_cart` e
  `remove_line` (limpar carrinho / remover linha individual).

Ambos chamam `POST /api/auth/admin` com o PIN digitado. Não há outra
exigência de PIN no PDV Clássico além do desconto via `payment-modal`.

### 2.6 Risco de segurança (NÃO corrigido — não foi pedido)

🟡 **PIN armazenado em texto plano no banco.** Em caso de leak da tabela
`users`, todos os PINs ficam expostos. Sugestão futura (com confirmação do
usuário): hash bcrypt — exigiria migração de schema + rewrite do endpoint
POST (`bcrypt.compare(pin, user.pinHash)` em vez do `where: { pin }`) +
fluxo de troca de PIN.

🟡 **Sessão de 7 dias.** Cookie `assistec_admin_session` dura uma semana
desde o último login. Em um caixa compartilhado, isso significa que um
operador autorizado pode pegar um login feito pelo gerente dias antes. Não
expira por inatividade. Aceitar/reduzir é decisão do usuário.

## 3. Restrições respeitadas

- ❌ **Auth não alterada** (`auth.ts`, `auth.config.ts`).
- ❌ **`proxy.ts` não tocado.**
- ❌ **Sidebar não tocada.**
- ❌ **Prisma schema não alterado.**
- ❌ **Estoque/Financeiro/Caixa não tocados** (Goals 1–4 preservados).
- ❌ **Senha de supervisor continua exigida** — fluxo intacto.
- ❌ **Sem mock** — endpoint real continua sendo `/api/auth/admin`.
- ❌ **Senha não exposta em UI/toast** — apenas mensagens genéricas
  ("Senha inválida.", "Falha ao validar senha.").
- ✅ Design system preservado (tokens semânticos, sem cor hardcoded fora
  do que já existia).
- ✅ Ajuste cirúrgico **somente no PDV Clássico** (1 arquivo, 3 linhas
  alteradas).

## 4. Validações

| Comando | Resultado |
|---|---|
| `npx tsc --noEmit` | ✅ **0 erros** |
| `npm run build` | ✅ **Compiled successfully** |
| `git status` | ✅ `M components/dashboard/vendas/pdv-classic.tsx` |
| `git diff --stat` | ✅ `pdv-classic.tsx \| 5 +++--` (3 inserts, 2 deletes) |

## 5. Arquivos alterados

```
M  components/dashboard/vendas/pdv-classic.tsx   (+3 / -2)
```

Apenas 1 arquivo de aplicação. Nenhum arquivo criado fora deste relatório
(`docs/ai/PDV_CLASSICO_UI_SUPERVISOR_REPORT.md`).

## 6. Teste manual (loja, amanhã)

1. Abrir `/dashboard/vendas` em uma loja com produtos cadastrados (PDV Clássico).
2. Buscar por um produto com nome longo (ex.: "BATERIA PORTATIL"). Verificar:
   - Nome aparece em até **3 linhas** (não mais 2).
   - Se ainda truncar (nome muito longo), passar o mouse mostra **tooltip**
     com o nome completo.
   - Altura dos cards uniforme (~140px mínimo).
   - Categoria + badge de estoque continuam alinhados na base do card.
3. Cards em todas as quebras de tela: 2 colunas (mobile) → 3 (sm) → 4 (lg) →
   5 (xl). Layout responsivo preservado.
4. Adicionar produto ao carrinho — fluxo de adicionar não foi tocado.
5. **Teste do PIN de supervisor** (opcional): aplicar um desconto manual e
   confirmar a venda — modal `Senha do Supervisor` deve aparecer, validar
   contra o `User` com `role = ADMIN` no banco.

## 7. Próximos goals sugeridos (NÃO neste goal)

| Prioridade | Sugestão | Justificativa |
|---|---|---|
| 🟡 Média | **UI para gerenciar PINs de supervisor** | Hoje só por Prisma Studio / SQL direto. |
| 🟡 Média | **Hash bcrypt do `User.pin`** | PIN em texto plano expõe credencial em caso de leak. |
| 🟢 Baixa | **Reduzir tempo de sessão do cookie `assistec_admin_session`** | 7 dias é longo para autorização única. Considerar 1 dia ou expiração por inatividade. |
| 🟢 Baixa | **Cards do carrinho com `line-clamp-2`** | Mesmo padrão dos cards de catálogo. Hoje continua `line-clamp-2`; ajustar para 3 linhas é simétrico. |

---

**Conclusão:** Cards do PDV Clássico passam a permitir até 3 linhas no nome
do produto (era 2) com tooltip de nome completo no hover, sem alterar a
densidade da grade nem a responsividade. Origem do PIN de supervisor
documentada: vem da tabela `users` (modelo `User`, campo `pin` em texto
plano) via `POST /api/auth/admin` — não é hardcoded, não vem de env, e não
tem UI no app (gerenciado por Prisma Studio / SQL direto). Sem mudança na
regra de segurança.
