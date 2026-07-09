# Device Seeds 001 - Catálogo de Aparelhos

Data: 2026-07-09

## Objetivo

Estes arquivos são seeds revisáveis para o futuro Catálogo de Aparelhos do OmniGestão Pro. Eles foram gerados a partir do relatório comparativo de películas/capinhas já publicado, da planilha de modelos para capinhas, da base HTML de películas 3D e do CSV de gaps.

Eles **ainda não são importados no sistema**. Esta entrega é somente documentação/dados para revisão humana.

## Arquivos

- device_models_seed_001.csv: catálogo canônico de modelos de aparelhos. Não contém compatibilidade física.
- device_aliases_seed_001.csv: aliases de busca/autocomplete vinculados a model_key existente.
- device_compatibilities_seed_001.csv: relações de compatibilidade, principalmente grupos de película, com status e confiança conservadores.
- device_review_queue_seed_001.csv: fila de revisão humana para faltantes, aliases ambíguos, grupos multimarcas e duplicidades.

## Como usar

1. Revisar device_models_seed_001.csv para aprovar model_key, marca, linha comercial e nome canônico.
2. Revisar device_aliases_seed_001.csv para garantir que alias curto não vire chave global.
3. Revisar device_compatibilities_seed_001.csv separando película, capinha e outros acessórios.
4. Usar device_review_queue_seed_001.csv como checklist antes de qualquer importação.

## Modelo x alias x compatibilidade

- Modelo é o aparelho canônico, por exemplo Samsung Galaxy A05.
- Alias é um nome de busca, por exemplo Samsung A05, Galaxy A05 ou A05.
- Compatibilidade é uma relação entre modelos para uma categoria de produto, por exemplo pelicula_tela.

Alias ajuda a encontrar o aparelho, mas **não cria compatibilidade automática**.

## Status

- ativo: modelo válido para catálogo, sem indicação especial de legado ou revisão.
- legado: modelo antigo, útil para assistência/manutenção, mas com baixa prioridade de compra.
- novo: modelo recente ou de alta atenção operacional.
- revisar: item citado por base parcial, nome divergente ou dependente de confirmação.

Para compatibilidades:

- confirmado_fornecedor: relação indicada por fornecedor/base estruturada.
- provavel_mercado: aparece em mercado/tabelas abertas, mas sem confirmação forte.
- precisa_testar: exige teste seco ou confirmação humana antes de vender como compatível.
- nao_recomendado: não deve ser usado como compatível sem nova evidência.

## Confidence

- alta: boa correspondência entre fonte e modelo/alias, ou grupo direto de fornecedor.
- media: dado útil, mas com algum risco de nomenclatura, idade ou variação.
- baixa: dado vindo de grupo cruzado, mercado aberto, item faltante ou revisão necessária.

## Guardrails

- IA pode sugerir, humano confirma.
- Fornecedor pode errar.
- Película compatível não prova capinha compatível.
- Capinha exige encaixe físico, câmera traseira, botões e furação.
- Película exige tela, borda, sensor e câmera frontal.
- Tela, bateria e conector exigem revisão técnica mais rígida.
- Alias curto não deve ser chave global.
- Compatibilidade confirmada precisa ter fonte ou teste.
- Compatibilidade provável precisa aparecer como provável, não como confirmada.
- Não usar estes CSVs para baixar estoque.
- Não criar produtos automaticamente a partir destes CSVs.

## Próximo GOAL recomendado

Criar um GOAL de revisão/importação assistida que:

1. revise manualmente a fila device_review_queue_seed_001.csv;
2. aprove ou corrija aliases ambíguos;
3. separe compatibilidade de película, capinha, tela, bateria e conector;
4. defina o contrato final de importação sem alterar Prisma inicialmente;
5. rode um piloto com 20 casos reais de balcão antes de qualquer automação.

## Contagens desta geração

- Modelos canônicos: 417
- Aliases: 1716
- Compatibilidades: 1416
- Itens de revisão: 512
