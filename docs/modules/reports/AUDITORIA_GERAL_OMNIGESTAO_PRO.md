# Auditoria geral — OmniGestão Pro

**Tipo:** somente análise e documentação (sem alteração de código, migrations, seeds ou dados).  
**Data de referência:** Maio 2026  
**Fontes principais:** `docs/ai/CURRENT_STATUS.md`, `docs/modules/*.md`, `docs/modules/reports/*`, `docs/architecture/BACKEND.md`, inspeção pontual de rotas `app/dashboard/*`, `components/auth/AccessGate.tsx`, `app/actions/*`, `prisma/schema.prisma` (modelagem inferida pelos docs e serviços).

---

## Legenda de status

| Status | Significado |
|--------|-------------|
| **Real** | Persistência/consulta em Prisma (ou API interna estável) como fluxo principal da feature. |
| **Híbrido** | Parte real + parte mock/localStorage/duplicidade de superfície; ou backend pronto sem UI unificada. |
| **Mock** | Dados ou auth de demonstração; sem persistência de negócio ou sem integração com DB. |
| **Quebrado** | Evidência de falha sistêmica conhecida (doc ou bug aberto); risco alto em produção. |
| **Não iniciado** | Placeholder de rota/doc; sem implementação útil além de esqueleto. |

**Prioridade:** P0 crítico · P1 importante · P2 melhoria · P3 futuro.

---

## Resumo executivo do sistema

O OmniGestão Pro é um **Next.js + Prisma + Postgres** com módulos **premium em UI** e uma **estratégia de integração gradual**: vários HUBs Lovable/TanStack entregam UX completa enquanto o **núcleo financeiro e operacional** ganhou **serviços reais** (`lib/financeiro/services/`, `lib/operacoes/services/`, adapters OS→Receber, OS→Estoque). O principal gap para MVP comercial é **convergência de fonte de verdade**: mesma entidade (financeiro, OS, cadastros) aparece em **mais de uma superfície** (HUB mock vs painel legado vs APIs), e parte do **painel inicial / master / auth staff** ainda é **demonstração estática ou mock local**. **Produção vs localhost** já teve incidente documentado de dados “zerados” ligado a cache de API e ENV (`docs/modules/reports/VERCEL_PROD_DATA_EMPTY_DIAGNOSIS.md`) — risco operacional P0/P1 até checklist de deploy ser rotina.

---

## Tabela por módulo (visão única)

| # | Módulo / área | Status | O que já funciona | O que falta | Dependências | Riscos | Pri. |
|---|---------------|--------|-------------------|-------------|----------------|--------|------|
| 1 | Dashboard principal | Mock / demo | Layout enterprise, QuickActions, gráficos e KPIs com aparência pronta | KPIs e gráficos **hardcoded**; sem ligação confiável a Prisma/APIs agregadas | Loja ativa, APIs de resumo | Usuário assume dados reais; expectativa incorreta no go-live | P1 |
| 2 | Cadastros HUB (`/dashboard/cadastros-v2`) | Híbrido / majoritariamente real | Server Actions `app/actions/cadastros.ts` + Prisma (stats, produtos, clientes, logs, etc.); UI Lovable isolada | Cobertura total de telas vs mocks residuais; possíveis gaps por entidade não mapeada nesta auditoria | `storeId`, schema Prisma | Erros silenciosos em produção se modelo/ENV divergir (`withPrismaSafe`) | P1 |
| 3 | Produtos | Híbrido | Prisma + APIs `/api/produtos`; uso em OS/PDV em partes do fluxo | Cadastros HUB vs listagens legacy — alinhar UX e regras fiscais completas | Cadastros, Estoque, OS | Divergência de campos (ex.: fiscal) | P2 |
| 4 | Clientes | Híbrido | Prisma + `/api/clientes`; OS legado e operações leem opções reais | CRM avançado / segmentação: doc placeholder | OS, WhatsApp, Marketing | Duplicidade de cadastro entre módulos | P2 |
| 5 | Vendas HUB (`/vendas-hub`, `/dashboard/vendas-hub`) | Híbrido | SPA TanStack; basepath dual; UI completa | Integração ponta-a-ponta com `Venda`/PDV e relatórios reais a confirmar por rota | APIs `vendas`, estoque, financeiro | Risco de estado local desincronizado do DB se não houver persistência única | P1 |
| 6 | PDV / Caixa | Híbrido / majoritariamente real | `finalizeSaleTransaction`, caixa em `localStorage` por loja, barra unificada; integração receber (docs) | Consistência multi-dispositivo do caixa; conciliação | Financeiro, Estoque, Produtos | Caixa só local = risco em equipe multi-terminal | P1 |
| 7 | Operações HUB V2 | Híbrido | OS **real** via Server Actions + Prisma; timeline, payload, normalização de status; faturamento→CR; estoque na entrega; anexos IndexedDB | Dados “hub” ainda citados como mock em docs antigos para **vendas/peças em memória**; convergir narrativa e código | Clientes, produtos, financeiro, estoque | Duplicidade com OS clássica; dois backends (Actions vs `/api/ordens-servico`) | P0 |
| 8 | OS clássica / legado (`/dashboard/os`) | Real | Cliente pesado com Prisma types, fluxo completo legado | Manutenção dupla vs HUB V2; qual rota “oficial” para MVP | Mesmo modelo `OrdemServico` | Divergência de regras/UX entre legado e V2 | P0 |
| 9 | Financeiro (guarda-chuva) | Híbrido | Serviços reais receber/pagar; contratos; adapters OS; APIs `/api/ops/*`, `/api/financeiro/*` | **Uma** UX e **uma** fonte de verdade | Operações, PDV, ledger futuro | Usuário alterna entre HUB mock e painéis reais | P0 |
| 10 | Contas a receber | Híbrido | Service Prisma; APIs persist/list; rotas de baixa/estorno; painel legado com LS+servidor | Rotas stub `app/dashboard/financeiro/contas-a-receber`; HUB V2 ainda mock nos dados principais | OS faturamento, PDV | Parte da UI não montada nas rotas dashboard financeiro | P0 |
| 11 | Contas a pagar | Híbrido | Service + APIs; painel legado **híbrido** (doc `FINANCEIRO_PAGAR_PAINEL_HIBRIDO.md`) | HUB V2 sem plug; dependência de `localKey`/fornecedor | Financeiro, fornecedores | localStorage ainda no caminho = risco de drift | P1 |
| 12 | Fluxo de caixa | Híbrido / majoritariamente mock na UI V2 | Ledger lógico em `lib/financeiro/services/` (sem tabelas dedicadas) | UI HUB: mock; painel legado: LS | Contas, movimentos | Relatórios financeiros não confiáveis até modelo único | P1 |
| 13 | Estoque | Híbrido | `Produto.stock`, consumo OS na entrega (adapter idempotente) | Telas de estoque dashboard: validar % real vs seed | Operações, produtos | Estoque “de mentira” em demos do hub | P1 |
| 14 | Marketplace | Não iniciado / placeholder | Rota/menu pode existir; doc placeholder | Integrações ML/Shopee etc. | Cadastros, vendas | Expectativa de feature inexistente | P3 |
| 15 | Marketing IA | Híbrido | Telas ricas; APIs marketing em `app/api/marketing/*`; calendário com helpers mock | Consistência “real” por feature (custo créditos, persistência posts) | Créditos, loja | Custo de API e limites sem governança clara = risco financeiro | P2 |
| 16 | WhatsApp HUB | Híbrido | UI + Prisma (conversas/mensagens); **Meta Cloud API** — texto/template/mídia (`lib/whatsapp.ts`, `POST /api/whatsapp/send`); inbound `POST /api/webhooks/whatsapp` + `after()`; simulação de automações por palavra-chave; temas/scroll corrigidos | Automações de **evento de sistema** ainda majoritariamente simuladas; métricas do dashboard HUB ainda ilustrativas em partes; filas/observabilidade Meta em escala | Auth, loja, templates aprovados Business Manager | Custo/regulatório API; webhook sem secret em ambiente aberto | P1 |
| 17 | Omni Agent HUB | Mock (doc) | UX premium demonstrativa | Execução real com auditoria (`docs/ai/AGENT_HUB.md`) | Todos os módulos | “IA faz tudo” sem trilha = risco reputacional | P2 |
| 18 | Configurações | Híbrido | Rotas `configuracoes`, `configuracoes-v2`; permissões citadas em CURRENT_STATUS | Unificar v2/v3 vs dashboard | Auth, loja | Múltiplas entradas confundem suporte | P2 |
| 19 | Temas globais | Real | `applyGlobalTheme`, tokens, persistência LS, sync hubs | Doc `THEMES.md` ainda placeholder | — | Cores hardcoded pontuais (citado em OPERACOES.md) | P3 |
| 20 | Master Console | Mock | KPIs e listas **hardcoded** (`master-console/page.tsx`) | Ligar a `Store` Prisma, equipe real, billing | Auth, multi-loja | Decisões em cima de dados fictícios | P2 |
| 21 | Auth / usuários / permissões | Mock (staff) | `AccessGate` com perfil em **localStorage** mock; fluxos admin/contador separados | SSO/RBAC real; sessão server-first | Prisma `User`/staff se existir | Segurança comercial inadequada para cliente pagante | P0 |
| 22 | Billing / planos / créditos | Híbrido | Rotas `/api/credits/*`, `/meu-plano`, subscription seal/verify | Política comercial única; UI vs backend alinhados | Auth, Prisma | Créditos sem trilha clara = disputa | P1 |
| 23 | Deploy / Vercel / produção | Real (tooling) | `docs/ai/DEPLOY.md`, build PWA | Checklist ENV, `tsc`, smoke DB | — | Cache route / DB vazio (doc diagnóstico) | P0 |
| 24 | Prisma / banco / migrations | Real | Schema amplo; serviços usam JSONB + histórico | Disciplina de migrate vs `db push` dev | — | Drift schema ambiente | P1 |
| 25 | APIs / Server Actions | Híbrido | Actions operação/cadastro; dezenas de API routes | Documentação OpenAPI ausente; duplicidade REST vs Actions | — | Contratos implícitos | P2 |
| 26 | Docs / memória técnica | Híbrido | Muitos relatórios em `reports/`; FINANCEIRO/OPERACOES/ESTOQUE úteis | `CLIENTES.md`, `VENDAS.md`, `MARKETPLACE.md`, `THEMES.md`, `ROADMAP.md` placeholders | — | Doc desatualizada vs código (ex.: estoque no HUB) | P2 |

---

## Detalhamento por módulo (expandido)

### 1. Dashboard principal
- **Status:** Mock (números estáticos em `app/dashboard/page.tsx`).
- **Funciona:** Shell, navegação, componentes visuais.
- **Falta:** Agregações reais (`/api/dashboard/resumo`, `elite`, etc.) ligadas a KPIs.
- **Riscos:** Marketing interno/externo mostra “receita falsa”.
- **Prioridade:** P1.

### 2. Cadastros HUB
- **Status:** Híbrido — núcleo **real** via Server Actions (`getCadastrosDashboardStats`, `upsertProduto`, …).
- **Funciona:** Dashboard de cadastros, IA parcial (campos ainda zerados em tipos), auditoria listável.
- **Falta:** Mapa fechado feature por feature; hardening de erros na UI.
- **Depende de:** `storeId`, migrations alinhadas.
- **Prioridade:** P1.

### 3–4. Produtos e Clientes
- **Status:** Híbrido — entidades Prisma + APIs REST consagradas.
- **Falta:** Docs de módulo (`CLIENTES.md`, `VENDAS.md`) ainda placeholders; regras de negócio avançadas não documentadas aqui.
- **Prioridade:** P2 (doc + regras), P1 se houver bug de loja ativa.

### 5–6. Vendas HUB e PDV
- **Vendas HUB:** UI SPA; grau de persistência **variável por sub-rota** — tratar como híbrido até inventário de mutações.
- **PDV:** Transação de venda e financeiro com padrão real (ver `useOperationsStore`, `finalizeSaleTransaction`); caixa **localStorage** = híbrido.
- **Prioridade:** P1 (PDV), P1 (vendas hub integração).

### 7–8. Operações HUB V2 vs OS legado
- **HUB V2:** Backend **real** para ciclo de vida OS; integrações **reais** documentadas (CR, estoque entrega, anexos IDB, política orçamento).
- **Doc OPERACOES.md** ainda menciona estoque/peças “mock” no hub — **parcialmente desatualizado** frente aos adapters reais; manter cautela: UI pode exibir dados seed em alguns painéis.
- **OS legado:** Fluxo completo alternativo.
- **Risco P0:** Duas experiências de OS + dois canais de API/Actions.

### 9–12. Financeiro, receber, pagar, fluxo
- **HUB V2 (`financeiro.tsx`):** Mock inline (relatório `FINANCEIRO_V2_REAL_CHECKIN.md`).
- **Núcleo server:** Real e crescente (services, APIs, painel pagar híbrido, receber unificado).
- **Rotas `app/dashboard/financeiro/*`:** Stubs “em construção” para várias páginas — **gap de roteamento**.
- **Prioridade:** P0 convergência; P1 fluxo de caixa e ledger.

### 13. Estoque
- **Real** no consumo pós-OS entregue; **UI** dashboard estoque a validar contra APIs reais.
- **Prioridade:** P1.

### 14. Marketplace
- **Não iniciado** (placeholder).
- **Prioridade:** P3.

### 15. Marketing IA
- **Híbrido:** APIs e UI; partes mock (ex.: ideias mês).
- **Prioridade:** P2 (governança créditos), P1 se disparar custo API sem teto.

### 16. WhatsApp HUB
- **Híbrido:** UI real + dados Prisma (conversas/mensagens); **Meta Cloud API** para envio e recebimento (webhook dedicado, gravação inbound, outbound com wamid); automações por palavra-chave e eventos de sistema ainda **não** equivalentes a um BSP completo; parte das métricas do dashboard HUB permanece ilustrativa.
- **Prioridade:** P1 (operacionalização: secrets, templates, limites, observabilidade).

### 17. Omni Agent HUB
- **Mock** declarado em `AGENT_HUB.md`.
- **Prioridade:** P2.

### 18–19. Configurações e temas
- **Config:** múltiplas rotas (`configuracoes`, `v2`, `v3`, `dashboard/configuracoes-v2`).
- **Temas:** implementação real; doc temas placeholder.
- **Prioridade:** P2.

### 20. Master Console
- **Mock** (dados constantes).
- **Prioridade:** P2 (antes de vender multi-loja “de verdade”).

### 21. Auth / permissões
- **Mock** para staff do dashboard (`MOCK_AUTH_STORAGE_KEY`).
- **Prioridade:** P0 para lançamento B2B sério.

### 22. Billing / créditos
- **Híbrido:** APIs existem; fluxo produto-completo a validar com jurídico/financeiro.
- **Prioridade:** P1.

### 23–25. Deploy, Prisma, APIs
- **Deploy:** risco **P0** se ENV/cache não checklistados.
- **Prisma:** real; risco de drift entre ambientes **P1**.
- **APIs:** real; falta catalogação para terceiros **P2**.

### 26. Docs
- **Híbrido:** ótima cobertura em reports; gaps em placeholders.
- **Prioridade:** P2.

---

## Lista P0 — crítico (bloqueia ou compromete lançamento sério)

1. **Duplicidade OS:** Operações HUB V2 vs `/dashboard/os` — definir produto único ou migração explícita.
2. **Financeiro:** HUB V2 mock vs serviços reais vs stubs de rota — fonte de verdade e navegação.
3. **Auth staff mock** (`AccessGate` / localStorage): inadequado para cliente pagante em produção.
4. **Produção “dados zerados”:** ENV, `storeId`, cache de API (`/api/stores` etc.) — mitigação documentada deve ser **processo de release**, não só código pontual.
5. **Expectativa do dashboard inicial:** KPIs falsos podem gerar problema legal/comercial.

---

## Lista P1 — importante (MVP sólido)

1. PDV/caixa: estratégia multi-terminal ou documentar limitação.
2. Contas a pagar: reduzir dependência de localStorage após APIs estáveis.
3. Contas a receber: montar rotas dashboard ou redirecionar para painel legado único.
4. Vendas HUB: fechar matriz real vs mock por feature.
5. WhatsApp: plano mínimo de produção (webhook, fila, opt-in).
6. Cadastros HUB: testes de smoke por `storeId` em staging espelhando produção.
7. Prisma: política clara `migrate` vs `push` por ambiente.

---

## Lista P2 — melhoria

1. Master Console → dados Prisma.
2. Marketing IA: limites e auditoria de gasto de crédito.
3. Omni Agent: trilha de execução e sandbox.
4. Documentar placeholders (`CLIENTES.md`, `VENDAS.md`, `THEMES.md`).
5. Catalogar APIs internas (reduz acoplamento Actions vs REST).

---

## Lista P3 — futuro

1. Marketplace integrado.
2. Cadastro inteligente massivo (IA).
3. Temas: eliminar cores fixas residuais.

---

## Sequência recomendada para fechar MVP

1. **Congelar decisão de produto:** OS = HUB V2 **ou** legado para go-live; outro modo “beta oculto”.
2. **Auth mínimo real:** sessão server + roles persistidos; remover mock gate ou restringir a `NODE_ENV=development`.
3. **Financeiro — rota única do usuário:** uma entrada (“Financeiro”) que leia/escreva Prisma (receber/pagar/fluxo mínimo) **ou** redirecionar tudo para painéis legados até o HUB V2 ser plugado.
4. **Dashboard:** ligar KPIs a uma API agregadora real ou esconder números até existirem.
5. **Checklist deploy:** `tsc`, `build`, ENV, smoke `Store`/`Cliente`/`Produto`, teste manual doc DEPLOY.
6. **PDV:** documentar caixa local; opcional sync server na próxima fase.
7. **WhatsApp:** escopo reduzido (avisos internos) ou feature flag.

---

## Riscos para lançamento (consolidado)

| Risco | Impacto |
|-------|---------|
| Dados financeiros divergentes entre telas | Erro de cobrança, perda de confiança |
| OS duplicada conceitualmente | Suporte impossível, bugs de status |
| Auth mock | Vazamento de conceito de segurança |
| Produção com DB/cache errado | “Sistema não funciona” na primeira demo |
| Dashboard com métricas falsas | Risco comercial/legal leve a moderado |
| Marketing/WhatsApp API custo aberto | Risco financeiro |

---

## O que NÃO mexer agora (recomendação desta auditoria)

- **Não** fundir código de OS legado e HUB V2 sem plano escrito (alto risco de regressão).
- **Não** trocar todo o Financeiro HUB V2 de mock para Prisma em um único PR gigante (preferir fatias por aba com feature flag).
- **Não** remover `localStorage` financeiro até haver **leitura offline** equivalente ou aceite de perda de modo avião.
- **Não** apagar rotas legadas ainda referenciadas no sidebar/mobile sem mapear todos os links.
- **Não** alterar schema Prisma em produção sem migration revisada (já política do projeto).

---

## Referências cruzadas

- Memória viva consolidada: `docs/memory/OMNIGESTAO_MASTER_MEMORY.md`
- Estado vivo resumido: `docs/ai/CURRENT_STATUS.md`
- Roadmap macro: `docs/roadmap/ROADMAP.md`
- Financeiro: `docs/modules/FINANCEIRO.md` + `FINANCEIRO_V2_REAL_CHECKIN.md`
- Operações: `docs/modules/OPERACOES.md` + reports `OPERACOES_HUB_V2_*`
- Deploy: `docs/ai/DEPLOY.md`
- Produção vazia: `docs/modules/reports/VERCEL_PROD_DATA_EMPTY_DIAGNOSIS.md`

---

## Próxima revisão sugerida

Reexecutar esta auditoria após: (1) decisão única de OS, (2) primeira versão de auth real no dashboard, (3) primeira tela financeira 100% Prisma sem mock principal.
