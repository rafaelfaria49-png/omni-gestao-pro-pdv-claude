# OmniGestão Pro — Estado Atual do Projeto

> Última atualização: 21 Mai 2026 — Sessão: Omni Agent HUB Visual Premium (remoção dados sintéticos, distribuição real, inbox/automações/memória premium)
> Referência rápida para retomar o projeto ou fazer onboarding.

**Memória viva consolidada:**
[`docs/memory/OMNIGESTAO_MASTER_MEMORY.md`](../memory/OMNIGESTAO_MASTER_MEMORY.md)

**Auditoria consolidada:**
[`docs/modules/reports/AUDITORIA_GERAL_OMNIGESTAO_PRO.md`](../modules/reports/AUDITORIA_GERAL_OMNIGESTAO_PRO.md)

---

## ✅ Concluído e Funcionando

### Operações HUB — Adapter OS → Estoque Fase 2 (concluído 21/05/2026)

**Antes:** o adapter `lib/operacoes/adapters/os-estoque.ts` já fazia consumo/restauração/delta real do estoque com transação, idempotência, anti-negativo e ledger profissional (`MovimentacaoEstoque` com `tipo:"saida"`, `origem:"os"`). Mas as movimentações geradas pela OS gravavam `usuario: null`, `documento: null`, `custoUnitario: 0` e `valorTotal: 0` — sem auditoria de quem baixou, sem vínculo humano com a OS e sem valor consumido para KPIs.

**Arquivos alterados:**

| Arquivo | Mudança |
|---|---|
| `lib/operacoes/adapters/os-estoque.ts` | `registrarLedgerOS` recebe `osNumero` e `operador` e grava: `usuario` (do session label), `documento` = número da OS (ex.: `OS-2026-00012`), `motivo` igual ao `documento`, `custoUnitario` = `arredonda2(max(0, precoCusto))` e `valorTotal` = `qtd × custoUnitario`. As três funções públicas (`consumeEstoqueFromOS`, `restoreEstoqueFromOS`, `applyEstoqueDelta`) ganham `operador?: string \| null`, leem `OrdemServico.numero` na mesma transação e repassam ao ledger. `tipo` e `origem` mantidos. |
| `app/actions/operacoes.ts` | `updateOSStatus` e `updateOSPayload` resolvem `getOperatorLabelFromSession(await auth())` uma vez e propagam para as 4 chamadas (1 consume + 2 restore + 1 delta). |

**Campos do `MovimentacaoEstoque` para `origem:"os"`:**

| Campo | Antes | Depois |
|---|---|---|
| `usuario` | `null` | operador NextAuth (`name` ou `email`) |
| `documento` | `null` | `OrdemServico.numero` (fallback `OS {osId}`) |
| `motivo` | `OS {osId}` (cuid) | mesmo do `documento` (número humano) |
| `custoUnitario` | `0` | `precoCusto` atual do produto |
| `valorTotal` | `0` | `qtd × custoUnitario` |

**Validação:** `npx tsc --noEmit` — 0 erros novos nos arquivos modificados. Os 4 erros pré-existentes em `components/omni-agent/OmniAgentHub.tsx` (linhas 732–744, `points`/`heatmap` undefined) eram causados pelas variáveis de gráfico sintético e foram **resolvidos na sessão de refatoração visual de 21/05/2026** (remoção dos `useMemo` com `Math.random()`).

**Comportamento preservado (NÃO alterado):**

- Idempotência (`payload.estoqueConsumido`, `estoqueUltimaRevisaoEm`).
- Validação anti-negativo prévia em transação.
- Best-effort: falhas registram `estoque_sync_erro` na timeline, não quebram a OS.
- `tipo:"saida"` + `origem:"os"` mantidos como par diferenciador (PDV usa `origem:"pdv"`).

**Riscos remanescentes / pendências:**

- Operador pode vir `null` em transições disparadas fora de sessão NextAuth (job interno) — schema aceita; relatórios precisarão tratar.
- Produtos com `precoCusto = 0` (legados GestaoClick) continuarão gerando `valorTotal = 0` até cadastro de custo — não é regressão.
- Movimentos históricos pré-21/05/2026 continuam com campos `null/0` — só novas baixas/restaurações são preenchidas. Backfill opcional fica como próximo passo.
- `registrarLedgerOS` continua silencioso em falha (`console.error`) — endurecer com evento `estoque_ledger_erro` fica para fase futura.

**Próximos passos sugeridos:** F2.4 — evento `estoque_item_ignorado` visível na timeline; F2.5 — defesa em profundidade na idempotência via consulta ao ledger; F2.6 — KPI "valor consumido por OS" agora que `valorTotal` é confiável.

---

### Omni Agent HUB — Refinamento Visual Premium (concluído 21/05/2026)

**Contexto:** backend, Prisma, server actions, automações e lógica de comandos mantidos intactos. Sessão exclusivamente de visual/UX.

**Problema principal:** gráfico SVG "Comandos por hora" e "Mapa de calor (semana)" usavam `Math.random()` em `useMemo` — dados 100% sintéticos apresentados como tendências reais. Quatro erros TypeScript (`points`/`heatmap` undefined) eram consequência direta dessas variáveis.

**Arquivos alterados:**

| Arquivo | Tipo |
|---|---|
| `components/omni-agent/OmniAgentHub.tsx` | Múltiplas edições cirúrgicas (visual/UX) |
| `components/omni-agent/OmniAgentInboxReal.tsx` | Reescrita completa visual (lógica inalterada) |

**Mudanças em `OmniAgentHub.tsx`:**

- **Dados sintéticos removidos:** `useMemo` com `Math.random()` para `hours`, `points` e `heatmap` eliminados
- **Gráfico fake → distribuição real:** card "Comandos por hora" substituído por barras de distribuição por status usando `stats.executed`, `stats.pending`, `stats.awaitingConfirmation`, `stats.error` (dados Prisma reais) com skeleton loading
- **Heatmap aleatório → resumo honesto:** 4 métricas reais (hoje, total histórico, taxa de acerto, pendentes) com skeleton por célula
- **Stat component:** prop `loading` com skeleton animado; prop `accent` para cor semântica por tipo de métrica
- **Header:** ícone `Bot` → `Cpu`; status badge com cor semântica (verde/cinza); notificações com lista scrollável e link "Ver Inbox"; botões `sm:inline-flex`
- **Tabs:** labels `hidden sm:inline`; badges de pendência com formato compacto
- **Feed rows:** borda esquerda `border-l-2` colorida por `badgeKind` (`emerald`/`amber`/`blue`/`destructive`)
- **Último comando:** card com borda colorida e badge de status contextual
- **AutomationsTab:** borda esquerda `emerald` (ativa) / `border` (inativa); badge Ativa/Inativa; template em bloco `bg-muted/50 font-mono`; skeleton de loading; empty state com ícone `Zap`
- **MemoryTab:** avatar de iniciais (2 letras, `rounded-full`) na lista; skeleton de 5 itens; empty state com ícone `Users`
- **ReportsTab:** stat grid com `loading` prop e cores semânticas; barras `rounded-full` com `transition-all duration-500`; cards financeiros com cores por tipo (receita=verde, despesa=vermelho, pend.=âmbar); skeleton do financeiro em vez de texto simples
- **SettingsTab:** audit log com ponto `bg-primary/40` por linha, monospace, hover sutil, container `bg-muted/30`
- **Floating button:** pill com `ring-2`; cor semântica online/pausado; label dinâmico ("X pendentes" / "Online" / "Pausado"); mini-dashboard expandido polido

**Mudanças em `OmniAgentInboxReal.tsx`:**

- **Skeleton loading:** 3 cards animados com avatar, texto e badges
- **Filtros pill:** barra no estilo das Tabs principais; contadores por status integrados ao label
- **Borda esquerda colorida por status:** `amber`=pendente · `blue`=aguardando · `emerald`=executado · `destructive`=erro
- **Ícone semântico por card:** `Clock` (pendente) · `AlertTriangle` (aguardando) · `CheckCircle2` (executado) · `XCircle` (erro)
- **Botão "Executar":** spinner `Loader2` durante processamento; "Recusar" com hover `text-destructive`
- **Confirmação de cliente ambíguo:** container `bg-blue-500/5 border-blue-500/20`
- **Campos interpretados:** label `uppercase tracking-wider`; `sm:grid-cols-2`
- **Resultado:** container `bg-card` com label uppercase
- **Empty state:** ícone `Inbox` centralizado com subtexto orientativo

**Validação:** `npx tsc --noEmit` → **0 erros** (os 4 erros pré-existentes de `points`/`heatmap` foram eliminados junto com as variáveis).

**O que NÃO foi alterado:**
- Prisma, server actions, automações, event bus
- WhatsApp backend, auth, proxy
- Lógica de interpretação de comandos, tipos, APIs
- Mocks de "sugestões" no OverviewTab (cards de ação UI, não dados)
- WhatsAppTab, CommandsTab, NewCommandModal, CommandPalette (sem mudanças visuais além das passadas pelo Stat refatorado)

**Pontos que ainda dependem do backend para evolução futura:**
- Gráfico de comandos por hora: exigiria `OmniAgentHubStatsDTO` com breakdown `por hora`
- Memória operacional / timeline unificada do cliente: fase 3
- Créditos IA / plano no SettingsTab: localStorage local, sem backend

---

### Cadastros HUB > Importação — HUB reestruturado (concluído 21/05/2026)

**Antes:** aba "Importação" do `CadastrosHub` rodava um `ImportFlow` mock (drag&drop fake, mapeamento de colunas fictício, contagens de erro hardcoded) + um modal `Importar planilha` que abria o mesmo mock. O `ImportadorAvancado` real existia mas só era acessível por `Configurações > Importação`. XML NF-e tinha apenas protótipo isolado em `components/dashboard/estoque/gestao-produtos.tsx`. Não havia histórico/auditoria consolidado de lotes de import.

**Arquivos alterados:**

| Arquivo | Mudança |
|---|---|
| `components/cadastros/lovable/components/cadastros/ImportacaoHub.tsx` (NOVO) | HUB 3-blocos: (1) **Planilhas** monta `<ImportadorAvancado />` real dentro de `<AppOpsProviders>`; (2) **XML NF-e** com `DOMParser` cliente lendo `det/prod/xProd/cProd/NCM/CFOP/vUnCom/qCom` — preview de cabeçalho + tabela de itens, banner "Parser experimental — preview apenas, não persiste no banco", botão "Confirmar entrada" desabilitado; (3) **Histórico** consome `listImportacoesAuditoria` com empty state honesto. Header com 3 KPIs clicáveis (Lotes / Última / Registros consolidados) derivados dos logs reais. |
| `components/cadastros/lovable/components/cadastros/CadastrosHub.tsx` | Removidos `ImportFlow` mock e modal `Importar planilha`. Botão "Importar" do header navega para `tab=importacao`. `ImportacaoPanel` agora delega ao `<ImportacaoHub />`. |
| `app/actions/cadastros.ts` | Nova Server Action `listImportacoesAuditoria(limit)` lê `LogsAuditoria` com `action startsWith "import."`. Tipo amigável (Planilhas / XML NF-e / Outro), totais, batchId, duração, porDominio, status (ok/erro). Sem schema novo — usa o modelo existente. |
| `app/api/import/advanced/route.ts` | Best-effort `prisma.logsAuditoria.create` ao final de cada batch: `action: "import.planilha"` (ou `.erro`), `source: "importador_avancado"`, `metadata` JSON com `batchId`, `storeId`, `duracaoMs`, `totais`, `porDominio`, `arquivos`. `requireSubscription` agora devolve `userLabel` para logar quem importou. |

**Status real vs placeholder:**

| Bloco | Status |
|---|---|
| Planilhas (CSV/XLSX/ZIP GestaoClick) | ✅ Real — reaproveita `ImportadorAvancado` intacto |
| Histórico de lotes (data, usuário, totais, duração, batchId, porDominio) | ✅ Real — gravação a partir desta sessão; lotes pré-21/05/2026 não aparecem |
| KPIs do header (Lotes / Última / Registros) | ✅ Real — calculados sobre `LogsAuditoria` |
| XML NF-e — preview cliente (cabeçalho + itens) | ✅ Real (preview-only) |
| XML NF-e — gravação de estoque/fornecedor/preço | ⚠️ Placeholder honesto: banner explícito, botão desabilitado, card "Planejado" / "Fora deste fluxo" |

**Validação:** `npx tsc --noEmit` EXIT 0 · `npm run build` Compiled successfully in 35.2s.

**Pendências:**
- Backend fiscal definitivo (entrada estoque por NF-e, vínculo fornecedor por CNPJ, atualização preço custo + NCM/CFOP, lançamento financeiro automático, integração SEFAZ) — fora de escopo desta sessão.
- Lotes importados antes de 21/05/2026 não constam no Histórico (o gancho de auditoria foi adicionado nesta sessão).

---

### Financeiro HUB V2 — aba "A Pagar" plugada em dados reais (concluído 20/05/2026)

**Antes:** `/api/financeiro/pagar` retornava `rows[]` apenas com `id, descricao, fornecedor, valor, vencimento, status`. `fornecedorFromPayload` fazia fallback para a string `"Fornecedor"` (mock falso). `normalizePagarRows` ignorava `descricao` e `parcela`; UI mostrava `id` cru ("imp-gc:loja-1:cp:funcionario:…").

**Arquivos alterados:**

| Arquivo | Mudança |
|---|---|
| `app/api/financeiro/pagar/route.ts` | Helper `pickStringFromPayload`/`parcelaLabelFromPayload`. `rows[]` (e detalhe via `?localKey=`) agora inclui `categoria` (payload.planoContas), `formaPagamento`, `contaBancaria`, `observacao`, `parcela: "N/M"`. `fornecedorFromPayload` deixou de retornar "Fornecedor" como fallback — devolve string vazia, UI decide o "—". |
| `components/financeiro/lovable/context/FinanceiroRealContext.tsx` | Tipo `ContaPagar` ganha `descricao`, `categoria`, `parcela`, `formaPagamento`, `contaBancaria`, `observacao`. `normalizePagarRows` propaga todos os campos sem fallback enganoso (vazio fica vazio). |
| `components/financeiro/lovable/routes/financeiro.tsx` | Aba "A Pagar": coluna `Doc.` → `Título` exibindo `descricao` (truncate + tooltip), novas colunas `Categoria` e `Parcela`, sub-texto "saldo R$ X" em Pago quando parcial, empty state honesto (mensagem diferente para "sem dados na loja" vs "filtro vazio"), vencimento "—" quando vazio. `handleDuplicar` agora propaga `descricao` e `categoria`. |

**Validação (5 exemplos reais):**

- **ALUGUEL IMOVEL** — vencido · R$ 1.950,00 · venc 10/04/2026 · categoria Aluguel · fornecedor "—" (vazio na planilha)
- **FUNCIONARIO** — 4 parcelas: 1/4 R$ 600 (vencido, 07/04, 13º salário) · 2/4 R$ 400 (pendente, 20/04, VALE) · 3/4 e 4/4 R$ 600 (pendentes, 07/05, PAGAMENTO)
- **WORD CELL PRIME** — 3 parcelas pagas (R$ 110 + R$ 195,25 + R$ 215), fornecedor "WORD CELL PRIME", categoria Compras
- **PLANETA CELULARES** — 2 parcelas pagas via PIX (R$ 310 + R$ 138), fornecedor "PLANETA CELULARES", categoria Compras
- **Fechamento de caixa** — 22 registros preservados (RAFAEL FARIA DE LIMA / Ajuste de caixa)

**Summary (KPIs aba A Pagar):**

| Estado | Qtd | Valor |
|---|---|---|
| Pago | 31 | R$ 10.984,17 |
| Vencido | 4 | R$ 2.804,05 |
| Pendente | 3 | R$ 1.600,00 |
| **Total** | **38** | **R$ 15.388,22** ✓ |

Bate exatamente com a expectativa indicada pelo usuário (~R$ 15.388,22).

**Limitações restantes da aba A Pagar:**

- KPIs específicos da aba A Pagar (cards no topo da aba) ainda não foram adicionados — Visão Geral já tem `StatCard "A pagar"` consumindo `summaryP.totalAberto`. Adicionar bloco de KPIs dentro de `ContasPagar()` seria escopo de UX, não foi pedido.
- `HistoricoPagarModal` busca `payload.historico` via `?localKey=` (já retorna corretamente o pagamento gravado pelo importador), mas renderização do histórico continua simples.
- Modais (`PagarContaModal`, `EstornoPagarModal`) usam `conta.id` (localKey) no título — visualmente longo mas funcional.
- Forma de pagamento e Conta bancária estão no contexto/modelo mas não foram expostas como colunas visíveis na tabela (decisão de manter visual atual de 7 colunas).

---

### Financeiro HUB V2 — aba "A Receber" plugada em dados reais (concluído 20/05/2026)

**Antes:** o `FinanceiroRealContext` já consumia `/api/financeiro/receber` mas perdia informação no caminho: `parcela` hardcoded `"1/1"`, `descricao` não chegava ao tipo `ContaReceber`, coluna "Título" da tabela mostrava o `localKey` cru (ex.: `imp-gc:loja-1:cr:venda-de-no-131:cleiton-…:2026-02-21:20000:1`).

**Arquivos alterados:**

| Arquivo | Mudança |
|---|---|
| `app/api/financeiro/receber/route.ts` | `rows[]` agora inclui `descricao` (já existia) e `parcela` (extraída de `payload.parcela.{numero,total}` → `"N/M"`). Mantém compatibilidade com clientes antigos do endpoint (campos novos, nenhum removido). |
| `components/financeiro/lovable/context/FinanceiroRealContext.tsx` | Tipo `ContaReceber` ganha `descricao: string`. `normalizeReceberRows` usa `parcela` real do endpoint (sem fallback `"1/1"`) e preserva `descricao` para a UI. |
| `components/financeiro/lovable/routes/financeiro.tsx` | Coluna "Título" da tabela "A Receber" mostra `descricao` (ex.: "Venda de nº 131 (1/5)") com fallback monoespaçado para `id` quando descrição vazia. Coluna "Recebido" agora exibe sub-texto "saldo R$ X" quando há recebimento parcial. Vencimento exibe "—" se vazio. |

**Validação (Venda 131 / CLEITON):**

```
Título                    Cliente                    Parcela Venc.       Status    Valor       Recebido    Saldo
Venda de nº 131 (1/5)     CLEITON RICARDO SIQUEIRA   1/5     2026-02-21  pago      R$ 200,00   R$ 200,00   R$ 0,00
Venda de nº 131 (2/5)     CLEITON RICARDO SIQUEIRA   2/5     2026-03-23  pago      R$ 272,50   R$ 272,50   R$ 0,00
Venda de nº 131 (3/5)     CLEITON RICARDO SIQUEIRA   3/5     2026-04-22  pendente  R$ 272,50   R$ 0,00     R$ 272,50
Venda de nº 131 (4/5)     CLEITON RICARDO SIQUEIRA   4/5     2026-05-22  pendente  R$ 272,50   R$ 0,00     R$ 272,50
Venda de nº 131 (5/5)     CLEITON RICARDO SIQUEIRA   5/5     2026-06-21  pendente  R$ 272,50   R$ 0,00     R$ 272,50
```

KPIs reais já em funcionamento desde antes desta sessão (`fluxoCaixa`, `summaryR`, `summaryP` consumidos pelos `StatCard` da Visão Geral e da aba Fluxo) — apenas refletem agora os 307 títulos preservados pelo importador.

**Limitações restantes do Financeiro HUB V2:**

- HistoricoModal já chama `/api/financeiro/receber?localKey=...` que retorna `payload.historico` — entrada `tipo: "pagamento"` gravada pelo importador (Confirmado) aparece ali, mas o modal renderiza só genéricos; refinamento de UI do histórico ainda não foi feito.
- Renegociação (`RenegociarModal`) continua placeholder ("em preparação") — sem backend.
- "Recibo" é gerado client-side a partir do `id` do título — usa `localKey` cru.
- Aba **A Pagar** segue o mesmo fluxo `FinanceiroRealContext`/`normalizePagarRows`, mas `parcela` ainda não foi exposta (importador já grava `payload.parcela` para pagar — plug é simétrico, só não aplicado nesta sessão por escopo).
- Carteiras, DRE, Conciliação, Fechamento, Relatórios continuam reais via seus próprios endpoints — não tocados.

---

### Importador GestaoClick — contas_receber/pagar com parcelas (concluído 20/05/2026)

**Bug original:** Vendas parceladas chegavam ao Financeiro HUB com apenas 1 parcela. Ex.: Venda nº 131 / CLEITON RICARDO SIQUEIRA tinha 5 parcelas na planilha mas o banco guardava só 1 (a última, R$ 272,50 não pago).

**Causa raiz (4 problemas independentes):**

1. **`localKey` colidia** — `chaveJoin` de contas_receber apontava para `financeiro.descricao`. Como todas as 5 parcelas têm a mesma descrição ("Venda de nº 131"), `localKey = imp-${storeId}-${chave}` era idêntica, e `upsertContaReceber` sobrescrevia cada parcela na mesma row.
2. **Valor sempre = 0** — colunas reais do GestaoClick são `Plano de contas_3` / `Plano de contas_8` (pivot ofuscado), não mapeadas no dicionário.
3. **Vencimento sempre vazio** — coluna real é `Plano de contas_9`, também não mapeada.
4. **Status nunca casava** — `"Confirmado"` (294 linhas) e `"Não Pago"` (6 linhas) não estavam em `RECEBER_ALIASES`; quase tudo caía em `pendente` por fallback.

**Arquivos alterados:**

| Arquivo | Mudança |
|---|---|
| `lib/importador-avancado/merger.ts` | Novo helper `extrairPerfilGestaoClick` reconhece o pivot `Plano de contas_1..9` e mapeia entidade/valor/vencimento. Novo `mapearStatusReceberCanon`: `Confirmado→pago`, `Não Pago→pendente`, `Atrasado→vencido`, etc. `extrairCamposContaReceber`/`Pagar` retornam status canônico + `valorPago` + `dataConfirmacao` + `statusOriginal`. Prioriza `_raw` para descrições (evita `normalizarLinha` converter "Venda de nº 131" → `131`). |
| `lib/importador-avancado/persistidor.ts` | `persistirContasReceber`/`Pagar` agora: (a) pré-extrai todos os registros e numera parcelas N/M via `indexarParcelas` (agrupa por descrição+entidade, ordena por vencimento); (b) gera `localKey` única por parcela: `imp-gc:{storeId}:cr:{slugDesc}:{slugCli}:{venc}:{valorCents}:{n}`; (c) registra histórico de pagamento quando `status=pago`; (d) usa `replacePayload: true` para idempotência em re-importação. |

**Resultado pós-fix (re-import da planilha real, 307 linhas):**

- Venda 131 / CLEITON: **5 parcelas** corretas (1/5 R$ 200 pago, 2/5 R$ 272,50 pago, 3/5–5/5 R$ 272,50 pendente)
- Outras vendas parceladas: 14 grupos com ≥2 parcelas preservados
- Distribuição: 294 pago (R$ 17.989,41) · 7 vencido (R$ 2.124,99) · 6 pendente (R$ 1.522,49)
- Re-importação idempotente: mesma `localKey` → upsert no mesmo título, sem duplicar histórico

**Script auxiliar:** `scripts/reimport-contas-receber.ts` — re-roda o pipeline completo via CLI (`npx tsx scripts/reimport-contas-receber.ts <xlsx>`); limpa títulos com prefixos `imp-loja-1-` (legado) e `imp-gc:{storeId}:cr/cp:` antes de re-importar.

---

### Cadastros HUB — UX Clientes + Vínculo Venda→Cliente (concluído 19/05/2026)

#### UX Clientes (Fase 4)

**Arquivo principal:** `components/cadastros/lovable/components/cadastros/CadastrosHub.tsx`

- **Modal PF/PJ:** Select de tipo controlado; ao mudar PF↔PJ o campo de documento é limpo e a label/placeholder mudam dinamicamente (`CPF 000.000.000-00` / `CNPJ 00.000.000/0000-00`); máscara aplicada em tempo real
- **Botões da tabela:** Eye/Wrench/ShoppingCart desabilitados com `opacity-40 cursor-not-allowed` e tooltip "em breve"; Editar funciona; WhatsApp abre `wa.me` se cliente tiver telefone, desabilitado se não tiver
- **Total gasto real:** calcula em tempo real via aggregate Prisma (OS + Venda por clienteId); fallback para `Cliente.totalSpent` se DB falhar

#### Vínculo Venda → Cliente (FK real no banco)

**Schema alterado:**

| Model | Mudança |
|---|---|
| `Venda` | + `clienteId String?` + `cliente Cliente? @relation(onDelete: SetNull)` + `@@index([clienteId])` |
| `Cliente` | + `vendas Venda[]` |

**Arquivos alterados:**

| Arquivo | Mudança |
|---|---|
| `lib/operations-sale-types.ts` | `SaleRecord` + `clienteId?: string` |
| `lib/ops-upsert-venda.ts` | `SalePayload` + `clienteId`; upsert persiste no banco |
| `lib/operations-store.tsx` | `finalizeSaleTransaction` aceita + propaga `clienteId` |
| `venda-completa-enterprise.tsx` | passa `clienteId: selectedCliente.id` |
| `pdv-venda-completa-enterprise.tsx` | passa `clienteId: selectedCliente?.id` |
| `pdv-assistencia-enterprise.tsx` | passa `clienteId: selectedClienteId ?? undefined` |
| `pdv-classic.tsx` | passa `clienteId: selectedCustomer?.id` |

**Regra de totalGasto:**
```
totalGasto = SUM(OS.valorTotal WHERE status IN [Pronto, Entregue] AND clienteId = c.id)
           + SUM(Venda.total WHERE status = "concluida" AND clienteId = c.id)
```

**Backfill:** `run-backfill-venda-cliente.mjs` (match por doc/telefone normalizado, nunca por nome).
- 245 vendas GestaoClick não têm `payload.enterprise` → ficam `clienteId = null`
- Futuras vendas PDV Enterprise são vinculadas em tempo real

**`pdv-supermercado.tsx`** e consumidor final: `clienteId = null`, comportamento inalterado.

---

### Governança IA — sincronização canonical (concluído 19/05/2026)

- **`CLAUDE.md`** atualizado com bloco de governança obrigatória no topo (ler antes de qualquer tarefa)
- **`.cursor/rules/omnigestao.mdc`** criado — regras carregadas automaticamente pelo Cursor em toda sessão (`alwaysApply: true`)
- **`docs/skills/`** criado com estrutura canônica:
  - `INDEX.md` — índice de governança
  - `rules/CORE_RULES.md` — regras globais
  - `rules/DELIVERY_CHECKLIST.md` — checklist de encerramento
  - `rules/AI_WORKFLOW.md` — papéis Sonnet vs Opus, contexto, GitHub
  - `rules/FRONTEND_IMPORT_RULES.md` — regras de importação de UI externa

---

### Cadastros HUB — Fase 1+2+3 (concluído 19/05/2026)

**Arquivo:** `components/cadastros/lovable/components/cadastros/CadastrosHub.tsx`

- **Fase 1 (busca clientes):** state `filterQuery` controlado, `visibleRows` com filtro nome/telefone/documento/cidade, contador atualizado, busca funciona desde o 1º caractere
- **Fase 2 (visual inputs):** campo de pesquisa da Toolbar trocado de `bg-card` para `bg-background` — texto visível em todos os temas
- **Fase 3 (performance):** separados `refreshRows` (rápido, bloqueia só tabela) e `refreshAlerts` (lento, silencioso) — busca responsiva imediatamente, alertas carregam em paralelo sem travar a lista

---

### PDV Next / Black Edition — 4º PDV (concluído 19/05/2026)

**Rota:** `/dashboard/pdv-next`
**Galeria:** `Configurações > PDV` → 4 cards na grade "Fluxos principais"

#### Arquivos criados

| Arquivo | Descrição |
|---------|-----------|
| `components/pdv-next/PdvBlackShell.tsx` | Shell visual Black Edition isolado — sempre preto, sem dependência de `useStudioTheme`. Header operacional: loja, caixa aberto/fechado, operador, cupom, relógio, status online. Tabela de itens, sidebar (total emerald, cliente, NF-e), barra F1–F9 |
| `components/pdv-next/PdvBlackEdition.tsx` | Controller: carrinho, catálogo real (`mergePdvCatalogWithInventory`), busca de clientes real (`useClienteSearch`), caixa (`useCaixa`), atalhos globais F1–F9, `PaymentModal` |
| `app/dashboard/pdv-next/page.tsx` | Rota Next.js com Suspense |

#### Arquivos modificados

| Arquivo | Mudança |
|---------|---------|
| `app/dashboard/layout.tsx` | `isVendas` inclui `/dashboard/pdv-next` (noPadding + flex-1) |
| `components/configuracoes-v3/features/settings/sections/PdvSection.tsx` | 4º card com preview black/emerald, badge Beta, link direto para `/dashboard/pdv-next` |

#### Status real vs mock

| Funcionalidade | Status |
|----------------|--------|
| Produtos do inventário (ao vivo) | ✅ Real |
| Busca de clientes (F2) via API | ✅ Real |
| Status caixa aberto/fechado | ✅ Real |
| Nome da loja e operador | ✅ Real |
| Atalhos F1–F9 (teclado global) | ✅ Real |
| Bipe/scan de produto (Enter) | ✅ Real |
| CaixaStatusBar (abertura/fechamento) | ✅ Real |
| Pagamento (PaymentModal) | ⚠️ Mock — abre o modal, limpa carrinho, **não persiste venda no banco** |
| Documento fiscal (NF-e) | ⚠️ Mock — placeholder "NF-e — mock" |

#### PDVs preservados (sem alteração)

| PDV | Rota | Status |
|-----|------|--------|
| PDV Clássico/Omni | `/dashboard/vendas` | ✅ Intocado |
| PDV Assistência | `/dashboard/vendas` (services layout) | ✅ Intocado |
| PDV Supermercado | `/dashboard/vendas` (supermercado layout) | ✅ Intocado |
| **PDV Next / Black Edition** | `/dashboard/pdv-next` | ✅ **Novo — isolado** |

---

### Importador Avançado — GestaoClick (concluído 17/05/2026)

**Commit 1** — `lib/importador-avancado/` (6 arquivos):
- `types.ts`, `detector.ts`, `merger.ts`, `parser.ts`, `persistidor.ts`, `index.ts`

**Commit 2** — `app/api/import/advanced/route.ts`:
- `GET /api/import/advanced` → capabilities (formatos, domínios, limites)
- `POST /api/import/advanced?modo=preview` → planilhasDetectadas, grupos, confiança
- `POST /api/import/advanced?modo=importar` → { batchId, totais, porDominio, errosDetalhados, duracaoMs }
- Auth via NextAuth v5 + fallback cookie legado
- Suporte a ZIP do GestaoClick (adm-zip + jszip instalados)

**Commit 3** — UI do Importador Avançado:
- `components/dashboard/configuracoes/importador-avancado/hooks/use-importador-avancado.ts` — engine completa (upload, preview, import, estado em máquina de fases)
- `UploadZone.tsx` — drag & drop multi-arquivo, aceita ZIP
- `PreviewCruzamento.tsx` — lista planilhas com barra de confiança, amostra colapsável, botão Importar tudo
- `LogAuditoria.tsx` — resultado pós-import agrupado por domínio, batchId copiável, erros detalhados
- `ImportadorAvancado.tsx` — orquestrador (UploadZone → PreviewCruzamento → BarraProgresso → LogAuditoria)

**Integração:**
- `components/configuracoes-v3/features/settings/sections/ImportacaoSection.tsx` substituído por switcher de 2 cards (padrão PdvSection):
  - "Importação Universal" → `<ImportadorDadosExternos />` (legado, default)
  - "Importação Avançada" → `<ImportadorAvancado />`
  - Modo persistido em `localStorage["@omnigestao:importacao-modo"]`

**Dependências instaladas:**
- `adm-zip@^0.5.17`, `jszip@^3.10.1` (runtime — ZIP do GestaoClick)
- `@types/adm-zip` (devDependencies)

**Resultado de importação real (ZIP GestaoClick, 17/05/2026):**
- 17/17 arquivos detectados com domínio correto e confiança ≥70%
- Log do import reportou: ~555 criados / 2 atualizados / 13 ignorados / 0 erros (~53s) — *não reconferido nesta sessão*
- Estado do banco verificado após o import: Clientes 40 ✅ | Fornecedores 15 (tabela própria) ✅ | Produtos 231 ✅ | OS 34 ✅ | Vendas 245 ✅
- servicos_catalogo: ignorado (modelo próprio pendente)
- contas_pagar/receber: detectadas mas não persistidas (Fix futuro)

---

### Fixes aplicados (detector, parser, persistidor, hydration)

| Fix | Arquivo | O que fez |
|---|---|---|
| Fix 1 | deps | `npm install adm-zip jszip` |
| Fix 2 | `detector.ts` | Dicionário calibrado com headers reais GestaoClick (`"n da os"→os.numero`, `"nome"→cliente.nome`, etc.) |
| Fix 3 | `parser.ts` | Removido branch ExcelJS (não instalado → derrubava compilação da rota) |
| Fix 4 | `detector.ts` | `"n do pedido"→venda.numero`; reordenação de assinaturas (sub-domínios de vendas e `fornecedores_enderecos` antes dos genéricos); `clientes` passa a exigir `tipoPessoa` |
| Fix 5 | — | Não houve um Fix 5 isolado nesta sessão — o ajuste de `clientes_enderecos` foi incorporado ao Fix 6 |
| Fix 6 | `detector.ts` | `nomeNorm.includes(norm(n))` — normaliza entradas de `nomesArquivo` antes de comparar (underscore virava espaço e nunca casava); `clientes_enderecos.nomesArquivo` restrito |
| Fix 7 | `persistidor.ts` | Clientes: grava `document`, `kind`, `city`, `active`; Produtos: grava `barcode`, `brand`, SKU sintético anti-colisão; OS: match 4 camadas (doc→mapa→doc banco→nome banco) |
| Fix 8 | `use-importador-avancado.ts` | Hook lê `planilhasDetectadas` do response (backend) e preenche também `planilhas` (compatibilidade componentes) |
| Fix 9 | `route.ts` | Lê `modo` do query string (`?modo=importar`) e não só do FormData — era a causa de NUNCA persistir |
| Fix 10 | `persistidor.ts` | Fornecedores persistem na tabela `Fornecedor` (não mais em `Cliente`); `servicos_catalogo` marcado como ignorado; OS ganha 5ª camada de match (contains da 1ª palavra) |
| Fix 11 | `app/api/ops/ordens/route.ts` | GET usa `hydrateOSRows` com `include: { cliente, garantiasOperacionais }` em vez de devolver `r.payload` cru |
| Fix 12 | `app/actions/ordens.ts` | `findMany` inclui `cliente`; `DbOrdemRow` tipado com `cliente?`; `mapRows` propaga `{ id, nome }` |
| Fix 13 | `lib/operacoes/services/hydration-service.ts` | `PrismaOSRow` aceita `cliente?` (nome opcional); `applyPrismaEnrichment` propaga nome real do cliente (FK) quando payload tem `"—"` |

---

### Operações HUB — dados reais via Prisma (concluído 17/05/2026)

- **Kanban** mostra nome do cliente, defeito e valor nos cards ✅
- **Detalhe da OS** mostra `CLIENTE: LARISSA SOARES` (FK real) ✅
- **Histórico de clientes** vincula OS corretamente ✅
- Pipeline de status funcional (Aberto → Diagnóstico → Aprovado → etc.)
- `osStore` → `osApi.listOrdens` → Server Action `listOrdens` → `hydrateOSRows` → Kanban

**Arquivos principais da cadeia:**
```
components/operacoes/lovable/store/osStore.tsx
components/operacoes/lovable/api/os.ts  → listOrdens → listOrdensPrisma
app/actions/ordens.ts                   → findMany + include cliente + hydrateOSRows
lib/operacoes/services/hydration-service.ts  → applyPrismaEnrichment (propaga cliente real)
components/operacoes/lovable/components/operacoes/OSCard.tsx
```

---

### Hubs Visuais (mantidos da versão anterior)

- **WhatsApp HUB** — dados reais via Prisma, Meta Cloud API real, webhook HMAC, automações
- **PDV** — Assistência, Rápido, Completo; busca por SKU/EAN/nome; layout fixo sem scroll global
- **Cadastros HUB** — Clientes (UX completa: modal PF/PJ com máscara, botões corrigidos, totalGasto real OS+Venda), Produtos, Fornecedores com dados reais
- **Financeiro** — contas a pagar/receber com service Prisma (sem plug na UI visual ainda)

### Sistema de Temas
- 4 temas: Light, Soft Ice, Midnight, Black Edition
- Sincronização bidirecional Hub ↔ Global
- Tokens semânticos globais (bg-background, bg-card, text-foreground, etc.)

---

## 🔄 Em Andamento

| Item | Situação |
|---|---|
| **PDV Black Edition — persistência de vendas** | `PdvBlackEdition.tsx`: `handlePaymentConfirm` limpa carrinho localmente. Próximo passo: plugar `adicionarEntrada(useCaixa)` + criar venda no banco (Server Action `registrarVendaPDV`) |
| Equipamento no card Kanban | `os.equipamento` chega como string `"MOTOROLA MOTO EDGE 30"` — card exibe `—` na linha de marca/modelo. Fix pendente: `hydration-service` ler `payload.aparelho.{tipo,marca,modelo}` |
| servicos_catalogo (12 serviços) | Detectados mas ignorados — aguarda model `Servico` próprio no Prisma |
| contas_pagar / contas_receber — UI Financeiro V2 | **Persistência real OK** (importador GestaoClick com parcelas, fix 20/05/2026). Falta plugar o HUB V2 Lovable em `lib/financeiro/services/` — UI ainda mostra mocks |
| Fornecedores endereços | `fornecedores_enderecos.xlsx` (1 linha) importado mas sem modelo de endereço de fornecedor |
| Editar cliente/técnico na OS via UI | Botão "Vincular cliente" não existe ainda na tela de detalhe da OS |
| Relatórios de vendas a prazo | Vendas importadas existem no banco mas Relatórios HUB não as exibe ainda |

---

## 🔜 Próximos Passos (Backlog Priorizado)

### P0 — Crítico (bloqueia uso em produção)

- [ ] **Fix equipamento no card Kanban** — `hydration-service.ts`: ler `payload.aparelho.{tipo,marca,modelo}` quando `os.equipamento` é string plana
- [ ] **Vincular cliente na OS via UI** — botão inline na tela de detalhe para buscar e selecionar cliente
- [ ] **Atribuir técnico na OS via UI** — select de técnicos na tela de detalhe

### P1 — Importante

- [ ] **PDV Black Edition — persistir vendas** — `PdvBlackEdition.tsx`: plugar `adicionarEntrada` + Server Action `registrarVendaPDV`; rota `/dashboard/pdv-next` já existe, motor de carrinho já funciona
- [x] ~~**Persistir contas_pagar/contas_receber no importador**~~ — concluído 20/05/2026, com parcelamento idempotente e mapeamento GestaoClick
- [ ] **Persistir servicos_catalogo** — criar model `Servico` ou reutilizar `Produto` com `type="servico"`
- [ ] **Relatórios de vendas** — exibir vendas importadas (245 no banco) no Relatórios HUB
- [ ] **Vendas a prazo** — listar no módulo Financeiro HUB (contas a receber vinculadas)

### P2 — Qualidade

- [ ] **Label de domínio no PreviewCruzamento** — planilhas sem domínio mostrado (ex: `clientes_enderecos`, sub-domínios OS) ficam sem label no card
- [ ] **Dedup de clientes** — homônimos (SOLANGE × SOLANGE SOL COXINHA, MICHEL × MICHEL DOUGLAS) não são mesclados; match só por doc exato
- [ ] **Normalização de telefone** — `149981153484` vs `(14)99...` inconsistente na importação
- [ ] **Histórico de clientes** — exibir vendas além das OS (hoje só OS aparecem)

### P3 — Expansão

- [ ] Marketplace HUB
- [ ] Sistema de mídia para OS (upload de fotos/anexos)
- [ ] Marketing IA com dados reais
- [ ] Financeiro HUB — fechamento de caixa, conciliação

---

## ⚠️ Atenção ao Retomar

1. **Sempre rodar `npx tsc --noEmit`** antes de commitar — zero tolerância
2. **Sempre ler `docs/skills/rules/CORE_RULES.md`** antes de qualquer tarefa (governança obrigatória)
3. **PDV Black Edition** — pagamento **não persiste** no banco ainda. `handlePaymentConfirm` em `PdvBlackEdition.tsx` apenas limpa o carrinho localmente. NÃO apresente como real ao usuário final.
4. **Galeria PDV** — agora com 4 cards em `PdvSection.tsx` (grid `lg:grid-cols-4`). O 4º card usa `href` direto para `/dashboard/pdv-next`, não usa o mecanismo de `draftFlow`.
5. **Operações HUB usa dados REAIS via Prisma** (não mais mock) desde 17/05/2026
6. **Importador Avançado** — endpoint `POST /api/import/advanced` lê `modo` do **query string** (`?modo=preview` / `?modo=importar`), não do FormData
7. **GestaoClick ZIP** — todos os 17 arquivos detectam corretamente (Fix 6: `norm()` aplicado também nos `nomesArquivo`)
8. **Não tocar**: `auth.ts`, `proxy.ts`, `schema.prisma`
9. WhatsApp envio usa Meta Cloud API real (requer ENVs configuradas)
10. A rota `/dashboard/os` (legado) continua em paralelo ao `/dashboard/operacoes-v2`

---

## 📁 Arquivos-chave desta sessão

```
lib/importador-avancado/
├── types.ts
├── detector.ts          ← calibrado com headers reais GestaoClick
├── merger.ts
├── parser.ts            ← sem ExcelJS (Fix 3)
├── persistidor.ts       ← campos completos (Fix 7, 10)
└── index.ts

app/api/import/advanced/route.ts   ← lê modo do query string (Fix 9)
app/actions/ordens.ts              ← include cliente no findMany (Fix 12)
lib/operacoes/services/hydration-service.ts  ← propaga cliente FK (Fix 13)

components/dashboard/configuracoes/importador-avancado/
├── hooks/use-importador-avancado.ts   ← lê planilhasDetectadas (Fix 8)
├── UploadZone.tsx
├── PreviewCruzamento.tsx
├── LogAuditoria.tsx
└── ImportadorAvancado.tsx

components/configuracoes-v3/features/settings/sections/ImportacaoSection.tsx
```

---

## 📊 Estado do Banco (loja-1) após importação de 17/05/2026

| Modelo | Total | Observação |
|---|---|---|
| Cliente | 40 | Todos do `clientes.xlsx` GestaoClick |
| Produto | 231 | `produtos.xlsx` GestaoClick |
| OrdemServico | 34 | `ordens_servicos*.xlsx` GestaoClick |
| Venda | 245 | `vendas*.xlsx` GestaoClick |
| Fornecedor | 15 | `fornecedores.xlsx` (import 17/05) + eventuais legados — tabela `Fornecedor` não foi limpa antes do re-import |
| ContaReceberTitulo | 0 | Detectada, não persistida |
| ContaPagarTitulo | 0 | Detectada, não persistida |

> Contagens verificadas via Prisma em 17/05/2026 (`storeId: loja-1`).
