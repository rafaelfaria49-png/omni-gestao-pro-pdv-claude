# Categoria explícita e feedback de estoque no cadastro

Corretiva de usabilidade sobre `0f5f563a4833ff8c298d8558b6dff540660739dc` (main
efetiva no preflight), observada pelo proprietário na conta STORE "Padaria TESTE".
Branch/worktree própria `codex/cadastro-categoria-estoque-feedback`. AEP opt-in
ausente; nenhum GOAL, número CAD-R2, state, ledger ou registry criado. A conta
"Padaria TESTE", seus produtos e qualquer dado produtivo não foram tocados.

## Causa observada

**Categoria.** A ficha canônica (`ProductAIModal`, #307) só criava categoria por um
item "Criar …" escondido na lista do campo ou por Enter com texto fora da lista; a
saída do campo gravava o texto livre em `Produto.category` (que depois reaparece na
lista via `listCategoriasMarcasUsadasEmProduto`). Para o cliente básico não havia
ação visível de criar, e texto digitado virava "categoria" sem ação explícita.

**Estoque.** Produto KG (peso em preparação) com saldo 0: `Movimentar estoque`
ficava desabilitado por `modoVenda === "peso" || invalidCommercial`
(`produto-ia.tsx`), mas o botão não tinha estilo de desabilitado, o saldo vinha
sem unidade e o texto ao lado continuava mandando movimentar. Declaração inválida
e peso tinham o mesmo silêncio. Depois de uma entrada pela ficha, o modal fechava
sem mostrar o saldo novo e a ficha seguia exibindo o saldo antigo.

## Mudanças

- `lib/cadastros/product-commercial-contract.ts` — `productStockMovementAvailability`
  lê `productCommercialCatalogProjection` (sem nova flag): `disponivel` em UN, ou
  bloqueio `peso_em_preparacao` (KG/G) / `declaracao_invalida` (unidade a revisar)
  com título e orientação próprios. Os writers mantêm o próprio guard
  (`assertProductCommercialSaleSupported`); declaração inválida tem precedência na
  tela porque a unidade não é confiável.
- `produto-ia.tsx` — na experiência do cliente (`usesClientExperience !== false`):
  busca/seleção estrita das categorias da loja; Enter e saída do campo nunca gravam
  nem aceitam texto fora da lista (volta ao valor selecionado e orienta); botão
  **"+ Nova categoria"** ao lado do campo. Plataforma (A01) e lojas legadas mantêm o
  combobox histórico sem alteração.
- `NovaCategoriaDialog.tsx` — janela acessível (Radix Dialog, título, descrição,
  rótulo, erro `role="alert"`, foco no nome e retorno ao botão). Trava síncrona
  contra submissão repetida; fechar bloqueado durante a gravação. Grava pelo writer
  canônico `upsertCategoria` (normalização, dedupe sem caixa, escopo de loja já
  existentes) e só então seleciona o **nome devolvido**, anuncia e relê a lista
  (`listCategorias`). Falha mantém a janela com erro e não seleciona nada.
- Estoque na ficha: unidade junto ao saldo (`UN`/`KG`/`G` ou "unidade a revisar");
  botão com estado desabilitado visível e `aria-describedby` para o motivo, exibido
  em texto ao lado do controle (não tooltip), diferenciado por motivo; a instrução
  "use Movimentar estoque" só aparece quando a ação existe. Após Entrada/Ajuste, a
  ficha mostra o saldo devolvido pelo writer na mesma transação e a lista relê.
- `MovimentacaoEstoqueModal.tsx` — aceita `metadata` opcional: com bloqueio, mostra
  o motivo e não oferece Entrada/Ajuste (Histórico continua); `onSaved` recebe
  `estoqueDepois`; saldo do cabeçalho acompanha a operação confirmada; erro de rede
  vira `role="alert"` sem sucesso. Sem `metadata`, comportamento anterior.
- `CadastrosHub.tsx` — botão "Estoque" da lista passa `metadata` ao modal.

Nada de tabela, endpoint, lista local paralela, seed de categorias, writer de
estoque, conversão de saldo, estoque fracionado ou bypass. Auth, permissões,
schema/migrations, PDV, pagamentos, pesagem, Fiscal, voz, QR e importadores intactos.

## Provas

- `lib/cadastros/product-stock-movement-availability.test.ts` — contrato × guard do writer.
- `lib/cadastros/produto-categoria-estoque.component.test.ts` — sem gravação por
  Enter/blur; seleção canônica; uma gravação por duplo clique/submit; nada anunciado
  antes da confirmação; falha sem categoria fictícia; cancelar/Escape preservam o
  rascunho e devolvem o foco; A01 interno inalterado; UN abre e relê; KG/inválida
  explicam e não abrem gravação; salvar a ficha não envia `estoque`.
- `e2e/platform-pilot/cadastro-categoria-estoque.spec.ts` (CI: PostgreSQL
  descartável, NextAuth real, build de produção + `next start`) — persistência
  conferida no banco: categoria criada pelo botão, uma linha por duplo clique,
  variação de caixa reaproveita o registro, nova sessão, A não vaza para B, loja
  adulterada B→A recusada pelo servidor, CAIXA sem acesso à página, falha de rede
  sem criação, entrada UN pelo writer canônico (+1 movimentação, saldo 5, ficha e
  lista relidas), salvar a ficha não move saldo, KG/inválida sem gravação,
  proprietário com criação histórica, 320/390/1440 px, foco e teclado.

Cadastro salvo **não** prova venda por peso: nenhuma venda foi feita.

## Handoff obrigatório — Vendas/PDV (não editado aqui)

**A. Card "Orçamentos" do Vendas HUB.** `components/vendas-hub/lovable/features/vendas/VendasHub.tsx`
(card "Orçamentos", `dashboardHref: "/dashboard/orcamentos"`, promete "Crie, envie e
converta orçamentos em vendas"). `app/dashboard/orcamentos/page.tsx` redireciona
para `/dashboard/operacoes-v3`, que `lib/auth/page-access.ts` libera só com
`hubs.operacoes`; o pacote básico (`BASIC_MODULE_ACCESS`, sem `service`) recebe
acesso negado. Correção imediata recomendada à frente Vendas: filtrar os cards pelo
destino realmente permitido (`page-access`) e ajustar o texto prometido. Evolução
planejada: orçamento comercial independente de OS (cliente, itens, quantidade e
unidade, preços, validade, observações, status), que não movimenta caixa/estoque nem
confirma venda sozinho. Contratos existentes: não há modelo de orçamento no
`schema.prisma`; o legado `components/dashboard/orcamentos/orcamentos.tsx` era
localStorage (ainda lido por `cliente-portal` via `normalizeOrcamento`); o orçamento
de Operações V3 é atrelado à OS. Investigar antes de propor schema. **Não liberar
Operações/assistência para a padaria como solução.**

**B. PDV pede estoque para produto KG bloqueado.** `app/api/ops/inventory/route.ts`
não projeta a declaração comercial (o tipo tem `vendaPorPeso`, a projeção nunca o
preenche), então o PDV vê o produto KG como unitário. Em
`components/dashboard/vendas/pdv-classic.tsx` (`addToCart`), a checagem
`stock <= 0` → toast "Sem estoque … está sem saldo no estoque" roda antes do ramo de
peso; com saldo > 0 a venda segue por unidade até o guard do servidor
(`ProductWeightNotOperationalError`). Recomendado à frente PDV: projetar
`productCommercialCatalogProjection` (ou `productStockMovementAvailability`) no
inventário e dar precedência à mensagem "venda por peso em preparação —
indisponível" antes de qualquer orientação de estoque. Reproduzir na frente PDV.

**C. Venda e estoque por peso** continuam com PDV/pesagem (`docs/padaria/pesagem`).
Esta corretiva não os declara entregues.
