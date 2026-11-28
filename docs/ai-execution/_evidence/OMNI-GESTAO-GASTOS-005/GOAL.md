# OMNI-GESTAO-GASTOS-005 — Consultas e exportações financeiras reconciliadas

STATUS: IMPLEMENTADO E VALIDADO; R APPROVED; fechamento em commit local único. Classe C4.

## Autorização e isolamento

Somente G005, implementação, testes, correções, R e um commit local após todos os gates. Base EXATA fad3d202a5556c1170af07b94181e668aa4d21a7; branch codex/omni-gestao-gastos-005; worktree C:/Projetos/omni-gestao/.worktrees/omni-gestao-gastos-005. G001 55bab9a, G002 bcde32c, G003 451b0e4 e G004 fad3d20 têm ancestralidade comprovada (merge-base --is-ancestor exit 0). Worktrees anteriores e principal preservadas; principal 5ae661d com WIPs de outras trilhas, não integrantes deste trabalho.

Fetch sem integração confirmou origin/main 040fcc76fdf739100d9dd5a7d798d456a6b8aff5. O remoto acrescenta guards operacionais empresariais e ajustes no analytics/conciliacao; conferir esses deltas sem merge, rebase ou cherry-pick. A base continua o SHA G004 solicitado. Espaço inicial C: 41.253.961.728 bytes livres, superior ao gate 8 GiB; reconferir antes de banco/build. Node local 26.12.1; engines 24.x, sem alteração global/dependência para ocultar a diferença.

ENTRYPOINT, EXECUTION_PROTOCOL, TASK_LEVELS, GOVERNANCA e INDEX de execução consultados. AEP é opt-in e .aep-active está AUSENTE nesta worktree. Não criar sessão de outra trilha, nem editar state.json, LEDGER.jsonl ou REGISTRY.md. Não chamar close que criaria outro commit de estado. Os gates de código/core financeiro/Agent e testes descartáveis estão expressamente autorizados pelo pedido atual. Migration G005 não autorizada por padrão e não prevista.

Referência: pacote OMNI-GESTAO-GASTOS-WHATSAPP-PLANO-001 em C:/Users/rafae/.codex/visualizations/2026/10/19/01a1556c-83ac-77e2-a447-7e0f152c7c8e/OMNI-GESTAO-GASTOS-WHATSAPP-PLANO-001. Decisões G001–G004 prevalecem sobre formulações antigas do plano: PESSOAL global por AdminUser, sem Store, exclusivamente interno; EMPRESA por loja e membership/grant atuais.

## Allowlist exata, antes de editar produto

| Caminho | Necessidade identificada no inventário |
|---|---|
| app/api/financeiro/relatorios/rankings/route.ts | R1 reproduziu três consultas/snapshots na mesma resposta. Leitor diretamente afetado, já autorizado pelo §4 humano; enumerado antes da edição para usar uma consulta e projetores puros. |
| app/api/financeiro/relatorios/indicadores/route.ts | Mesmo defeito R1 de múltiplos snapshots; um DTO e calendário do mesmo asOf, com códigos de erro estáveis. |
| app/api/financeiro/relatorios/resumo/route.ts | R1 reproduziu preset inválido fora do try e ocultação de anomalia como503 genérico. Somente leitor diretamente afetado, sob §4; registrar antes da edição. |
| app/api/financeiro/relatorios/categorias/route.ts | Mesmo contrato de preset/erro na projeção oficial, sem alterar gates. |
| app/api/financeiro/relatorios/fluxo/route.ts | Mesmo contrato de preset/erro na projeção oficial, sem alterar gates. |
| app/actions/omni-agent.ts | Somente leitura do resumo financeiro no overview: anomalia não pode ser rotulada como falta de permissão. Writers e demais ações intactos. |
| lib/gastos/query.ts | Autoridade tipada de consulta, autorização atual, snapshot somente leitura, período/fuso/base/conta/categoria, DTO em centavos e versão. |
| lib/gastos/query-calculo.ts | Cálculo puro compartilhado de precisão, saldo restante, fatos de caixa e datas; necessário também aos ports de leitura do Contador, sem importar Prisma em agregadores puros. |
| lib/gastos/query.test.ts | Contratos de precisão, filtros, datas e projeções. |
| lib/financeiro/services/relatorios-financeiros-service.ts | Indicadores usam valor original bruto e várias versões do banco; categorias usam origem. Substituir somente leituras/projeções pelas métricas oficiais. |
| lib/financeiro/services/fluxo-caixa-service.ts | Saldo ignora saldo inicial, parciais usam bruto, tempo usa sincronização; consumir o DTO oficial. |
| lib/financeiro/services/dre-service.ts | Leitor direto de movimentos/títulos: compor a fonte canônica preservando a política/classificações próprias da DRE, inclusive composição transacional do fechamento G004. |
| app/api/financeiro/analytics/route.ts | Listas take=500 e fallback por títulos pagos não podem produzir totais; trocar as projeções pela consulta oficial. |
| app/api/financeiro/relatorios/exportar/route.ts | CSV/XLSX de movimentos/títulos/fluxo devem usar a mesma fonte, saldo restante e critérios; preservar demais exports e seus gates. |
| app/api/financeiro/pagar/route.ts | Somente GET: summary e saldo de cada linha devem usar a mesma autoridade; writers G004 ficam intactos. |
| app/api/financeiro/receber/route.ts | Somente GET: mesmo contrato para recebíveis e parciais, sem alterar writers M1. |
| app/api/financeiro/carteiras/route.ts | Somente GET: saldos do HUB vêm do ledger, sem mutação/recalculo oculto no GET. |
| components/financeiro/lovable/context/FinanceiroRealContext.tsx | Consumidor real de API/HUB: transportar metadados e valores oficiais, sem somar páginas nem alterar recibos/cache G003/G004. |
| lib/omni-agent/executor.ts | Somente FINANCE_SUMMARY: consulta oficial, filtros validados e esclarecimento para ambiguidades; sem alterar executores de escrita. |
| lib/omni-agent/interpret.ts | Somente identificação/filtros de consultas financeiras; perguntas de gasto não podem virar comandos de despesa. |
| lib/omni-agent/interpret-finance-query.test.ts | Contratos dos exemplos de pergunta e ambiguidades; IA não fornece total monetário. |
| lib/contador/readers/financeiro.ts | Posição de títulos atualmente soma bruto; reusar o cálculo canônico e preservar apresentação/bases próprias. |
| lib/contador/readers/index.ts | Port real do Contador precisa carregar campos/histórico/alocações para saldo restante; preservar gate externo e falhas honestas. |
| lib/contador/readers/index.test.ts | Contrato diretamente afetado do port: substituir a exigência antiga de createdAt incondicional pela precedência de ocorridoEm com fallback legado, preservando os quatro limites do intervalo semiaberto. Caminho concretizado antes da edição deste teste; já autorizado por “testes de contrato dos consumidores afetados” no §4 do comando humano, sem ampliar caminhos de produto. |
| lib/contador/pacote/carregar-fontes.ts | Mesmo leitor bruto nos pacotes; carregar e projetar restante sem usar soma de páginas como autoridade de consulta. |
| test/gastos/g005-fixtures.ts | Banco novo identificado e massa sintética exclusiva G005; nenhum dado/credencial produtivo. |
| test/gastos/reconciliacao.postgres.test.ts | A13 inteiro com G004 real, SQL, filtros/privacidade, precisão/datas, snapshot de duas conexões e ausência de mutação. |
| test/gastos/consumidores-g005.postgres.test.ts | Serviço/API/HUB/CSV/XLSX/Agent/Contador com mesmos valores/base e mais registros que a página. |
| test/gastos/readers.postgres.test.ts | Contratos reais dos leitores já afetados: três expectativas G003 explicitamente anteriores à reconciliação G005 usam saldo materializado/fluxo sem abertura e origem como categoria. Atualizar para a autoridade ledger/categoria estruturada com oráculo SQL independente, preservando fixtures, isolamento, demais assertions e A13. Caminho registrado antes da edição, sob a autorização humana de testes dos consumidores afetados. |
| docs/ai-execution/_evidence/OMNI-GESTAO-GASTOS-005/GOAL.md | Escopo e gates registrados antes das mudanças correspondentes. |
| docs/ai-execution/_evidence/OMNI-GESTAO-GASTOS-005/RELATORIO.md | Evidências e limitações honestas dos gates atuais, sem herdar PASS/R do G004. |
| docs/ai-execution/_evidence/OMNI-GESTAO-GASTOS-005/REVISAO_R.json | Parecer Anthropic real, proveniência/hashes, correções e aceite expresso do lint diferencial atual. |
| docs/ai-execution/_evidence/OMNI-GESTAO-GASTOS-005/MATRIZ_METRICAS_CONSUMIDORES.json | Inventário, base de cada métrica e mapeamento para consumidores/provas. |

Nenhum wildcard de produto. Um caminho permitido não exige alteração. Não tocar writers, schema/migrations, auth, PDV/OS, estoque, fiscal ou WhatsApp. Necessidade real fora desta fronteira exige autorização específica antes de editar.

Precisão da allowlist de testes durante o diagnóstico: a rodada unitária identificou duas asserções estruturais antigas em lib/contador/readers/index.test.ts que exigiam filtrar sempre createdAt. O comando humano já autoriza testes de contrato dos consumidores afetados; o caminho foi enumerado acima ANTES de editar. A correção mantém a prova de fronteira e acrescenta ocorridoEm diferente da sincronização, sem alterar oráculos monetários A13 ou abrir outro escopo.

Artefatos regeneráveis ignorados limitados à worktree: junction node_modules para instalação existente com lock idêntico, generated/prisma, .next, tsbuildinfo e saídas PWA já ignoradas do build oficial. Logs, harness, cluster, provas SQL e pacote R ficam exclusivamente em C:/Users/rafae/.codex/visualizations/2026/10/23/01a16672-b095-7202-8895-5cf8f4aa76c5/G005-execution. Não copiar .env ou credenciais. Não modificar ferramentas/configurações globais ou processos de outras sessões.

## Contrato e gates de conclusão

Caixa realizado BRL líquido de compensações válidas; crédito é obrigação, fatura aloca consumo sem outro gasto, transferência neutra consolidada com pernas por conta. Contas derivam de saldo inicial e ledger; títulos usam pagamentos válidos individuais sem somar espelho JSON e alocação duas vezes. Categoria estruturada, jamais descrição. Precisão legada anômala sinalizada, sem arredondamento silencioso. Data econômica e fuso IANA separados de sincronização. DRE conserva política própria explicitamente rotulada.

Contexto opaco G001 e gates empresariais G003 revalidados, inclusive dentro do snapshot; ausência de perfil não vira wildcard. PostgreSQL REPEATABLE READ e READ ONLY, sem lock financeiro novo, retry cego ou mutação oculta. Metadados declaram posição dos títulos e instante de saldo; não alegar reconstrução histórica de atributos que o schema não versiona.

Executar em sequência: focados, PostgreSQL descartável identificado, regressões G001–G004/M1/N10/N11/PDV/OS/cache pertinentes, typecheck integral exit0, lint focado, lint global e diferencial individual contra G004, build oficial exit0/MIGRATION_SKIPPED, diff --check e R independente. Lint global herdado 105 erros/113 avisos não recebe PASS; exceção somente após comparação atual e aceite expresso da R para os hashes atuais.

Commit único local por caminhos explícitos somente após A13/A14/A17/A19 aplicáveis, gates e R APPROVED. Sem push/merge/deploy/DDL ou grant produtivo/WhatsApp/ativação pessoal/G006. Bloqueio real: registrar BLOCKED, preservar WIP, sem fabricar PASS ou commit.

R1 real Anthropic sonnet5.5, sessão b5e22012-37d9-489e-a950-d28cbac1bcf4: CHANGES_REQUESTED. Os seis caminhos acima são leitores diretamente afetados já autorizados pelo §4 humano, concretizados ANTES da edição; não há nova autorização de writers/produção. Corrigir resíduo sem carteira, diagnóstico/eventos separados de posições, respostas com um snapshot, presets/export/totais de apresentação, prova SQL líquida e proveniência remota. Repetir os gates e R sobre hashes novos.

Revalidação remota após R1: fetch2026-10-23T04:34Z confirmou origin/main0adec2121ed463844f1af325f05f924f6952eddf;040fcc76 era observação inicial. Analytics remoto requer conciliação futura do gate de módulo com perfis/read-scope/cache G003; sem integrar e sem mudar baseG004. Os gates corrigidos e a pré-auditoria/limites constam no relatório/matriz; R2 APPROVED, com aceite expresso dos hashes atuais e liberação somente do commit local.

Finalização EOF: somente a linha vazia final de test/gastos/g005-fixtures.ts foi removida após stagedcheck; fonte produtiva intacta, nenhum commit criado. Gates renovados e auditoria de whitespace inclui todos os arquivos novos. R2 preservada; R3 APPROVED sobre os hashes finais.
