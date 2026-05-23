# Estoque HUB — Auditoria e estabilização para operação real

> Goal 7 — concluído em 23/05/2026 · Modelo: Claude Opus 4.7
> Escopo: auditar o **Estoque HUB** (saldo, movimentações, inventário, ajustes,
> entradas/saídas, integrações PDV/OS, filtros/busca) e estabilizar para uso real,
> sem mock crítico. Prioridade máxima: **saldo e movimentação confiáveis**.

---

## 1. Resumo executivo

O Estoque HUB está, em sua maior parte, **real e confiável**. O backend
(`app/actions/estoque.ts`) usa transações Prisma com livro-razão imutável
(`MovimentacaoEstoque`), custo médio ponderado e `storeId` em todas as queries.
A Auditoria de Estoque e o Planejamento/Movimentação são reais.

A auditoria encontrou **1 mock enganoso crítico**: a importação de XML NF-e em
`gestao-produtos.tsx` (`confirmarEntradaMercadoria`) **só alterava o estado local
do React** e exibia "Entrada de mercadoria concluída / Estoque atualizado com
sucesso" — **nada era persistido** (sumia ao recarregar). Num módulo de estoque,
isso é perigoso (operador acredita que deu entrada da NF-e). Corrigido tornando o
fluxo **honestamente pré-visualização**, consistente com o padrão já adotado no
Cadastros → Importação.

**Validação:** `npx tsc --noEmit` → 0 erros · `npm run build` → OK.
**Arquivos alterados:** 1 (`components/dashboard/estoque/gestao-produtos.tsx`).

---

## 2. Bug crítico corrigido — importação XML NF-e fingia dar entrada no estoque

**Onde:** `components/dashboard/estoque/gestao-produtos.tsx` →
`confirmarEntradaMercadoria` + modal "Importar XML NF-e".

**Sintoma:** ler um XML de NF-e, configurar o De-Para e clicar **"Confirmar
Entrada"** mostrava toast de sucesso ("…item(ns) processado(s) no estoque",
"Estoque atualizado com sucesso") e os itens apareciam na tabela — mas **só em
memória** (`setProducts(...)`). Nenhuma chamada à API, nenhum `Produto.stock`
atualizado, nenhum `MovimentacaoEstoque`. Ao recarregar, tudo sumia.

**Por que é crítico:** viola diretamente "saldo e movimentação confiáveis" — dá
ao operador a falsa certeza de que a mercadoria entrou no estoque.

**Correção (cirúrgica, preview-only honesto):**

| Mudança | Detalhe |
|---|---|
| Removida a função `confirmarEntradaMercadoria` fake | Não mutila mais o estado local nem alega sucesso. Comentário no código explica que entrada por XML não persiste nesta fase. |
| Botão "Confirmar Entrada" **desabilitado** | `disabled` + `title` "Entrada automática por XML — em breve. Use a Entrada manual em Cadastros → Estoque." + rótulo "Confirmar Entrada (em breve)". |
| Banner honesto (âmbar) no modal | "Pré-visualização: a entrada por XML ainda não grava no estoque. Confira os itens e dê entrada real em Cadastros → Estoque (Entrada manual, com livro-razão) ou pelo Importador Avançado." |
| Copy do modal corrigida | Intro e "Dica" não prometem mais "atualização do estoque" / "itens serão incluídos". |
| Removido `const mockProducts: Product[] = []` | Constante morta (nunca referenciada). |

A **leitura do XML + De-Para permanece** como conferência (preview). A entrada
real continua disponível pelos caminhos com livro-razão:
`registrarEntradaEstoque` (Cadastros → Estoque, Entrada manual) e o Importador
Avançado.

> Decisão de escopo: implementar gravação real por NF-e (criar produto novo +
> `registrarEntradaEstoque` por item, vínculo fornecedor por CNPJ, custo/NCM) é
> **explicitamente fora de escopo** do projeto ("Backend fiscal definitivo —
> entrada estoque por NF-e" já deferido na auditoria de Importação de 21/05) e
> seria uma feature, não uma correção cirúrgica. Recomendado como goal futuro.

---

## 3. Auditoria — o que está REAL (sem mock)

| Área | Arquivo | Status |
|---|---|---|
| **Backend de estoque** | `app/actions/estoque.ts` | ✅ Real. `registrarEntradaEstoque` (custo médio ponderado, ledger, tx), `registrarAjusteEstoque` (delta, ledger, tx), `getEstoqueResumo`, `listMovimentacoesEstoque`, `getAuditoriaEstoque`. `storeId` em 100% das queries. |
| **Estoque HUB principal** (`/dashboard/estoque`) | `gestao-produtos.tsx` | ✅ Real (exceto XML, agora preview-only). Lista via `/api/ops/inventory`; criar/editar via `/api/produtos` (POST/PATCH); excluir single + bulk; busca (nome/código/SKU/barcode/IMEI) e filtro por categoria reais; KPIs derivados de dados reais; loading/empty states (`LoadingState`/`EmptyState`); `storeId` via header. |
| **Auditoria de Estoque** (`/dashboard/estoque/auditoria`) | `auditoria-estoque.tsx` | ✅ Real. Consome `getAuditoriaEstoque(storeId, filtro)`; KPIs do dia, alertas (negativo, custo zero, sem barcode, ajustes excessivos), filtros (data/produto/usuário/tipo/origem/negativos/ajustes), skeleton + empty state. Multi-loja. |
| **Movimentação/Inventário** (SPA `page=planejamento-compras`) | `planejamento-compras.tsx` | ✅ Real. `useOperationsStore` (sincronizado do DB no bootstrap) + `computePurchasePlanning` (cobertura por vendas líquidas 30d); PDF de compras; empty state. |
| **Integração PDV → estoque** | `lib/ops-upsert-venda.ts` | ✅ Real e idempotente (auditado no Goal 2 — `ESTOQUE_PDV_GOAL_REPORT.md`). `MovimentacaoEstoque(origem:"pdv")` aparece na Auditoria (filtro origem=PDV). |
| **Integração OS → estoque** | `lib/operacoes/adapters/os-estoque.ts` | ✅ Real e idempotente (Goal Operações). `MovimentacaoEstoque(origem:"os")` aparece na Auditoria (filtro origem=O.S.). |

**Temas:** cores semânticas (âmbar = warning, esmeralda = entrada, destructive =
saída/negativo) já usadas em todo o módulo; banner novo usa o mesmo padrão âmbar.
Light/Soft Ice/Midnight/Black preservados (validação visual no browser recomendada).

---

## 4. Riscos / limitações documentados (não corrigidos — exigem schema/feature)

1. **"Estoque Mínimo (Alerta)" não persiste** — o form de produto
   (`gestao-produtos.tsx`) deixa editar "Estoque Mínimo", mas o model `Produto`
   **não tem coluna de estoque mínimo** e o payload de save não o envia; no
   reload volta a `0`. Consequência: o KPI **"Estoque Baixo"** usa `min=0`, então
   conta efetivamente itens com `stock <= 0` (não 1–5). Corrigir exige coluna no
   schema (proibido sem confirmação). *Sugestão:* adicionar `minStock Int` ao
   `Produto` e persistir; ou usar heurística fixa (como o Cadastros HUB, que usa
   `1–5`).
2. **Entrada real por NF-e (XML)** — pendente (ver §2). Hoje é preview. Caminho
   real existe via Entrada manual (`registrarEntradaEstoque`) e Importador Avançado.
3. **Edição direta de "Estoque Atual" no produto não gera livro-razão** — salvar
   o produto via `/api/produtos` (PATCH) sobrescreve `stock` sem criar
   `MovimentacaoEstoque`. Para trilha auditável, o caminho correto é
   Cadastros → Estoque → Entrada/Ajuste (`registrarEntradaEstoque` /
   `registrarAjusteEstoque`). *Sugestão de goal futuro:* rotear a edição de saldo
   por ajuste com motivo.
4. **Estoque pode ir negativo em concorrência** (pré-existente, Goal 2) —
   `decrement` não checa sinal; 2 caixas vendendo o mesmo SKU podem zerar/negativar.
   A Auditoria já **detecta e destaca** negativos (KPI + alerta).
5. **`revalidatePath` das actions de estoque aponta só para `/dashboard/cadastros-v2`** —
   não para `/dashboard/estoque`. Impacto nulo na prática (as telas recarregam via
   estado/`reloadInventory`), mas vale alinhar se algum dia a página virar SSR.
6. **`gestao-produtos.tsx` carrega todo o inventário sem paginação** — para
   catálogos muito grandes pode ficar pesado (busca/filtro são client-side). A API
   `/api/ops/inventory` limita o retorno; pré-existente.
7. **`components/dashboard/estoque/servicos.tsx`** — componente **não importado**
   em nenhum lugar do app (código morto). Não tocado.

---

## 5. Testes documentados

| # | Teste | Resultado |
|---|---|---|
| 1 | Abrir Estoque HUB (`/dashboard/estoque`) | ✅ tabela real, KPIs, busca, filtro |
| 2 | Buscar produto | ✅ por nome/código/SKU/barcode/IMEI (client-side, real) |
| 3 | Validar saldo | ✅ `estoqueAtual` vem de `/api/ops/inventory`; KPI "Valor em Estoque" = Σ custo×saldo |
| 4 | Validar movimentações | ✅ Auditoria (`getAuditoriaEstoque`) lista livro-razão real com filtros |
| 5 | Validar entrada/saída | ✅ entrada/ajuste manual reais (Cadastros → Estoque, ledger); saída PDV/OS via origem |
| 6 | Integração com venda (PDV) | ✅ `MovimentacaoEstoque(origem:"pdv")` na Auditoria (Goal 2) |
| 7 | Integração com OS | ✅ `MovimentacaoEstoque(origem:"os")` na Auditoria (Goal Operações) |
| 8 | Temas Light/Soft Ice/Midnight/Black | ✅ tokens semânticos (validação visual no browser recomendada) |
| 9 | Riscos restantes | ✅ documentados (§4) |
| + | Importação XML NF-e | ✅ agora **pré-visualização honesta** (não finge dar entrada) |

---

## 6. Validação

- `npx tsc --noEmit` → **0 erros**.
- `npm run build` → **OK** (prisma generate + Next; tabela de rotas íntegra).
- `git status` (deste goal): `M components/dashboard/estoque/gestao-produtos.tsx`
  (~52 linhas removidas do fluxo fake + copy/banner/botão honestos).
  Os demais arquivos modificados (`cadastros.ts`, `CadastrosHub.tsx`,
  `CURRENT_STATUS.md`, `CADASTROS_HUB_GOAL_REPORT.md`) são do Goal 6 (Cadastros),
  ainda não commitados.

## 7. Escopo

- **Não** alterados: auth, `proxy.ts`, sidebar, `prisma/schema.prisma`, fluxo
  PDV/Caixa, Financeiro, Operações, Vendas. Nenhuma migration.
- **Nenhuma movimentação real apagada.** A correção apenas removeu uma simulação
  local que nunca tocou o banco.
- `CURRENT_STATUS.md` atualizado com a entrada do Goal 7.
