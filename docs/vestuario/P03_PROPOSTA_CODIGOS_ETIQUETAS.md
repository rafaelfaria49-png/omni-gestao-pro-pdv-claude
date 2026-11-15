# P03 — Proposta de códigos e etiquetas

**PROPOSTA PARA APROVAÇÃO. IMPLEMENTAÇÃO NÃO INICIADA.**

Referência: P03 do plano `OMNI-VESTUARIO-VARIACOES-MARKETPLACE-001` (códigos/etiquetas), após P01 e P02.
Esta proposta não autoriza migrations, ativação, conexão externa, deploy, alteração de Omni Print/Electron
ou venda/estoque de variantes. A aprovação da PR #358 não aprova automaticamente a P03.

## Resultado pretendido

Uma etiqueta deve identificar exatamente o alvo autorizado da loja: produto simples ou variante de um pai.
Na grade, SKU, cor e tamanho identificam a ficha comercial; a identidade continua sendo a tupla estável
P01 `(storeId, produtoId, varianteId)`. Trocar nome, SKU ou posição da matriz não cria outra identidade.

Código interno imprimível em Code 128, SKU e GTIN oficial permanecem conceitos separados. Nenhum código
interno será apresentado como GTIN/EAN oficial. Um GTIN será cadastrado somente com associação conferida
à mercadoria/variação correta e evidência de origem; não será inferido do pai ou fabricado pelo sistema.

## Contrato e persistência a projetar

- Registro de identificadores vinculado ao alvo e à loja, com tipo, valor original/canônico, origem,
  situação, datas e ator. GTIN preserva zeros à esquerda; nunca é convertido em Number.
- `barcodeInterno` da P02 deve ter uma única fonte de verdade. Definir sua relação com o registro antes
  de propor schema; não manter dois writers independentes ou duas cópias divergentes.
- Unicidade/colisão na mesma loja deve abranger SKU, código interno, aliases e identificadores de
  produtos simples/variantes. Mesmo código em lojas distintas não autoriza leitura cruzada.
- Códigos já existentes não serão normalizados, substituídos ou convertidos em variantes por backfill
  semântico. Colisões legadas serão diagnosticadas para revisão; nenhum resultado ambíguo será resolvido
  escolhendo o primeiro produto.
- Emissão interna transacional e idempotente por loja/alvo/solicitação. Reimpressão reutiliza o mesmo
  código. Desativação não libera um código para representar outra mercadoria.
- Metadados de impressão e auditoria ficam separados do ledger de estoque. Nenhuma impressão gera
  entrada, saída, reserva ou venda.

Tudo acima é desenho para revisão. Nenhuma tabela, índice ou migration P03 é entregue nesta execução.

## Etapas pequenas e independentes

| Etapa proposta | Entrega revisável | Gate de saída |
|---|---|---|
| P03-A — inventário | Mapear lookup, códigos legados, etiquetas, impressão, leitores e contratos de Omni Print sem alterar essas integrações. | Relatório de capacidades reais e colisões; dono confirma os dispositivos/layouts de QA. |
| P03-B — contratos | Definir registro único, tipos de código, proveniência GTIN, estados, permissões, formato interno e idempotência. | Revisão do contrato e decisão sobre fonte de verdade; nenhuma migration aplicada. |
| P03-C — persistência QA | Propor schema/migration aditivos e constraints; ensaio em PostgreSQL novo e vazio. | Aprovação separada de schema; isolamento/concorrência/legado/rollback comprovados em QA. |
| P03-D — emissão e lookup | Alocar códigos internos sob demanda; resolver alvo exato por loja, com auditoria e recusa de colisão/ambiguidade. | Testes de repetição, disputa, alvo inativo e loja alheia; estoque/venda permanecem bloqueados. |
| P03-E — preview e impressão | Layout determinístico por snapshot e fila/job auditável, reutilizando adaptadores existentes somente após autorização. | Preview verificável e impressão física em dispositivos de QA acordados. |
| P03-F — revisão e aceite | Evidências dos testes, custos, falhas de impressora/rede, restauração e revisão independente. | Aceite do proprietário; nenhum piloto Production implícito. |

## Lookup e impressão

O servidor deriva a loja da sessão autorizada. Resolver um código retorna um contrato de identificação,
não autorização para vender nem prova de saldo. O PDV atual não passa a aceitar venda de variante na P03:
os guards P01 permanecem e o fluxo operacional dos dois PDVs continua reservado à P06 e seus gates.

O job de etiqueta deve congelar alvo, versão do catálogo, SKU, cor, tamanho, código, layout e dados comerciais
aprovados. Formatação de preço segue precisão monetária e arredondamento P01; não se converte custo/saldo
legado. Mudança posterior da ficha não altera silenciosamente um job já revisado.

Falha ou resposta perdida da impressora não prova que nenhuma etiqueta saiu. Separar solicitado, enviado,
resultado conhecido e resultado incerto. Reimpressão deve ser explícita e auditada, sem realocar código.
Homologação física é necessária para afirmar legibilidade; um preview ou API simulada não comprova impressão.

Inicialmente propor emissão online com confirmação do servidor. Emissão offline e reutilização de jobs
em cache exigem política própria; cache local não se torna autoridade de identificadores ou estoque.

## QA e custos previstos

Usar camiseta P/M/G/GG em várias cores, calçados numéricos e produtos simples sintéticos. Cobrir duplicação
normalizada, colisão com legado, zeros em GTIN, formato/dígito inválido, referência ausente, lojas distintas,
requisições concorrentes, resposta perdida, reimpressão, catálogo alterado/inativo e restauração. Testar leitor
real e medidas/layouts aprovados; registrar resultado por variação e dispositivo.

Preferir geração e impressão sob demanda, paginação e lotes limitados. Medir CPU de renderização por lote,
bytes por etiqueta e gravações/consultas por emissão; cachear apenas assets/layouts seguros. Não introduzir
polling frequente, novo projeto Neon, fila externa ou serviço sem necessidade demonstrada. Nenhum custo
real Vercel/Neon foi medido para P03, pois ela não foi implementada.

## Decisões do proprietário antes de iniciar

Confirmar escopo inicial de SKU/código interno/GTIN, formato e política de aliases; modelos e tamanhos de
etiqueta; leitores e impressoras disponíveis em QA; uso e alcance autorizado de Omni Print; política de
preço impresso e reimpressão; ambiente/lojas de QA e gates de schema. Depois aprovar explicitamente as
etapas P03 desejadas. Production, Mercado Livre, estoque e venda permanecem fora dessa autorização.
