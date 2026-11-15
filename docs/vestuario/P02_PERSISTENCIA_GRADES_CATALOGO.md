# P02 — Persistência de grades e catálogo de variações

GOAL: `OMNI-VESTUARIO-P02-PERSISTENCIA-GRADES-CATALOGO-001`. Base: `cdce14a3d049e1977ecd295a4b0d15c501dc995e`
(`main`, PR #357/P01 integrada), revalidada em 15/11/2026. Referências: `P01_CONTRATOS_COMPATIBILIDADE.md` e o
plano técnico `OMNI-VESTUARIO-VARIACOES-MARKETPLACE-001` (seções DATA_MODEL, BARCODE e MIGRATION).

## Limite da entrega

Cadastro real de grades, tamanhos, cores, produto com grade e variações, com integridade no banco e UI no
Cadastros HUB. **Não** entrega estoque, venda, reserva, etiqueta, código de barras gerado, GTIN, Mercado Livre,
Omni Print ou Electron. Flags de estoque e venda continuam forçadas a `false`. Nenhuma migration ou escrita em
Production; nada mergeado.

## Modelo (migration `20261115120000_vestuario_p02_grades_catalogo`)

| Tabela | Papel | Integridade |
|---|---|---|
| `vestuario_grades` | Grade de tamanhos da loja (Adulto, Jeans, Calçados, Infantil…) | Nome único por loja após normalizar caixa/acento/espaço (`nomeKey`); `version` para concorrência otimista. |
| `vestuario_grade_tamanhos` | Valores autorizados de uma grade, ordenáveis, ativáveis | FK `(storeId, gradeId)`; rótulo único na grade; trigger impede renomear tamanho já usado e mudar de grade/loja. |
| `vestuario_cores` | Cor comercial, HEX opcional (estampa pode não ter), ordem, ativa | Nome único por loja normalizado; CHECK de HEX `#RRGGBB`. Renomear cor usada é permitido (identidade é o `id`). |
| `vestuario_produtos_grade` | **Fonte autoritativa** do modo COM_GRADE (1:1 com o pai) | FK composta `(produtoId, storeId) → estoque_produtos(id, storeId)`; produto e grade imutáveis; sem DELETE. |
| `vestuario_variantes` | Combinação cor × tamanho de um produto | FKs compostas com `storeId` para produto/grade, cor e tamanho **da grade do produto**; unique `(storeId, produtoId, corId, tamanhoId)`; cor/tamanho/produto imutáveis; sem DELETE. |

Sem linha em `vestuario_produtos_grade` o produto é simples — todo o legado continua assim (zero backfill,
`gradePlanejada`/metadata livre/atributos não são convertidos). O pai também recebe o marcador P01
`metadata.vestuario = {contract:"omni.vestuario.catalog", version:1, mode:"COM_GRADE", gradeId}` na mesma
transação: é o que mantém os writers legados de venda e estoque recusando o produto (`VARIANTE_OBRIGATORIA` /
`VESTUARIO_NAO_OPERACIONAL`) sem nenhuma mudança neles.

FKs são todas `RESTRICT` (nada em cascata). Cor/tamanho usados não podem ser excluídos; desativar é a saída.

### Identidade, SKU e código interno

- `varianteId` = `cuid()` do servidor. Não deriva de SKU, rótulo, cor, tamanho ou posição na matriz.
- SKU (opcional na P02) e `barcodeInterno` (reservado à P03) são gravados normalizados: NFKC, maiúsculas, sem espaço,
  charset `[A-Z0-9._/-]` para SKU e ASCII visível para o código interno (CHECK no banco).
- Colisão bloqueada no banco, nos dois sentidos, para todos os writers (inclusive legados): variante × `sku`/`barcode`
  de produto da mesma loja (comparados por `upper(btrim())`), e SKU × código interno entre variantes. Advisory lock
  transacional por loja na mesma chave: **exclusivo** para quem grava código de variação, **compartilhado** para
  produtos — cadastros legados não se serializam entre si, e variação × produto nunca passam juntos sem que um
  enxergue o outro já commitado. Uma gravação de código de variação espera transações de produto abertas da loja
  (ex.: importação) por **no máximo 3 s** (`lock_timeout`) e então desiste com CONFLICT, sem gravar nada. Enquanto
  ela está na fila, o PostgreSQL também segura novos cadastros de produto com SKU/barcode da mesma loja — por isso
  a espera é limitada a esses 3 s.
- Nenhum código é gerado. Sem SKU **e** código interno a variante fica em **Rascunho**; com os dois, "Cadastro
  completo" — que ainda não significa vendável nem estocável. GTIN não existe nesta fase.

### Preço e custo

Pai: colunas legadas (`price`, `price_cost`, Float), sem conversão. Variante: override opcional de preço em
centavos (`precoCentavos`) e custo de referência em milionésimos (`custoMicros`), pelo contrato monetário P01
(HALF_UP, string decimal; "1.005" ambíguo é recusado). Vazio = herda o preço do pai. Nada disso alimenta PDV,
custo médio, fiscal ou financeiro ainda.

### Fotos

Não implementado: o HUB não tem hoje fluxo de associar `ProductMedia` por cor e não há upload de mídia no cadastro
de produto. Fica para fase com upload/etiqueta; nenhum campo ou botão fictício foi criado.

## Writer e autorização

`lib/vestuario/catalog-service.ts` (server-only) é o único writer das tabelas novas: uma transação por operação
com auditoria em `logs_auditoria` (`action vestuario.*`, `source vestuario-catalog-service`), validação Zod
estrita (chave extra como `storeId` no payload é recusada), pré-checagem amigável de colisão e tradução estável
dos erros de constraint/trigger. O pai é criado pelo writer canônico `createProductTx` (estoque 0, mesmas
validações/auditoria do cadastro simples) dentro da mesma transação — sem bypass do writer de venda/estoque.

`app/actions/vestuario-catalogo.ts`: cada Server Action exige sessão, módulo `catalog`, loja autorizada para a sessão
(`requireCadastrosActionAccess`, perfil hub) e a flag da loja. O `storeId` recebido só escolhe a loja; nunca é
autoridade. Falhas são devolvidas (não lançadas). Concorrência: `catalogVersion`/`version` (expectedVersion).

### Flags (`lib/vestuario/feature-flags.server.ts`)

Catálogo liga só com `VESTUARIO_CATALOG_ENABLED=1` **e** loja em `VESTUARIO_STORE_ALLOWLIST` **e**
`VERCEL_ENV` diferente de `production`. Estoque e venda: sempre `false`, mesmo solicitados.

## UI (Cadastros HUB)

- Aba **Grades e variações** — só aparece quando o servidor habilita a loja. Seções: Produtos com grade
  (lista paginada por cursor, busca), Grades de tamanho (criar, renomear, ordenar, desativar; tamanho em uso
  bloqueado para renomear), Cores (criar, renomear, HEX, ordenar, desativar).
- **Novo produto** no Cadastro de Produtos pergunta a modalidade (simples × com grade) quando habilitado.
- Editor do produto com grade: dados comuns (categorias/marcas/fornecedores existentes como sugestão), grade
  (imutável depois de criado), cores, **matriz cor × tamanho** com somente as combinações marcadas, tabela de
  variações (SKU, preço próprio, situação, desativar). Avisos explícitos de que estoque/venda/etiqueta não estão ativos.
- Troca de loja: painel remontado por loja e toda resposta descartada se a loja ou a sequência mudou.

## Validação

Ver `docs/ai-execution/_evidence/OMNI-VESTUARIO-P02-PERSISTENCIA-GRADES-CATALOGO-001/` (ensaio da migration,
integração em PG real, E2E com build de produção e NextAuth real, capturas desktop/mobile) e o workflow
`.github/workflows/vestuario-p02.yml`. Ordem futura de deploy/migration e rollback: `P02_DEPLOY_E_ROLLBACK.md`.

## Limitações conhecidas

- Exclusão **em lote** (`/api/produtos/bulk-action`) que inclua um pai com grade aborta o lote inteiro sem alterar
  nada (FK RESTRICT); exclusão individual devolve mensagem clara. Inativação em lote do pai já era recusada desde a P01.
- O trigger compara SKU legado por `upper(btrim())`; um SKU legado com acento (ex.: `CAMISÁ`) não colide com `CAMISA`.
- Writers legados que não passam pelo writer canônico de produto (ex.: importações antigas, item avulso, adapters
  de OS) recebem o unique violado (P2002) sem contexto quando o código coincide com o de uma variação; quem trata
  P2002 como "já existe" pode procurar um produto inexistente. Só ocorre em loja com variações (hoje: QA).
- A checagem variante × produto legado varre os produtos da loja uma vez por comando (trigger por instrução, sem
  índice de expressão novo em `estoque_produtos`): custo proporcional ao catálogo da loja, só ao gravar código de
  variação (500 variações: 0,24 s numa loja sintética de 50 mil produtos).

## Dependências para a P03

Geração/registro do código interno (`OGV-…`), unicidade entre aliases, GTIN separado com evidência de origem,
lookup por bipe exato e impressão de etiqueta (Code 128) — usando `vestuario_variantes.barcodeInterno` e os
triggers de colisão já existentes. Fotos por cor dependem de fluxo de mídia. Estoque/venda: P04/P06/P07.

**P03 NÃO AUTORIZADA nesta execução.**
