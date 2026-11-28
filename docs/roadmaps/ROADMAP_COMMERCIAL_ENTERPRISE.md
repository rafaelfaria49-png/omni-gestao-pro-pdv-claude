---
title: Roadmap — Evolução Comercial Enterprise (multissegmento)
goal: OMNI-COMMERCIAL-ENTERPRISE-EVOLUTION-001
status: em execução — PR 1 (núcleo) em draft
last_update: 2026-11-27
decisoes: [ADR-0025, ADR-0026]
---

# Roadmap — Evolução Comercial Enterprise

Ciclo alvo: aquisição → cadastro → estoque → avaliação → preparação → custos → precificação →
negociação → venda → pagamento → entrega → garantia → pós-venda → relatórios, para lojas de
qualquer ramo. **Ramo sugere, não autoriza.** Hierarquia: plano contratado → recurso disponível →
configuração da loja → permissão do usuário.

Fontes de verdade reutilizadas (nada paralelo): Produto canônico, StockLedger
(`applyStockMutationTx`), motor de vendas (`upsertVendaInTransaction`), Contas a Pagar canônico,
domínio Aparelhos (`AparelhoFisico` + lifecycle), Capabilities V1 (`StoreSettings.printerConfig.capabilities`),
Central de Relatórios.

Legenda: ✅ implementado e validado (testes reais) · 🟡 implementado, aguardando homologação ·
🔒 dependência externa · ⬜ não implementado.

## Entregas da PR 1 (núcleo transacional)

| Frente | Estado | O que existe | Arquivos principais |
|---|---|---|---|
| VC-00 Recursos multissegmento | ✅ | 9 recursos novos no MESMO registry (só ativação explícita), grupos, dependências reais (`missing`), módulo contratado, busca/filtro/agrupamento na tela, limite retroativo configurável | `lib/store-business-capabilities.ts`, `lib/capabilities-persistence-v1.ts`, `BusinessResourcesCard.tsx` |
| VC-01 Contrato de custos | ✅ | 5 origens (estoque, preexistente, vínculo financeiro com rateio, nova compra, gerencial), centavos, append-only, idempotência, capacidade travada, reversão auditável | `lib/comercial/custos/*`, migration `20261129120000_comercial_custos_preparacao` |
| Custo histórico | ✅ | Congelado na venda da unidade (mesma transação), imutável; alterar custo depois não muda o histórico | `lib/comercial/custos/congelamento.ts`, gancho `lib/aparelhos/sale-hook.ts` |
| VC-04 Preparação para revenda | ✅ backend · 🟡 UI | Etapas (em preparação/testes/concluída) sobre o lifecycle existente (`em_revisao`), trava de liberação, prontuário (categoria, funcionamento, finalidade, defeitos, classe estética, conferências de segurança) | `lib/comercial/custos/service.ts`, `components/aparelhos/comercial/*` |
| VC-03 Individualizados (generalização) | 🟡 parcial | Categoria da unidade (smartphone…eletrodoméstico); identificação por série já aceita; rateio exato de custos de lote | idem |
| Implantação (item 13) | ✅ backend | Saldo inicial uma vez por produto, saldo zero, sem financeiro; mercadoria preexistente marcada no prontuário | `lib/comercial/implantacao.ts` |
| VC-02 Venda retroativa | ✅ backend · 🟡 UI | Cenário A (pagamento hoje) e B (regularização em sessão original fechada) validados no servidor; C/D fail-closed | `lib/comercial/venda/*`, rotas `venda-persist` V1/V2 |
| VC-05 Brindes | ✅ backend · 🟡 UI | Linha preço zero, baixa e custo pelo motor canônico, motivo; sem receita fictícia | idem |
| Tipo de venda não exclusivo | 🟡 | Características derivadas (a prazo ≠ cartão, garantia, misto, retroativa, brinde) | `contrato.ts`, Venda Completa |
| VC-09 Relatório comercial | 🟡 | Kind `comercial` na Central (capital imobilizado, preparação, margem histórica só com custo congelado completo, estoque parado, brindes, retroativas) | `lib/relatorios/comercial.ts` |

## Próximas etapas (não implementadas nesta PR — sem interface falsa: recursos ficam "Em preparação")

| Frente | Estado | Bloqueio / próximo passo |
|---|---|---|
| Gestor Money (vínculo `gestor_money_gasto`) | 🔒 | Contratos da #405 não publicados na main. PR 2 dependente após merge da #405: mapear `Gasto`/`AlocacaoPagamento` → `comercial_custos_origens.tipo = gestor_money_gasto` (hoje `GESTOR_MONEY_NAO_DISPONIVEL`). |
| VC-06 Usado como parte do pagamento | ⬜ | Exige liquidação canônica de aquisição por compensação (hoje `abatimento_venda` é `PAGAMENTO_NAO_INTEGRADO`): aquisição + venda + diferença numa transação, com recuperação durável. |
| Cadastro rápido de aparelho na venda | ⬜ | Requer reserva/criação da unidade no diálogo de venda com destino explícito em abandono (unidade criada fica `aguardando_conferencia`, nunca estoque). |
| VC-07 Troca/devolução de unidade individualizada | 🔒 | Motor de trocas P1 (#401) e F8 (#331) ainda em PR; aparelho segue fail-closed (`APARELHO_DEVOLUCAO_NAO_INTEGRADA`). Integrar pela unidade exata (`AparelhoVenda.aparelhoId`, `vendido → devolvido → em_avaliacao`). |
| Garantias detalhadas por item | ⬜ | Legal (não opcional) + contratual + fabricante + peça + serviço + fornecedor por linha; validação jurídica pendente. |
| VC-08 Integração com OS | ⬜ | Custos de OS (material preexistente/compra vinculada), alternativas de orçamento (original/premium/compatível), conversão de aparelho de cliente em aquisição formal (sem transferência automática de propriedade). OS não guarda IMEI hoje. |
| Venda retroativa C e D | ⬜ | Vínculo explícito de pagamento já registrado; regularização de aparelho vendido antes da implantação sem entrada fictícia. |
| VC-10 Vitrine, etiquetas, interesse | ⬜ | Depois do núcleo: vitrine sem IMEI/aquisição, consentimento para contato; consignação só com contrato de propriedade/repasse. |

## Revisão independente (agente separado, contexto próprio)

- Rodada 1: REQUEST_CHANGES — 3 P1 (custo zero forçado congelado como conhecido; validação comercial antes do replay com códigos dependentes de relógio/permissão como recusa definitiva; título de nova compra reaproveitável por outra unidade com o mesmo operationId) e 7 P2.
- Correções: todos os P1 e os P2-1, P2-3, P2-4 (motivo), P2-5, P2-6, P2-7 + P3 de congelamento, hash à vista e trigger de imutabilidade, cada um com teste de regressão (PG).
- Rodada 2: **APPROVE** — nenhum P0/P1/P2 novo.
- Ressalvas residuais (condição para LIGAR os recursos, não para o merge):
  - P2-2: título manual cujos itens também entraram no estoque pode ser rateado e consumido do estoque — regra do proprietário/contador pendente; até lá, ligar `vínculo financeiro` com orientação.
  - P2-4: regularização (cenário B, só API) altera totais de sessão fechada sem evento de ajuste na `SessaoCaixa` — aprovar ou implementar o evento antes de usar.
  - P3: venda retroativa offline que sincroniza depois do limite/permissão fica "exige correção" (descartar manualmente); saldo inicial com custo desconhecido entra a custo 0 no médio; FK de `comercial_vendas_custos` sem `storeId`; brindes sem limite/permissão própria; retroativa reaproveita `pdv.cancelarVenda`; preexistente aceito quando o saldo é menor que a quantidade.

## Rollout

1. Revisão independente + CI verde da PR 1 (draft).
2. Aplicar migration em Production somente com autorização, backup/PITR (Neon) e janela.
3. Ligar recursos por loja (todos desligados por padrão; lojas legadas intactas).
4. Homologação física: prontuário, liberação, venda com custo congelado, relatório.
5. PR 2 (Gestor Money) após merge da #405.
