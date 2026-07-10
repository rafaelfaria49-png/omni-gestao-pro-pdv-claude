# PDV-ACESSORIOS-MODELO-COR-AUDIT-001

Data da auditoria: 2026-07-10
Modo: auditoria arquitetural read-only
Status: proposta; nenhuma implementação de produção realizada

## 1. Resumo executivo e decisão

É viável iniciar o MVP de venda de acessórios com seleção de modelo e cor **sem alterar o schema Prisma**.

A solução recomendada é:

1. Configurar o comportamento no namespace `Produto.metadata.acessorios`.
2. Entregar ao PDV somente uma projeção validada dessa configuração, e não o `metadata` bruto inteiro.
3. Reutilizar exclusivamente `docs/catalogo/seeds/device_models_seed_001.csv` e `device_aliases_seed_001.csv` por meio da busca já existente em `/api/catalogo/aparelhos/search`.
4. Guardar a seleção como snapshot estruturado em `Venda.payload.lines[].accessorySelection`.
5. Manter em `ItemVenda.nome` a descrição expandida para carrinho, comprovante e histórico, por exemplo `Capinha silicone — Samsung Galaxy A06 — Preto`.
6. Continuar baixando estoque, resolvendo tributação e movimentando caixa/financeiro pelo mesmo `inventoryId` do produto principal.

O MVP não deve criar SKU, produto fiscal ou saldo de estoque por combinação de modelo/cor. A combinação é atributo da linha vendida, não uma nova identidade de produto.

Há quatro adequações obrigatórias para a implementação futura ser segura:

- fazer a configuração de acessório chegar de `/api/ops/inventory` a `PdvCatalogProduct`;
- transportar `accessorySelection` por todos os tipos e mapeamentos até `Venda.payload.lines[]`;
- impedir a consolidação de linhas com seleções diferentes;
- preservar a seleção em venda em espera, rascunho, correção de itens, devolução, histórico e impressão.

## 2. Branch, worktree e base analisada

- Worktree: `C:\Projetos\omni-gestao`.
- Branch atual: `recover/cosmos-auth-diag-011-on-current-main`.
- HEAD analisado para a arquitetura de produção: `b5b6d0a2e2ac6d5b492f4c3f4b730336e67109dc`.
- `origin/main` local: `93b4190ceff7dd11274ff04e5722b3212150af7f` — `feat(catalogo): expandir seeds de peliculas revisados`.
- O commit mínimo exigido, `93b4190`, está presente em `origin/main`.
- A branch atual estava um commit atrás de `origin/main`. O diff `HEAD..origin/main` contém somente documentação/seeds do catálogo e `lib/catalogo-aparelhos/peliculas.test.ts`; não altera os contratos de produção de PDV, venda, estoque, fiscal ou financeiro auditados.
- Para considerar a base esperada, os seeds de modelos e aliases foram lidos diretamente de `origin/main`. Nessa base, `samsung_galaxy_a06` existe como modelo canônico e seus aliases incluem `A06`, `Galaxy A06`, `Samsung A06` e `Samsung Galaxy A06`.
- Nenhuma troca de branch, worktree adicional, reset, restore ou stash foi feita.

Já existiam arquivos não rastreados de outros trabalhos no worktree. Eles foram tratados como trabalho paralelo e não foram alterados.

## 3. Áreas e arquivos auditados

### 3.1 Seleção e roteamento dos PDVs

- `components/dashboard/vendas/vendas-pdv.tsx`
- `components/dashboard/vendas/pdv-classic.tsx`
- `components/dashboard/vendas/pdv-assistencia-enterprise.tsx`
- `components/dashboard/vendas/pdv-supermercado.tsx`
- `components/dashboard/vendas/pdv-product-dialogs.tsx`
- `components/dashboard/vendas/tabela-itens.tsx`
- `lib/pdv-catalog.ts`
- `lib/pdv-hold.ts`
- `lib/pdv-scan-product.ts`
- `lib/pdv-product-search.ts`

### 3.2 Fluxos adicionais de venda

- `app/dashboard/pdv-next/page.tsx`
- `components/pdv-next/PdvBlackEdition.tsx`
- `components/pdv-next/PdvBlackShell.tsx`
- `app/dashboard/vendas/venda-completa/page.tsx`
- `components/dashboard/vendas/venda-completa-enterprise.tsx`
- `components/dashboard/vendas/pdv-venda-completa-enterprise.tsx`

O PDV oficial alterna entre Clássico, Assistência e Supermercado. O PDV Next é experimental, mas persiste pelo mesmo motor oficial. A Venda Completa é uma rota ativa e também usa `finalizeSaleTransaction`. Portanto, o contrato compartilhado deve atendê-los; não é seguro implementar apenas a UI do Clássico.

### 3.3 Venda, carrinho, persistência, histórico e pós-venda

- `lib/operations-store.tsx`
- `lib/operations-sale-types.ts`
- `app/api/ops/venda-persist/route.ts`
- `lib/ops-upsert-venda.ts`
- `app/api/ops/vendas-list/route.ts`
- `app/api/vendas/historico/route.ts`
- `app/api/vendas/[id]/route.ts`
- `app/api/vendas/[id]/corrigir-item-meta/route.ts`
- `app/api/vendas/[id]/corrigir-itens/route.ts`
- `lib/vendas/correcao-itens-plan.ts`
- `components/dashboard/vendas/vendas-arquivo-geral.tsx`
- `components/dashboard/vendas/workspace-correcao-venda.tsx`
- `components/dashboard/vendas/trocas-devolucao.tsx`
- `app/api/ops/devolucao/route.ts`

### 3.4 Impressão, comprovante e fiscal

- `components/dashboard/vendas/cupom-nao-fiscal.tsx`
- `lib/pdv-print-runtime.ts`
- `lib/escpos.ts`
- `lib/fiscal/venda-fiscal-snapshot-service.ts`
- `lib/fiscal/venda-fiscal-snapshot.ts`
- `lib/fiscal/xml/nfce-xml-builder.ts`
- `lib/produto-fiscal.ts`

### 3.5 Produto, cadastro, estoque e catálogo de aparelhos

- `prisma/schema.prisma` — somente leitura dos models `Produto`, `Venda`, `ItemVenda` e `NotaFiscalItem`.
- `app/api/produtos/route.ts`
- `app/api/produtos/[id]/route.ts`
- `app/actions/cadastros.ts`
- `lib/cadastros/produto-upsert-metadata.ts`
- `lib/cadastros/produto-quality-score.ts`
- `components/dashboard/estoque/gestao-produtos.tsx`
- `components/cadastros/lovable/components/cadastros/produto-ia.tsx`
- `app/api/ops/inventory/route.ts`
- `lib/catalogo-aparelhos/types.ts`
- `lib/catalogo-aparelhos/catalogo-aparelhos.ts`
- `lib/catalogo-aparelhos/catalogo-loader.ts`
- `lib/catalogo-aparelhos/produto-metadata.ts`
- `app/api/catalogo/aparelhos/search/route.ts`
- `app/api/catalogo/aparelhos/produto/[id]/route.ts`
- `components/dashboard/estoque/produto-compatibilidade-aparelhos.tsx`
- `docs/catalogo/seeds/device_models_seed_001.csv`
- `docs/catalogo/seeds/device_aliases_seed_001.csv`
- `docs/catalogo/seeds/README_DEVICE_SEEDS_001.md`

## 4. Estado arquitetural atual

### 4.1 Produto

`Produto` já possui os campos centrais necessários: `id`, `storeId`, `sku`, `barcode`, `name`, `brand`, `stock`, `precoCusto`, `price`, `category`, `status`, `active` e `metadata JsonB`.

O repositório já usa namespaces extensíveis em `metadata`:

- `metadata.fiscal`, lido pelo contrato canônico de `lib/produto-fiscal.ts`;
- `metadata.catalogoAparelhos`, lido por `lib/catalogo-aparelhos/produto-metadata.ts`;
- `metadata.atributos` e `metadata.cadastroIa` no Cadastros V2.

As APIs `/api/produtos` já leem e devolvem `metadata`. O cadastro via action `upsertProduto` usa merge aditivo de dois níveis. A API REST tem helpers aditivos para fiscal e catálogo de aparelhos, mas um `metadata` bruto enviado diretamente no PATCH substitui o JSON; o futuro namespace de acessórios deve ter helper próprio de leitura, saneamento e merge, seguindo o padrão de `produto-fiscal.ts`, para não depender de callers montarem o JSON corretamente.

O status de cadastro incompleto é hoje derivado por regras de qualidade/ausência de campos, não por uma coluna dedicada ao acessório. `exigeModelo` e `exigeCor` não devem alterar `Produto.status`; validações específicas devem viver no helper do namespace e na UI do cadastro.

### 4.2 Catálogo entregue aos PDVs

`/api/ops/inventory` lê `Produto`, mas projeta apenas identidade, códigos, estoque, custo, preço, categoria e fiscal. `InventoryItem` e `PdvCatalogProduct` não possuem `metadata` nem configuração de acessório. Logo, apenas gravar `Produto.metadata.acessorios` não ativa o PDV: é necessário projetar um campo saneado, por exemplo `accessoryConfig`, em:

`Produto.metadata` → `rowToItem()` → `InventoryItem` → `mergePdvCatalogWithInventory()` → `PdvCatalogProduct`.

Recomenda-se não entregar o `metadata` bruto ao PDV. A projeção reduz acoplamento e evita expor namespaces fiscais, de IA ou integrações sem necessidade.

### 4.3 Carrinhos

- Clássico e Supermercado criam uma nova linha para cada adição normal.
- Assistência consolida uma linha quando encontra o mesmo `inventoryId` e preço.
- Venda Completa também consolida pelo `inventoryId`.
- PDV Next trabalha com `lineId`, mas sua linha não tem seleção de acessório.
- Venda em espera (`lib/pdv-hold.ts`) e rascunhos locais têm tipos próprios e hoje não carregam seleção de acessório.

Para acessórios, duas seleções distintas do mesmo produto nunca podem ser fundidas. A chave de consolidação deve incluir `inventoryId + deviceModelKey + colorKey + customColorLabel normalizada`. Quantidade pode ser incrementada apenas quando essa chave completa for igual.

### 4.4 Venda persistida

`finalizeSaleTransaction` converte as linhas dos PDVs em `SaleLineRecord`, grava o snapshot local e envia a venda inteira para `/api/ops/venda-persist`. `upsertVendaInTransaction`:

- persiste o objeto completo em `Venda.payload`;
- recria `ItemVenda` com `inventoryId`, `nome`, `quantidade`, `precoUnitario` e `lineTotal`;
- resolve o produto por id, SKU ou barcode;
- agrega a quantidade por produto e baixa o estoque principal;
- movimenta caixa/financeiro pelo total e pelo breakdown de pagamento.

`ItemVenda` não possui `metadata`. Portanto, o caminho sem schema é deliberadamente híbrido:

- descrição legível: `ItemVenda.nome`;
- seleção estruturada: `Venda.payload.lines[].accessorySelection`;
- vínculo e baixa: `ItemVenda.inventoryId`/`SaleLineRecord.inventoryId` do produto principal.

Esse padrão já existe para `isAvulso`, `custoUnitario` e metadados pós-venda de item, que vivem no payload.

### 4.5 Histórico, correções e devoluções

`/api/ops/vendas-list` prefere devolver o `Venda.payload` inteiro quando ele contém uma venda válida. O detalhe `/api/vendas/[id]` casa `ItemVenda` com `payload.lines[i]` por posição e hoje expõe apenas `line.metadata` como metadado do item. O futuro detalhe deve expor `accessorySelection` explicitamente.

O endpoint `corrigir-item-meta` preserva as demais propriedades da linha por usar spread. Já `corrigir-itens` recria `payload.lines` com uma lista fechada de campos e **descartaria `accessorySelection`**. Seu planner também casa alterações por `inventoryId`, o que não distingue combinações do mesmo acessório. Esse fluxo precisa ser incluído na Fase 4.

As devoluções locais procuram a primeira linha por `inventoryId`; duas linhas do mesmo produto com modelo/cor diferentes são ambíguas. O contrato futuro deve levar `lineId`/`lineKey` até o histórico e usar essa identidade na devolução, mantendo `inventoryId` apenas para a movimentação do produto principal.

## 5. Contrato recomendado para o Produto

Namespace recomendado:

```ts
type ProdutoAcessoriosMetadataV1 = {
  version: 1
  tipo: "capinha" | "pelicula" | "acessorio_generico"
  exigeModelo: boolean
  exigeCor: boolean
  usaCoresPadrao: boolean
  /** null/ausente = todas as cores padrão; lista = subconjunto por chave estável. */
  coresPermitidas?: string[] | null
}
```

Exemplo:

```json
{
  "acessorios": {
    "version": 1,
    "tipo": "capinha",
    "exigeModelo": true,
    "exigeCor": true,
    "usaCoresPadrao": true,
    "coresPermitidas": null
  }
}
```

Regras recomendadas:

- namespace ausente ou inválido: produto comum, sem modal;
- `exigeModelo=false` e `exigeCor=false`: produto comum, sem modal;
- booleanos sempre normalizados pelo helper, sem coerção permissiva de strings;
- `coresPermitidas` contém chaves, não labels;
- `version` permite evolução sem migration;
- leitura e escrita por helpers puros `get/sanitize/merge`, preservando `metadata.fiscal`, `metadata.catalogoAparelhos` e demais namespaces;
- o cadastro pode ter toggles “Exige modelo” e “Exige cor”, mas não deve criar variações ou alterar estoque/preço.

`metadata.catalogoAparelhos` não deve ser reutilizado como configuração do modal: ele representa compatibilidade técnica cadastrada para o produto. Se existir, seus `deviceModelKeys` podem restringir ou priorizar a lista permitida; se não existir, o modal consulta o catálogo global. A fonte dos modelos continua única.

## 6. Lista global de cores

O melhor domínio é `lib/acessorios`, não `lib/catalogo-aparelhos` e não `lib/pdv`:

- cor é contrato do acessório, não do aparelho;
- o contrato será usado por cadastro, PDVs, histórico e relatórios;
- colocá-lo no PDV impediria reutilização limpa fora da UI de venda.

Estrutura futura recomendada: `lib/acessorios/cores.ts` ou um `contracts.ts` do mesmo domínio. Em vez de strings soltas, usar chave estável e label:

```ts
const ACESSORIO_CORES_PADRAO = [
  { key: "transparente", label: "Transparente" },
  { key: "preto", label: "Preto" },
  { key: "branco", label: "Branco" },
  { key: "azul", label: "Azul" },
  { key: "azul_claro", label: "Azul claro" },
  { key: "azul_escuro", label: "Azul escuro" },
  { key: "verde", label: "Verde" },
  { key: "verde_claro", label: "Verde claro" },
  { key: "verde_escuro", label: "Verde escuro" },
  { key: "rosa", label: "Rosa" },
  { key: "lilas", label: "Lilás" },
  { key: "vermelho", label: "Vermelho" },
  { key: "amarelo", label: "Amarelo" },
  { key: "fume", label: "Fumê" },
  { key: "dourado", label: "Dourado" },
  { key: "prata", label: "Prata" },
  { key: "colorida", label: "Colorida" },
  { key: "outra", label: "Outra" }
] as const
```

Na venda devem ser persistidos `colorKey` e `colorLabel`. A chave dá estabilidade a filtros; o label é snapshot histórico caso a apresentação mude. Para `outra`, uma evolução compatível adiciona `customColorLabel`; enquanto esse campo livre não for implementado, “Outra” pode ser gravada literalmente ou ocultada da UI para produtos que exigem cor, evitando uma seleção sem informação útil.

## 7. Reaproveitamento da base única de aparelhos

O repositório já possui a cadeia necessária:

1. `device_models_seed_001.csv` fornece `modelKey`, marca e nome canônico.
2. `device_aliases_seed_001.csv` fornece aliases e flags de ambiguidade.
3. `catalogo-loader.ts` lê os CSVs no servidor e monta cache por processo.
4. `searchDeviceModels()` busca por nome canônico, nome curto e alias, priorizando exato, prefixo e contém.
5. `/api/catalogo/aparelhos/search?q=...` expõe o autocomplete autenticado ao client.

O modal do PDV deve chamar essa API; não deve importar CSV no client, copiar modelos para constante, criar tabela própria de capinhas ou gravar uma lista duplicada no produto.

Regras de busca recomendadas:

- iniciar com dois caracteres, como a API atual;
- debounce curto, cancelando a requisição anterior;
- mostrar marca, `canonicalName` e alias que casou;
- respeitar `ambiguous` e `requiresBrandContext`; aliases como `A06` exigem confirmação visual da marca;
- não aceitar texto livre como modelo quando `exigeModelo=true`; a confirmação deve carregar um `modelKey` existente;
- se `metadata.catalogoAparelhos.deviceModelKeys` estiver preenchido para o produto, limitar ou priorizar resultados a essas chaves conforme regra explícita de negócio.

Risco operacional já existente: o loader lê arquivos em `docs/` no runtime. Em deploy serverless, os seeds precisam estar no bundle; o código atual degrada para catálogo vazio se não estiverem. Antes de liberar o modal, deve haver teste/smoke de empacotamento e estado de erro “Catálogo indisponível”, sem permitir confirmar um campo obrigatório vazio.

## 8. Contrato recomendado para a linha do carrinho/venda

```ts
type AccessorySelectionV1 = {
  version: 1
  deviceModelKey?: string
  deviceBrand?: string
  deviceModelName?: string
  colorKey?: string
  colorLabel?: string
  customColorLabel?: string
}

type SaleLineRecord = {
  lineId?: string
  inventoryId: string
  name: string
  quantity: number
  unitPrice: number
  lineTotal: number
  accessorySelection?: AccessorySelectionV1
  // campos atuais permanecem
}
```

Exemplo:

```json
{
  "lineId": "line-...",
  "inventoryId": "CAP-SIL-001",
  "name": "Capinha silicone — Samsung Galaxy A06 — Preto",
  "quantity": 1,
  "unitPrice": 25,
  "lineTotal": 25,
  "accessorySelection": {
    "version": 1,
    "deviceModelKey": "samsung_galaxy_a06",
    "deviceBrand": "Samsung",
    "deviceModelName": "Samsung Galaxy A06",
    "colorKey": "preto",
    "colorLabel": "Preto"
  }
}
```

O exemplo original usa `deviceModelName: "Galaxy A06"`, mas o seed canônico atual contém `Samsung Galaxy A06`. Recomenda-se salvar exatamente o `canonicalName` devolvido pela API e armazenar `deviceBrand` separadamente. O helper de apresentação deve evitar duplicar marca se o nome canônico já a contém.

Um helper puro deve montar a descrição:

```text
produto base [— modelo, se selecionado] [— cor, se selecionada]
```

O `name` expandido é importante porque as telas e impressões atuais já renderizam o nome sem conhecer metadados. A seleção estruturada, porém, é a fonte para filtros e não deve ser reconstruída por parsing do nome.

`lineId` ou uma `lineKey` equivalente precisa ser preservada no snapshot para pós-venda. `inventoryId` continua sendo a identidade do estoque, mas não distingue duas combinações vendidas na mesma venda.

## 9. UX recomendada do modal

### 9.1 Disparo

Ao selecionar, clicar, bipar ou usar atalho para um produto com `accessoryConfig`, o PDV deve validar estoque e abrir o modal **antes** de inserir a linha. Todos os caminhos de adição devem passar por uma função compartilhada; atalhos/scan não podem contornar a exigência.

Se o produto também tiver atributos genéricos ou venda por peso, a ordem dos modais precisa ser explícita. Para o escopo de acessórios, recomenda-se impedir combinações contraditórias no cadastro ou encadear: seleção do acessório → atributos adicionais → inclusão. Nunca abrir dois dialogs simultâneos.

### 9.2 Conteúdo

1. Título com nome e preço do produto.
2. Busca de aparelho quando `exigeModelo` ou quando a seleção opcional de modelo estiver habilitada.
3. Resultados com marca, nome canônico, alias encontrado e aviso de ambiguidade/revisão.
4. Chips de cor usando a lista global ou o subconjunto de `coresPermitidas`.
5. Resumo da linha que será adicionada.
6. Botões Cancelar e Adicionar.

### 9.3 Validação

- modelo obrigatório quando `exigeModelo=true`;
- cor obrigatória quando `exigeCor=true`;
- campos opcionais podem ficar ausentes;
- Cancelar fecha sem alterar carrinho, estoque ou busca;
- Confirmar não muda preço;
- a quantidade original do scan/atalho deve ser preservada após o modal;
- modal não confirma enquanto a busca obrigatória está em erro ou sem seleção canônica;
- ao confirmar, foco retorna ao campo operacional correto do PDV.

### 9.4 Linhas e quantidade

- mesma seleção completa: pode incrementar quantidade;
- mesmo produto com modelo ou cor diferente: cria outra linha;
- edição de quantidade atua por `lineId`, não por `inventoryId`;
- alteração de seleção deve reabrir o modal da linha e manter preço/quantidade;
- venda em espera e rascunho devem restaurar o objeto estruturado.

## 10. Apresentação no carrinho, cupom e histórico

Apresentação principal:

```text
Capinha silicone — Samsung Galaxy A06 — Preto
```

O nome expandido deve aparecer em:

- linha do carrinho dos cinco fluxos roteados/operacionais;
- resumo antes do pagamento;
- impressão HTML e ESC/POS;
- cupom não fiscal;
- `ItemVenda.nome` e detalhe/histórico da venda;
- devolução/troca e workspace de correção.

O renderer ESC/POS atual trunca o título para a largura da bobina. Para não esconder modelo/cor, a implementação deve preferir quebra em mais de uma linha ou imprimir uma segunda linha de detalhe; não deve depender de um título único truncado em 32/48 caracteres.

No fiscal, o snapshot atual usa `ItemVenda.nome` como `descricao` e o XML usa essa descrição em `xProd`. Portanto, o nome expandido chegaria ao documento fiscal sem mudar NCM/CEST/CFOP. Antes da ativação fiscal, o helper deve aplicar o limite/normalização exigido para `xProd` e preservar o conteúdo mais informativo possível. Não alterar o módulo fiscal nesta feature; apenas garantir que a descrição produzida respeita seu contrato.

## 11. Persistência sem quebrar estoque, fiscal, caixa ou financeiro

### 11.1 Estoque

- `inventoryId` permanece o id/SKU/barcode do produto genérico.
- `upsertVendaInTransaction` já agrega quantidades por produto e faz baixa atômica anti-negativo.
- Duas linhas “A06/Preto” e “iPhone 11/Azul” baixam duas unidades da mesma `Capinha silicone`.
- `MovimentacaoEstoque.produtoNome` continua com o nome cadastral do produto, não com a combinação.
- Não criar saldo por modelo/cor, depósito virtual, SKU derivado ou movimentação paralela.

### 11.2 Fiscal

- produto fiscal continua sendo resolvido por `inventoryId` no `Produto` principal;
- NCM, CEST, CFOP, CST/CSOSN, origem e unidades continuam vindo de `Produto.metadata.fiscal`;
- `produtoId`, `codigoProduto` e GTIN não mudam;
- modelo/cor são complemento descritivo/snapshot da linha;
- nenhuma combinação cria `NotaFiscalItem` com outra identidade tributária.

### 11.3 Caixa e financeiro

- `unitPrice`, `lineTotal`, desconto, total e `paymentBreakdown` não são alterados pela seleção;
- `finalizeSaleTransaction`, sessão de caixa, formas de pagamento, contas a receber e vale/crédito continuam iguais;
- nenhum campo de `accessorySelection` participa de cálculo monetário;
- o payload adicional é apenas auditoria/histórico.

### 11.4 Persistência mínima do MVP

1. O PDV constrói `name` expandido e `accessorySelection` validado.
2. `finalizeSaleTransaction` copia ambos para `SaleLineRecord`.
3. `/api/ops/venda-persist` valida tamanho/formato e grava o payload completo.
4. `ItemVenda.nome` recebe o nome expandido; os demais campos permanecem iguais.
5. O detalhe da venda combina `ItemVenda` e `payload.lines[i]` e devolve a seleção.

O servidor não deve confiar apenas no client. Na persistência, deve sanear chaves/labels, limitar tamanho e exigir os campos coerentes com a configuração atual do produto. Para não invalidar uma venda legítima se o cadastro mudar entre adição e finalização, a configuração usada pelo carrinho pode ser tratada como snapshot, mas `deviceModelKey` deve existir no catálogo e a linha deve permanecer vinculada ao produto da loja.

## 12. Relatórios futuros

Com `accessorySelection` estruturado no payload, é possível inicialmente extrair:

- capinhas vendidas por `deviceModelKey`;
- capinhas por `colorKey`;
- películas por aparelho;
- acessórios por marca/modelo;
- combinações mais vendidas para sugerir reposição.

Regras de agregação:

- agrupar por chaves, exibir labels de snapshot;
- excluir vendas canceladas e descontar devoluções;
- usar `quantity`, não contar apenas linhas;
- separar `tipo` do produto ou gravar um snapshot `accessoryType` na linha para evitar depender do cadastro atual;
- nunca fazer parsing do `name` expandido.

Consulta inicial pode usar `jsonb_array_elements(Venda.payload->'lines')`. Esse caminho serve para MVP/validação, mas não é adequado a alto volume: não há coluna/index por seleção, o histórico atual já aplica alguns filtros de payload em memória, e o casamento da linha por posição é frágil.

Quando o relatório virar requisito operacional, avaliar schema dedicado — preferencialmente `ItemVenda.metadata JsonB` com índices por expressão ou colunas `deviceModelKey`/`colorKey` conforme volume e padrões reais de consulta. Essa é uma decisão da Fase 5, não condição para iniciar o MVP.

## 13. Riscos e guardrails

| Risco | Evidência atual | Mitigação recomendada |
|---|---|---|
| Configuração não chega ao PDV | `rowToItem`, `InventoryItem` e `PdvCatalogProduct` omitem acessórios | Projetar `accessoryConfig` saneado no catálogo operacional |
| Fluxos divergentes | Há Clássico, Assistência, Supermercado, Venda Completa e PDV Next | Contrato compartilhado e componente/modal reutilizável; testes por fluxo |
| Seleções distintas são consolidadas | Assistência e Venda Completa agrupam por `inventoryId` | Chave de linha inclui seleção completa |
| Devolução escolhe linha errada | Pós-venda usa `find` por `inventoryId` | Persistir/usar `lineId` ou `lineKey` |
| Correção apaga seleção | `corrigir-itens` reconstrói `payload.lines` com campos fechados | Levar seleção ao planner/draft e preservá-la explicitamente |
| Venda em espera/rascunho perde seleção | Tipos locais não têm o campo | Acrescentar campo opcional e testar round-trip/localStorage antigo |
| Histórico depende da posição | Detalhe casa `ItemVenda` e payload por índice | Preservar ordem no MVP; evoluir para identidade de linha |
| Impressão térmica oculta modelo/cor | ESC/POS trunca o título | Quebrar detalhe em linha adicional e testar 58/80 mm |
| Descrição fiscal longa | `ItemVenda.nome` alimenta `xProd` | Helper com normalização/limite fiscal, sem mudar tributos |
| Catálogo vazio em produção | Loader degrada quando `docs/` não entra no bundle | Garantir tracing/bundle e mostrar erro bloqueante para campo obrigatório |
| Alias ambíguo selecionado incorretamente | Busca já sinaliza `ambiguous`/`requiresBrandContext` | Mostrar marca e exigir escolha de resultado canônico |
| Metadata sobrescrita | PATCH REST aceita substituir `metadata` bruto | Helper `mergeAcessoriosIntoMetadata` e payload específico |
| Relatório lento | Seleção dentro de array JSONB sem índice | MVP por JSON; schema/index só quando relatórios entrarem em produção |
| Estoque agregado diverge do físico por variante | Saldo é único no MVP | Assumir explicitamente, medir divergência e não prometer disponibilidade por combinação |
| Configuração alterada entre carrinho e persistência | Produto pode ser editado durante a venda | Snapshot da seleção + validação tolerante e auditável no servidor |

## 14. Fases recomendadas de implementação

### Fase 1 — contratos puros

- criar domínio `lib/acessorios`;
- definir configuração de produto versionada;
- definir cores por chave/label;
- definir `AccessorySelectionV1`;
- criar saneadores e merges não destrutivos;
- criar helper de descrição e chave de consolidação;
- adicionar testes de contrato, descrição, “Outra”, campos opcionais e compatibilidade com payload antigo.

Critério de saída: nenhuma UI e nenhum side effect; contratos cobrem casos obrigatórios/opcionais e nunca alteram valores monetários.

### Fase 2 — cadastro de produto

- adicionar controles “Exige modelo/cor” nos dois cadastros relevantes;
- gravar `metadata.acessorios` via helper específico;
- preservar fiscal, catálogo de aparelhos, atributos e IA;
- projetar `accessoryConfig` em `/api/ops/inventory`, `InventoryItem` e `PdvCatalogProduct`;
- não alterar schema, seeds, preço ou estoque.

Critério de saída: round-trip criar/editar/reabrir produto e catálogo do PDV recebe apenas a configuração saneada.

### Fase 3 — PDVs

- componente compartilhado do modal;
- busca por `/api/catalogo/aparelhos/search`;
- chips de cor;
- interceptar clique, Enter, scan, atalho e voz quando aplicável;
- aplicar nos PDVs Clássico, Assistência, Supermercado, Venda Completa e PDV Next antes de considerar rollout completo;
- preservar seleção em venda em espera/rascunho;
- separar linhas por seleção e exibir descrição expandida.

Critério de saída: nenhuma rota de adição contorna os obrigatórios; cancelar não adiciona; preço não muda.

### Fase 4 — persistência e pós-venda

- estender `SaleLineRecord`, contrato de `finalizeSaleTransaction` e `SalePayload.lines`;
- validar/sanear no servidor;
- persistir em `Venda.payload.lines[].accessorySelection` e `ItemVenda.nome`;
- expor no detalhe e histórico;
- preservar em correção de itens;
- usar identidade de linha em devolução/troca;
- imprimir sem truncar informação essencial;
- testar snapshot fiscal para confirmar produto/tributos principais inalterados.

Critério de saída: round-trip PDV → banco → histórico → comprovante → devolução mantém seleção e baixa somente o produto principal.

### Fase 5 — relatórios

- consultas por modelo/cor/tipo, líquidas de cancelamento/devolução;
- medir volume e plano de execução;
- decidir entre extração JSONB, `ItemVenda.metadata` indexado ou colunas dedicadas;
- reposição sugerida permanece analítica até existir controle de estoque granular confiável.

## 15. Cenários mínimos de validação futura

1. Capinha exige modelo e cor: confirmar A06/Preto e vender uma unidade.
2. Mesmo produto A06/Preto duas vezes: uma linha com quantidade 2, se a regra de consolidação for adotada.
3. Mesmo produto A06/Preto e iPhone 11/Azul: duas linhas, estoque total -2.
4. Exige apenas modelo; exige apenas cor; ambos opcionais.
5. Cancelar modal: carrinho inalterado.
6. Alias ambíguo `A06`: marca visível antes da confirmação.
7. “Outra”: label livre preservado quando essa evolução estiver habilitada.
8. Venda em espera e restauração de rascunho.
9. Reenvio de venda pendente e idempotência.
10. Histórico e cupom mostram nome expandido.
11. ESC/POS 58 mm e 80 mm não ocultam seleção.
12. Fiscal resolve o mesmo `Produto`, NCM/CEST/CFOP e GTIN.
13. Caixa e breakdown de pagamento idênticos ao cenário sem seleção.
14. Correção de itens preserva seleção não editada.
15. Devolução seleciona a combinação correta e devolve uma unidade ao produto genérico.
16. Catálogo de aparelhos indisponível bloqueia confirmação quando modelo é obrigatório.

## 16. Conclusões obrigatórias

1. **Branch/worktree analisada:** `recover/cosmos-auth-diag-011-on-current-main` em `C:\Projetos\omni-gestao`.
2. **Base `origin/main` usada:** `93b4190`, incluindo a expansão esperada dos seeds.
3. **Arquivos/áreas auditadas:** PDVs oficiais e adicionais, carrinhos, catálogo operacional, produto/cadastro, aparelho/aliases, persistência, estoque, impressão, histórico, correções, devolução, fiscal, caixa/financeiro e relatórios.
4. **Indicação no produto:** `Produto.metadata.acessorios`, contrato versionado e saneado, sem mudar `status` ou schema.
5. **Lista de cores:** domínio `lib/acessorios`, com chave estável + label e evolução para `customColorLabel`.
6. **Base única de aparelhos:** reutilizar seeds, loader, busca e API já existentes; nenhuma segunda base.
7. **Modal:** aberto antes da inclusão por qualquer caminho, com busca canônica, chips, validação condicional, cancelar e confirmar sem mudar preço.
8. **Carrinho/cupom:** nome expandido e seleção estruturada; linhas distintas por combinação.
9. **Persistência segura:** seleção em `Venda.payload.lines[]`, nome em `ItemVenda.nome`, produto principal em `inventoryId`; estoque/fiscal/caixa inalterados.
10. **Riscos:** propagação ausente, múltiplos PDVs, consolidação/devolução por `inventoryId`, correção que perde metadado, impressão truncada, loader de seeds e relatórios JSONB sem índice.
11. **Fases:** contratos, cadastro, PDVs, persistência/pós-venda e relatórios.
12. **Arquivo criado:** somente `docs/audits/PDV_ACESSORIOS_MODELO_COR_AUDIT_001.md` por esta auditoria.
13. **Código de produção alterado:** não.
14. **Schema alterado:** não.
15. **Seeds alterados:** não.
16. **Commit:** não realizado.
17. **Push:** não realizado.
