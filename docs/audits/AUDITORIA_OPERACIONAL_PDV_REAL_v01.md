# AUDITORIA OPERACIONAL PDV + WORKSPACE DE CORREÇÃO — v01

> **GOAL:** `GOAL_AUDITORIA_OPERACIONAL_PDV_REAL_V01`
> **Modo:** READ ONLY — nenhum código alterado, nenhum commit, nenhum push. Único arquivo criado: este documento.
> **Data:** 2026-06-17 · **Branch:** `main` · **Autor:** Claude Code (Opus)
> **Escopo:** todos os PDVs ativos, fluxo real de venda, caixa, Conta a Receber, estoque, Workspace de Correção (F1→F4), UX operacional, PWA/offline, segurança e prontidão fiscal.

---

## 1. Resumo executivo

O núcleo transacional do PDV está **saudável e maduro**. Existe **um único motor de venda compartilhado** (`finalizeSaleTransaction` em `lib/operations-store.tsx` → `POST /api/ops/venda-persist` → `upsertVendaInTransaction` em `lib/ops-upsert-venda.ts`) usado por **todos os 5 PDVs**, com:

- baixa de estoque **atômica anti-negativa** (`updateMany where stock >= qty`),
- **idempotência** por `documento = pedidoId` (estoque) e por `localKey` (à prazo),
- split correto **caixa à vista × Conta a Receber** (à prazo nunca entra como dinheiro),
- offline-first com fila local e reenvio (`syncPending`).

O **Workspace de Correção de Venda** está **completo e editável** (9 abas, F1–F4): produtos/estoque, pagamento, cliente, Conta a Receber, reparcelamento e metadados de item — todos com **motivo + PIN de supervisor + trilha de auditoria** (`payload.correcoes[]`) e **pré-visualização antes/depois**, reaproveitando os mesmos planners puros no cliente e no servidor.

**Não há P0 de "venda perdida".** Foram encontrados achados financeiros e de governança que merecem atenção antes do fiscal:

| Sev | Qtd | Destaques |
|-----|-----|-----------|
| **P0** | 1 (condicional) | `creditoVale` é somado como receita à vista na `MovimentacaoFinanceira(origem:"venda")` da venda original, mas a correção de pagamento o **exclui** → a **mesma venda** reporta faturamento diferente antes/depois de uma correção. Não afeta a gaveta física, mas distorce "Total de Vendas / Recebido à vista". |
| **P1** | 3 | PIN de supervisor **não é escopado por loja**; rotas de correção **não enforçam sessão/permissão/assinatura** (diferente de `cancelar`); correção de itens **bloqueia** vendas com à prazo/vale. |
| **P2** | 6 | badge "Somente leitura (F1)" desatualizado no Workspace; cupom térmico sem operador/cliente/pagamento (auditoria anterior); modal antigo "Corrigir venda" redundante com o Workspace; correção de observação sem PIN; `no_change` retorna toast de erro; PDV Next ainda referencia motor mas segue bloqueado por flag. |
| **P3** | 3 | arquivo órfão `pdv-venda-completa-enterprise.tsx` (1500 linhas, duplica `VendaCompletaEnterprise`); matriz de atalhos de teclado divergente entre PDVs; textos/UX de acabamento. |

---

## 2. Matriz dos PDVs

| # | PDV | Componente principal | Rota | Ativo em prod | Motor compartilhado | Caixa real | Pagto enterprise | Busca nova | Cupom | Offline/sync |
|---|-----|----------------------|------|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| 1 | **Assistência** | `components/dashboard/vendas/pdv-assistencia-enterprise.tsx` | variante do hub de Vendas (`/dashboard/vendas`) | ✅ | ✅ | ✅ | ✅ (modal local de ~570 linhas removido — usa o compartilhado) | ✅ `scorePdvSearch` | ✅ | ✅ |
| 2 | **Clássico** | `pdv-classic.tsx` + shell `pdv-omni-classic-shell.tsx` | variante do hub de Vendas | ✅ | ✅ | ✅ | ✅ + layout 2-col opt-in | ✅ + **F3 tabela** (exclusivo) | ✅ | ✅ |
| 3 | **Supermercado** | `pdv-supermercado.tsx` | variante do hub de Vendas | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| 4 | **Venda Completa** | `venda-completa-enterprise.tsx` (via `venda-completa-page-client.tsx`) | `/dashboard/vendas/venda-completa` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| 5 | **PDV Next / Black Edition** | `components/pdv-next/PdvBlackEdition.tsx` + `PdvBlackShell.tsx` | `/dashboard/pdv-next` | ⛔ **BLOQUEADO por flag** | ✅ (já chama `finalizeSaleTransaction`) | ✅ | parcial | parcial | ? | ✅ |

**Notas de matriz**
- O **Workspace de Correção não vive dentro dos PDVs** — é acionado a partir da lista **Vendas / Arquivo Geral** (`vendas-arquivo-geral.tsx`), disponível para qualquer venda independentemente do PDV de origem.
- **PDV Next** continua **bloqueado em produção** por `experimentalPdvEnabled` (`app/dashboard/pdv-next/page.tsx`), exibindo `ModuleEmDesenvolvimento` com aviso "não registra as vendas". Mesmo já referenciando o motor compartilhado, **não deve ser usado** até validação fim-a-fim.
- `pdv-venda-completa-enterprise.tsx` **não é importado por nenhuma rota** (apenas se auto-exporta como alias `VendaCompletaEnterprise`). É **código órfão** — ver P3-01.

---

## 3. Matriz de funcionalidades (fluxo de venda — PARTE 2)

Fonte única no cliente: `finalizeSaleTransaction` (`lib/operations-store.tsx:1176`). Validações server: `upsertVendaInTransaction` (`lib/ops-upsert-venda.ts`).

| Fluxo | Funciona? | Onde | Observações / risco |
|-------|:---:|------|---------------------|
| Abrir caixa (inclusive `openCaixaIfClosed`) | ✅ | todos | abertura no ato da 1ª venda se configurado |
| Operador por nome | ✅ | todos | nome resolvido via sessão (não `cashierId`) |
| Buscar produto por nome | ✅ | todos | `scorePdvSearch` |
| Buscar por código/bipe | ✅ | todos | resolução `id\|sku\|barcode` (`ops-upsert-venda.ts:206`) |
| Adicionar produto | ✅ | todos | valida estoque local antes |
| Item avulso (INSERT) | ✅ | todos | prefixo `__avulso__`, **não baixa estoque** (`isVirtualSaleLine`) |
| Cliente / cliente rápido | ✅ | todos | `/api/clientes/quick` (auth-any, phone opcional) |
| Desconto | ✅ | todos | auditado em `discountReais/discountPercent` |
| Venda simples / múltipla | ✅ | todos | soma das formas conferida (tolerância 0,02) |
| Venda com entrada + saldo à prazo | ✅ | todos | gera `ContaReceberTitulo` (N parcelas) |
| Venda 100% à prazo | ✅ | todos | **exige cliente com CPF** (`operations-store.tsx:1251`) |
| Venda com crédito/vale | ✅ | todos | valida saldo local + debita `ClienteCredito` na transação |
| Finalizar | ✅ | todos | otimista + `syncPending` até confirmar |
| Cupom / reimpressão | ✅ | todos | 3 pipelines (ver §11 fiscal e auditoria de comprovantes) |
| Limpar carrinho / manter foco | ✅ | todos | comportamento por shell — validar manualmente (ver §8) |

**Pontos fortes**
- À prazo e vale têm **trava de cliente/CPF** no cliente *e* no servidor.
- `createdAt = at` na `MovimentacaoFinanceira` garante que vendas sincronizadas tarde caem na **sessão de caixa correta**.

---

## 4. Caixa (PARTE 3)

Consolidação pura: `lib/caixa-fechamento-resumo.ts`. Detalhe da sessão: `app/api/ops/caixa/sessao-detalhe/route.ts`.

| Item | Estado | Evidência |
|------|:---:|-----------|
| Abertura / fechamento | ✅ | `caixa/abrir`, `caixa/fechar` |
| Sangria / suprimento | ✅ | `aggregateCaixaOperacoes` (`caixa-fechamento-resumo.ts:132`) |
| Venda entra no caixa correto | ✅ | filtra por `sessaoId` (preciso) ou janela temporal (legado) |
| **À prazo NÃO entra como dinheiro** | ✅ | `totalRecebido = totalLiquido − aPrazo`; gaveta usa só `pg.dinheiro` |
| **Vale/crédito NÃO entra na gaveta física** | ✅ | `saldoDinheiroEsperado = saldoInicial + pg.dinheiro + suprimentos + recCrDin − sangrias` (linha 290) |
| Correção de pagamento em caixa aberto | ✅ | reconcilia `MovimentacaoFinanceira` ao alvo |
| **Bloqueio de caixa/período fechado** | ✅ | `verificarPeriodoFechado` em corrigir/itens/parcelas |
| Reimpressão / histórico / operador | ✅ | `sessao-detalhe` + histórico de caixa |

### 🔴 P0-01 (condicional) — `creditoVale` infla "Recebido à vista / Total de Vendas"
- **Venda original** (`ops-upsert-venda.ts:337-367`): `valorImediato = total − aPrazo` — **inclui `creditoVale`** na `MovimentacaoFinanceira(origem:"venda")`. O próprio comentário do código (linha 335) afirma o contrário: *"creditoVale é abatimento de saldo existente — não é receita nova"*.
- **Correção de pagamento** (`correcao-pagamento-plan.ts:76` + `corrigir/route.ts:359`): usa `cashReal = dinheiro+pix+débito+crédito+carnê` — **exclui `creditoVale`**.
- **Consequência:** uma venda paga com vale aparece com um valor de receita; após **qualquer** correção de pagamento naquela venda, a `MovimentacaoFinanceira` é reescrita para **menos** o vale → o "Total de Vendas" da sessão (`sessao-detalhe`) e o "Recebido à vista" (`caixa-fechamento-resumo`) **mudam** para a mesma venda. Duas vendas idênticas (uma corrigida, outra não) reportam faturamento diferente.
- **Não afeta a gaveta física** (vale nunca está em `pg.dinheiro`), por isso não causa "caixa não bate" no dinheiro — mas **distorce faturamento/recebido**.
- **Severidade:** P0 pela divergência de dados financeiros da *mesma* venda; mitigado por ser à vista-consistente entre relatórios e por não tocar dinheiro físico.
- **Correção sugerida:** alinhar o motor original ao planner (excluir `creditoVale` de `valorImediato`). ⚠️ **Toca o core Financeiro — exige autorização explícita** (CORE_RULES).

---

## 5. Conta a Receber (PARTE 4)

Criação: `ops-upsert-venda.ts:415-503`. Correções: `corrigir` (pagamento), `corrigir-titulo` (vencimento/obs), `corrigir-parcelas` (reparcelamento).

| Item | Estado | Observação |
|------|:---:|-----------|
| Venda à prazo cria título | ✅ | `localKey = pdv-aprazo-{pedidoId}` (1) ou `-{n}` (N) |
| Entrada + saldo cria título correto | ✅ | só o saldo à prazo vira título |
| Múltiplo + prazo | ✅ | split correto |
| Troca de cliente propaga ao título aberto | ✅ | `corrigir/route.ts:587` (`updateMany`) |
| Edição de vencimento/observação | ✅ | `corrigir-titulo` (não gated por período — não move dinheiro) |
| Reparcelamento 1↔N | ✅ | `corrigir-parcelas`; última parcela absorve arredondamento; `localKey` na mesma convenção |
| **Bloqueio de título pago/parcial** | ✅ | todas as rotas barram `PAGO/PARCIAL` |
| Cancelamento varre todos os títulos | ✅ | `startsWith pdv-aprazo-{pedidoId}` |
| **Risco de duplicar título / perder dívida** | ✅ baixo | `upsert` por `storeId_localKey` é idempotente; reparcelamento cancela `localKeys` não reaproveitados antes de criar os novos |

**Conclusão:** sem risco evidente de duplicação ou perda de dívida. O reparcelamento reusa o motor de estorno/cancelamento (`estornarMovimentacaoPorReferencia` + `cancelContaReceber` + `upsertContaReceber`).

---

## 6. Estoque (PARTE 5)

Baixa na venda: `ops-upsert-venda.ts:270-332`. Correção de itens: `corrigir-itens/route.ts` + `correcao-itens-plan.ts`.

| Item | Estado | Observação |
|------|:---:|-----------|
| Baixa na venda | ✅ | agregada por produto; `documento=pedidoId` evita retry duplo |
| Item avulso não baixa estoque | ✅ | `isVirtualSaleLine` |
| Item virtual/OS não baixa | ✅ | prefixos `__os_servico__/__os_pecas__` |
| Correção de quantidade (delta) | ✅ | `MovimentacaoEstoque origem:"correcao_pdv"` |
| Troca / adicionar / remover produto na correção | ✅ | recria `ItemVenda` + ledger de delta |
| **Bloqueio de estoque negativo** | ✅ | `updateMany where stock >= qty` (venda e correção) |
| Movimentação de estoque auditada | ✅ | `estoqueAntes/estoqueDepois/custo` |
| **Risco de estoque incorreto** | ✅ baixo | itens não-resolvidos (`id\|sku\|barcode`) são **registrados sem baixa** e logados (`naoResolvidos`) — risco de "vendeu e não baixou" se o SKU divergir do cache |

**Atenção (P2):** linhas cujo `inventoryId` não casa por `id/sku/barcode` **não geram baixa** e apenas logam `estoque-nao-baixado`. Em catálogo com SKU divergente/produto removido pós-cache, isso significa estoque não decrementado silenciosamente. Mitigação atual: log no servidor + (no balcão) a fila "Produtos a cadastrar".

---

## 7. Workspace de Correção (PARTE 6)

`components/dashboard/vendas/workspace-correcao-venda.tsx` (1575 linhas) — Dialog full-width `96vw × 92vh`, 9 abas.

| Aba | Leitura | Edição | Preview | Motivo+PIN | Auditoria |
|-----|:---:|:---:|:---:|:---:|:---:|
| Resumo | ✅ | — | — | — | — |
| Cliente | ✅ | ✅ trocar + editar CPF/fone/email + cadastro rápido | n/a | ✅ (PIN p/ troca) | ✅ |
| Pagamento | ✅ | ✅ 7 formas | ✅ antes→depois | ✅ | ✅ |
| Financeiro | ✅ | — | — | — | — (read-only correto) |
| Produtos | ✅ | ✅ qtd/preço/desc/troca/avulso + **metadados** (serial/IMEI/lote/garantia/obs) | ✅ impacto estoque + caixa | ✅ | ✅ |
| Auditoria | ✅ | — | — | — | mostra `correcoes[]` |
| Conta a Receber | ✅ | ✅ vencimento/obs + **reparcelamento 1/2/3/6/12** | ✅ parcelas | ✅ | ✅ |
| Caixa | ✅ | — | — | — | sessão vinculada |
| Histórico | ✅ | — | — | — | timeline + devoluções + cancelamento |

**Pontos fortes:** planners puros (`computeCorrecaoItensPlan`, `computeCorrecaoPagamentoPlan`, `computeParcelamentoPlan`, `parseVencimentoBr`) **reusados** no preview cliente e na validação servidor → o que o operador vê é o que o servidor aplica. `min-w-0` consistente; tablist com `overflow-x-auto`; corpo com `overflow-y-auto`.

### Achados do Workspace
- **P2-01 — Badge desatualizado:** o cabeçalho exibe **"Somente leitura (F1)"** (`workspace-correcao-venda.tsx:740`) mesmo com edição completa F2–F4 ativa. Mensagem enganosa para o operador.
- **P2-02 — Modal antigo "Corrigir venda" redundante:** o drawer da lista de Vendas ainda mostra **dois** botões: "Workspace (ficha completa)" e "Corrigir venda" (3 abas: pagamento/cliente/observação) — `vendas-arquivo-geral.tsx:1328` e `:1955`. O Workspace é **superconjunto** do modal antigo. Recomendação: rebaixar o modal antigo a legado/atalho rápido, ou removê-lo, para evitar dois caminhos divergentes de correção.
- **P3-02 — Casamento por índice:** metadados de item casam `payload.lines[i] ↔ ItemVenda[i]` por posição; se a venda for editada por F2 entre abrir e salvar metadados, recarregar resolve (já há concorrência otimista nos fluxos que mexem em total).

**Veredito:** o modal antigo **deve virar legado**. O Workspace cobre 100% do que ele faz, com preview e auditoria superiores.

---

## 8. UX operacional (PARTE 7)

> Itens marcados **(verificar)** dependem de teste manual no balcão — não foram reexecutados nesta auditoria estática.

- Foco após venda / após adicionar produto / limpeza de busca: **(verificar)** — padrão-ouro conhecido é o **Supermercado**; histórico de instabilidade de `keydown` por *closure stale* já foi corrigido (toda flag de modal precisa estar em `anyModalOpen` **e** nas deps do `useEffect`).
- Enter / ESC / F1·F2·F3·F7·F10·F12: **(verificar)** — F3 tabela é exclusivo do Clássico; F7 (venda em espera) em Clássico/Supermercado/Assistência.
- Modal Workspace em **1366×768**: `92vh` + `overflow-y-auto` no corpo e `overflow-x-auto` nas abas → sem corte teórico; **(verificar)** densidade dos formulários de edição (Pagamento/Produtos) em telas baixas.
- Modo escuro / tema Black / tokens semânticos: ✅ no Workspace (sem cor hardcoded; usa `bg-card`, `text-foreground`, `border-border`, `text-warning/success/info`).
- Barra lateral comendo conteúdo / overflow: AppShell é o único scroll owner; Workspace é Dialog (fora do fluxo do AppShell) → sem conflito.

---

## 9. Offline / PWA (PARTE 8)

`lib/pwa-version.ts` + `components/pwa/pwa-update-prompt.tsx` + `app/api/version/route.ts`.

| Item | Estado | Observação |
|------|:---:|-----------|
| Fila offline / pendências locais | ✅ | `syncPending` em `SaleRecord`; persistência local `assistec-pro-ops-v1` |
| Sync / reenviar | ✅ | re-sync e retry (`operations-store.tsx:822/857`) + badge `pdv-pending-sync-badge` |
| Stale guard | ✅ | 2 camadas: Service Worker `updatefound` + sondagem `/api/version` (3 min + foco/online) |
| Update prompt | ✅ | severidade `warn`/`strong` (≥6h); nunca bloqueia a venda em curso |
| **Reload/update não perde venda** | ✅ | `applyUpdateAndReload` **só** faz `reg.update()` + `SKIP_WAITING` + `location.reload()`; **nunca** limpa localStorage/IndexedDB/Cache → carrinho, vendas pendentes e caixa aberto preservados (comentário e código confirmam, `pwa-update-prompt.tsx:25-27`) |
| Venda em espera (F7) | ✅ | localStorage por `storeId+terminalId` |

**Conclusão:** risco de "bundle antigo perdendo venda" está **mitigado** — o guard é conservador e preserva todo o armazenamento local.

---

## 10. Segurança / Permissões (PARTE 9)

**Importante:** o `proxy.ts` trata **todo `/api/*` como público** (`isPublicPath`, linha 29). Portanto **cada rota de API se autoriza sozinha**.

| Rota | Sessão/permissão | Assinatura | PIN supervisor | Escopo loja no PIN |
|------|:---:|:---:|:---:|:---:|
| `venda-persist` | ✅ `apiGuardEnterpriseOrOps` | — | — | n/a |
| `vendas/[id]/cancelar` | ✅ `requireEnterpriseWith(pdv.cancelarVenda)` ou `requireOpsSubscription` | ✅ | — | n/a |
| `vendas/[id]/corrigir` (pagamento/cliente) | ❌ só `auth()` p/ label | ❌ | ✅ (ADMIN) | ❌ **não escopado** |
| `corrigir` (observação) | ❌ | ❌ | ❌ **sem PIN** | — |
| `corrigir-itens` | ❌ | ❌ | ✅ | ❌ |
| `corrigir-parcelas` | ❌ | ❌ | ✅ | ❌ |
| `corrigir-item-meta` | ❌ | ❌ | ✅ | ❌ |
| `corrigir-titulo` | ❌ | ❌ | ✅ | ❌ |

### Achados
- **P1-01 — PIN de supervisor não é escopado por loja.** Todas as rotas validam `prisma.user.findFirst({ where: { pin, role ∈ {ADMIN,admin} } })` **sem `storeId`** (ex.: `corrigir-itens/route.ts:133`). Um PIN ADMIN de **qualquer loja** autoriza correção em **qualquer outra loja**. Com PIN numérico curto e muitas lojas, há **risco de colisão** entre PINs. Para a RafaCell (dono único) o impacto operacional é baixo, mas é uma **falha de isolamento multi-loja** do SaaS.
- **P1-02 — Rotas de correção não enforçam sessão/permissão/assinatura.** Diferente de `cancelar` e `venda-persist`, as rotas `corrigir*` não chamam `requireEnterpriseWith`/`requireOpsSubscription`/`apiGuardEnterpriseOrOps`. O **único** controle de mutação financeira/estoque é o PIN ADMIN. Defesa em profundidade ausente; e o `operador` da auditoria cai para `"Operador"` se não houver sessão.
- **P2-03 — Correção de observação sem PIN nem permissão.** No `corrigir/route.ts`, o caminho `hasObsChange` (linha 598) grava sem PIN e sem sessão obrigatória. Impacto baixo (texto de observação), mas é escrita não autenticada.

**Resposta à pergunta-chave ("algum operador altera dinheiro sem permissão?"):** **Não** — toda correção que mexe em dinheiro/estoque **exige PIN ADMIN**. A ressalva é que o PIN **não é por loja** e não há camada de sessão/permissão por trás dele.

---

## 11. Riscos antes do fiscal (PARTE 10 — NÃO implementar fiscal)

Apenas leitura de prontidão. **O PDV NÃO está pronto para fiscal** sem trabalho prévio.

| Requisito | Pronto? | Bloqueio |
|-----------|:---:|---------|
| NFC-e | ❌ | sem emissor, sem CSC/CSRT, sem numeração/série fiscal, sem contingência |
| SAT | ❌ | sem integração com equipamento SAT |
| TEF | ❌ | pagamento é manual (operador digita valores por forma); sem captura TEF/comprovante |
| Cancelamento fiscal | ❌ | cancelamento atual é **operacional** (estorno interno), não fiscal |
| Inutilização / numeração | ❌ | não há faixa de numeração fiscal |
| XML / DANFE / reimpressão fiscal | ❌ | cupom é **não fiscal** (HTML/térmico) |

**Fundações que ajudam o fiscal depois:**
- Metadados de item (serial/IMEI/lote/garantia) já capturáveis em `payload.lines[].metadata` (F4).
- `customerCpf`/`clienteId` já vinculados; auditoria de correção/cancelamento robusta.

**Bloqueios de comprovante (auditoria anterior, ainda válidos):** há **3 pipelines de impressão paralelos**; o **térmico (config por loja) não imprime operador/cliente/forma de pagamento**, e o cupom "rico" (`CupomNaoFiscal`) é HTML-only fora do PoS. Antes de qualquer fiscal, **unificar o comprovante** (P2).

---

## 12. Classificação consolidada dos achados

### P0 — dinheiro/estoque/caixa/dívida/venda
- **P0-01** — `creditoVale` contado como receita à vista na venda original × excluído na correção → faturamento/"Recebido à vista" da **mesma venda** diverge antes/depois de correção. (`ops-upsert-venda.ts:337` vs `correcao-pagamento-plan.ts:76`). *Não afeta gaveta física.* **Fix toca core Financeiro → exige autorização.**

### P1 — fluxo bloqueado / cliente errado / governança financeira
- **P1-01** — PIN de supervisor **não escopado por loja** (todas as rotas `corrigir*`). Risco de isolamento multi-loja + colisão de PIN.
- **P1-02** — Rotas `corrigir*` **sem** `requireEnterpriseWith`/`requireOpsSubscription` (inconsistente com `cancelar`/`venda-persist`).
- **P1-03** — **Correção de itens bloqueia** vendas com `aPrazo`/`creditoVale > 0` (`correcao-itens-plan.ts:162`) → para corrigir item de venda à prazo, só cancelamento/devolução. Limitação consciente, mas é fluxo bloqueado para um caso real (corrigir quantidade de venda fiada).

### P2 — UX / mensagem / comportamento divergente
- **P2-01** — Badge "Somente leitura (F1)" no Workspace já editável (`workspace-correcao-venda.tsx:740`).
- **P2-02** — Modal antigo "Corrigir venda" redundante com o Workspace (dois caminhos de correção).
- **P2-03** — Correção de observação sem PIN/sessão.
- **P2-04** — Estoque não baixado silenciosamente quando `inventoryId` não resolve (`id\|sku\|barcode`).
- **P2-05** — Comprovante térmico sem operador/cliente/forma de pagamento; 3 pipelines de impressão.
- **P2-06** — `corrigir-itens` retorna `no_change` como `ok:false` (status 200) → cliente exibe **toast de erro** "Nenhuma alteração" em vez de aviso neutro.

### P3 — visual / acabamento / código morto
- **P3-01** — `pdv-venda-completa-enterprise.tsx` (1500 linhas) é **órfão** (nenhuma rota importa; só se auto-exporta como `VendaCompletaEnterprise`). Risco de editar o arquivo errado. Recomenda-se remover/arquivar.
- **P3-02** — Metadados de item casam por **índice** `payload.lines ↔ ItemVenda`.
- **P3-03** — Matriz de atalhos de teclado/foco divergente entre PDVs (Supermercado = padrão-ouro) — uniformizar.

---

## 13. Bugs prováveis (a confirmar em runtime)

1. **Faturamento "encolhe" após corrigir pagamento de venda com vale** (consequência direta do P0-01).
2. **Toast de erro indevido** ao "pré-visualizar/aplicar" sem mudança em Produtos (P2-06).
3. **Estoque não decrementa** para item vendido com SKU que diverge do cache do PDV (P2-04) — verificar com produto renomeado/SKU alterado entre o cache e a venda.
4. **PIN de outra loja aceito** numa correção (P1-01) — confirmar com 2 lojas.

---

## 14. Plano de correção (proposto — fora deste GOAL)

| Ordem | Item | Sev | Toca core? | Esforço |
|------:|------|:---:|:---:|:---:|
| 1 | Escopar PIN supervisor por `storeId` em todas as rotas `corrigir*` | P1-01 | não (rotas) | baixo |
| 2 | Adicionar `requireEnterpriseWith`/assinatura nas rotas `corrigir*` (espelhar `cancelar`) | P1-02 | não | baixo |
| 3 | Alinhar `valorImediato` à definição `cashReal` (excluir `creditoVale`) | P0-01 | **sim (Financeiro)** | médio + **autorização** |
| 4 | Trocar badge "Somente leitura (F1)" por estado real do Workspace | P2-01 | não | trivial |
| 5 | Rebaixar/remover modal antigo "Corrigir venda" | P2-02 | não | baixo |
| 6 | `no_change` → resposta neutra (não-erro) no cliente | P2-06 | não | trivial |
| 7 | Exigir PIN também na correção de observação | P2-03 | não | trivial |
| 8 | Remover/arquivar `pdv-venda-completa-enterprise.tsx` órfão | P3-01 | não | baixo |
| 9 | Unificar pipeline de comprovante (operador/cliente/pagamento) | P2-05 | parcial | médio |

> **Sequência segura:** itens 1, 2, 4, 5, 6, 7, 8 são cirúrgicos e sem risco ao motor. O item 3 (P0) **só** após autorização explícita por mexer no Financeiro central — idealmente acompanhado de teste de regressão de fechamento de caixa com vendas em vale.

---

## 15. Checklist manual para a RafaCell (smoke de balcão)

**Venda**
- [ ] Venda à vista (dinheiro) → confere no fechamento em "Dinheiro".
- [ ] Venda múltipla (dinheiro + pix + cartão) → soma fecha com o total.
- [ ] Venda com **entrada + saldo à prazo** → título correto em Contas a Receber, vencimento certo.
- [ ] Venda **100% à prazo sem cliente** → deve **bloquear** pedindo cliente/CPF.
- [ ] Venda com **vale/crédito** → saldo do cliente debita; gaveta **não** aumenta em dinheiro.
- [ ] Item avulso (INSERT) → **não** baixa estoque; aparece em "Produtos a cadastrar".
- [ ] Cupom imprime e reimprime; operador aparece por **nome**.

**Caixa**
- [ ] Sangria e suprimento refletem na gaveta; à prazo e vale **não** entram como dinheiro.
- [ ] Fechar caixa → "Saldo em dinheiro esperado" bate com a conferência física.

**Workspace de Correção**
- [ ] Corrigir **pagamento** (à vista ↔ à prazo): preview antes/depois, exige motivo + PIN, reconcilia título.
- [ ] Corrigir **produtos** (qtd/preço/troca/avulso): preview de impacto no estoque e caixa; bloqueia estoque negativo.
- [ ] **Reparcelar** saldo à prazo 1→3 e 3→1: parcelas somam o total; cancelamento ainda varre todas.
- [ ] Editar **CPF/telefone/e-mail** do cliente → reflete no cupom/reimpressão.
- [ ] Salvar **serial/IMEI/lote** → estoque e total **não** mudam; aparece na aba Auditoria.
- [ ] Tentar corrigir com **período fechado** → deve bloquear.
- [ ] Conferir os **4 temas** (claro/escuro/Black) em 1366×768.

**Segurança**
- [ ] Operador comum **sem** PIN não consegue alterar pagamento/itens/parcelas.
- [ ] (Multi-loja) PIN de admin de outra loja **não deveria** ser aceito — hoje **é** (P1-01).

**PWA**
- [ ] Com carrinho aberto, forçar "Atualizar agora" → carrinho/venda pendente preservados.
- [ ] Venda offline → entra em `syncPending` → "Reenviar sync" confirma no servidor.

---

## 16. Próximos GOALs recomendados

1. **`GOAL_SEGURANCA_CORRECAO_VENDA_MULTILOJA`** — escopar PIN por loja + enforce sessão/permissão/assinatura nas rotas `corrigir*` (P1-01/P1-02). Cirúrgico, alto valor, sem tocar motor.
2. **`GOAL_FATURAMENTO_VALE_ALINHAMENTO`** — alinhar `creditoVale` entre motor e correção (P0-01). **Requer autorização (Financeiro core)** + testes de fechamento.
3. **`GOAL_WORKSPACE_POLISH`** — badge real, rebaixar modal antigo, `no_change` neutro, PIN na observação (P2-01/02/03/06).
4. **`GOAL_LIMPEZA_PDV_ORFAOS`** — remover `pdv-venda-completa-enterprise.tsx` e uniformizar atalhos/foco entre PDVs (P3-01/P3-03).
5. **`GOAL_COMPROVANTE_UNIFICADO`** — pré-fiscal: um pipeline de cupom com operador/cliente/pagamento (P2-05).

---

### Validação desta entrega
- `git diff --stat` deve mostrar **apenas** a criação de `docs/audits/AUDITORIA_OPERACIONAL_PDV_REAL_v01.md`.
- Sem commit. Sem push. Nenhum arquivo de código alterado.
