# P01 — Contratos e compatibilidade de vestuário

GOAL: `OMNI-VESTUARIO-P01-CONTRATOS-COMPATIBILIDADE-001`.
Base: `4d4b0d8c06a6e2a13384fc19fac1526db1e18812` (`main`, PR #353 integrada), revalidada em 15/11/2026.
Referência técnica aprovada: `docs/ai-execution/_evidence/OMNI-VESTUARIO-VARIACOES-MARKETPLACE-001/PLANO_TECNICO.md` e `EVIDENCIAS.md`, entregues localmente na auditoria anterior.

## Limite da entrega

P01 entrega contratos prospectivos, política e proteções dos writers existentes. Não entrega cadastro operacional de variantes, alteração de saldo por variante, seletor de grade, migrations, OAuth ou conexão de canal. Todas as capacidades operacionais de vestuário continuam desligadas. Não há alteração de schema Prisma, banco, Omni Print, Electron, atalhos ou componentes de PDV.

A diferença da main `5805462` auditada para a base atual foi inspecionada. A #353 acrescentou edição de OS e reconciliação financeira; os contratos de produto/venda/estoque abaixo mantêm a base atual. A configuração `vercel.json` preserva as entradas existentes e desabilita deployment automático somente para `codex/omni-vestuario-p01-contratos-001`, sem mudar a configuração do projeto remoto ou da main.

## Auditoria dos contratos atuais

| Caminho | Contrato atual | Compatibilidade nesta entrega |
|---|---|---|
| `lib/cadastros/product-commercial-contract.ts` | UN/KG/G, `gradePlanejada`, projeção comercial e guards | Não converter `gradePlanejada` em grade operacional; peso e declaração comercial inválida mantêm os erros atuais. |
| `lib/cadastros/product-write-service.ts` | Contexto confiável de loja, patch parcial, metadata extensível, writer/auditoria canônicos | Campos comuns e metadata livres continuam preservados; o contrato explícito novo não pode criar grade nem ser apagado para disfarçar um pai como simples. |
| `lib/operations-sale-types.ts`, `lib/pdv-catalog.ts` | `produtoId`, `inventoryId` legado, quantidade/preço; acessório é dado descritivo | DTOs e producers atuais não foram substituídos ou reinterpretados. |
| `lib/ops-upsert-venda.ts` | Writer compartilhado por V1/V2, transação, numeração, replay e baixa por produto | Uma referência nova de variante é recusada antes de qualquer I/O, inclusive no caminho histórico; linhas antigas seguem o fluxo existente. |
| `lib/estoque/stock-ledger-service.ts` | Lock, ownership, idempotência, saldo de produto/depósito e ledger | A mesma consulta de lock projeta apenas a declaração opcional; não movimenta grade nem abre transação/query adicional. |
| `lib/vendas/pending-sync-classification.ts` | Recusa definitiva versus resultado desconhecido | Erros novos antes de commit devolvem carrinho novo para correção; uma tentativa reaproveitada/incerta conserva sua identidade. |
| `prisma/schema.prisma` | Produto e ledger sem dimensão de variante | Intocado; persistência e integridade de variante dependem de P02 e fases posteriores. |

## Contratos versionados

`lib/vestuario/contracts.ts` exporta schemas Zod estritos, tipos e validação pura de escopo. Não importa Prisma, ambiente, fetch ou browser.

- `ProductCatalogV1`: `version: 1`, `storeId`, `produtoId`, `mode: SIMPLES | COM_GRADE`; pai com grade exige `gradeId`.
- `VariantIdentityV1`: `version: 1`, `storeId`, `produtoId`, `varianteId`, `corId`, `tamanhoId`, `sku` e `barcodeInterno`.
- `StockTargetV1`: loja, produto, depósito e discriminador `SIMPLES | VARIANTE`; alvo de variante exige `varianteId`.
- `SimpleSaleLineV1` e `VariantSaleLineV1`: linha, loja, produto, depósito, versão de catálogo, quantidade inteira positiva, preço/desconto/total em centavos. A linha de variante exige IDs e snapshots de SKU, cor, tamanho e código.
- Versão desconhecida, chave extra, controle em identificador, fração, valor não finito, overflow, desconto acima do bruto e total incoerente são recusados. Não existe downgrade silencioso para produto simples.

Esses são DTOs para adapters futuros; não são aceitos automaticamente pelo endpoint legado. Não se acrescentou um segundo writer de estoque ou venda.

### Identidade e autoridade

`varianteId` deve ser um ID opaco estável atribuído pelo servidor na futura persistência. Não deriva de rótulo, SKU, cor, tamanho ou posição da matriz. `stableVariantKey` serializa a tupla `(storeId, produtoId, varianteId)` sem colisões por separadores. Mudar SKU/nome/código não troca essa identidade nem os snapshots vendidos.

Cor e tamanho não podem ser reatribuídos à mesma identidade para significar outra combinação. A unicidade por loja, associação do tamanho à grade, identidade imutável da combinação e colisões de SKU/barcode precisam da estrutura/transação de P02: a validação pura não substitui índices/FKs nem consulta de registros autoritativos.

`validateVariantScope` compara a loja previamente autorizada com produto e variante, exige vínculo ao mesmo produto e impede associar variante a produto simples. O contexto deve vir dos gates de sessão existentes; nunca do header/payload isoladamente. Sucesso dessa função significa somente que os registros fornecidos respeitam o contrato de escopo; não prova autorização de usuário, existência no banco, preço ou saldo.

GTIN oficial é independente do código interno. `barcodeInterno` representa o identificador imprimível em Code 128; não é apresentado nem enviado como GTIN. Atribuição, evidência de GTIN, registro único de códigos e impressão ficam nas fases próprias; nenhum código ou etiqueta é gerado na P01.

### Declaração persistida explícita e legado opaco

O guard pequeno em `lib/vestuario/guard-contract.ts` não depende de Zod no caminho comum. Só considera adesão ao novo contrato o discriminador explícito abaixo:

```json
{
  "vestuario": {
    "contract": "omni.vestuario.catalog",
    "version": 1,
    "mode": "COM_GRADE",
    "gradeId": "grade-sintetica-a"
  }
}
```

Isso é exemplo de contrato, não uma instrução para gravar JSON em produção. O writer atual recusa criar/editar esse pai na P01. A ausência da declaração e valores livres como `metadata.vestuario = "camiseta"`, `null` ou objeto sem esse discriminador continuam opacos. Nem nomes, `atributos.cor/tamanho`, `gradePlanejada` ou `accessorySelection` são convertidos em prova de estoque por variação.

Uma declaração que adere ao discriminador, mas traz versão/formato desconhecido, falha fechado. Uma edição posterior não pode limpar a declaração canônica para reinterpretar o produto como simples. Linhas com o discriminador `vestuario.contract = "omni.vestuario.sale-line"`, ou com a referência prospectiva reservada `varianteId`, são recusadas pelos writers legados antes do lookup/replay/numeração. Um `line.vestuario` livre sem adesão não muda o replay antigo.

## Guards de servidor e compatibilidade dos PDVs

| Situação | Resultado nesta fase |
|---|---|
| Produto simples sem declaração nova | Comportamento existente, inclusive validação de peso e preservação de saldos/histórico. |
| Somente `gradePlanejada` ou cor/modelo de acessório | Nenhuma alteração de identidade de estoque. |
| Pai explicitamente com grade, sem variante no writer atual | `VARIANTE_OBRIGATORIA`; nenhuma movimentação confirmada. |
| Referência de variante enviada ao writer atual | `VESTUARIO_NAO_OPERACIONAL`; nem uma variante válida habilita a operação na P01. |
| Adesão ao contrato de catálogo com versão/formato desconhecido | `CONTRATO_VARIACAO_INVALIDO`; não tratar como simples. |
| Produto/variante de outra loja | Validação de escopo recusa; gates atuais de sessão/loja continuam obrigatórios. |
| Cadastro tenta introduzir ou limpar uma grade explícita | Falha de validação do writer antes de create/update/audit. |

`ProductVariantGuardError` herda `ProductCommercialInvalidError`, já traduzido pelos boundaries existentes como 409. O código anterior da declaração comercial permanece o mesmo quando não há o contrato novo. O ledger retorna os novos códigos no seu contrato de erro, antes de criar depósito ou escrever saldo/ledger. Suas queries continuam parametrizadas por produto e loja.

Os códigos novos entram na lista de recusas definitivas de venda. Para uma identidade criada na finalização e comprovadamente recusada antes do commit, o resultado é `FAILED` e o carrinho continua corrigível. Se a identidade foi reaproveitada ou o resultado anterior pode ser desconhecido, permanece `PENDING`; rede/5xx nunca passam a ser prova de ausência de venda.

PDV Clássico e Venda Completa continuam com seus produtores/carrinhos/atalhos atuais. Contratos prospectivos preservam os mesmos identificadores em ambas as superfícies futuras. Nenhuma delas ganhou seletor, venda de variante, reserva, baixa nova, impressão ou mudança de F8 nesta P01.

## Flags privadas e política online/offline

`lib/vestuario/feature-flags.server.ts` possui sentinela `server-only`. Os nomes preparados são `VESTUARIO_CATALOG_ENABLED`, `VESTUARIO_STOCK_ENABLED`, `VESTUARIO_SALE_ENABLED` e `VESTUARIO_STORE_ALLOWLIST`.

Ausência de configuração significa falso. Apenas o valor literal `1` solicita uma flag e a loja precisa constar explicitamente na allowlist; `NEXT_PUBLIC_*`, truthiness e wildcard não autorizam loja. Mesmo solicitadas, as flags operacionais retornam **false** na P01: persistência e estoque não foram liberados. Nenhuma variável local/remota foi ativada e nenhum endpoint de configuração foi criado.

`vestuarioSalePolicy` mantém `LEGACY_UNCHANGED` para simples. Para grade futura, exige variante e confirmação do servidor; permite somente rascunho offline, nunca venda confirmada ou uso do saldo local como autoridade. Todas as operações de grade continuam bloqueadas nesta fase, inclusive online. Cotas por terminal/canal, reserva, sincronização, outbox e baixa única pertencem às próximas fases autorizadas.

## Precisão monetária

`lib/vestuario/money.ts` opera apenas o contrato novo:

- Preço/desconto/total: inteiros seguros em centavos de BRL, escala 2.
- Custo: inteiro seguro em milionésimos de real, escala 6. A precisão máxima é validada; overflow é erro, nunca aproximação.
- Entrada para conversão: string decimal canônica não negativa; não aceita Number, vírgula, expoente, sinal, espaço ou NaN/Infinity.
- Arredondamento explícito HALF_UP decimal, incluindo `1.005 → 101` centavos; intermediários BigInt evitam arredondamento binário. BigInt não atravessa JSON nem exige mudar o target ES6 do projeto.
- Total: `quantidade × preço - desconto`; exige quantidade inteira positiva e recusa total negativo/inseguro.
- Média de custo: ponderação por quantidade com arredondamento apenas na escala 6. Zero explicitamente informado é custo zero no contrato novo; ausência é inválida e não vira zero. Saldo inicial zero não reaproveita o custo de mercadoria inexistente.

Nenhum cálculo acima foi conectado ao preço, custo médio, fiscal, financeiro ou estoque Float legado. Retornos, custo histórico, herança de preço por variante e projeção do custo do pai exigem implementação/QA próprias antes da ativação.

## Validação e CI

Os testes novos usam somente registros sintéticos e transações em memória, sem rede, banco, migration ou venda real. Exercitam contratos, cross-store, identidade, precisão, flags forçadas, guard integrado de cadastro/venda/ledger, metadata livre legada, replay e resultado incerto. Eles não provam constraints de uma tabela de variante que ainda não existe.

O workflow próprio `vestuario-p01.yml` usa Node 24, URLs sintéticas de loopback inacessíveis, autoridade de migration desligada, nenhum secret e nenhum deploy. Executa a suíte de contratos/regressões, lint do escopo e typecheck completo. Workflows já existentes da main mantêm suas regras e ambientes de QA; não são redefinidos nesta fase. O resultado do head revisado é registrado na PR e no relatório final da execução.

Também são executadas regressões dos dois PDVs, cadastro, estoque, permissões multiloja, writers V1/V2, fila e pendências. Impressão física, PostgreSQL de variantes e APIs de canal não são reivindicados como testados nesta fase.

## Performance, custos e rollback

O caminho comum acrescenta verificações de propriedade/discriminador e mantém a mesma quantidade de consultas. O SELECT de lock de estoque já existente projeta somente a chave `vestuario` e sua presença, sem transportar todo o JSONB; pode haver bytes/CPU adicionais se esse campo livre já contiver dados. Não há novo polling, cron, fila, serviço, projeto, índice ou consulta remota. Não se afirma custo incremental rigorosamente zero: medir a projeção JSONB quando houver homologação com banco. Não foi inspecionado billing de Vercel/Neon.

O workflow novo consome minutos de GitHub Actions; as verificações locais consomem recursos da estação. Deployment automático da branch está desligado. Não há capacidade operacional nova a sustentar no Vercel/Neon nesta P01.

Como não existe schema/movimento novo, rollback de código desta P01 não precisa de migração reversa. Antes de qualquer P02, manter guards compatíveis com o esquema real e os clientes antigos. Uma futura ativação com vendas de variantes terá política de rollback própria; nunca remover o guard de cliente antigo depois de existirem fatos com variantes sem outro mecanismo equivalente.

## Dependências explícitas de P02 e fases seguintes

1. Aprovação separada para criar/revisar/aplicar schema e migrations em QA; nenhuma é entregue aqui.
2. Entidades de variante, cor, tamanho/grade, códigos e FKs compostas por loja; unique de SKU/barcode e combinação no banco, incluindo colisões com identificadores de produtos simples.
3. Fonte persistida autoritativa para modo simples/grade e vínculo completo da variante. O marcador de compatibilidade não substitui essa estrutura.
4. Garantir a identidade cor/tamanho imutável e a associação do tamanho à grade. Manter produto legado simples por padrão, sem backfill semântico de `gradePlanejada` ou textos.
5. Revisar dependências das PRs de F8 e KG na base escolhida; não incorporar trabalho aberto automaticamente.
6. Estoque por variante, projeções, preço/custo efetivos, reservas/outbox, seletores, devoluções e disponibilidade operacional dependem das fases P04–P07, além do catálogo P02/P03.
7. Habilitação das flags só com capacidades reais revisadas e autorização da fase correspondente. OAuth/Mercado Livre e Full permanecem fora da P01.

P02 NÃO AUTORIZADA. Merge, Production e conexão de conta real continuam proibidos nesta execução.
