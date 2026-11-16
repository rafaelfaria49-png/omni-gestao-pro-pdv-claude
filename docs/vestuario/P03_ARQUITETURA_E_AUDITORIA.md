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
