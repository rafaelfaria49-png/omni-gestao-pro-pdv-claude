# Venda manual KG — hardening e plano de publicação

GOAL: PDV-PADARIA-KG-RELEASE-HARDENING-002. Execução local na branch codex/pdv-padaria-venda-manual-kg-mvp-001, preservando 26dbb19 e 606eaac. Referências: estoque #315 em 104d768d7b7497fe34e2872f4253c4fd97feb5bb; main/#322 em 35a3971c31f62e6e802b7dd8763be81475334780. Nenhuma publicação está autorizada. Este documento não modifica nem conclui o runbook A6 da frente de estoque.

## Decisão da migration

O piloto Float de ItemVenda NÃO é uma base segura para publicação. A prova executável com schema/cliente Prisma exato de 104d768 reproduziu uma escrita Int de 13 que gravou 6.4e-323 em coluna double precision. A posição da migration na fila não resolve essa incompatibilidade do protocolo de escrita. Nem o bloqueio de estoque sozinho cobre avulsos, serviços, títulos e correções de payload.

A migration ainda não publicada 20261029120000_manual_kg_sale_quantity foi revisada. A versão anterior está preservada nos commits do MVP; o arquivo e checksum novos devem ser aprovados como tal. Se qualquer ambiente tiver aplicado o piloto Float, esta migration RECUSA essa base com KG_ADDITIVE_REQUIRES_LEGACY_INTEGER. Não alterar histórico de migrations, marcar como aplicada nem converter/truncar seus pesos para contornar a recusa. Um piloto com dados exige reconciliação própria; nenhum dado produtivo foi examinado ou modificado aqui.

| Representação | quantidade (OID int4 legado) | quantidadeKg NUMERIC(65,30) |
| --- | --- | --- |
| UN | inteiro não nulo | nulo |
| KG, inclusive 1 kg | nulo | positivo, até 2.000.000.000 kg, múltiplo de 0,001 |

A escala física de 30 casas evita que um numeric(15,3) arredonde 0,3501 para 0,350 antes do CHECK. O domínio HTTP continua sendo número decimal com no máximo três casas, validado antes de qualquer escrita. A soma de peso e os deltas usam gramas inteiros; valores monetários usam centavos e half-up por linha. Nunca interpretar o sentinel NULL como zero. O adapter itemCommercialQuantity é o ponto de leitura da quantidade comercial.

As cinco colunas Float do estoque da #315 permanecem intactas. A expansão exige schema public, executor proprietário das tabelas consultadas e ausência de FORCE RLS nessas tabelas; qualquer topologia diferente exige avaliação antes da publicação. A migration tem BEGIN/COMMIT explícitos, lock_timeout de 5s e statement_timeout de 60s. O CHECK validado recebe fingerprint, e o gate verifica tipos, precisão, nulabilidade, CHECK e associação dos oito triggers às funções/tabelas esperadas.

As funções da barreira usam SECURITY DEFINER e search_path fixo public, pg_temp. Foi testado um papel runtime sintético com RLS escondendo a Venda: a escrita econômica continuou bloqueada. Não é necessário nem foi realizado ajuste de papel produtivo. O marcador transaction-local omni.manual_kg_writer=additive-v2 é uma barreira de VERSÃO; não é autenticação contra alguém com acesso SQL às credenciais. A autorização A01/STORE continua nos guards HTTP existentes.

## Compatibilidade real dos clientes antigos

Cliente da #315 conserva leitura, criação e incremento de UN, inclusive o histórico 2147483647. Ler um item KG com quantidade Int obrigatória falha com P2032. Consultas somente de Venda/payload e COUNT ainda funcionam; SUM(quantidade) ignora KG nulo. Portanto, NÃO há compatibilidade semântica de relatórios KG com leitores antigos. Todos os leitores/agregadores usados pelas lojas KG precisam ser atualizados ou retirados de circulação antes da habilitação.

O banco bloqueia writers antigos sobre Venda KG (incluindo remoção do marcador), seus itens, ledger de estoque por referência, financeiro direto/por título, títulos por FK/localKey/payload e usos de crédito. A devolução também é recusada por produto KG na linha, mesmo sem referência à venda, incluindo declarações legadas vendaPorPeso e atributos.vendaPorPeso. A barreira dos títulos impede a correção antiga de criar um título em transação separada antes de falhar na Venda. UN convencional mantém seu contrato.

## Operações admitidas e limites

- Venda manual: Clássico normal/rápido, KG e carrinho misto com UN inteiro, writers V1/V2 e idempotência. Produto, unidade e preço são conferidos no servidor sob lock. O operador confirma o peso no modal.
- Imposto estimado: configuração autoritativa StoreSettings.printerConfig.pdvParams; percentual até quatro casas e centavos exatos, sobre subtotal antes do desconto. O servidor congela enabled/ratePercent/baseCents/taxCents em manualKgTax. Divergência do navegador aborta toda a venda. Isso não habilita cálculo/emissão fiscal.
- Correção de peso: somente venda com UM item KG, paga integralmente em dinheiro, sem desconto, sem devolução/vale/título/documento fiscal e com sessão original aberta e períodos abertos. Exige sessão autorizada, PIN e motivo. Altera somente peso, mantendo identidade da linha, produto, preço e alíquota originais. Lock da Venda, revisão, commandId/digest e transação Serializable protegem concorrência e repetição. Estoque/depósito/ledger, item, entrada financeira e auditoria são atômicos. Os demais tipos de correção ficam bloqueados no servidor e na interface.
- Cancelamento integral: preserva permissão e step-up por venda, guard de caixa/período/recebíveis e a reposição exata. Relê sob lock; serializa com correções e outro cancelamento. Para KG, títulos e seus estornos pertencem à mesma transação de estoque/status/financeiro. Créditos consumidos são restaurados uma vez. Cancelamento incrementa a revisão e é terminal.
- Devolução parcial/troca/vale originado por devolução KG: BLOQUEADOS, incluindo peso inteiro e caminhos sem referência. Dependem de quantidade e identidade da linha de devolução, teto cumulativo concorrente por item, crédito/refund server-first e transação única. O legado tem ItemDevolucaoVenda Int, correspondência por produto, fallback de valores do cliente e integração financeira posterior; só trocar o tipo seria inseguro. Não liberar para obter um badge PASS.
- Recovery histórico que CRIARIA KG ausente: BLOQUEADO antes de arredondamento/plano de estoque. Depende de decisão para déficit e movimentos já absorvidos por ajustes posteriores, sessão histórica e identidade. A cópia local é preservada. Reenvio da tentativa original e reconciliação de venda já confirmada continuam permitidos sem repetir efeitos.
- Fiscal KG: snapshot/emissão permanecem bloqueados; quantidade nula não vira zero fiscal. O comprovante é não fiscal. Qualquer evolução de unidade/tributação/NFC-e é outra autorização.

## Releitura, rede e caches

SaleRecord e detalhe/histórico leem quantidade comercial canônica. O histórico conta linhas KG como itens e informa pesoTotalKg separadamente; não soma kg com unidades como uma quantidade única. O comprovante KG conserva o subtotal bruto e a taxa congelada.

Após confirmação KG, o cliente exige um snapshot autenticado da venda atual e dos saldos, lido sob lock compartilhado. Não baixa o estoque local de novo e não debita crédito de novo: usa os saldos lidos. Se essa leitura falhar, a tentativa fica pendente com a mesma identidade. O replay original continua comparando a fingerprint original, preservada pelo servidor, mesmo depois de correção auditada.

V1/V2 reconciliam revisão, itens, total, pagamentos e taxa remotos. A seleção monotônica ignora revisões antigas e regressão de cancelada. A mesma seleção rege efeitos e eventos. Ajustes de projeção em dinheiro só atingem o dia e a sessão originais, e respostas de outra loja em voo não alteram o cache atual. Esses caches são projeções; estoque, financeiro e autorização transacionais continuam no servidor.

## Integração isolada com main e #322

A integração é ensaiada por merge-tree e exportação em diretório de referência separado, sem merge na branch ou mudança da worktree #315. O visor da #322 permanece componente/serviço read-only. Não há callback de peso do visor para a transação. O teste autenticado integrado simula leituras 9,999/8,888 kg e confirma venda somente dos 0,350 kg digitados pelo operador. O modal manual não oferece Ler balança. Não houve validação de hardware físico nem autorização para entrada automática de peso.

## Plano específico de rollout — NÃO EXECUTADO

1. Obter autorização humana separada para publicação, migrations e habilitação. Conferir HEADs, checksums, revisão e evidências finais; resolver/aceitar formalmente os limites operacionais ainda bloqueados. A aprovação local de código não autoriza rollout amplo.
2. Concluir os gates próprios da #315/A6 na outra frente. Confirmar estado real das migrations e as cinco colunas Float de estoque. Este trabalho não substitui a contenção/drenagem exigida pela mudança Int→Float de ESTOQUE da #315, nem altera seu runbook/WIP.
3. Manter PDV_MANUAL_KG_RELEASE ausente e nenhuma loja KG liberada. Conter TODAS as escritas de venda/pós-venda/sync/OS/avulsos/serviços/recebíveis na janela; STOCK_WRITES_FROZEN sozinho não cobre esse grafo. Drenar transações e inventariar clientes, filas, PWA/offline, URLs antigas, jobs e leitores de relatórios.
4. Validar backup/restore e preflight em cópia descartável com a topologia real de owner/RLS. Aplicar primeiro a migration de estoque #315 conforme sua autoridade; depois executar a expansão aditiva desta venda com Int legado preservado. Comparar valores UN e vínculos antes/depois. Qualquer timeout, drift, Float piloto ou diferença aborta a etapa. Não habilitar KG para testar a migration.
5. A expansão vem ANTES dos novos binários Prisma: eles selecionam quantidadeKg e falhariam sem a coluna. Clientes #315 podem continuar atendendo UN durante a expansão, mas a janela e seus serviços econômicos precisam estar controlados. Publicar o binário compatível com flag KG desligada; conferir geração Prisma e artefato de proxy.
6. Atualizar/retirar todos os leitores e writers antigos das lojas pretendidas, inclusive relatórios que somam quantidade e URLs preservadas de deploys. Comprovar barreiras e retirada de acesso; NULL/P2032 impede conversão silenciosa, mas não torna agregados legados corretos. Reabrir UN e conferir caixa/depósito/ledger/retry sob a nova versão.
7. Somente com nova autorização explícita configurar PDV_MANUAL_KG_RELEASE=PDV-PADARIA-KG-RELEASE-HARDENING-002 e PDV_MANUAL_KG_STORES com IDs exatos. O gate exige o contrato físico completo. Não usar flag pública, curinga ou peso do visor. Habilitar uma loja de cada vez sob o acompanhamento aprovado, sem usar venda comercial real como teste automático.
8. Observar erros P2032, barreiras de versão, pendências, revisões, saldos, depósitos e reconciliação. Manter devolução parcial, recovery histórico, correções fora da restrição e fiscal KG bloqueados. Expansão comercial ampla depende da decisão operacional e/ou evolução dessas frentes.

## Rollback próprio

- Antes da primeira KG: desligar flag/allowlist e conservar a expansão aditiva é o rollback preferido. Voltar apenas ao cliente #315 para UN é tecnicamente compatível com int4 preservado; a topologia de estoque ainda precisa respeitar o rollback da #315. Não voltar a clientes pré-315 sobre Float de estoque.
- Depois de qualquer KG, inclusive 1 kg ou venda cancelada: desligar novas vendas e conter escritas conforme o incidente; manter o binário ponte compatível para leitura, reconciliação e cancelamento autorizado. Não voltar globalmente ao cliente Int obrigatório, não remover quantidadeKg/triggers e não restaurar NOT NULL. Não apagar históricos para permitir downgrade.
- Reversão física só pode ser considerada em outra janela se NÃO existir nenhuma linha/contrato KG, nenhum cliente novo em voo e houver autorização específica. Ausência apenas de frações não basta: 1 kg usa o mesmo sentinel NULL. Nenhum down migration, backfill ou correção de histórico foi executado.
- Pendências preservam identidade; não cunhar outra venda para compensar timeout. Uma tentativa confirmada pode ser relida mesmo com a capacidade de criação desligada. Nunca reexecutar estoque/pagamento como estratégia de rollback.

## Reprodução e evidências

Usar Node 24 e somente PostgreSQL 17 descartável em 127.0.0.1:55479, database manual_kg_sale_isolated, role manual_kg; DATABASE_URL e DIRECT_URL exatas, MIGRATION_AUTHORITY_ENABLED=false. O runner recusa .env e banco não fresco. Prepara schema sintético anterior, aplica a migration #315 original e a expansão, preserva histórico UN, gera o cliente exato #315 e executa provas reais. O papel/RLS da prova é criado e removido somente nesse cluster sintético.

- node scripts/pdv/run-manual-kg-tests.mjs
- node scripts/vercel-build.mjs — exigir MIGRATION_SKIPPED e PROXY_PRISMA_ARTIFACT_VERIFIED; executar tsc separado, pois Next pula checagem de tipos.
- node scripts/pdv/run-manual-kg-e2e.mjs — contas/PIN/senhas sintéticos em memória; localhost:31479; exige repetir a preparação fresca antes de outra rodada.
- Lint dos arquivos envolvidos; para lint global excluir .local-kg/**, que contém cliente gerado/cluster descartável. Não excluir código da aplicação nem as falhas históricas arquivadas.

Resultados resumidos e revisão: docs/ai-execution/_evidence/PDV-PADARIA-KG-RELEASE-HARDENING-002. Logs brutos locais em test-results/manual-kg. Os relatórios do MVP original permanecem como registro histórico.
