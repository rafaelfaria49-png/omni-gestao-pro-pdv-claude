# RELATORIOS-PRODUTOS-VENDIDOS-REAL-001 — Relatório de entrega

Relatório **Produtos Mais Vendidos** real, substituindo o card de roadmap da central de Relatórios.
Somente leitura: nenhuma escrita em banco, nenhuma alteração de schema/migration, estoque, caixa,
pagamento, PDV ou fiscal. Base: `origin/main` @ `34b70a1`.

## Superfície

| Peça | Caminho |
|---|---|
| Tela | `/dashboard/relatorios/produtos` → `components/dashboard/relatorios/produtos-vendidos-report.tsx` |
| API ranking | `GET /api/vendas/produtos-vendidos` |
| API variantes | `GET /api/vendas/produtos-vendidos/variantes?produtoId=` |
| Regras (puras) | `lib/relatorios/produtos-vendidos.ts`, `lib/relatorios/produtos-vendidos-variantes.ts` |
| Leitura Prisma | `lib/relatorios/produtos-vendidos-query.ts` |
| Card | `app/dashboard/relatorios/RelatoriosHubGrid.tsx` (roadmap → disponível) |

## Origem dos dados

| Dado | Fonte persistida |
|---|---|
| Vendido (bruto) | `venda_itens` (`ItemVenda`) de `vendas` com `storeId` da loja, `at` no período e `status <> 'cancelada'` — `groupBy (inventoryId, nome)` no SQL |
| Canceladas | `vendas.status = 'cancelada'` no período — só contagem e soma de `total` |
| Devolvido | `itens_devolucao_venda` de `devolucoes_venda` da loja, vinculados por `vendaLocalId = Venda.pedidoId` |
| Produto / categoria | `estoque_produtos` (catálogo atual) + `categorias_produto` (slug → nome) |
| Variante (modelo/cor) | `Venda.payload.lines[].accessorySelection` (não há coluna relacional) |

## Cálculos

- **Coorte pela data da venda.** Período = instantes `from`/`to` (início/fim do dia local, enviados pelo
  cliente — mesmo padrão do Histórico de Vendas). Máximo 366 dias.
- **Bruto** = Σ `quantidade` e Σ `lineTotal` das linhas de vendas não canceladas.
- **Devolvido** = devoluções vinculadas a vendas da coorte, **qualquer que seja a data da devolução**
  (inclusive depois do período). Por (venda, produto): todas as devoluções somam e o total é
  **limitado ao vendido** (quantidade e valor). O excedente é descartado e exposto em
  `diagnostico.quantidadeDevolvidaDescartada`. Devolução sem venda vinculada encontrada na loja
  não é descontada de nenhum produto; aparece em `diagnostico.devolucoesSemVenda`.
- **Líquido** = bruto − devolvido. Ranking por quantidade líquida ou receita líquida.
- **Preço médio** = receita bruta / quantidade bruta. **Participação** = fração do líquido do recorte.
- **Identidade:** produto do catálogo agrupa por `Produto.id`; linha legada gravada com SKU ou código
  de barras é atribuída ao produto na mesma ordem do writer (id → sku → barcode). Nomes gravados que
  diferem do nome atual aparecem como "Vendido como". Produto excluído do catálogo continua no
  ranking com o nome gravado ("Fora do catálogo atual"). Avulsos, serviços e O.S. ficam fora por
  padrão (toggle os inclui, agrupados por nome).
- **Categoria:** `Produto.category` normalizada; slug e nome do mesmo `CategoriaProduto` viram uma
  só chave. Vazio = "Sem categoria".
- **Variante:** usada só quando a soma do payload da venda para o produto **bate** com `ItemVenda`;
  senão vai para "Sem detalhe confiável". Quantidades brutas (devolução não registra variante).
  Análise limitada às 2 000 vendas mais recentes do produto no período (sinalizado na tela).

## Limitações históricas (declaradas na própria tela)

1. **Sem margem/lucro.** `Produto.precoCusto` é o custo atual; não há custo histórico por venda.
2. **Desconto geral não rateado.** Desconto/acréscimo lançado só no total da venda não está nas
   linhas; a diferença Σ `Venda.total` − Σ `lineTotal` é exibida como ajuste não distribuído.
3. **Categoria é a atual**, não a da época da venda (não existe snapshot de categoria em `ItemVenda`).
4. **Devolução sem vínculo** (`vendaLocalId` vazio ou venda só local) não pode ser atribuída a produto.
5. **Variante** só existe em vendas de acessório com seleção registrada (PDV-ACESSORIOS 003+).
6. **Performance:** `vendas` não tem índice `(storeId, at)`; as consultas filtram por `storeId`
   (indexado) e depois por data. Medido: 50 006 vendas em ~0,6–0,7 s (PG local). Criar o índice
   exige alteração de schema — fora do escopo, recomendado como follow-up.
7. **Cache do Service Worker:** como as demais `GET /api/*` (ex.: `/api/vendas/historico`), a
   resposta pode ser servida pelo cache NetworkFirst do PWA quando offline, apesar do
   `Cache-Control: no-store`. Pré-existente em `next.config.mjs` (área protegida, não alterada).

## Segurança e isolamento

- `requireModuleApi(req, "reports")` **e** `requireModuleApi(req, "sales")`; depois sessão +
  `canAccessStore`. `storeId` do header/query/cookie é só seleção.
- Toda consulta do loader e da rota de variantes filtra `storeId`. Produto de outra loja → 404.
- Erro de banco → 503 sem detalhe fora de `development`.
- A tela e o card exigem os mesmos módulos que a API.

## Evidências

| Prova | Resultado |
|---|---|
| Unidade (`lib/relatorios/*.test.ts`) | 22 PASS — ranking, repetidos, SKU/EAN legado, excluído do catálogo, devolução parcial/integral/múltipla/acima do vendido/fora da coorte, categorias slug+nome, busca sem acento, limite, 20 mil grupos + 5 mil devoluções |
| ACL (`app/api/vendas/produtos-vendidos/route.test.ts`) | 11 PASS — 401, 403 outra loja, 403 sem `reports`, 403 sem `sales`, 400 período, escopo `storeId` em todas as consultas, 503 sem vazamento, variantes 404/refs concorrentes |
| Integração PostgreSQL real descartável (`*.pg.test.ts`) | 6 PASS — períodos, cancelada, devolução após o período, devolução com relógio adiantado, devolução acima do vendido, linha legada por SKU, avulso opcional, 2 lojas (mesmo SKU, devolução cruzada), variantes; volume 2 000 e **50 000** vendas (relatório em ~0,7 s) |
| Conferência SQL × tela (base demo, 320 vendas) | bruto 1 034 un./R$ 51.615,20; canceladas 14/R$ 1.888,30; devolvido 26/R$ 1.273,90 — idênticos |
| `npm run typecheck` | 0 erros |
| ESLint (arquivos do GOAL) | 0 erros, 0 avisos |
| `npm run build` | Compiled successfully; rotas `ƒ /api/vendas/produtos-vendidos`, `…/variantes`, `ƒ /dashboard/relatorios/produtos` |
| Revisão independente (agente com contexto zerado) | 0 P0/P1; 2 P2 + 6 P3 de código corrigidos; índice `(storeId, at)` registrado como limitação |
| Visual | `desktop-1280.jpg`, `variantes-1280.jpg`, `mobile-375.jpg` (375 px sem overflow horizontal; o modal sobreposto no mobile é o assistente de boas-vindas da loja demo, alheio ao relatório) |

Integração PG: rode com `PRODUTOS_VENDIDOS_PG_URL=postgresql://user@127.0.0.1:<porta>/<db>` após
`prisma db push` num PostgreSQL descartável (o teste recusa host fora de loopback).
`PRODUTOS_VENDIDOS_PG_VOLUME` ajusta a carga.
