# PDV-PADARIA-VENDA-MANUAL-KG-MVP-001

Implementação local isolada sobre 104d768 (PR315), com capacidade desligada por padrão. A PR315 foi reconferida e continua aberta no mesmo head. Commit funcional: 26dbb19c652dcf3a321e470ad326672a826971f5. O commit de fechamento das evidências é o HEAD desta branch.

## Resultado

0,350 kg × R$20,00/kg = R$7,00. Banco confirma ItemVenda 0,35; saída -0,35 no livro; Produto e depósito passam de 10 para 9,65. O mesmo mecanismo atende A01, ADMIN STORE e CAIXA STORE autorizado no Clássico normal/rápido. Preço/unidade reais são validados no servidor, com quantidades em milésimos e dinheiro em centavos. O cancelamento integral repõe 0,350 exatamente uma vez.

MANUAL_KG_SALE=PASS
PDV_CLASSIC_KG=PASS
A01=PASS
STORE=PASS
WEIGHT_PRECISION=PASS
SALE_TOTAL=PASS
PAYMENT_INTEGRITY=PASS
STOCK_LEDGER=PASS
CANCELLATION_RETURNS=BLOCKED
WRITER_V2=PASS
UN_REGRESSION=PASS
CAIXA_320_REGRESSION=PASS
E2E=PASS
NEW_SCHEMA_MIGRATION=YES
INDEPENDENT_REVIEW=APPROVE
BRANCH=codex/pdv-padaria-venda-manual-kg-mvp-001
COMMIT_IMPLEMENTACAO=26dbb19c652dcf3a321e470ad326672a826971f5
PUSH=NO
PRODUCTION_WRITES=0
MERGE=NO
DEPLOY=NO
DEPENDENCY_PR315=YES

## Validação executada

- PostgreSQL 17 descartável: 37/37 testes de contrato e integração passaram. Aplicadas separadamente as migrations #315 e de ItemVenda; histórico UN máximo 2147483647 preservado.
- E2E autenticado no build de produção: 8/8 passaram. A01 normal; ADMIN STORE normal; CAIXA STORE rápido; edição de peso; releitura; cancelamento com step-up; devolução bloqueada; outra loja recusada; resposta perdida e reenvio da mesma identidade; Caixa Seguro com senha própria/PIN e recusa ao CAIXA; diálogo mobile de 390 px; carrinho misto KG/UN com pagamento de R$13,00.
- Writer V2: integração PostgreSQL real, clientSaleId estável e três reenvios paralelos geram uma única venda/número/baixa. O E2E HTTP local usa o writer V1, preservando o gate de runtime existente.
- Regressão no Node 24: 281 testes, 246 aprovados e 35 falhas iguais por nome às da base. Comparação feita em cópia de leitura do commit 104d768, sem alterar a worktree concorrente. Nenhuma falha nova.
- Typecheck completo passou. Build passou com MIGRATION_SKIPPED e PROXY_PRISMA_ARTIFACT_VERIFIED. Lint dos 26 arquivos TS/TSX/MJS novos/alterados passou, com quatro avisos de hooks existentes no Clássico.
- O lint completo foi executado e falhou em 105 erros de cinco arquivos antigos em components/pdv-github-original. Os cinco arquivos foram comparados com a base e estão intactos. Esse resultado não foi omitido nem convertido em PASS.
- Revisão independente: três rodadas, APPROVE final, zero P0/P1; achados resolvidos em catálogo, descontos, compatibilidade UN, replay e cancelamento.

## Cobertura dos cenários obrigatórios

| Cenário | Prova |
| --- | --- |
| 0,350 kg e 1,250 kg | PostgreSQL e E2E autenticado |
| Carrinho misto, UN inteiro e edição do peso | PostgreSQL e E2E (edição UN fracionada recusada) |
| Saldo insuficiente; peso zero/negativo/inválido/precisão excessiva | Rollback PostgreSQL e parser/UI |
| Preço/total/pagamento divergentes e desconto adulterado | PostgreSQL; centavos estritos antes do replay |
| Reenvio e concorrência | V1 idempotente, V2 paralelo, proteção dos últimos gramas e E2E com resposta perdida |
| Cancelamento e devolução | Cancelamento integral exato; parcial/vale/troca KG bloqueados sem efeitos |
| A01, STORE e outra loja | NextAuth real, loja/permissão, três perfis; requisição cruzada recusada |
| Caixa #320 e vendas UN | E2E positivo/negativo de reautenticação, regressão e carrinho misto |
| Rede e reload | Aviso persistente, mesma identidade, Reenviar real, recarga e uma única baixa |

## Limites e liberação

Devoluções parciais/troca/vale de devolução, correção posterior de itens KG e criação por recuperação histórica permanecem bloqueadas. Acréscimo de imposto estimado no carrinho KG também não está adaptado. São impeditivos de liberação comercial ampla até implementação/decisão operacional expressa.

Publicação continua pendente da dependência #315, aprovação/aplicação da nova migration, coordenação de todos os clientes/servidores e autorização específica. Nenhuma flag, migration ou escrita produtiva foi executada. O runbook próprio está em [VENDA_MANUAL_KG_MVP_RUNBOOK.md](../../../padaria/pesagem/VENDA_MANUAL_KG_MVP_RUNBOOK.md); ele exige conter todas as escritas de venda/pós-venda, inclusive avulsos, e drenar clientes Prisma Int antes do schema Float.

As capturas desktop e mobile foram inspecionadas. Preservados estilo, tokens e componentes do PDV; o diálogo mostra preço/kg, peso com vírgula e total. Labels, orientação de erro, aria-invalid e aria-live presentes. Verificadas larguras de 1440 e 390 px; não houve auditoria exaustiva de acessibilidade.

Artefatos resumidos: validation.json, AUDIT.md, INDEPENDENT_REVIEW.md e capturas nesta pasta. Relatórios brutos reproduzíveis ficam em test-results/manual-kg, ignorados pelo Git. Rodadas repetidas do E2E exigem repetir a preparação fresca, evitando colisão dos números V1 globais entre lojas sintéticas antigas.
