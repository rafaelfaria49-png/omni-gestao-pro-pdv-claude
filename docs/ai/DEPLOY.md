# OmniGestão Pro — Guia de Deploy

---

## 1. Checklist Pré-Deploy

Execute na ordem antes de qualquer push:

```bash
# 1. Verificar tipos TypeScript
npx tsc --noEmit

# 2. Verificar se o build passa
npm run build

# 3. Teste visual manual (ver seção abaixo)
```

### Teste visual obrigatório

- [ ] Abrir `/dashboard` — painel carrega sem erros
- [ ] Testar troca de temas (Light / Soft Ice / Midnight / Black Edition)
- [ ] Abrir `/dashboard/whatsapp` — hub carrega, sem scroll interno, sem barra lateral
- [ ] Abrir `/dashboard/operacoes-v2` — hub carrega, Kanban em grid, sem barra lateral
- [ ] Testar `/dashboard/os` — lista de OS legado funciona
- [ ] Abrir PDV e testar caixa
- [ ] Verificar que não existe scrollbar horizontal em nenhuma página
- [ ] Testar em mobile (responsividade básica)

---

## 2. Deploy via Git

```bash
git add .
git commit -m "feat: descrição da mudança"
git push origin master
```

**Branch principal:** `master`
**Deploy automático:** Vercel detecta push e faz deploy automaticamente.

---

## 3. Banco de Dados (Prisma)

Quando houver mudanças no schema:

```bash
# Gerar migration
npx prisma migrate dev --name "nome_da_migration"

# Atualizar cliente Prisma
npx prisma generate

# Verificar banco em produção
npx prisma migrate deploy
```

> ⚠️ Migrations de produção devem ser revisadas antes de aplicar.

---

## 4. Variáveis de Ambiente

Arquivo `.env.local` (não commitado):

```
DATABASE_URL=          # Supabase PostgreSQL
DIRECT_URL=            # Supabase direct connection
NEXTAUTH_SECRET=       # Secret para sessão
NEXTAUTH_URL=          # URL da aplicação
```

Em produção, configurar no painel da Vercel (Settings → Environment Variables).

---

## 5. Solução de Problemas Comuns

| Problema | Solução |
|----------|---------|
| `tsc` com erros após integrar hub Lovable | Adicionar pastas problemáticas ao `exclude` do `tsconfig.json` |
| Erro `EPERM` no `prisma generate` | Fechar processos que bloqueiam a pasta `.prisma` e retentar |
| Build falha com módulo não encontrado | Verificar path aliases no `tsconfig.json` |
| Hub não carrega (hydration error) | Garantir `dynamic(..., { ssr: false })` no `page.tsx` do hub |
| Tema não sincroniza | Verificar se `applyGlobalTheme()` atualiza `data-studio-theme` e `localStorage` |
