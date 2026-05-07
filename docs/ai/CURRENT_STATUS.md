# OmniGestão Pro — Estado Atual do Projeto

> Última atualização: Maio 2026
> Referência rápida para retomar o projeto ou fazer onboarding.

---

## ✅ Concluído e Funcionando

### Hubs Visuais (Lovable integrado)
- **WhatsApp HUB** — renderizado em `/dashboard/whatsapp`, tema sincronizado globalmente, sem scroll interno, full width
- **Operações HUB** — renderizado em `/dashboard/operacoes-v2`, MemoryRouter isolado, OSProvider com dados mock, Kanban em grid responsivo

### Sistema de Temas
- Sincronização bidirecional Hub ↔ Global via `applyGlobalTheme()`
- `data-studio-theme` + classes CSS aplicados no `document.documentElement`
- Persistência em `localStorage` (`omni-studio-dual-theme`)
- ThemeSwitcher do Operações HUB sincroniza sidebar/header global ao mudar tema

### Layout e Scroll
- Overflow horizontal eliminado de todos os hubs
- `min-w-0` aplicado em toda cadeia flex dos hubs
- AppShell controla o único scroll vertical
- Kanban de OS convertido de `flex + overflow-x-auto` para `grid` responsivo (1→2→3→4 colunas)
- `min-h-screen` e `sticky top-0` removidos dos wrappers internos dos hubs
- `-my-6` removido de `page.tsx` (causava topo cortado)

### Automações WhatsApp
- Engine funcionando em simulação (`/api/automation/handle-event`)
- `targetPhone` configurável via UI do HUB
- Prioridade correta: `actions.targetPhone` > payload para eventos de sistema
- `ensureDefaultEventAutomations` não sobrescreve `targetPhone` configurado pelo usuário
- Deduplicação de automações duplicadas automática

### PDV
- PDV Assistência integrado com `finalizeSaleTransaction`
- CaixaStatusBar unificada entre todos os PDVs
- Estado do caixa persistido por `storeId` no localStorage
- Modal de fechamento de caixa com layout corrigido

### Navegação
- Menu "WhatsApp" → `/dashboard/whatsapp`
- Menu "Histórico de Vendas" → `/dashboard/vendas-arquivo-geral`
- Links do sidebar corrigidos (não caem mais na landing page)
- Permissões de configurações: ADMIN/GERENTE/dono podem salvar

---

## 🔄 Em Andamento

| Item | Situação |
|------|----------|
| Operações HUB — dados reais | Dados ainda são mock (`api/_db.ts`); integração com Prisma pendente |
| Financeiro HUB | Visual Lovable criado, integração pendente |

---

## 🔜 Próximos Passos (Backlog)

### Curto Prazo
- [ ] Integrar Operações HUB com Prisma/Supabase (substituir `osStore` mock)
- [ ] Expandir modelo Prisma: `Garantia`, `Anexo`, `OrcamentoItem` como tabelas dedicadas
- [ ] Pipeline de status da OS: alinhar enum Prisma (`Aberto/EmAnalise/Pronto/Entregue`) com pipeline rico do Lovable

### Médio Prazo
- [ ] Marketplace HUB — criar visual + integração
- [ ] Cadastros HUB — integração com Prisma (`Cliente`, `Produto`)
- [ ] Sistema de mídia para OS (upload de anexos/fotos)
- [ ] Integração Marketing IA com dados de OS e vendas reais

### Longo Prazo
- [ ] Financeiro HUB — fechamento de caixa, conciliação, relatórios
- [ ] Cadastro inteligente com IA (sugestão de descrição, categorias, preços)
- [ ] WhatsApp HUB — conectar com Meta Business API real

---

## 📁 Estrutura de Hubs Lovable

```
components/
├── whatsapp/lovable/            → WhatsApp HUB
│   └── components/whatsapp/WhatsAppHub.tsx
├── operacoes/lovable/           → Operações HUB
│   ├── OperacoesHubIsolated.tsx
│   ├── pages/
│   ├── components/operacoes/
│   ├── store/osStore.tsx
│   └── api/  (mock)
```

---

## ⚠️ Atenção ao Retomar

1. Sempre rodar `npx tsc --noEmit` antes de fazer deploy
2. O Operações HUB usa dados **mock** — não persistem ao recarregar
3. WhatsApp automações são **simuladas** (sem Meta API real)
4. A rota `/dashboard/os` (legado) continua funcionando em paralelo ao `/dashboard/operacoes-v2`
5. Não importar `index.css` ou `App.css` dos hubs Lovable no layout raiz
