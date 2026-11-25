# P03 — Auditoria, contratos e modelo escolhido (QA)

GOAL `OMNI-VESTUARIO-P03-CODIGOS-ETIQUETAS-001`. Base `51265894a8a019fbd5e679003de0b08dd95feba9`.
PRs #357, #358 e #360 integradas e revalidadas. AEP opt-in inativo nesta worktree.

## Limites autorizados

Implementar identificação/etiquetas somente em QA. Nenhum merge, deployment, escrita/migration Production,
conexão Mercado Livre, impressão direta, mudança em Omni Print/Electron ou operação de estoque/venda.
O opt-in de catálogo da #360 é preservado sem mudar suas flags ou allowlist. P03 terá gate próprio privado,
desligado por padrão e bloqueado quando VERCEL_ENV=production, mesmo com opt-in de catálogo ativo.

## Auditoria P03-A

| Recurso existente | Evidência | Decisão |
|---|---|---|
| Produto simples | Produto: id, storeId, sku/barcode separados, saldo/metadata legados | Não alterar essas colunas nem reinterpretar valores para emitir código novo. |
| Variante P02 | Identidade imutável, fonte COM_GRADE em vestuario_produtos_grade, barcodeInterno opcional | Alvo simples deve consultar vínculo autoritativo; pai com grade exige variante. |
| Alias de inventário | lib/estoque/produto-codigo-alias.ts: metadata.codigosAlias, trim JS, caixa preservada | Reutilizar leitura; nenhuma migração de aliases históricos ou regravação automática. |
| Writer do alias | app/actions/inventario.ts: altera somente metadata, sem lock cross-table | Trigger aditivo deve observar mudança de aliases para impedir colisão com reservas P03. |
| GTIN | lib/cadastros/gtin.ts: EAN8/13/UPC, checksum, códigos internos 20–29 | Reutilizar validação; estender separadamente para GTIN14 sem mudar defaults antigos. |
| Lookup externo | lib/barcode-lookup: Cosmos/UPCitemdb e governança | Não chamar nem substituir; P03 resolve somente catálogo local autorizado. |
| Mídia | ProductMedia por produto, sem dimensão de cor | Não buscar URLs nem alterar mídia; imagem não é necessária à etiqueta desta fase. |
| PDF/impressão atuais | purchase-planning-pdf, print-os-via-cliente: HTML/dialog; etiqueta técnica de OS é outro contrato | Não há gerador comercial de PDF/Code128 reutilizável; criar um motor único de etiquetas. |
| Raw/Omni Print | thermal-print e /api/print/raw podem enviar TCP/HTTP; contrato fora do recorte | Não usar essa saída nem alterar seus adapters. Navegador/PDF com resultado físico incerto. |
| Leitor local | Identificação por barcode/SKU/aliases e em alguns fluxos Produto.id | Considerar também IDs ao detectar colisão. Não modificar PDV/inventário legados nesta fase. |

O lookup P03 será uma capacidade do HUB, com entrada por teclado/leitor e resultado de identificação; não
inclui automaticamente item em carrinho nem autoriza movimento. O leitor pode enviar o texto de Code128,
mas sua legibilidade física continua pendente de homologação em equipamento real.

## Modelo P03-B/C (revisão antes da migration)

Uma migration nova aditiva. Nenhuma migration histórica alterada. Cinco tabelas:

1. **Identificador**: loja, produto, variante opcional, tipo INTERNO/GTIN/ALIAS, valor original, ativo,
   proveniência/formato GTIN, ator e datas. Identidade/alvo/valor imutáveis; sem DELETE. Código desativado
   continua reservado, não é reciclado. INTERNO: um por alvo e namespace gerado globalmente único.
2. **Chave de lookup/reserva**: PK(loja,chave), alvo e identificador opcional, FKs compostas. Chaves P03
   com identificador são permanentes/imutáveis/sem DELETE. A mesma tabela também reserva atomicamente
   códigos legados NOVOS introduzidos por writers atuais (identificador NULL, referência técnica corrente,
   sem classificá-los como GTIN/interno). Reserva corrente só é liberada pelo banco quando nenhuma fonte
   viva daquele alvo contém a chave; exclusão comum de produto sem emissão P03 continua possível. Pode ser
   promovida a permanente apenas para o mesmo alvo ao registrar um identificador explicitamente. GTIN tem
   equivalências explícitas; a migration não varre nem adota dados preexistentes.
3. **Solicitação idempotente**: unique(loja,operação,chave), hash canônico do pedido e resultado persistido,
   na mesma transação. Mesma chave/conteúdo recupera resultado; conteúdo diferente recusa.
4. **Lote de etiquetas**: snapshot imutável dos alvos/nomes/SKUs/cor/tamanho/códigos/preço, mídia e quantidades;
   vínculo opcional ao lote original e motivo de reimpressão. Sem dependência do ledger.
5. **Tentativa de impressão**: FK composta do lote, ator, estado e confirmação humana. Auditoria por evento
   usa logs_auditoria existente, sem duplicar o serviço de auditoria.

FK de variante inclui loja/produto/variante (índice único aditivo necessário); FK de produto reutiliza a
chave composta da P02. CHECKs/uniques/triggers protegem também SQL direto, não apenas actions.
Dois índices GIN de arrays de chaves derivadas (produto/variante) aceleram consulta e diagnóstico das fontes
históricas sem backfill, reescrita ou UNIQUE que recusaria ambiguidades antigas. Construção e custo de escrita
devem ser medidos em QA e novamente antes de qualquer autorização de migration Production.
O normalizador puro `p03_key` usa corpo SQL `RETURN`, analisado na criação, com built-ins `pg_catalog`:
evita configuração de search_path por chamada e permite inline, sem depender de resolução tardia de nomes.
Os helpers agregados/owners e os triggers preservam `SET search_path=pg_catalog,public`. A/B em PG17 QA:
10 mil entradas ~157 ms versus ~44 ms e zero diferenças em 10 mil casos de whitespace/Unicode. O impacto
no lote de catálogo deve ser medido separadamente; esse microteste não representa capacidade Production.

### Fonte de verdade e compatibilidade

O registro P03 será autoridade do código INTERNO emitido. Para variante, barcodeInterno P02 é projeção
atômica mantida por trigger, e não um segundo writer de código. Após emissão, alterações diretas do código
pela P02/SQL são recusadas. SKU continua atributo comercial separado, editável sob as regras existentes.

Variante que já tenha barcodeInterno não será sobrescrita em silêncio: a operação exige consentimento
explícito para preservar aquele valor como alias antes de emitir/projetar o novo código opaco. Sem consentimento,
recusa sem escrita. Nenhum registro existente é adotado automaticamente pela migration. Para simples, o novo
código fica no registro; barcode/SKU/metadata legados permanecem intactos.

Novas reservas usam trim compatível com o helper de alias, comparação ASCII de caixa e restrições de texto
novo. Valor original é preservado. Dados históricos com ambiguidades continuam no banco; o lookup P03 recusa
múltiplos alvos, sem escolher o primeiro. Aliases removidos do JSON não liberam reserva/tombstone P03.

### Concorrência e colisões

Compartilhar a chave advisory P02 omni.vestuario.ident:<loja>: reserva P03 exclusiva; writers de produto
compartilhados e writers P02 exclusivos. Não basta SELECT para produto × produto: AFTER triggers aditivos
inserem/upsertam cada chave NOVA na PK única, com verificação do alvo na linha concorrente. Assim SKU de A ×
barcode/alias de B disputam a mesma chave e um deles aborta; códigos distintos continuam paralelos como P02.
Triggers também verificam as fontes preexistentes não reservadas, em ambos os sentidos. Comparações toleram
JSON livre e whitespace do helper JS. Sem backfill nem rejeição de ambiguidades históricas inalteradas.

Chaves permanentes não podem perder/trocar identificador, alvo ou valor por SQL direto. Chave corrente não
pode ser criada sem fonte viva nem removida enquanto fonte viva existir. DELETE/cascade só libera chave
corrente, nunca permanente; Identificador tem FK RESTRICT e mantém a identidade de um alvo com emissão.
Testar disputa real SKU × barcode e alias × alias entre dois produtos simples, além de P02/P03.

Espera limitada a 3 s; conflitos/deadlocks retornam CONFLICT sem commit parcial e com a mesma identidade de
solicitação para recuperação. Não se promete ausência de deadlock em writers legados que já travam linha
antes do trigger; PostgreSQL aborta uma transação e o boundary preserva atomicidade/idempotência.

## Emissão, lookup e GTIN

Código novo opaco OGV-<token aleatório>, sem derivar de loja, nome, tamanho, cor, preço ou SKU. Uniques e
retries de transação tratam colisão aleatória, sem depender só da probabilidade. Nenhuma API externa.
O formato implementado é `OGV-` + 12 dígitos aleatórios uniformes (`crypto.randomInt`), incluindo zeros à
esquerda: namespace de 1 trilhão (~40 bits). Não é segredo/autorização e não é GTIN. O prefixo alfabético
impede confundi-lo com GTIN; pares numéricos permitem compactação Code128-C. O candidato alfanumérico
de 12 caracteres falhou na prova independente de 50 mm/203 DPI; a alteração foi feita antes de qualquer
persistência fora de QA. Unicidade GLOBAL no banco, três tentativas somente após rollback de colisão
comprovada e recuperação idempotente continuam sendo a garantia. Não se usa SKU como fonte de entropia.
Lookup retorna loja/produto/variante e snapshots comerciais, nunca autorização de venda ou saldo.
Faz dedup por alvo; código conflituoso/ambíguo ou alvo inativo é recusado. Loja vem da sessão autorizada.

GTIN é informado com formato/proveniência/evidência pelo usuário, com checksum e zeros preservados.
Um ALIAS ativo pode ser promovido explicitamente para GTIN do MESMO valor/alvo/id, com nova proveniência,
auditoria e version+1. As equivalências adicionais são reservadas atomicamente; se houver conflito, toda
a promoção é revertida. GTIN não volta a alias, não troca valor e não libera reservas antigas.
Não é verificação externa de titularidade GS1 nem é gerado a partir do código interno. Variante correta,
sem inferir do pai. GTIN14 não é truncado em EAN13. Etiqueta inicial imprime código interno Code128;
GTIN é cadastrado/consultável separadamente. Fontes: validarGtin canônico e documentação GS1 do plano P00.

## Lotes, PDF e estados

Mídia configurável por largura/altura/margens e preço opcional, com presets e limites. Máximo 50 alvos e
500 etiquetas por lote, sem batch ilimitado. Dados e configuração congelados; reimpressão explícita gera
outro lote auditado com o mesmo snapshot/códigos e motivo, sem emitir outro identificador.

PDF e preview determinísticos a partir do snapshot, fonte local incorporada e barcode gerado localmente.
Bibliotecas propostas: pdf-lib + fontkit e bwip-js (sem Chromium no servidor, CDN, imagem remota ou nova fila).
Renderização/decodificação de QA é independente do encoder. Nome longo é limitado visualmente por layout,
mas o snapshot preserva todo o texto; fonte sem glyph suportado deve falhar claramente, nunca corromper texto.

Tentativa nasce SOLICITADO antes de abrir diálogo. Ack do navegador → RESULTADO_DESCONHECIDO, nunca sucesso
físico. Resposta perdida conserva tentativa existente; não há reenvio automático. Confirmação de saída é
MANUAL, identificada como tal. Popup bloqueado antes do envio pode ser registrado como FALHA_ANTES_ENVIO.
Fechar diálogo/afterprint não confirma impressão. Homologação física permanece NÃO EXECUTADA.
Transições são condicionais e monotônicas: ack atrasado não rebaixa CONFIRMADO_MANUAL e falha antes do envio
não substitui um envio já incerto. Repetição do mesmo evento/chave retorna o resultado, sem segunda tentativa.
Snapshot lê versões/estado sob locks compatíveis; desativação ou mudança concorrente produz conflito/rollback,
não snapshot de outro alvo. Custo e saldo não são lidos para criar etiqueta.
Só é permitido iniciar outra tentativa no mesmo lote quando todas as anteriores falharam antes do envio.
SOLICITADO, resultado desconhecido ou confirmação manual exigem NOVO lote de reimpressão com motivo;
serviço, trigger e unique parcial por loja/lote garantem isso. O replay da MESMA chave retorna a tentativa
existente. PDF baixado/impresso fora do fluxo não devolve status físico à aplicação.

O orçamento de mídia reserva 15 mm para texto/rodapé sem preço e 18 mm com preço, além de barras e duas
margens; Zod e CHECK SQL aplicam o mesmo limite. Em 50×30 mm, preço + margem2 usa barras8 mm. Uma página
por etiqueta, sem grade A4. O motor compartilha geometria entre PDF e SVG/HTML e recusa sobreposição.

IDs e loja de produto/variante são estáveis: a nova fronteira recusa UPDATE desses campos antes de comparar
as chaves, inclusive quando ainda não há reserva P03. Não existe writer operacional de transferência de
identidade entre lojas. A projeção do código incrementa tanto `variante.version` quanto `catalogVersion`
do pai. Produto simples com emissão permanente não pode ser excluído; o boundary legado captura a FK e
orienta Inativar, sem consultar tabelas P03 em Production pré-migration. Simples sem emissão continua excluível.

## Direção de interface e QA

Refinamento do HUB existente, sem redesign: mesmos tokens/tipografia/componentes, aba Etiquetas sob gate
privado, fluxo selecionar → configurar mídia → conferir folha → PDF/imprimir. Prévia da etiqueta branca,
preta e em escala visual da mídia é o elemento principal; estados e resultados têm texto, não só cor.
Mobile: seleção em lista, configurações empilhadas e preview sem overflow; foco/teclado preservados.

QA sintético PG17: legado com aliases, duas lojas, camiseta P/M/G/GG/cores e calçados. Cobrir colisões nos
dois sentidos, UPDATE direto, geração concorrente, replay/resposta perdida, alvo/código inativo, GTIN,
snapshot/reimpressão, preços, lote e acesso a PDF. Regressões P01/P02/#360, build, lint, typecheck e E2E
autenticado; render PDF em PNG e decodificar Code128 por biblioteca independente. Teste físico é pendência.

Custos: emissão/lookup sob demanda, índices de chaves e limites de lote. Medir CPU/bytes PDF e queries de
emissão; triggers de colisão acrescentam leituras em mudança de códigos/aliases, inclusive com UI desligada.
Não afirmar custo zero. Rollback operacional desliga apenas P03, mantém reservas/dados/guards e opt-in P02.

### Recursos de CI e bloqueio anterior à P03

O schema e os contratos ampliam o programa TypeScript integral. O check fiscal com heap padrão (~2 GB)
passa na base exata `51265894` (run `43910747836`, matrizes Ubuntu/Windows), mas esgotou heap com P03.
Fronteiras DB mínimas e opções Prisma explícitas foram aplicadas sem casts; um diagnóstico separado sem
o novo teste PG também esgotou 2 GB. Nenhum arquivo/check foi retirado da validação autoritativa.
O workflow fiscal chama `npm run typecheck -- --incremental false`: mesmos checks, sem cache,
orçamento de 4 GB já definido em `package.json` na main. O check integral usa apenas nesse passo a engine
Node24 declarada pelo app; os testes/hashes do worker continuam Node20.20.2 e a engine é restaurada antes
do lint fiscal. Matriz dos dois sistemas, dependência do gate, pins/limites de container e controles
fiscais não mudam. Node20 passou esse check em f75c2d4, mas esgotou também 4 GB em c32be72 nos dois OS;
o Node24 sem incremental deve passar no head final, sem excluir arquivos ou aumentar heap novamente.
Não foi atribuída causa exata a chamadas Playwright sem perfil A/B. Memória/tempo constam no relatório QA.

A comparação da base também comprovou falha independente da P03 no build do container fiscal:
`libpcre2-8-0=10.42-1+deb12u1` está indisponível no APT (`43910747836`, job `133454912075`).
Dockerfile, pins e integridade desse worker não são alterados pela P03. Isso deve ser reportado como
bloqueio do CI global enquanto não houver correção fiscal autorizada; não omitir nem desabilitar o job.

O E2E verifica o PDF binário por HTTP autenticado, compara-o integralmente ao Blob recebido pela UI,
confere Content-Length e cinco páginas do lote real. O artefato desse transporte é rasterizado e
decodificado novamente por PDFium/ZXing em 203/300 DPI. HTTP 200 vazio/inválido não habilita imprimir.
A leitura de body pelo CDP não é a evidência binária autoritativa do plugin PDF do Chromium.
O iframe de conferência usa SVG/HTML do mesmo motor geométrico, com sandbox sem scripts e CSP da rota;
assim a prévia não depende de plugin PDF do navegador. Download usa o PDF binário conferido; o diálogo
de impressão usa o HTML do mesmo snapshot/motor, sem depender do plugin PDF.
O E2E exige etiquetas visíveis no frame e inspeciona a ausência da rota privada no Cache Storage.

O contexto E2E permite o service worker real e espera seu registro; bloquear o SW por Playwright faz o
Workbox preexistente receber registro undefined e acessar waiting. A perda de resposta é injetada no
BrowserContext, incluindo requests do SW, mantendo o commit real e a asserção de recuperação/sem duplicata.
Não há filtro de pageerror; cada sessão é verificada, com stack para diagnóstico. Referência de roteamento:
https://playwright.dev/docs/service-workers#network-events-and-routing.

Revalidação de 16/11: main avançou de `51265894` para `8fbb727d` com #368–#370, relativas ao desktop
e impressão. A atualização será incorporada por merge, preservando esses arquivos. A P03 continua
usando apenas o diálogo do navegador, sem consumir ou modificar a nova ponte de impressão desktop.

## Reconciliação FINAL-002 com `origin/main` (`e609ef0`) e auditoria integral

GOAL `OMNI-VESTUARIO-P03-CODIGOS-ETIQUETAS-FINAL-002`. Base reconciliada por merge controlado (sem
rebase nem force-push): `e609ef0fc2ef09afd744a211db3a31889d482862`, preservando integralmente:

- **#357 / #358 / #360** — Contratos P01, persistência de grades P02 e opt-in privado de produção.
- **#379 / #381** — Impressão do termo de garantia 80 mm e Central de Relatórios.
- **#387 / #400** — Correções fiscais na `main`: pin `libpcre2-8-0=10.42-1+deb12u2` no Dockerfile do
  worker XSD, `npm run test:root:sem-pg` + `root-pg-suites.yml`, `NODE_OPTIONS="--max-old-space-size=4096" npm run build`
  e heap canônico de `6144 MB` no typecheck. O arquivo `.github/workflows/fiscal-xsd-worker.yml` ficou
  idêntico à `origin/main` após a resolução do conflito.
- **#393** — Segurança PWA allowlist-only em `next.config.mjs` (`extendDefaultRuntimeCaching: false`,
  `cacheOnFrontEndNav: false`, `cacheStartUrl: false`, Regra 1 `NetworkOnly` cobrindo `/api/identificacao/*`,
  sem `swe-worker`), validada sobre o build real via `scripts/pessoas/inspect-pwa-build.mjs`.
- **#394** — Padrão global de nomes, ordenação e busca em Cadastros: corrigida a regressão de integração
  em `lib/cadastros/cadastros-padrao-ux.component.test.ts` (mock da action `getIdentificacaoStatus` usada
  pelo `CadastrosHub`) e alinhada a busca de alvos P03 (`listTargets`) ao `chaveNomeCadastro` sem acento,
  com múltiplos termos por nome, SKU, cor e tamanho em ordem natural de grade.
- **#395 / #396 / #397 / #399 / #400** — Landing premium (`SolicitacaoTesteComercial` preservada no
  `prisma/schema.prisma`), fundação SaaS, Financeiro F9/estornos, Acessórios/Cores (`compat_cores_loja`
  mantida separada de `vestuario_cores`) e Marketplace Mercado Livre M01 (OAuth desligado, `proxy.ts`
  inalterado e separação total entre `OGV-`, SKU, GTIN e IDs externos MLB / User Product).

Melhorias cirúrgicas aplicadas no escopo P03:

1. `listTargets` (`lib/identificacao/service.ts`): busca tolerante a acentos e múltiplos termos por nome,
   SKU, cor (`vestuario_cores`) e tamanho (`vestuario_grade_tamanhos`), com ordenação natural (nome, ordem
   da cor, ordem do tamanho), mantendo leitura única bounded (`WITH choices AS ...`, sem N+1).
2. `IdentificacaoEtiquetasPanel.tsx`: suporte a **mídia personalizada** (`50–110 × 30–80 mm`, além dos
   presets `50×30`, `60×40` e `80×50 mm`) com validação imediata de geometria via `mediaSchema`, correção
   do subtítulo em produto simples, `aria-label` único para variantes sem SKU, limpeza do campo de motivo
   após reimpressão e `type="button"` explícito nos botões auxiliares.
3. `contracts.ts` (`snapshotSchema`): exige `cor` e `tamanho` preenchidos sempre que `varianteId` estiver
   definido, evitando renderização inconsistente em snapshots manipulados.
4. `docs/vestuario/rollback_20261116090000_identificadores_etiquetas_p03.sql`: script de reversão
   operacional **fail-closed** (recusa abortando sem alterações caso exista qualquer identificador, lote,
   tentativa, solicitação ou chave permanente P03).

## Auditoria da migration `20261116090000_identificadores_etiquetas_p03` (PostgreSQL 17.10)

A migration candidata não foi alterada: mantém o mesmo SQL e checksum SHA-256 auditado na PR #367
(`49df6b1159c6cc28b3bc1973af2a28746748daaa382926f310a0a7c9b9766424`). Nenhuma migration histórica foi
editada e nenhuma migration foi executada em Production.

### Achados técnicos e medições em PostgreSQL 17.10 descartável

Ensaio executado em cluster isolado PostgreSQL 17.10 (`scratchpad-pg17`) com base pré-P02 + migrations
até `20261118120000_solicitacoes_teste_comercial` já aplicadas (simulando ordem real de Production) e
massa sintética estilo RAFACELL (**3.002 produtos legados**, incluindo capinhas/películas com
`metadata.acessorios`, `metadata.fiscal`, `metadata.codigosAlias`, metadata livre e duplicidades
históricas pré-existentes, com Vestuário e P03 desligados):

| Dimensão | Resultado comprovado em PG 17.10 |
|---|---|
| Aplicação léxica (base vazia → 31 migrations) | PASS (`prisma migrate deploy` + `status` up to date + `DRIFT_ZERO`) |
| Aplicação fora de ordem (P02 e `20261118120000` já aplicadas → P03 pendente) | PASS em `5.235 ms` sobre 3.002 produtos; `prisma migrate status` = up to date; `DRIFT_ZERO` |
| Volume de WAL da migration (3.002 produtos) | `701.280 bytes` (~685 KiB) |
| Tamanho dos índices GIN sobre 3.002 produtos | `p03_produto_chaves_gin` = `737.280 bytes` (vs heap `estoque_produtos` = `1.294.336 bytes`, ~57%); `p03_variante_chaves_gin` = `16.384 bytes`; `identificador_chaves` = `0 bytes` (sem backfill) |
| Rollback transacional (`BEGIN; migration.sql; ROLLBACK;`) | PASS — zero tabelas/objetos residuais |
| Risco de lock (`CREATE INDEX p03_produto_chaves_gin` sem `CONCURRENTLY`) | Toma `SHARE` lock em `estoque_produtos` (bloqueia escritas, permite leituras `SELECT`). Com `SET LOCAL lock_timeout = '800ms'` diante de escrita aberta, abortou em `904 ms` sem DDL parcial |
| **CRÍTICO — Grants para papel runtime não-dono (`omni_runtime_v2`)** | **Sem GRANT nas 5 tabelas P03:** `INSERT INTO estoque_produtos` por `omni_runtime_v2` **falhou imediatamente** com `42501: permission denied for table identificador_chaves` (o trigger `p03_produto_keys_trg` executa como `SECURITY INVOKER`). **Com `GRANT SELECT, INSERT, UPDATE, DELETE` nas 5 tabelas P03:** todos os writers legados passaram 100% |
| Writers legados com migration aplicada e P03 OFF (como `omni_runtime_v2` com grants) | PASS: `INSERT` com acessórios/aliases, `UPDATE` de preço/estoque/metadata em produto com duplicidade histórica, `UPDATE` de SKU/aliases e `DELETE` de produto simples sem emissão P03 (chaves correntes liberadas por `CASCADE`) |
| Custo em writers legados (3.002 produtos) | 200 updates sequenciais de estoque (`PDV hot path`): `236 ms` (~1,18 ms/update; trigger sai no early-return `newkeys IS NOT DISTINCT FROM oldkeys` sem lock); 200 inserts legados com triggers/aliases: `698 ms` (~3,49 ms/produto) |
| Rollback operacional fail-closed | Recusa (`ROLLBACK_RECUSADO`) se houver qualquer registro permanente P03; remove integralmente (0 funções `p03_*`) preservando 100% dos produtos/saldos legados quando não há dados P03, com reaplicação posterior limpa (`DRIFT_ZERO`) |

## Plano de homologação física (procedimento para o proprietário)

**Status atual: `PHYSICAL_HOMOLOGATION=NOT_EXECUTED`.** Separação obrigatória das quatro camadas de
validação:

1. **PDF validado digitalmente:** PASS (assinatura `%PDF-`, páginas, dimensões mm exatas, igualdade byte a byte HTTP × UI Blob).
2. **Leitura de código rasterizado (203 e 300 DPI, PDFium + ZXing-C++):** PASS (16 rasterizações de amostras em `50×30`, `55×35`, `60×40` e `80×50 mm` + 10 rasterizações do PDF HTTP real do E2E).
3. **Etiqueta física impressa:** **NÃO EXECUTADA** (depende de equipamento real do proprietário).
4. **Leitura física pelo scanner:** **NÃO EXECUTADA** (depende de leitor real sobre a etiqueta impressa).

### Roteiro simples de bancada (somente em ambiente QA autorizado, após conferir o equipamento)

> **Atenção sobre equipamento:** Não comprar impressora nova antes de verificar o que já existe na loja.
> **Não confundir a impressora térmica de cupons POS-80 (bobina contínua de papel térmico) com uma
> impressora de etiquetas adesivas** (ex.: Argox, Elgin L42, Zebra, Bematech LB-1000 ou folha compatível).
> Nenhum modelo físico está declarado homologado até passar por este roteiro com evidências.

1. **Preparação (somente QA sintético):** Confirmar loja QA de teste (fora de Production, sem estoque/venda
   de variantes). Conferir equipamento disponível (modelo/DPI real/mídia disponível, ex. `50×30 mm` ou
   `60×40 mm`, e leitor USB/Bluetooth em modo teclado com Enter).
2. **Camiseta de teste:** Cadastrar uma camiseta de teste em *Grades e variações* com ao menos 2 cores
   (ex.: Preta e Branca) e 2 tamanhos (ex.: P e M).
3. **Emissão individual:** Abrir a aba *Etiquetas*, emitir o código interno `OGV-` para *Preta P*, *Preta M*
   e *Branca P*. Confirmar que cada variação recebeu um código único de 12 dígitos.
4. **Geração de lote e impressão:** Definir 1–2 unidades por variação, escolher a mídia compatível (ex.:
   `50×30 mm`), marcar preço opcional se desejado, clicar em *Salvar lote para conferência* → *Gerar prévia /
   PDF*, baixar o PDF ou abrir *Solicitar impressão* a **100% de escala** (sem "ajustar à página" nem
   cabeçalhos/rodapés do navegador). Confirmar que o sistema registra `RESULTADO_DESCONHECIDO` até a
   conferência manual.
5. **Leitura física:** Conferir visualmente nome, cor, tamanho, preço, margens e barras sem cortes. Bipar
   cada etiqueta impressa no campo *Ler código* do HUB (ao menos 10 leituras por etiqueta) e confirmar que
   cada código identifica **exatamente** o produto, a cor e o tamanho corretos.
6. **Imutabilidade após alteração de preço:** Alterar o preço de venda da camiseta no cadastro. Confirmar
   que o código `OGV-` permanece **idêntico** (não gera novo código).
7. **Segunda impressão e histórico:** Testar (a) *Criar reimpressão* com motivo explícito no lote original
   (preserva o snapshot/preço original) e (b) um novo lote com o novo preço (mesmo código `OGV-`). Conferir
   ambos em *Lotes recentes* e registrar foto das etiquetas + leituras obtidas.

## Prontidão e plano de implantação em Production (futuro, mediante autorização)

**Nenhuma migration, deploy ou escrita em Production foi executada.**

### Identificação do ambiente canônico (sem credenciais)

- **Banco canônico:** Projeto Neon `dry-mouse-36002471`, branch `production` (`br-muddy-meadow-ac7ah2wl`),
  endpoint `ep-summer-tooth-acltc6wi`, database `omnigestao_prod`, collation `en_US.UTF-8`.
- **Projetos Vercel conectados à `main`:**
  - `omni-gestao-pro` (`PROJECT_A`, fingerprint `2cfcc0a76da7`, canônico em `scripts/migration-authority-guard.mjs`).
  - `omni-gestao` (`PROJECT_B`, fingerprint `02bf338b1365`, legado, nunca possui autoridade de migration).
- **Mecanismo de autoridade de migrations:** `scripts/vercel-build.mjs` + `scripts/migration-authority-guard.mjs`
  é fail-closed e só executa `prisma migrate deploy` quando `VERCEL_ENV=production` **e**
  `VERCEL_PROJECT_ID` = canônico **e** `MIGRATION_AUTHORITY_ENABLED="true"`. Pelo estado documentado na
  `main` (`P02_RELEASE_CATALOGO_PRODUCTION.md` e `ROLLOUT_20261107120000_catalogo_aparelhos_loja.md`),
  `MIGRATION_AUTHORITY_ENABLED=false` permanece em Production — portanto **o merge da PR #367 NÃO aplicará
  a migration automaticamente** (o build emitirá `MIGRATION_SKIPPED`).
- **Histórico e dependências:** `20261115120000_vestuario_p02_grades_catalogo` já está aplicada em Production
  (dependência obrigatória: `vestuario_variantes`, `vestuario_produtos_grade`, `vestuario_ident_lock*`,
  `estoque_produtos_id_storeId_key`). `20261116090000_identificadores_etiquetas_p03` é independente de
  `20261118120000_solicitacoes_teste_comercial` e foi comprovada em aplicação fora de ordem após `20261118120000`.
- **Checksum aprovado (SHA-256):** `49df6b1159c6cc28b3bc1973af2a28746748daaa382926f310a0a7c9b9766424`.

### Comparação baseada em evidências: Alternativa A vs B vs C

| Alternativa | Análise factual baseada em provas | Veredito |
|---|---|---|
| **A — Aplicar migration antes do merge** | Aciona imediatamente os triggers `p03_produto_keys_trg` e `p03_variante_keys_trg` em Production sob o código antigo (sem o tratamento amigável de FK `P2003` em `deleteProduto`). Exige obrigatoriamente janela de manutenção + `GRANT` a `omni_runtime_v2` antes mesmo de o código P03 estar na `main`. | Viável com grants, mas inferior à B |
| **B — Integrar código com feature flag desligada (Production travada) e aplicar migration em janela dedicada** | Comprovadamente segura: `identificationEnabled()` bloqueia `VERCEL_ENV=production` antes de sessão ou banco; `CadastrosHub`, Server Actions e rota PDF nunca importam/consultam tabelas P03 com o gate fechado; `deleteProduto` trata `P2003` sem consultar tabela P03; `MIGRATION_AUTHORITY_ENABLED=false` garante `MIGRATION_SKIPPED` no merge. Permite validar deploy sem DDL e executar a migration separadamente com preflight, backup/PITR, `lock_timeout` e grants atômicos a `omni_runtime_v2`. | **RECOMENDADA** |
| **C — Adiar integração por risco bloqueador na migration** | Nenhum risco P0/P1 irremediável na migration: o requisito de grants a `omni_runtime_v2` e o lock `SHARE` do índice GIN foram reproduzidos, medidos e mitigados com procedimento transacional explícito e script de rollback fail-closed. | Não necessária após CI verde e revisão independente aprovada |

### Sequência segura para a futura janela de migration (somente após autorização humana expressa)

1. **Backup / PITR:** Confirmar ponto de recuperação contínua (Neon PITR / snapshot) antes de qualquer DDL.
2. **Preflight read-only (`default_transaction_read_only=on`):**
   - Confirmar identidade Neon (`omnigestao_prod`), versão PostgreSQL (>= 14; esperado 17), papel runtime ativo
     e existência de `omni_runtime_v2`.
   - Conferir `_prisma_migrations` (P02 presente, `20261116090000` ausente, nenhuma migration incompleta).
   - Medir `SELECT count(*), pg_size_pretty(pg_total_relation_size('estoque_produtos')) FROM estoque_produtos;`
     para dimensionar a janela do lock `SHARE` de `p03_produto_chaves_gin`.
   - Verificar que `MIGRATION_AUTHORITY_ENABLED=false` continua em `omni-gestao-pro` (ou coordenar janela
     explícita caso opte por aplicação assistida direta via `neondb_owner`).
3. **Aplicação em transação única (`psql -1 -v ON_ERROR_STOP=1`, papel `neondb_owner`, janela de baixo movimento):**
   - **Regra operacional obrigatória (P2-1):** **NUNCA** aplicar `20261116090000_identificadores_etiquetas_p03`
     via `MIGRATION_AUTHORITY_ENABLED=true` (`prisma migrate deploy` automático da Vercel) enquanto o runtime
     conectar como papel não-dono `omni_runtime_v2` sem `ALTER DEFAULT PRIVILEGES`, pois `p03_produto_keys_trg`
     exige `GRANT` imediato em `identificador_chaves` no mesmo commit.
   - Trava de identidade do banco + `SET LOCAL lock_timeout = '3s'; SET LOCAL statement_timeout = '60s';`.
   - Conferir SHA-256 do `migration.sql` = `49df6b1159c6cc28b3bc1973af2a28746748daaa382926f310a0a7c9b9766424`.
   - Executar `migration.sql` e registrar em `_prisma_migrations` no formato Prisma (`applied_steps_count=1`).
   - **Grants obrigatórios na MESMA transação (se o papel `omni_runtime_v2` existir):**
     `GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "identificadores_produto", "identificador_chaves", "etiqueta_lotes", "etiqueta_tentativas", "identificacao_solicitacoes" TO "omni_runtime_v2";`
     (evitando qualquer janela de `42501 permission denied` em cadastros legados).
4. **Pós-validação read-only e smoke de lojas legadas:**
   - Conferir 5 tabelas, 16 funções `p03_%`, 11 triggers `p03_%` (3 em tabelas existentes + 8 nas tabelas novas),
     `prisma migrate status` em dia, `DRIFT_ZERO` e `has_table_privilege('omni_runtime_v2', 'identificador_chaves', 'INSERT') = true`.
   - Smoke em loja legada sem Vestuário (ex.: perfil RAFACELL): consultar catálogo, criar/editar produto
     simples/acessório, atualizar estoque/preço, validar ausência da aba *Etiquetas* e ausência de erros 500.
5. **Rollback operacional (sem perda de dados):**
   - **Se P03 ainda não tiver dados permanentes:** manter P03 OFF; caso necessário remover o schema em janela
     autorizada, usar `docs/vestuario/rollback_20261116090000_identificadores_etiquetas_p03.sql` (fail-closed).
   - **Se já houver códigos emitidos, snapshots ou auditorias P03:** **NUNCA** executar `DROP TABLE` nem
     apagar identificadores/snapshots. Desligar `VESTUARIO_P03_ENABLED` / remover allowlist e preservar 100%
     das reservas permanentes e auditorias. Em emergência extrema no trigger legado, somente com autorização
     expressa, `DROP TRIGGER p03_produto_keys_trg ON estoque_produtos;` é reversível sem perder dados P03.
6. **Ativação futura em Production:** Permanecerá **BLOQUEADA** em código (`VERCEL_ENV === "production"`
   sempre recusado) até conclusão da homologação física pelo proprietário e PR específica autorizada.

## Revisão independente somente leitura (FINAL-002)

- **1ª rodada (SHA `0e71f16e274e391bb2d8ed7f704c1a48b77f2863` vs `origin/main` `e609ef0`):** parecer
  **`APPROVED`** com `P0 = 0`, `P1 = 0`, `2 P2` (não bloqueantes para merge pela Alternativa B) e `4 P3`.
- **Correções aplicadas após a 1ª rodada:**
  - `P2-1` (guardrail operacional): regra explícita na sequência de implantação proibindo aplicar
    `20261116090000_identificadores_etiquetas_p03` via `MIGRATION_AUTHORITY_ENABLED=true` enquanto o
    runtime operar como `omni_runtime_v2` sem `ALTER DEFAULT PRIVILEGES`; obrigatória transação única
    `psql -1` com `GRANT` atômico nas 5 tabelas P03.
  - `P2-2` (`app/actions/cadastros.ts` + teste): `deleteProduto` trata também `P03_RESERVA_PERMANENTE`
    (além de `P2003`), cobrindo eventual inversão na ordem de disparo de triggers de FK após `pg_dump`/restore.
  - `P3-1`: contagem de triggers corrigida para `11 triggers p03_%` (3 em tabelas existentes + 8 nas tabelas P03).
  - `P3-2` / `P3-3` (`IdentificacaoEtiquetasPanel.tsx`): edição de altura personalizada sem reduzir
    `barcodeHeightMm` durante digitação intermediária; proteção de sequência no lookup (`sequence.current`)
    e sincronização de `detail.codigoInterno` pela lista de identificadores.
  - `P3-4` (`label-renderer.server.ts`, `service.ts`, `rollback_20261116090000_identificadores_etiquetas_p03.sql`):
    limpeza de promise rejeitada no cache da fonte, `<meta http-equiv="Content-Security-Policy">` no HTML
    da janela de impressão, reserva exclusiva do formato `^OGV-[0-9]{12}$` para emissão interna (recusado
    como alias manual) e `LOCK TABLE ... IN ACCESS EXCLUSIVE MODE` antes do guard fail-closed de rollback.
- **2ª rodada (SHA `a2e3766`):** todas as correções da 1ª rodada confirmadas; detectado e corrigido
  `P2-R2-1` (controle simétrico de `setLoading(true)`/`finally { setLoading(false) }` no handler de lookup
  de `IdentificacaoEtiquetasPanel.tsx`, com teste de regressão de corrida em `panel.component.test.ts`).
- **3ª rodada (SHA `3eea6df051bd12b7e800a602172e608e63761bca`):** parecer **`RATIFIED`** com `P0 = 0`,
  `P1 = 0`, `P2 = 0`, `P3 = 0` sobre todo o diff reconciliado frente à `origin/main` (`e609ef0`).

## Validações finais, CI remota e separação do bloqueio fiscal/M01 da `main`

### Provas locais e independentes executadas sobre o código final

- **Vitest focado P03/P01/P02/#394:** 14 arquivos, 199/199 testes aprovados (`panel.component.test.ts` 8/8
  incluindo regressão de corrida `P2-R2-1`).
- **Regressões amplas (#394, #400, #399, #397, #393, #381, Aparelhos/IMEI):** 82 arquivos adicionais,
  1.436/1.436 testes aprovados (`lib/cadastros`, `lib/compat`, `lib/marketplace`, `produto-codigo-alias`,
  `inspect-pwa-build.test.mjs`, Financeiro/PDV F9/Relatórios/Aparelhos).
- **PostgreSQL 17.10 descartável:** `prepare-pg.mjs` com massa legada (`BASELINE_OK`, `DRIFT_ZERO`),
  `service.integration.test.ts` (19/19) + `catalog-service.integration.test.ts` (22/22) = 41/41 aprovados,
  além da bateria de auditoria sobre 3.002 produtos legados e papel `omni_runtime_v2` registrada acima.
- **Typecheck integral (`--incremental false`, heap `6144 MB`), ESLint focado e `git diff --check`:** PASS.
- **Build Next (`NODE_OPTIONS=--max-old-space-size=4096`, `MIGRATION_SKIPPED`) e auditoria PWA (#393):**
  PASS (`next-pwa 10.2.9`, 37 rotas privadas `NetworkOnly`, 3 assets públicos na allowlist, sem `swe-worker`).
- **Playwright autenticado + decodificação independente PDFium + ZXing-C++ (203 e 300 DPI):** 3/3 specs E2E
  aprovadas (desktop e mobile); 16/16 rasterizações de amostras (`50×30`, `55×35` personalizada, `60×40` e
  `80×50 mm`) + 10/10 rasterizações do PDF HTTP real do E2E decodificadas em 203 e 300 DPI.

### CI remota e diagnóstico factual do `Fiscal XSD Worker B2` frente à `origin/main` (`e609ef0`)

No código reconciliado (`3eea6df`), **17 de 18 jobs executados passaram** (1 pulado conforme esperado:
`Plataforma - acesso piloto / reports-synthetic`):

- **PASS (17 jobs):** `Vestuario P03 - identificacao e etiquetas QA`, `Vestuario P02`, `Vestuario P01`,
  `Marketplace Mercado Livre QA`, `Suítes PostgreSQL da raiz`, `Ramos e Cadastros` (`validate`,
  `postgres-integration`, `e2e-authenticated`), `Cadastros Cliente assistido` (`validate`,
  `postgres-integration`), `Relatórios - QA sintética`, `Plataforma - acesso piloto` (`validate`,
  `authenticated`), `Aparelhos (IMEI, compra, venda, garantia)`, `Fiscal C14N External Proof` e
  `Fiscal XSD Worker B2` (`Unit and contract` em `ubuntu-24.04` e `windows-2022`).
- **Ocorrências intermitentes reproduzidas/superadas em reexecução (zero diff frente à `origin/main`):**
  1. Falha transitória do `next/font/google` durante `next build` em `app/gestao-lojas/page.tsx` nos runs
     iniciais de `Cadastros Cliente assistido / validate` e `Relatórios - QA sintética / reports` — ambos
     passaram integralmente na reexecução.
  2. Flake único de cookie de sessão em `logoutViaSeguranca` (`e2e/cadastros-ramos/01-padaria.spec.ts`,
     35/36 passaram na 1ª tentativa) — passou integralmente na reexecução (`e2e-authenticated` verde).
- **Bloqueio fiscal pré-existente (antigo APT resolvido; nova incompatibilidade `main` separada da P03):**
  - O bloqueio anterior de APT (`libpcre2-8-0=10.42-1+deb12u1`) **foi resolvido** após a reconciliação com
    `origin/main` (`e609ef0`). No job `Fiscal XSD Worker B2 / Container, offline integration and supply chain`,
    **todos os passos próprios do worker fiscal passaram**: build imutável do Docker (`libpcre2-8-0=10.42-1+deb12u2`),
    prontidão com hashes (`libxml2Version: 2.15.3`), transporte na rede interna, limites/isolamento do
    container, `test:fiscal-xsd:integration`, `test:fiscal-xsd:security` e prova automatizada de zero-egress.
  - A falha ocorre no passo 16 (`Suíte completa e build Next` → `npm run test:root:sem-pg`, executado sob
    **Node 20.20.2** conforme `.github/workflows/fiscal-xsd-worker.yml:119`):
    - **Causa raiz determinística na `origin/main` (`e609ef0`):** `lib/marketplace/mercado-livre/adapter.ts:85-91`
      (introduzido pela PR #399 após a PR #400, com blob SHA `8a46a677a6e9bc7eae7331645d15ded60a5dee56`
      **idêntico** entre `origin/main` e esta branch) utiliza o 3º argumento `context.source` do reviver de
      `JSON.parse` para preservar Int64 (*"Preserva os dígitos originais do JSON em Node 24"*). Esse recurso
      (TC39 `json-parse-with-source`) só existe a partir do **Node 21+**, retornando `null` em Node 20.20.2 e
      reprovando 6 testes de `lib/marketplace/mercado-livre/adapter.test.ts` (que passam 20/20 em Node 24 no
      workflow `Marketplace Mercado Livre QA`). A PR #399 não acionou `fiscal-xsd-worker.yml` por não alterar
      `package*.json`, expondo a incompatibilidade em qualquer PR posterior que altere `package.json` (como
      `pdf-lib` na P03).
    - **Paridade comprovada com `origin/main` (`e609ef0`):** diff zero e blob SHA idêntico em
      `.github/workflows/fiscal-xsd-worker.yml`, `workers/fiscal-xsd/Dockerfile`,
      `lib/marketplace/mercado-livre/adapter.ts` e `lib/marketplace/mercado-livre/adapter.test.ts`.
    - **Impacto transparente:** como o passo 16 interrompe antes dos passos 17–19, os passos de hashes da
      imagem/binário, SBOM SPDX e scanner Trivy não chegaram a executar nessa rodada.
    - **Separação de escopo (sem alterar fiscal nem Mercado Livre na P03):** conforme diretriz de não alterar
      pins fiscais nem expandir silenciosamente o escopo P03, a correção deve ocorrer em PR dedicada fora da
      P03 (tornando `parseMeliJson` em `lib/marketplace/mercado-livre/adapter.ts` compatível com Node 20 ou
      avaliando com os responsáveis fiscais a versão Node do passo 16 em `fiscal-xsd-worker.yml`).
- **Vercel Preview:** `vercel.json` mantém `"codex/vestuario-p03-codigos-etiquetas-001": false` (mesma
  política das entregas P01/P02), impedindo deploy preview automático não autorizado.
