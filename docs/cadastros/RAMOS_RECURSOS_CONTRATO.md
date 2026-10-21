# Configurações por ramo e Cadastros adaptados

Continuação da missão de Configurações + Cadastros, incorporando o adendo de
recursos combináveis. Não cria nem renumera GOAL. Base: `8aed9e1d7c7891fd1e6f53b60da53679be0f1117`.
AEP opt-in inativo nesta worktree; nenhum state, ledger ou registry é alterado.

## Responsabilidade e fronteiras

O executor desta missão é o único responsável pelos contratos compartilhados:
`lib/capabilities-persistence-v1.ts`, configuração por loja, validação, merge,
provider e contrato de produto. Frente A edita Configurações gerais; frente B
consome o mesmo contrato no Cadastros HUB e no ProductWriteService.

Todos os 16 caminhos da allowlist N5-C rev5 ficam reservados à frente PDV,
incluindo Classic, Assistência, Supermercado, Venda Completa, testes de auditoria,
E2E e `generated/prisma/**`. Nenhum desses fontes será modificado nesta missão.
O contrato de quantidade inteira, retry, efeitos pós-venda e StockLedger fica
preservado. A única ligação de segurança da preparação de peso será uma rejeição
server-side de novos usos incompatíveis, sem mudar cálculo ou saldos.

## Contrato canônico

`StoreSettings.printerConfig.capabilities`, versão 1, concentra `business`
(ramo principal e padrões de apresentação) e `overrides` (escolhas explícitas).
Não existe armazenamento de ramo no navegador. `Store.profile` é somente fallback
para lojas legadas sem configuração nova. Uma leitura não grava nem reclassifica.
O ramo sugere recursos; overrides explícitos têm precedência sobre todo preset.
Recursos não concedem plano, autorização ou suporte operacional.

Configurações gerais é o editor oficial. Cadastros contém somente um link para
esse editor. A apresentação usa os componentes, tipografia e tokens existentes,
com ramo e estado de cada recurso legíveis e controles acessíveis em celular.

Venda por peso e grade comercial admitem preparação declarada, sem simular
estoque por variação nem fracionamento. Balança continua bloqueada e separada da
declaração de produto por peso; equipamentos serão configurados por terminal.
Acessórios, compatibilidade e assistência são escolhas independentes.

## Preservação e publicação

Patch parcial preserva campos omitidos, overrides e padrões explícitos, com merge
sob o advisory lock por loja existente. Formulários omitem seções ocultas.
O writer canônico preserva metadata não enviado. Troca de ramo não escreve em
Produto, estoque, preço, unidade, vínculos ou histórico.

A declaração comercial versionada do produto usa metadata descritivo, sem saldo
paralelo. Produto por peso permanece bloqueado para venda por unidade no servidor
até integração real de quantidade, catálogo e estoque no PDV Clássico.

Publicação depende de testes de contrato/patch/isolamento, regressões, typecheck,
lint, build proporcional aos recursos e smoke de navegador. Há menos de 1 GB livre
no disco: reutilizar dependências existentes e executar somente um build por vez.
Commit, push e PR seguem o escopo desta missão; merge/deploy exigem autorização
aplicável. Sem migrations, escritas de produção ou alteração de autoridade de banco.

## Entrega e semântica de patch

- Editor: Configurações → Geral → Ramo e recursos. Cadastros contém somente
  `/dashboard/configuracoes?sec=geral#ramo-recursos`.
- A versão 1 foi estendida sem criar outro registro de flags. `business` e
  `overrides` fazem parte do mesmo envelope. Override explícito, inclusive `false`,
  prevalece sobre qualquer preset. `business.presentation` também faz merge parcial.
- O PUT mantém os guards administrativos e de loja; rejeita versões, ramos, tipos
  e campos de autoridade inválidos, inclusive tentativa de limpar capabilities.
  O advisory lock e o re-read existentes serializam patches concorrentes.
- Assistência, compatibilidade e acessórios são escolhas independentes. O override
  existente `pdv.accessoryModelColor` é reutilizado, inclusive no runtime do PDV;
  a matriz de suporte da superfície continua soberana. Não há uma segunda flag
  concorrente de acessórios.
- `catalog.weight` e `catalog.variants` habilitam apenas preparação de cadastro.
  O resolver retorna `operational: false`. `pdv.scale` e `sale.fractionalQty`
  continuam explicitamente bloqueados. Preferência não concede suporte ou permissão.
- O adapter legado de perfil consome o mesmo envelope. Seu GET também valida
  acesso à loja; falha de leitura não inventa uma loja nem um perfil.

Exemplo de loja mista (sem exigir ramo Padaria ou Moda):

```json
{
  "version": 1,
  "business": { "primaryBranch": "variedades" },
  "overrides": {
    "catalog.weight": true,
    "catalog.variants": true,
    "service.technical": false,
    "catalog.deviceCompatibility": false,
    "pdv.accessoryModelColor": false
  }
}
```

O produto possui aplicação explícita de compatibilidade/acessórios em
`metadata.cadastroRecursos`; produtos legados usam seus próprios vínculos como
fallback de apresentação. Nome e categoria não inferem comportamento. Os campos
comuns, garantia e fiscal permanecem. Navegação, cards, categorias de equipamento,
exemplos de serviços/fornecedores e placeholders foram auditados.

Se a seção não é renderizada, o formulário omite `accessoryConfig`,
`catalogoAparelhos` e `atributos.modeloCompativel`. O writer preserva o metadata
existente pelo merge canônico. Ocultar aplicação ou recurso não remove os vínculos.
`cadastroRecursos` envia somente as aplicações tocadas e ainda disponíveis.
Grade ocultada durante a edição também é omitida, sem reenviar false ou defaults.

## Handoff verificável ao PDV Clássico

Contratos versionados e Git blob SHA-1 (conteúdo normalizado pelo Git):

| Fonte | Versão | SHA |
| --- | --- | --- |
| `lib/capabilities-persistence-v1.ts` | 1 | `7182aacff91a1dfb2d64d92542ff9e55f784fe27` |
| `lib/store-business-capabilities.ts` | envelope 1 | `c6a7a4fb8b260315d7e899ca197fdb8ea13604d4` |
| `lib/cadastros/product-commercial-contract.ts` | 1 | `82d3b3cf20ed22ee07e2d2a613853d1476605a49` |

Declaração comercial: `Produto.metadata.comercial` com `version: 1`, `modoVenda`
(`unidade`/`peso`), `unidade` (`UN`/`KG`/`G`) e `basePreco` na mesma unidade.
`Produto.price` e o custo permanecem na base declarada; nenhum preço é convertido
ao trocar ramo. `gradePlanejada` é intenção descritiva, sem saldo por combinação.

`productCommercialCatalogProjection(metadata, price)` retorna essa declaração,
`precoNaBase`, `precisaoQuantidade` (KG: 3; G/UN: 0), `vendaPorPeso` e estados reais:
peso não operacional, estoque fracionado não operacional e grade não operacional.
Sem declaração, o produto legado continua por unidade. Declarações legadas de
peso também falham fechadas; ocultação nunca as transforma em unidade.
Uma declaração `comercial` presente e inválida não equivale a ausência: a
projeção informa `declaracaoComercialInvalida: true`, com `vendaOperacional: false`.
V1/V2 retornam `409 PRODUTO_COMERCIAL_INVALIDO` quando não há declaração conhecida
de peso (que mantém seu erro próprio). A UI avisa e omite esse namespace no save.
Editar campos comuns o preserva; CLEAR ou substituição por uma unidade padrão
não são permitidos. Não há normalização de saldo, unidade ou preço.

O writer não permite reinterpretar a unidade de produto já existente nem apagar
a declaração de peso por CLEAR de metadata. Novo produto por peso inicia sem
saldo. Criação/preparação é validada usando a loja provada pelo servidor.

A projeção operacional antiga de InventoryItem ainda não consome esse descriptor.
Integração futura deve reconciliar a origem do catálogo em `lib/operations-store.tsx`,
`InventoryItem.vendaPorPeso`/`precoPorKg`, o Classic reservado à N5-C e o contrato
de quantidade/StockLedger. Não retirar bloqueios atuais nem reinterpretar saldos.
A proteção adicionada à resolução server-side do produto rejeita peso mesmo
quando o carrinho envia quantidade inteira; V1/V2 retornam
`409 PRODUTO_POR_PESO_NAO_OPERACIONAL`. Não altera retry, finalização ou efeitos.
O writer de cadastro também relê o produto sob `FOR UPDATE` com id + loja, antes
do merge de metadata. Patches concorrentes não substituem chaves omitidas a partir
de um snapshot antigo. Usa a mesma linha que o ledger já trava, sem alterar o ledger.

Aceite operacional FUTURO: `0,350 kg × R$ 20,00/kg = R$ 7,00`; estoque
`10,000 kg → 9,650 kg`; repetição sem baixa duplicada; cancelamento e devolução
recompõem a mesma grandeza. Esses cenários transacionais por peso ainda não foram
entregues nem declarados aprovados. Marca/modelo e homologação da balança pendem.

## Verificação desta implementação

As contagens abaixo registram a implementação inicial. A revisão corretiva da
PR #295, suas reproduções e a validação posterior estão em
[`REVISAO_PR_295.md`](REVISAO_PR_295.md); o head final e a CI ficam no corpo da PR.

- Matriz combinada local: 263 testes, 18 arquivos, todos PASS, sem skips.
  Inclui contrato, permissões, isolamento, GET stale após troca de loja, nova sessão,
  concorrência de patches, preservação de metadata, duplicidade, REST, StockLedger
  existente e rejeição de peso com quantidade inteira.
- TypeScript completo: PASS com cliente Prisma privado gerado do schema corrente.
  O cliente compartilhado antigo não tinha os tipos de Pessoas da main; não foi
  alterado. A geração privada usou URLs sintéticas, sem acesso a banco.
- Lint focado: sem erros; avisos preexistentes de dependências de efeitos e de uma
  diretiva de lint no teste legado foram conservados.
- Chromium: componentes e CSS reais com I/O/contexto sintéticos, viewports 1440,
  390 e 320 px; sem overflow, erros de página ou rede externa. Novos controles
  possuem labels e seguem tokens/componentes oficiais. Não é homologação operacional.
  Evidências locais ignoradas em `test-results/ramos/`.
- Diff dos 16 padrões reservados à N5-C: vazio. WIPs e worktree principal preservados.
- Build Next completo delegado à CI isolada por limitação de espaço local.
  Workflow `Ramos e Cadastros` não recebe credenciais produtivas e mantém
  `MIGRATION_AUTHORITY_ENABLED=false`. PR/CI serão registrados na entrega.

Revisão do executor: conferidos autoridade de loja/permissão, limites de suporte,
omissão dos campos ocultos, impossibilidade de rebaixar peso para unidade e
preservação dos fontes reservados. Não substitui eventual revisão humana de merge.

## Correções após a primeira revisão independente

O parecer Claude Code no head `b2df14d` está registrado na PR e descrito em
`REVISAO_PR_295.md`. As correções seguintes foram escritas pelo Codex e serão
conferidas por outro contexto independente antes do parecer final.

- `hydrated` indica tentativa concluída para a loja atual, inclusive falha;
  `loaded` indica resposta válida confirmada. Recursos e backfill exigem `loaded`.
  O PDV mantém o fallback existente e o editor oferece recarga após erro.
- A escrita de recursos é um patch dedicado `{ printerConfig: { capabilities } }`.
  Quando `printerConfig` também contém tema, atalhos, impressão ou outra seção,
  capabilities desse snapshot é ignorado: preserva-se o valor atual sob o lock.
  Não cria outra fonte de dados nem permite reverter preferências por um blob antigo.
- Peso ou declaração inválida bloqueiam novas baixas unitárias também na correção
  de itens e no consumo/delta da OS. Entradas/ajustes de saldo via cadastro, REST,
  ações manuais e importação entre lojas são rejeitados para esses produtos.
  Importação confere origem e destino para não converter unidade/base de preço.
  Devoluções, estornos e replays de vendas confirmadas conservam os efeitos existentes.
  Nenhum cálculo ou fonte do StockLedger, quantidade, N5-C ou PR #294 é alterado.
