---
title: ADR-0025 · Contrato de custos comerciais — apropriação separada de compra, pagamento e estoque
status: proposta
data: 2026-11-27
autor: Claude (Opus 5.5) — GOAL OMNI-COMMERCIAL-ENTERPRISE-EVOLUTION-001
revisores: [revisor independente (agente), proprietário]
hub: cross
tags: [custos, estoque, financeiro, aparelhos, cmv, idempotencia, centavos]
---

# ADR-0025 · Contrato de custos comerciais

> **Status:** proposta (implementada em PR draft, migration NÃO aplicada em Production)
> **Decisão em uma frase:** custo aplicado a uma unidade individualizada é uma **apropriação** própria, em centavos inteiros e append-only, que nunca move dinheiro nem estoque por conta própria — dinheiro só pelo Financeiro canônico, estoque só pelo boundary do StockLedger.

## 1. Contexto

- A loja compra celular danificado por R$ 30, aplica uma tela antiga já paga (R$ 100) e um conector do estoque (R$ 30): o custo da unidade é R$ 160, mas a única saída de dinheiro nova é R$ 30.
- Até aqui o custo do aparelho era `AparelhoFisico.custoAquisicao + despesas` (Float, digitado), e o CMV da venda vinha da **média ponderada do modelo** no ledger — não do custo da unidade. Alterar custo depois mudava a margem histórica.
- O Financeiro grava dinheiro em `Float` (reais). O Gestor Money (#405, não mergeado) introduz `valorCentavos`, `Gasto`, `AlocacaoPagamento` — contratos ainda não publicados.

## 2. Decisão

Separar e nunca equiparar: aquisição comercial · obrigação financeira · pagamento efetivo · entrada de estoque · consumo de material · apropriação de custo · custo histórico da venda.

Tabelas novas (migration aditiva `20261129120000_comercial_custos_preparacao`):

| Tabela | Papel |
|---|---|
| `comercial_perfis_unidade` | Prontuário 1:1 da unidade: categoria, funcionamento, finalidade, etapa de preparação, status do custo de aquisição (conhecido/estimado/desconhecido), conferências de segurança, preexistente. |
| `comercial_custos_lancamentos` | Apropriação de custo. Append-only (trigger): só `ativo → estornado`. |
| `comercial_custos_origens` | Compra já registrada que pode ser rateada (capacidade de valor e quantidade). Append-only. |
| `comercial_vendas_custos` | Custo **congelado** na venda da unidade. Append-only. |

Cinco origens, cada uma com sua prova (CHECK no banco):

| Origem | Efeito financeiro | Efeito de estoque |
|---|---|---|
| `estoque` | nenhum | saída pelo StockLedger (`source=comercial-preparacao`), custo = custo médio histórico; sem custo médio ⇒ **desconhecido** |
| `preexistente` | nenhum | nenhum; recusado se o produto citado tem saldo (força consumir do estoque) |
| `vinculo_financeiro` | nenhum novo | nenhum; rateio de um `ContaPagarTitulo` existente até valor e quantidade (advisory lock por origem); título da compra do próprio aparelho ou criado aqui é recusado |
| `nova_compra` | **um** título pendente em Contas a Pagar (contrato canônico, `createdFrom=comercial.custos.nova_compra`); pagamento só no Financeiro | nenhum |
| `gerencial` | nenhum (mão de obra interna; CHECK impede outra origem) | nenhum |

Regras: custo desconhecido ⇒ `valorCentavos NULL` (CHECK); composição com desconhecido ⇒ total `null`, `completo=false`, sem margem. Indicadores só de margem bruta/contribuição **estimada** — nunca "lucro líquido". Idempotência por `operationId` do cliente (`custo:{unidade}:{op}` + hash do conteúdo). Unidade em preparação ou com finalidade ≠ revenda é recusada em `liberarParaVenda` (`PREPARACAO_PENDENTE`). Custo só para unidade **da loja** (manutenção de cliente continua na OS).

Congelamento: com `commercial.historicalCost` ligado e a migration instalada, o gancho de venda de aparelhos grava `comercial_vendas_custos` **na mesma transação** da venda. Sem isso, a venda segue exatamente como antes.

Saldo inicial de implantação (`commercial.implantationMode`): entrada de estoque `origem=implantacao`, uma vez por produto, só com saldo zero, sem nenhum movimento financeiro.

## 3. Alternativas descartadas

- **Somar no `despesas` legado**: perde origem, prova e reversão; mistura com o valor digitado.
- **Lançar despesa no Financeiro para cada peça**: cria saída fictícia e conta duas vezes (despesa + CMV).
- **Ligar no Gestor Money já**: contratos de #405 não publicados → vínculo `gestor_money_gasto` existe no tipo, mas responde `GESTOR_MONEY_NAO_DISPONIVEL` (fail-closed).

## 4. Consequências

- O CMV do ledger (média do modelo) continua sendo o do Financeiro/estoque; a margem **por unidade** passa a vir de `comercial_vendas_custos`. O Relatório comercial usa só linhas `completo=true` e declara as excluídas.
- Contas a Pagar criada por `nova_compra` usa categoria "(estoque)", lida pelo Relatório Geral como compra/insumo, não despesa operacional — **validar com o contador** o tratamento contábil (estoque × despesa).
- Pendências: integração com Gestor Money (segunda etapa, após #405), apropriação de custos em OS (V3/V4), consumo por peso/grade (bloqueado pelo ledger).
- Rollout: aplicar a migration é passo separado e autorizado (backup/PITR). Sem ela, rotas comerciais respondem 503 `COMERCIAL_NAO_INSTALADO`; liberação e venda consultam `to_regclass` antes de tocar as tabelas novas. Reversão: `down.sql` (somente sem dados reais).
