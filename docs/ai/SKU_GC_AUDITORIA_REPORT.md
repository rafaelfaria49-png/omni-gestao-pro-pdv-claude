# Auditoria — SKUs legados `gc-` (dry-run)

> Gerado por `scripts/auditar-gc-skus.ts` em 2026-05-24T14:07:13.964Z.
> **Somente leitura — nenhuma alteração foi feita no banco.**
> Escopo: todas as lojas.

## Resumo

| Métrica | Valor |
|---|---|
| Produtos no escopo | 237 |
| Candidatos `gc-` (sku começa com `gc-`) | 233 |
| **Seguros (atualizáveis)** | **232** |
| Conflitos (não serão atualizados) | 1 |
| Sem SKU final válido (pular) | 0 |
| Duração da auditoria | 1852ms |

## Vínculos dos produtos `gc-`

Todos os vínculos abaixo referenciam o produto por **id (cuid)**, não pelo `sku`.
A troca de `Produto.sku` **não quebra** nenhum destes vínculos.
(`MovimentacaoEstoque.produtoSku` é snapshot de auditoria e **não é alterado**.)

| Vínculo | Linhas | Produtos distintos |
|---|---|---|
| Itens de venda (`ItemVenda.inventoryId`) | 35 | 18 |
| Itens de OS (`OrdemServicoItem.produtoId`) | 0 | 0 |
| Movimentações de estoque (`produtoId`) | 40 | 19 |
| Marketplace listings (`productId`) | 0 | 0 |
| Marketplace product links (`produtoId`) | 0 | 0 |

## Exemplos de conversão segura (before → after)

| SKU atual | SKU novo | Loja | Produto |
|---|---|---|---|
| `gc-4500821874281` | `4500821874281` | loja-1 | FONE DE OUVIDO SEM FIO FN-19 |
| `gc-6615035253813` | `6615035253813` | loja-1 | KIT DE CARREGADOR RAPIDO 5.1 |
| `gc-8601706803840` | `8601706803840` | loja-1 | Suporte para celular bicicleta prova dag |
| `gc-2064203866908` | `2064203866908` | loja-1 | CABO IPHONE HRERBOS 1.2M HS-220 |
| `gc-6785452041751` | `6785452041751` | loja-1 | CABO DE REDE COM CONECTOR HMASTON |
| `gc-1938856068115` | `1938856068115` | loja-1 | CABO E CELULAR USB MICRO V8 1M 2.4A KAID |
| `gc-7766280594463` | `7766280594463` | loja-1 | CABO DE DADOS TIPO-C TIPO-C TURBO 60W KA |
| `gc-8550368017846` | `8550368017846` | loja-1 | CABO DE REDE 3M  NEW DAY |
| `gc-4617097863365` | `4617097863365` | loja-1 | CABO DE REDE 5M  NEW DAY |
| `gc-5528960037197` | `5528960037197` | loja-1 | CABO HDMI DE ALTA VELOCIDADE |
| `gc-996` | `996` | loja-1 | CABO DE FORÇA ENERGIA TRIPOLAR 3 PINOS |
| `gc-41` | `41` | loja-1 | Acessorio p\celular de capinha |
| `gc-8312527250075` | `8312527250075` | loja-1 | CABO AUXULIAR P2 P2 KAPBOMKA-AU01 |
| `gc-629115744281` | `629115744281` | loja-1 | Bastao de Selfie LE3507 |
| `gc-1720480308242` | `1720480308242` | loja-1 | BASTAO MUSICA LUZ RITMICA ALTOMEX AL-291 |
| `gc-8538450208142` | `8538450208142` | loja-1 | CABO DE CELULAR USB TIPO-C 1M 3A KAIDI K |
| `gc-2412472721651` | `2412472721651` | loja-1 | BATERIA PORTATIL IOS POWER BANK 5000MHA |
| `gc-7057113884145` | `7057113884145` | loja-1 | CABO AUXILIAR IOS PARA P2 ELETROMEX |
| `gc-5129633187718` | `5129633187718` | loja-1 | CABO AUXILIAR P2 3.5MM PEINING PEI-AU03 |
| `gc-39` | `39` | loja-1 | Astronalta acessorio p\celular |

## Conflitos (NÃO serão atualizados)

| SKU atual | SKU novo | Loja | Motivo | Conflita com (id) |
|---|---|---|---|---|
| `gc-10` | `10` | loja-1 | skuNovo já existe em outro produto da loja | cmpa56ysj002hh2uwuolbp6en |

## Sem SKU final válido (skuNovo vazio — serão pulados)

_Nenhum._

---

**Próximo passo:** revisar este relatório e, se aprovado, executar
`npx tsx scripts/remover-gc-skus.ts` (dry-run) e depois com `--apply`.
