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
| Financeiro HUB V2 (`/dashboard/financeiro-v2`) | UI Lovable isolada com **dados mock inline** em `financeiro.tsx`; integração com Prisma/API pendente |
| Financeiro — contratos base | `lib/financeiro/contracts/` (status, origem, localKey, payload, valores); adapter OS atualizado para usar helpers; doc `docs/modules/reports/FINANCEIRO_CONTRACTS_STATUS_BASE.md` |
| Financeiro — ledger / carteiras / movimentos (fundação) | Tipos `lib/financeiro/types/`, serviços `lib/financeiro/services/` (saldo derivado, previstos, ledger lógico, `buildMovimentoFromContaReceber` sem DB); sem migration; `docs/modules/reports/FINANCEIRO_LEDGER_BASE.md` |
| Financeiro — contas a receber (service Prisma) | `lib/financeiro/services/contas-receber-service.ts`: list/upsert por `localKey`, cancelar/liquidar/parcial/estorno, `buildContaReceberSummary` e `buildContaReceberAuditTrail`; contratos + `payload.historico`; docs `FINANCEIRO_RECEBER_SERVICE_REAL.md` e `FINANCEIRO_RECEBER_API_UNIFICATION.md`; **sem** plug no HUB V2 visual nesta entrega |
| Financeiro — contas a pagar (service Prisma) | `lib/financeiro/services/contas-pagar-service.ts`: list/get/upsert por `localKey`, cancelar/liquidar/parcial/estorno, `buildContaPagarSummary` e `buildContaPagarAuditTrail`; APIs Ops `contas-pagar-persist`/`contas-pagar-list`; preserva `numeroDocumento` e fornecedor (`fornecedorId`/`fornecedorNome`) no payload; docs `FINANCEIRO_PAGAR_REAL_CHECKIN.md`, `FINANCEIRO_PAGAR_SERVICE_REAL.md`, `FINANCEIRO_PAGAR_API_PERSIST_LIST.md`; **sem** plug no HUB V2 visual/painel legado nesta entrega |
| Financeiro — contas a pagar (baixas/estornos server-side) | Rotas oficiais `POST /api/financeiro/contas-pagar/*` para pagamento parcial, liquidação, estorno completo e estorno do último pagamento (service Prisma + `logsAuditoria` leve); doc `docs/modules/reports/FINANCEIRO_PAGAR_BAIXAS_E_ESTORNOS.md`; **sem** integração UI nesta entrega |
| Financeiro — contas a pagar (painel legado híbrido) | `components/dashboard/financeiro/contas-pagar.tsx` agora carrega de forma híbrida (fallback localStorage + leitura server `/api/ops/contas-pagar-list` com KPIs por `summary` quando disponível) e faz writes server-first (persist `/api/ops/contas-pagar-persist`, baixas/estornos `/api/financeiro/contas-pagar/*`); doc `docs/modules/reports/FINANCEIRO_PAGAR_PAINEL_HIBRIDO.md` |

### Operações HUB V2 — status (normalização segura)

- O HUB usa pipeline operacional granular, enquanto o Prisma enum possui apenas 4 estados.
- Foi adicionada camada de compatibilidade que **preserva o status granular no payload** (`payload.operacaoStatus`) e mantém o enum Prisma como status colapsado.
- Relatório: `docs/modules/reports/OPERACOES_HUB_V2_STATUS_NORMALIZATION.md`

### Operações HUB V2 — anexos (persistência local)

- Anexos deixaram de depender de blob URL efêmera. Agora os arquivos são persistidos em **IndexedDB** e referenciados no payload via `url: local-idb://...`.
- Timeline registra `anexo_adicionado` e `anexo_removido`.
- Relatório: `docs/modules/reports/OPERACOES_HUB_V2_ANEXOS_REAL.md`

### Operações HUB V2 — faturamento OS → Contas a Receber (adapter)

- Aprovação de orçamento já cria intenção de faturamento no payload (`faturamento*`).
- Foi criado um adapter server-side idempotente que materializa `ContaReceberTitulo` real (Prisma) via `localKey` determinística por OS/unidade.
- Timeline da OS registra eventos de criação/atualização/cancelamento e erro de sync.
- Relatórios:
  - `docs/modules/reports/OPERACOES_HUB_V2_FATURAMENTO_CHECKIN.md`
  - `docs/modules/reports/OPERACOES_HUB_V2_OS_CONTAS_RECEBER_ADAPTER.md`

### Operações HUB V2 — backend operacional (modularização segura)

- `app/actions/operacoes.ts` foi mantido como orquestrador de Server Actions.
- Lógica interna foi extraída para `lib/operacoes/services/` (hidratação, payload, timeline, status e sync financeiro) sem alterar comportamento.
- Relatório: `docs/modules/reports/OPERACOES_BACKEND_MODULARIZATION.md`

### Operações HUB V2 — política de orçamento aprovado (revisão segura)

- Alterações em orçamento **já aprovado** agora geram auditoria explícita:
  - sem mudança de valor → evento `orcamento_aprovado_editado_sem_valor`
  - com mudança de valor → histórico em `payload.orcamentoHistorico[]` + revisão atual + eventos `orcamento_aprovado_revisado` / `faturamento_os_revisado`
- Conta a Receber mantém a mesma `localKey` (sem duplicidade) e preserva histórico de revisões no payload do título.
- Relatório: `docs/modules/reports/OPERACOES_HUB_V2_ORCAMENTO_APROVADO_POLICY.md`

### Operações HUB V2 — adapter OS → Estoque real (baixa na entrega)

- A baixa de estoque **real** agora é feita apenas quando a OS vira `entregue`.
- O consumo é **idempotente** via `payload.estoqueConsumido` e registra trilha em `payload.estoqueMovimentos[]`.
- Em caso de erro, a OS não quebra a transição e registra `estoque_sync_erro` na timeline.
- Ciclo operacional: restauração automática ao sair de `entregue`/cancelar e delta pós-revisão de orçamento aprovado (histórico no payload, idempotente).
- Relatórios:
  - `docs/modules/reports/OPERACOES_HUB_V2_ESTOQUE_CHECKIN.md`
  - `docs/modules/reports/OPERACOES_HUB_V2_OS_ESTOQUE_ADAPTER.md`
  - `docs/modules/reports/OPERACOES_HUB_V2_ESTOQUE_RESTORE_DELTA.md`

### Operações HUB V2 — peças com `Produto.id` real (padronização)

- Peças adicionadas a orçamento/OS agora podem persistir `produtoId` real quando vierem do catálogo de produtos (Cadastros/Prisma), preservando compatibilidade com mocks/legado.
- Normalização centralizada antes de salvar no payload (`payload.orcamento.pecas` e `payload.pecas`) e indicação leve de origem na UI do orçamento.
- Relatório: `docs/modules/reports/OPERACOES_HUB_V2_PECAS_PRODUTO_REAL.md`

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
