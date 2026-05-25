# Auditoria Completa OmniGestão Pro — 24/05/2026

> **Tipo:** somente análise e planejamento. **Nenhum** arquivo de aplicação foi alterado.
> Único arquivo criado: este relatório (`docs/ai/AUDITORIA_2026-05-24.md`).
>
> **Solicitante:** RAFAEL — auditoria 360° de estabilidade, completude funcional e dívida técnica
> antes da próxima sprint de operação real.
>
> **Validações executadas:**
> - `npx tsc --noEmit` → EXIT 0 (sem erros de tipo)
> - `npx eslint --max-warnings 0 app/dashboard` → EXIT 0 (sem warnings/erros)
> - `npm run build` **não foi executado** nesta auditoria (já registrado no `CURRENT_STATUS` que
>   localmente trava por lock do `prisma generate` quando o dev server está rodando; o webpack do
>   Next compila normalmente nas sprints anteriores). Recomendado rodar manualmente antes do deploy.
>
> **Fontes consultadas:** `CLAUDE.md`, `docs/skills/**`, `docs/ai/CURRENT_STATUS.md` (1.279 linhas),
> `docs/modules/reports/AUDITORIA_GERAL_OMNIGESTAO_PRO.md`, `docs/modules/reports/FINANCEIRO_V2_*`,
> `prisma/schema.prisma` (1.903 linhas, 60+ models), e inspeção direta de `app/`, `lib/`,
> `components/` (PDV, Caixa, Financeiro v2, Operações v2, Cadastros v2, WhatsApp, Marketplace,
> IA Mestre, Master Console, Painel Inicial).

---

## 1. Resumo Executivo

O OmniGestão Pro está, em maio/2026, em um **nível de estabilidade operacional alto** para os
módulos críticos de loja (PDV Clássico, Assistência, Supermercado, Caixa, Estoque, Cadastros
v2, Operações v2 e Financeiro v2 nos eixos Contas a Receber/Pagar e Carteiras). As últimas
sprints (0, 1, 1.1 e 1.2 — entre 23 e 24/05/2026) fecharam vários riscos críticos: caixa
fantasma, sangria/suprimento silenciosos, redirect para PDV Next que não persistia, item avulso
nos 3 PDVs, multi-terminais com lock, cancelamento/troca/devolução ERP-safe, crédito do cliente
persistido no banco, faturamento OS → venda com FK correta, fechamento de caixa estilo ERP
premium.

Apesar disso, persistem **riscos operacionais reais** que afetam ou podem afetar venda diária:

- **PDV Clássico não tem tecla dedicada de Desconto** (só pelo menu Avançado/CTRL). Risco já
  registrado em CURRENT_STATUS — Sprint 1.2.
- **Sangria/suprimento sem `sessaoId` confirmado no servidor** apenas alerta (não retenta),
  podendo deixar caixa local divergente do servidor.
- **Lançamento de venda à prazo (`contaReceberTituloId`)** é fire-and-forget para
  `/api/ops/contas-receber-persist` — risco de drift se a rede cair entre o `finalizeSale` e
  o POST do título.
- **`/dashboard/pdv-next` continua sem persistir vendas** (gated por flag, mas o componente
  real está no repositório e poderia ser exposto por engano).
- **Auth de staff** legacy (`AccessGate`/PIN) continua coexistindo com NextAuth v5 — para
  cliente pagante isso é P0 antes do lançamento comercial mais amplo.
- **Dois fluxos de OS** (Operações v2 oficial + `/dashboard/os` legado) ainda convivem com a
  mesma tabela `OrdemServico`. Risco de UX divergente.
- **Master Console** já consome `/api/stores` — porém o `OmniAgent` HUB e parte do `Marketing
  IA` Studio seguem com partes ilustrativas. Marketplace é placeholder/roadmap.
- **`pdv-github-original/`** é uma cópia integral de versão anterior dentro de
  `components/pdv-github-original/` — código morto que polui buscas, lint e tcs (atualmente
  excluído do tsconfig, mas presente em disco e no Git).
- **53 usos de `CURRENT_STORE_ID` mutável** dentro de `components/operacoes/lovable/api/` —
  estado global em variável module-level, vulnerável a race entre lojas.

Critério rápido: o sistema **pode** rodar uma loja real hoje, **deve** rodar com o PDV Clássico
em uma única estação, e **não deve** ser exposto multi-tenant comercial até resolver auth real
e a divergência OS legado vs. Operações v2.

---

## 2. Mapa Arquitetural (visão única, ~ minha-página)

```
Next.js 16 (App Router) + React 19 + TS 5 strict
├── auth.ts / auth.config.ts          NextAuth v5 (Credentials, JWT, bcrypt)
│   └── proxy.ts                       gate /dashboard/*
├── app/(auth)/login                   página de login real
├── app/dashboard/                     shell + 30+ módulos
│   ├── page.tsx                       Painel Inicial (REAL via /api/dashboard/elite)
│   ├── vendas/                        PDV oficial (Classic/Assist/Super)
│   ├── pdv-next/  pdv-github-original gated experimental + cópia legacy
│   ├── caixa/historico                histórico real
│   ├── financeiro/{contas-a-*}        REDIRECT → financeiro-v2
│   ├── financeiro-v2/                 HUB Lovable + FinanceiroRealContext (APIs reais)
│   ├── operacoes-v2/                  HUB Lovable Operações (Server Actions reais)
│   ├── os/                            OS legado (Prisma direto)
│   ├── cadastros-v2/                  HUB Lovable Cadastros (Server Actions reais)
│   ├── clientes/                      CRM (real)
│   ├── estoque/                       Estoque + Auditoria (real)
│   ├── whatsapp/                      Inbox Meta Cloud API (real + envios outbound reais)
│   ├── marketing-ia/                  Studio (real parcial: textos/imagens; partes ilustrativas)
│   ├── marketplace/                   Placeholder/roadmap
│   ├── ia-mestre/                     UI premium; APIs OpenRouter/OpenAI reais
│   ├── omni-agent/                    Mock declarado
│   ├── master-console/                /api/stores real
│   ├── configuracoes(-v2/-v3)/        múltiplas entradas (consolidação pendente)
│   ├── billing/ creditos/             /api/billing + Stripe (real)
│   └── relatorios/ historico-vendas/  legados; usam APIs reais
├── app/api/
│   ├── ops/{caixa,terminal,venda-persist,contas-*-persist,devolucao,inventory,ordens,sync-*}
│   ├── financeiro/{receber,pagar,carteiras,fluxo-caixa,dre,fechamentos,...}    REAL
│   ├── vendas/[id]/{cancelar,corrigir} + vendas/historico                       REAL
│   ├── clientes, produtos, marketplace/*, marketing/*                           REAL
│   ├── whatsapp/* + webhook + Meta Cloud send/automations                       REAL
│   ├── webhooks/{stripe,whatsapp} + meta-whatsapp-verify                        REAL
│   └── debug/*                                                                  ferramental
├── app/actions/                       Server Actions (auth, cadastros, estoque,
│                                       operacoes, ordens, terminais, vendas-enterprise,
│                                       whatsapp, omni-agent)
├── lib/
│   ├── financeiro/{services,adapters,contracts}      núcleo financeiro REAL
│   ├── operacoes/{services,adapters}                 núcleo OS REAL
│   ├── operations-store.tsx, ops-upsert-venda.ts     transação venda (REAL + reenvio)
│   ├── pdv-terminal*.ts, pdv-terminal-lock.ts        multi-terminais + lock
│   ├── caixa-fechamento-resumo.ts                    fechamento ERP premium
│   ├── audit-log.ts, audit-sync.ts                   auditoria
│   ├── whatsapp.ts                                   Meta Cloud client
│   ├── feature-flags.ts                              gates (experimental, roadmap)
│   └── loja-ativa.tsx, store-id-from-request.ts      multi-loja
├── components/
│   ├── dashboard/{vendas,caixa,financeiro,clientes,estoque,os,...}   shells reais
│   ├── financeiro/lovable                             HUB v2 isolado (MemoryRouter)
│   ├── operacoes/lovable                              HUB v2 isolado (MemoryRouter)
│   ├── cadastros/lovable                              HUB v2 isolado
│   ├── whatsapp/lovable, marketplace/lovable          HUBs isolados
│   ├── painel-inicial/                                AppShell + Sidebar + Topbar (REAIS)
│   ├── master-console/                                cards + lista de lojas (REAL)
│   ├── pdv-next/ (PdvBlackEdition)                    experimental, NÃO persiste
│   └── pdv-github-original/                           cópia legado morta (no disco/git)
└── prisma/schema.prisma                ~60 models (Store, Cliente, Produto, OrdemServico,
                                        Venda, ItemVenda, MovimentacaoEstoque,
                                        MovimentacaoFinanceira, ContaPagar/ReceberTitulo,
                                        CarteiraFinanceira, SessaoCaixa, CaixaOperacao,
                                        PdvTerminal, DevolucaoVenda, ClienteCredito,
                                        FinancialAccount/Category/Transaction, WhatsApp*,
                                        Marketplace*, AdminUser, OmniAgentCommand, ...)
```

Padrões transversais relevantes:
- **payload (JSONB)** em várias entidades (OS, Venda, SessaoCaixa, DevolucaoVenda) guarda
  estado rico; a coluna enum (status) é "vista colapsada" do payload.
- **localKey** garante idempotência em fluxos financeiros (`os-faturamento:{storeId}:{osId}`,
  `receber:{storeId}:{localKey}`, etc.).
- **Multi-loja**: `x-assistec-loja-id` header é a fonte primária; helpers `opsLojaIdFromRequest`
  / `opsLojaIdFromRequestForWrite` / `storeIdFromAssistecRequestForRead` consolidam.
- **Reentrega de venda offline**: `syncPending` no `operations-store.tsx` reenvia em `online`,
  foco da aba e a cada 30s (`venda-persist` idempotente).

---

## 3. Matriz de Completude (Módulo → Tela → Aba → Status)

> **COMPLETA** = pronta para operação real. **INCOMPLETA** = funciona mas falta algo
> documentado. **FALTANDO** = aba prometida no menu/UI mas inexistente, vazia ou só
> placeholder. **EXPERIMENTAL** = existe, gated por flag, não usar em produção.

### 3.1 PDV / Vendas

| Tela / Sub-tela | Status | Lacunas para 100% pronto |
|---|---|---|
| `/dashboard/vendas` (TerminalSelector + lock) | COMPLETA | Sem propagação cross-tab da troca de loja (reload resolve) |
| PDV Clássico — Carrinho/Bipe | COMPLETA | — |
| PDV Clássico — Item Avulso (INS) | COMPLETA | — |
| PDV Clássico — **Desconto rápido** | INCOMPLETA | Sem tecla dedicada — só via menu Avançado (sprint 1.2) |
| PDV Clássico — Troca/Devolução (modal embutido) | COMPLETA | — |
| PDV Clássico — Cliente inline | COMPLETA | — |
| PDV Clássico — Sangria/Suprimento | INCOMPLETA | Alerta se sem sessão; não retenta |
| PDV Assistência (F8 Trocas, atalhos) | COMPLETA | — |
| PDV Supermercado | COMPLETA | — |
| PDV Next / Black Edition | EXPERIMENTAL | Gated por env; **não persiste venda** |
| PDV GitHub Original (`pdv-github-original`) | FALTANDO/legado | Gated; pasta inteira é cópia morta |
| Venda Completa Enterprise | COMPLETA | Validação visual nos 4 temas recomendada |
| Orçamentos (rota legado SPA) | INCOMPLETA | Fluxo de transição; UI presente, rota desconectada |
| Histórico de Vendas (`vendas-arquivo-geral`) | COMPLETA | Drawer + correção + troca/devolução real |
| Cancelar venda (ERP-safe, fase 2) | COMPLETA | Sessão de caixa fechada não reabre (auditável) |
| Corrigir venda (forma/cliente/obs) | COMPLETA | Correção parcial de pagamento misto = fora de escopo |

### 3.2 Caixa

| Tela / Sub-tela | Status | Lacunas |
|---|---|---|
| Abertura de Caixa (modal) | COMPLETA | Sem guard de duplicidade (`abrir` sempre cria nova `SessaoCaixa`) |
| Status Bar (terminal + saldo) | COMPLETA | `totalEntradas/totalSaidas` da barra são runtime local |
| Sangria / Suprimento | INCOMPLETA | Idempotência fraca (referenciaId = caixaOperacao.id evita duplicação no DB, mas falha de rede ainda é frágil) |
| Fechamento de Caixa (ERP premium) | COMPLETA | PDV Balcão × Venda Completa indistinguíveis na origem |
| Histórico de Caixa (`/caixa/historico`) | COMPLETA | — |
| Resumo por origem/pagamento | COMPLETA | — |

### 3.3 Operações v2 (OS)

| Aba | Status | Lacunas |
|---|---|---|
| Lista de OS | COMPLETA | — |
| Detalhe — Diagnóstico | COMPLETA | — |
| Detalhe — Orçamento | COMPLETA | Política orçamento real (`validateOrcamentoEstoqueAction`) |
| Detalhe — Peças | COMPLETA | `reservarPeca` no Lovable retorna mock-movement; baixa real só no `os-estoque.ts` adapter |
| Detalhe — Checklist/Timeline | COMPLETA | — |
| Detalhe — Entrega/Garantia | COMPLETA | — |
| Detalhe — Faturamento → Venda | COMPLETA | `criarVendaDeOSAction` resolve `clienteNome` + FK `Venda.clienteId` |
| Detalhe — Anexos (IndexedDB) | COMPLETA | — |
| OS Legado `/dashboard/os` | INCOMPLETA | Dupla manutenção com v2; TODO sobre `loja-1` no header de loja ativa |

### 3.4 Financeiro v2 (HUB Lovable em `/dashboard/financeiro-v2`)

| Aba (route financeiro.tsx) | Status | Observação |
|---|---|---|
| Contas a Receber | COMPLETA | `FinanceiroRealContext` → `/api/financeiro/receber` |
| Contas a Pagar | COMPLETA | `/api/financeiro/pagar` |
| Carteiras | COMPLETA | `/api/financeiro/carteiras` + transferências |
| Fluxo de Caixa | COMPLETA | `/api/financeiro/fluxo-caixa` |
| Movimentações | COMPLETA | `/api/financeiro/movimentacoes` |
| Relatórios (resumo/rankings/indicadores/fluxo) | COMPLETA | `/api/financeiro/relatorios/*` |
| DRE | COMPLETA | `/api/financeiro/dre` |
| Conciliação | COMPLETA | `/api/financeiro/conciliacao` |
| Fechamentos diário/mensal | COMPLETA | `/api/financeiro/fechamentos/*` |
| Exportações | COMPLETA | `/api/financeiro/relatorios/exportar` |
| Auditoria Financeira | COMPLETA | `/api/financeiro/auditoria` |
| Análises por carteira | COMPLETA | — |
| Configurações Financeiro (Categorias/Modelos) | INCOMPLETA | Doc `FINANCEIRO_V2_CONFIGURACOES_MOCK.md` indica mock; revalidar |
| Centro de Custos | INCOMPLETA | `lib/centro-financeiro.ts` existe, UI ainda parcial |

> **Observação:** os 6 docs `FINANCEIRO_V2_*_MOCK.md` foram escritos antes do
> `FinanceiroRealContext` ser plugado. Recomendado **reescrever esses 6 docs como
> CHECKIN_REAL** após auditoria visual ao vivo em cada aba — a leitura de código mostra
> chamadas a APIs reais para Contas/Carteiras/Fluxo/Relatórios.

### 3.5 Cadastros v2 (`/dashboard/cadastros-v2`)

| Aba | Status | Observação |
|---|---|---|
| Dashboard | COMPLETA | Stats reais |
| Clientes | COMPLETA | Bug `email` corrigido em sprint anterior |
| Produtos | COMPLETA | NCM/Tributação/Tags/Modelo presentes no form mas **não persistem** (sem coluna no schema) |
| Serviços | INCOMPLETA | Campos Peças/Checklist/Marketing IA não persistem |
| Fornecedores | COMPLETA | Coluna "Categoria" sempre "—" |
| Técnicos | COMPLETA | Métricas zeradas fixas |
| Equipamentos | COMPLETA | Botões IA do card desabilitados |
| Categorias/Marcas | COMPLETA | — |
| Importação | COMPLETA | XML NF-e ainda preview (não persiste — Sprint Estoque) |
| Auditoria | COMPLETA | **Não filtra por `storeId`** (logs globais, pré-existente) |

### 3.6 Estoque

| Aba | Status | Observação |
|---|---|---|
| Saldo / Lista | COMPLETA | "Estoque Mínimo (Alerta)" no form **não persiste** |
| Movimentações | COMPLETA | — |
| Inventário | COMPLETA | — |
| Ajustes (Entradas/Saídas) | COMPLETA | Editar "Estoque Atual" no produto sobrescreve sem livro-razão |
| Auditoria de Estoque | COMPLETA | Detecta estoque negativo |
| Importar XML NF-e | INCOMPLETA | Preview honesto; **não persiste** (banner avisa) |
| `servicos.tsx` em estoque | FALTANDO | Código morto |

### 3.7 Clientes / CRM

| Aba | Status | Observação |
|---|---|---|
| Lista (KPIs reais) | COMPLETA | "Ticket Médio" agora 0 quando vazio (não mais 380 falso) |
| Drawer cadastro (5 abas) | COMPLETA | Persiste `tags` estruturadas |
| Drawer perfil (3 abas) | COMPLETA | `totalSpent` agora agregado real |
| Histórico OS + Vendas | COMPLETA | Limite 15 no `include` (total já corrigido sem limite) |
| Timeline real | COMPLETA | — |
| Deep-link Nova OS / Iniciar Venda | INCOMPLETA | "Nova OS" do CRM ainda aponta `/dashboard/os` (legado) |

### 3.8 WhatsApp HUB

| Aba | Status | Observação |
|---|---|---|
| Inbox / Conversas | COMPLETA | Meta Cloud + inbound webhook + outbound real |
| Etiquetas / Quick Replies | COMPLETA | CRUD real |
| Automações por palavra-chave | COMPLETA | — |
| Automações por evento de sistema | INCOMPLETA | Majoritariamente simuladas |
| AI Settings | COMPLETA | — |
| Templates aprovados Business Manager | INCOMPLETA | Sem fluxo de aprovação dentro do app |
| Dashboard de métricas | INCOMPLETA | Parte ilustrativa |

### 3.9 Marketing IA

| Aba | Status | Observação |
|---|---|---|
| Studio Main (texto/imagem) | COMPLETA | APIs OpenRouter/OpenAI reais |
| Phone Preview | COMPLETA | — |
| Distribuição (Distribution) | INCOMPLETA | Parte ilustrativa |
| Calendário | INCOMPLETA | Helpers mock para ideias do mês |
| Gerador de Posts | COMPLETA | — |
| Mídia Studio | COMPLETA | Créditos consomem |
| Avatar / Voz / Vídeo | COMPLETA | Pesam em créditos |

### 3.10 Marketplace

| Aba | Status | Observação |
|---|---|---|
| Conexões | INCOMPLETA | CRUD existe (`/api/marketplace/connections`) mas sem provider real |
| Anúncios | INCOMPLETA | UI mock |
| Produtos | INCOMPLETA | Sync logs existem; sem provider real |
| Exportação | INCOMPLETA | — |
| **Geral** | FALTANDO (roadmap) | Toda a aba está **oculta do sidebar** via `roadmapHubsEnabled` |

### 3.11 IA Mestre

| Sub-rota | Status | Observação |
|---|---|---|
| Conversas | COMPLETA | Persistência real `IaConversation`/`IaMessage` |
| Gerador de Imagens | COMPLETA | API real |
| Projetos | INCOMPLETA | UI presente; parte sem persistência |
| Treinar | INCOMPLETA | UI presente; backend de treino não montado |
| Configurações | COMPLETA | — |

### 3.12 Painel Inicial / Master Console / Configurações

| Tela | Status | Observação |
|---|---|---|
| Painel Inicial (`/dashboard`) | COMPLETA | `useDashboardElite` real; cards "Ao vivo" quando há loja |
| Master Console | COMPLETA | `/api/stores` real; CRUD de lojas; supervisor PIN |
| Configurações | INCOMPLETA | Três rotas (`configuracoes`, `-v2`, `-v3`) coexistem |
| Omni Agent | INCOMPLETA (mock declarado) | Sem trilha real |
| Billing / Stripe | COMPLETA | Webhook + checkout + portal |
| Créditos | COMPLETA | History + purchase reais |
| Dev Health | COMPLETA | Diagnóstico interno |

---

## 4. Fluxos Cruzados — onde quebram ou ficam parciais

| Origem | Destino | Status | Onde quebra / o que falta |
|---|---|---|---|
| PDV → Caixa (vendas finalizadas) | `MovimentacaoFinanceira(origem:"venda")` | REAL & IDEMPOTENTE | `createdAt = at` (data real); reentrega em `syncPending` |
| PDV → Contas a Receber (à prazo) | `appendContaReceberTituloPdvAprazo` | **PARCIAL** | Fire-and-forget para `/api/ops/contas-receber-persist` — sem retry; se rede cair, título sobe só no localStorage até o próximo bootstrap |
| PDV → Estoque | `MovimentacaoEstoque(origem:"pdv")` | REAL & IDEMPOTENTE | Console.warn quando inventoryId não casa (observabilidade ok) |
| PDV → Crédito do Cliente | `ClienteCredito` | REAL (DB) | Crédito pré-Fase 4 só em localStorage; `validoAte` no schema mas não verificado |
| OS → Estoque (entrega) | `MovimentacaoEstoque(origem:"os")` | REAL & IDEMPOTENTE | Flags em payload (consumido/restaurado/ultimaRevisao) |
| OS → Contas a Receber (faturamento) | adapter `os-faturamento` + `localKey` | REAL & IDEMPOTENTE | — |
| OS → Venda (faturarOS) | `criarVendaDeOSAction` | REAL | `clienteNome` agora resolvido por prioridade; FK gravada |
| Cancelar Venda | Repõe estoque + estorna financeiro | REAL & IDEMPOTENTE | Sessão de caixa fechada **não reabre** (auditável; impacto operacional) |
| Devolução / Troca | Crédito DB + cupom ESC/POS | REAL | Excesso em dinheiro não cria `MovimentacaoFinanceira` saída (operador entrega no caixa) |
| Sangria/Suprimento | `MovimentacaoFinanceira` | REAL (parcial) | Idempotência via `referenciaId+origem`; falha de rede retorna toast destrutivo mas não retenta |
| Cliente → Iniciar Venda (deep link `?clienteId=`) | PDV | INCOMPLETA | Param já preservado mas PDV **não pré-seleciona** o cliente |
| Cliente → Nova OS (CRM) | `/dashboard/os` | INCOMPLETA | Link aponta para legado, deveria ser `/dashboard/operacoes-v2` |
| WhatsApp inbound → Cliente | matching por número | INCOMPLETA | Roteamento por `WHATSAPP_WEBHOOK_STORE_ID`; sem `WHATSAPP_WEBHOOK_STORE_ID` cai em `loja-1` |
| Marketplace → Produto | sync | NÃO INICIADO | Sem provider real |
| Marketing IA → Custos | `Usage`/`CreditPurchase` | PARCIAL | Sem governança de teto/alerta |

---

## 5. Bugs e Riscos Identificados (com prioridade)

### P0 — Risco operacional / financeiro / segurança

1. **Sangria/Suprimento sem retry** quando rede cai (toast existe, mas o operador precisa
   retentar manualmente). Possível diferença local × servidor no caixa.
   — Arquivos: `components/dashboard/vendas/pdv-classic.tsx` (handler), `app/api/ops/caixa/operacao/route.ts`.

2. **Lançamento de título à prazo fire-and-forget** (`/api/ops/contas-receber-persist`).
   Se a chamada falhar após o `finalizeSaleTransaction`, o título existe só em localStorage
   até o próximo bootstrap. O ledger financeiro principal (`MovimentacaoFinanceira(venda)`)
   já cobre o valor recebido, mas o título não é criado para cobrança/baixa.
   — Arquivo: `lib/pdv-append-conta-receber.ts:55`.

3. **`/dashboard/pdv-next` (Black Edition)** continua presente; gate é flag de env. Se o
   build promover `NEXT_PUBLIC_OG_EXPERIMENTAL=1` por erro, o operador pode acessar e
   perder vendas (handlePaymentConfirm só reseta UI). Risco recorrente.
   — Arquivo: `app/dashboard/pdv-next/page.tsx`, `components/pdv-next/PdvBlackEdition.tsx`.

4. **Auth de staff legado** (`AccessGate` + PIN em `assistec_staff_session` / `assistec_staff_role`)
   coexiste com NextAuth v5. Para cliente pagante, isso é P0: sessão e RBAC reais e
   server-first são exigência mínima.
   — Arquivos: `components/auth/AccessGate.tsx`, `app/dashboard/layout.tsx`, `lib/auth/*`.

5. **`CURRENT_STORE_ID` mutável module-level** em `components/operacoes/lovable/api/{estoque,os}.ts`
   (53 referências). Mudança de loja em outra aba pode contaminar a próxima leitura, e race
   teórica documentada no `OPERACOES_HUB_GOAL_REPORT`.
   — Arquivos: `components/operacoes/lovable/api/os.ts:45`, `.../estoque.ts:8`.

6. **OS legado `/dashboard/os` e Operações v2** convivem sobre a **mesma tabela**
   `OrdemServico`. Risco de divergência de UX e de regras de status entre os dois.
   — Arquivos: `app/dashboard/os/*`, `app/dashboard/operacoes-v2/*`.

7. **Cópia legacy `components/pdv-github-original/`** dentro do repositório (excluída do
   tsconfig mas presente em disco/Git e poluindo grep/lint). Hoje é só dívida, mas pode
   ser servida por engano se algum import esquecido sobreviver.
   — Diretório: `components/pdv-github-original/`.

### P1 — Inconsistência funcional

1. **PDV Clássico — sem tecla dedicada de Desconto** (só via menu Avançado). Já listado
   na sprint 1.2 como pendência.
2. **Caixa — abrir sem guard de duplicidade**: cria nova `SessaoCaixa` mesmo se houver
   uma ABERTA. Modal de abertura precisa checar antes.
3. **`totalEntradas/totalSaidas` da barra de caixa** são runtime local; podem divergir do
   servidor durante o turno (o fechamento usa o canônico do servidor).
4. **Cancelamento de venda** em sessão fechada: estorno é gravado, mas a sessão não
   reabre — impacto contábil precisa de procedimento documentado.
5. **`Cliente.totalSpent` coluna estática** — só preenchida no import; o real agora vem
   da agregação. Mantida por compatibilidade; eventualmente remover.
6. **CRM → "Nova OS"** ainda aponta para `/dashboard/os` (legado). Deve apontar para
   `/dashboard/operacoes-v2`.
7. **PDV não pré-seleciona cliente via `?clienteId=`** (query preservada, mas não usada
   pelo PDV ainda).
8. **`WHATSAPP_WEBHOOK_STORE_ID` ausente** cai em `loja-1` — risco em multi-loja real.
9. **Auditoria do Cadastros HUB** não filtra por `storeId` (logs globais).
10. **Cadastros — Produto/Serviço:** campos NCM, Tributação, Tags, Modelo, Peças,
    Checklist, Marketing IA presentes no form **não persistem** (sem coluna no schema).
11. **Estoque — "Estoque Mínimo"** no form não persiste.
12. **Lovable `reservarPeca`/`baixarPeca`** retornam mock-movement local (a baixa
    verdadeira é feita por `os-estoque.ts`). Comportamento intencional, mas a UI pode
    confundir — recomendado renomear ou retornar void.
13. **Múltiplas rotas de Configurações** (`/configuracoes`, `-v2`, `-v3`,
    `dashboard/configuracoes-v2`). Consolidação pendente.
14. **`/dashboard/finance` e `/dashboard/financeiro/*`** redirecionam ou são stubs —
    convergência completa para `financeiro-v2`.

### P2 — Melhoria / refatoração futura

1. **6 docs `FINANCEIRO_V2_*_MOCK.md`** desatualizados: o HUB hoje usa
   `FinanceiroRealContext` real. Reescrever como `*_CHECKIN_REAL.md`.
2. **`AUDITORIA_GERAL_OMNIGESTAO_PRO.md`** datado de Maio/2026 não reflete sprints 0–1.2.
   Reescrever em cima do `CURRENT_STATUS.md` atual.
3. **`pdv-github-original/`** — apagar ou mover para `archive/` fora do build.
4. **Omni Agent HUB** — mock declarado; UX premium sem backend executor.
5. **Marketing IA** — governança de gastos (teto por loja, alerta antes do limite).
6. **WhatsApp** — fila de envio, observabilidade, templates aprovados Business Manager.
7. **177 `console.error` + 43 `console.warn`** no app: padronizar para envio a um logger
   (Sentry/LogRocket) ou pelo menos categorizar por severidade.
8. **191 chamadas a `localStorage`** no app: a maioria é cache válido; auditar as de
   `components/dashboard/financeiro/contas-{receber,pagar}.tsx` (8 + 1 ocorrências) e
   `caixa-provider.tsx` (1) — confirmar que é só cache.
9. **47 ocorrências de `bg-red-500 / bg-blue-600 / text-emerald-500`** em
   `components/dashboard`. Várias são semânticas legítimas (sucesso/erro), mas precisam
   ser confirmadas contra `CORE_RULES §7`.

---

## 6. Riscos Operacionais Consolidados

| Risco | Impacto | Mitigação imediata |
|---|---|---|
| `pdv-next` exposto por engano | Vendas perdidas | Manter flag `NEXT_PUBLIC_OG_EXPERIMENTAL` OFF; checklist de release |
| Sangria/suprimento sem retry | Caixa diverge | Retry exponencial + reconciliação no fechamento |
| Título à prazo perdido em rede | Cobrança esquecida | Mover persistência para dentro da tx de venda |
| Auth staff mock em produção | Vazamento de papel | Restringir AccessGate a `NODE_ENV=development` |
| OS dupla (v2 + legado) | UX divergente | Congelar OS legado; redirecionar todos os deep-links |
| Trocar loja em outra aba | Contaminação `CURRENT_STORE_ID` | Substituir variável module-level por contexto React |
| Master Console multi-tenant sem RBAC real | Acesso a loja errada | Vincular `AdminUserStore` ao header `x-assistec-loja-id` |
| WhatsApp sem secret/store em prod | Webhook errado | Bloquear deploy se `WHATSAPP_APP_SECRET` ou `_WEBHOOK_STORE_ID` ausentes |
| Marketing IA sem teto de crédito | Conta de API estourada | Hard cap por loja + alerta 80% |

---

## 7. Dívida Técnica (resumo)

- **Código morto**: `components/pdv-github-original/`, `services.tsx` em estoque, várias
  rotas SPA TanStack `Vendas HUB` desconectadas (`/pdv`, `/vendas/nova`, `/orcamentos`,
  `/pedidos`, `/fiscal`).
- **Variáveis module-level mutáveis** (53× `CURRENT_STORE_ID`).
- **Mocks didáticos** ainda em `components/operacoes/lovable/api/_db.ts` (importa todos os
  SEEDs, mas vendas/clientes/estoque já apontam para Server Actions reais — `_db` é morto
  por inércia).
- **TODOs explícitos**: `app/dashboard/os/{OsPageClient,page}.tsx` + 4 landings + 1 stub
  de auth em `pdv-github-original`. Total: 12 TODOs.
- **`@ts-ignore`**: 2 (ambos em `lib/importador-avancado/parser.ts`, dependência opcional).
- **`console.error` × 177**, **`console.warn` × 43** — espalhados.
- **`localStorage` × 191** — em sua maioria cache válido; auditar caixos críticos.
- **Cores hex/Tailwind brutas em `components/dashboard`** — 47 hits, vários semânticos
  legítimos por CORE_RULES §7.
- **Documentação** com vários reports antigos não revisados (`FINANCEIRO_V2_*_MOCK.md`,
  `AUDITORIA_GERAL_OMNIGESTAO_PRO.md` datado).

---

## 8. Checklist Operacional (para a próxima sprint começar)

- [ ] Rodar `npm run build` em janela limpa (sem `npm run dev` paralelo) para validar
      compilação completa + `prisma generate`.
- [ ] Confirmar que `NEXT_PUBLIC_OG_EXPERIMENTAL` está OFF no `.env.production`.
- [ ] Verificar `AUTH_SECRET`, `NEXTAUTH_URL`, `ADMIN_DEFAULT_PASSWORD` na Vercel.
- [ ] Verificar Stripe (`STRIPE_*`) e WhatsApp (`WHATSAPP_*` + `WHATSAPP_WEBHOOK_STORE_ID`).
- [ ] Smoke `GET /api/stores`, `GET /api/dashboard/elite`, `GET /api/financeiro/receber`
      com header `x-assistec-loja-id` real.
- [ ] Validar UX dos 4 temas (Light, Soft Ice, Midnight, Black) em PDV Clássico,
      Financeiro v2 e Operações v2.
- [ ] Backup do banco antes de qualquer mudança em `prisma/schema.prisma`.
- [ ] Procedimento manual documentado para retry de sangria/suprimento falho.

---

## 9. Plano de Execução por Fases (proposta, sem código por enquanto)

### Sprint 1.2 — Estabilização final de caixa (curta, 1–2 dias)
- Tecla dedicada **Desconto** no PDV Clássico (atalho F-X consistente com Assist/Super).
- Retry exponencial em sangria/suprimento + alerta de divergência ao fechar caixa.
- Mover persistência do título à prazo para dentro da `tx` de `venda-persist`.
- Guard de duplicidade em `/api/ops/caixa/abrir` (já há `SessaoCaixa ABERTA` → 409 com
  retorno do `sessaoId` existente).
- Apagar `services.tsx` morto do Estoque.

### Sprint 2 — Convergência de OS e CRM
- Congelar OS legado: redirecionar `/dashboard/os` → `/dashboard/operacoes-v2` por flag
  com janela de fallback (mesma estratégia de `financeiro/*`).
- "Nova OS" do CRM apontar para v2.
- PDV consumir `?clienteId=` para pré-selecionar cliente.
- Substituir `CURRENT_STORE_ID` module-level por contexto React/Provider isolado.

### Sprint 3 — Auth & Multi-loja real
- Restringir `AccessGate` a `NODE_ENV=development`.
- Wire-up completo `AdminUserStore` ⇄ header `x-assistec-loja-id` ⇄ Sidebar de troca de loja.
- Verificar RBAC server-side em todas as Server Actions (`requireOperacaoAuth` é o padrão).
- Auditoria do Cadastros HUB passar a filtrar por `storeId`.

### Sprint 4 — Limpeza estrutural e dívida técnica
- Mover `components/pdv-github-original/` para `archive/` fora do bundle.
- Reescrever 6 docs `FINANCEIRO_V2_*_MOCK.md` como `*_CHECKIN_REAL.md`.
- Padronizar `console.error/warn` num logger único.
- Consolidar rotas Configurações em uma única árvore.
- Remover `_db.ts` morto em `components/operacoes/lovable/api/`.

### Sprint 5 — Roadmap (Marketplace, Omni Agent, Marketing IA)
- Marketplace: ML/Shopee/Magalu real (gradual, 1 provider por sub-sprint).
- Omni Agent: trilha de execução real + sandbox.
- Marketing IA: governança de créditos (teto por loja, alerta 80%).

### Sprint 6 — WhatsApp produção
- Fila Bull/BullMQ para envios outbound.
- Observabilidade Meta (latência, erros 4xx/5xx, custo por template).
- Aprovação de templates dentro do app.

---

## 10. Recomendação para a Próxima Sprint

**Sprint 1.2 — Estabilização final de caixa** (item 9.1 acima).

Justificativa: o sistema **está operacional**. Os 4 itens dessa sprint são todos
**cirúrgicos**, fecham riscos P0/P1 do caixa que já apareceram em homologação, e não
exigem mudanças de schema, auth ou refator. Resultado: o PDV/Caixa entra em produção real
com **zero pontos abertos de risco financeiro imediato**.

Depois disso, escalar para Sprint 2 (convergência OS/CRM) e Sprint 3 (auth real) antes de
abrir multi-tenant comercial.

---

## 11. O que NÃO mexer agora

- Schema Prisma — qualquer mudança exige migration revisada e backup.
- `auth.ts`, `auth.config.ts`, `proxy.ts` — só na Sprint 3, com plano escrito.
- `lib/financeiro/contracts/local-key.ts` e `lib/financeiro/adapters/os-faturamento.ts`
  — idempotência crítica.
- `components/painel-inicial/AppShell.tsx` — único scroll owner do dashboard.
- PDVs operacionais (Clássico, Assistência, Supermercado) — só mudanças cirúrgicas
  apontadas em Sprint 1.2.

---

**Fim do relatório.**

— Auditoria gerada por Claude (modelo Opus) sem alterar nenhum arquivo de aplicação.
Único arquivo criado: este `docs/ai/AUDITORIA_2026-05-24.md`.
