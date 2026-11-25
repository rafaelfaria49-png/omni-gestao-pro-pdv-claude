# OMNI-GESTAO-GASTOS-002 — Contas, categorias e writers

Comando humano anexado em 20/10/2026. Somente G002; C4 e revisão real Claude Code/Anthropic explicitamente autorizados. Executor codex/openai; R deve declarar anthropic e modelo efetivo conforme TASK_LEVELS.md/executors.json. Não simular R.

Base: commit G001 `55bab9a7a93218433912761d6ce2f07b8b3fdfad`, pai `13700862405a89da3c7d16702318735a88348133`. Na preparação, fetch origin/main confirmou `13700862405a89da3c7d16702318735a88348133`; a conferência final somente leitura encontrou `a874342f5366427f8f7cfebc96a9c14c8efe39ad`, sem sobreposição com a allowlist, conforme prova ao fim. Branch/worktree isoladas `codex/omni-gestao-gastos-002` / `.worktrees/omni-gestao-gastos-002`; nenhuma alteração/reset/rebase de G001, merge/cherry-pick ou incorporação de WIPs.

AEP opt-in ausente: não abrir trilha histórica, editar state/registry/ledger nem executar close com commit de governança. C4 autorizado diretamente pelo humano. Snapshot da origem e lista de worktrees preservados na área externa G002-execution.

## Allowlist exata — revisão 1 anterior a qualquer edição de produto

1. `prisma/schema.prisma`
2. `prisma/migrations/20261020130000_gastos_contas_writers/migration.sql`
3. `lib/gastos/contas.ts`
4. `lib/gastos/categorias.ts`
5. `lib/gastos/financeiro-scope.ts`
6. `lib/financeiro/services/contas-pagar-service.ts`
7. `lib/financeiro/services/contas-receber-service.ts`
8. `lib/financeiro/services/movimentacoes-service.ts`
9. `lib/financeiro/services/carteiras-service.ts`
10. `lib/ops-upsert-venda.ts`
11. `lib/financeiro/adapters/os-faturamento.ts`
12. `app/api/ops/contas-pagar-persist/route.ts`
13. `app/api/ops/contas-receber-persist/route.ts`
14. `lib/importador-avancado/persistidor.ts`
15. `lib/gastos/financeiro-scope.test.ts`
16. `test/gastos/writers.postgres.test.ts`
17. `test/gastos/migration.postgres.test.ts`
18. `test/gastos/g002-fixtures.ts`
19. `lib/ops-upsert-venda.test.ts`
20. `lib/ops-upsert-venda-vale.test.ts`
21. `lib/ops-upsert-venda-vale-concorrencia.test.ts`
22. `lib/ops-upsert-venda-safety.test.ts`
23. `lib/ops-upsert-venda-replay-conflict.test.ts`
24. `lib/ops-upsert-venda-pix-aprazo-resync.test.ts`
25. `lib/ops-upsert-venda-lines-integrity.test.ts`
26. `lib/ops-upsert-venda-historical-recovery.test.ts`
27. `lib/ops-upsert-venda-fractional.test.ts`
28. `lib/ops-upsert-venda-fiscal-handoff.test.ts`
29. `lib/ops-upsert-venda-colisao-loja.test.ts`
30. `lib/ops-upsert-venda-caixa-original-fechado.test.ts`
31. `lib/ops-upsert-venda-aprazo.test.ts`
32. `lib/ops-upsert-venda-accessory-selection.test.ts`
33. `lib/financeiro/services/contas-receber-parcial.test.ts`
34. `lib/financeiro/services/contas-receber-canonicalidade.test.ts`
35. `lib/financeiro/services/contas-receber-cancelar.test.ts`
36. `docs/decisions/OMNI-GESTAO-GASTOS-002-WRITERS.md`
37. `docs/ai-execution/_evidence/OMNI-GESTAO-GASTOS-002/GOAL.md`
38. `docs/ai-execution/_evidence/OMNI-GESTAO-GASTOS-002/INVENTARIO_WRITERS.json`
39. `docs/ai-execution/_evidence/OMNI-GESTAO-GASTOS-002/RELATORIO.md`
40. `docs/ai-execution/_evidence/OMNI-GESTAO-GASTOS-002/REVISAO_R.json`

### Revisão 2 — somente fakes de testes correspondentes, antes de editá-los

41. `app/api/financeiro/pagar/pagar-liquidar-saldo.test.ts`
42. `app/api/financeiro/receber/receber-liquidar-saldo.test.ts`

A bateria ampliada identificou nesses dois testes a mesma dependência nova de perfil/transação ausente nos fakes. Atualizar somente os fakes, mantendo as asserções de saldo/caixa. Estão dentro da autorização humana de testes diretamente correspondentes aos serviços canônicos; nenhuma ampliação de produto ou do escopo G003. Os cinco writers de produto abaixo continuam fora da allowlist até resposta humana.

### Revisão 3 — ampliação humana explícita recebida antes destas edições

Resposta humana: **Autorizar os cinco writers e testes correspondentes**. Somente atribuição/validação de perfil, precisão e preservação dos efeitos atuais, sem redesenhar vendas/Operações.

43. `app/api/vendas/[id]/cancelar/route.ts`
44. `app/api/vendas/[id]/corrigir/route.ts`
45. `app/api/vendas/[id]/corrigir-itens/route.ts`
46. `app/api/vendas/[id]/corrigir-titulo/route.ts`
47. `lib/operacoes-v3/recebimento-misto-service.ts`
48. `app/api/vendas/[id]/cancelar/route.test.ts`
49. `test/gastos/writers-routes.postgres.test.ts`

### Revisão 3b — teste diretamente correspondente ao writer OS V3, antes de editar

50. `test/ops-v3-recebimento-misto/recebimento-misto.pg.ts`

O typecheck integral identificou no harness existente de recebimento misto a projeção de storeId agora nullable. A autorização humana dos cinco writers inclui seus testes diretamente correspondentes. Refinar o resultado somente após conferir a mesma loja real consultada, sem cast, fallback, alteração de asserções ou mudança de destino de banco. Este harness não será executado contra serviço desconhecido; as provas executadas continuam nos testes G002 com URL sintética explícita.

### Revisão 3c — documentação SQL diretamente correspondente, antes de criar

51. `docs/ai-execution/_evidence/OMNI-GESTAO-GASTOS-002/AUDITORIA_PRE_MIGRATION.sql`

Documento solicitado pela revisão R real: auditoria somente leitura das relações legadas antes de qualquer aplicação fora do ensaio. A autorização G002 já inclui documentação diretamente correspondente; nenhuma nova superfície de produto, configuração ou destino real é liberado. Executar nesta etapa somente em fixtures sintéticas próprias. A correção R A2 distingue nova conta de pagamento (ativa obrigatória) de vínculo histórico já existente (não se apaga nem impede estorno por desativação posterior); propriedade/perfil/loja continuam obrigatórios e não são flexibilizados. Foi dada ciência ao usuário na atualização de execução. Não habilitar conta inativa para novo gasto ou transferência.

### Revisão 3d — somente regressões diretamente correspondentes aos writers canônicos, antes de editar

52. `app/api/pdv/receber-conta/recebimento-atomico.test.ts`
53. `app/api/pdv/receber-conta-lote/recebimento-lote.test.ts`
54. `app/api/pdv/receber-conta-lote/recebimento-lote-lock.postgres.test.ts`

O rastreio do chamador ativo do lote identificou essas regressões adicionais. A execução dos dois harnesses unitários encontrou 66 falhas por ausência do novo delegate FinanceiroPerfil; corrigir somente a representação de schema/locks nos fakes, mantendo asserções e a detecção de cliente global fora da transação. O teste PG existente precisa limpar o perfil sintético provisionado antes de remover sua Store. A autorização G002 já abrange testes diretamente correspondentes aos serviços canônicos; nenhum arquivo de produto é ampliado por esta revisão. O serviço recebimento-lote permanece fora da allowlist, aguardando autorização específica. Não converter N10/N11 em it.fails nem remover seus aceites.

### Revisão 4 — adendo humano explícito de continuação, antes de editar os três caminhos

55. `lib/operacoes-v3/entrega-actions.ts`
56. `lib/operacoes-v4/financial-projection-actions.ts`
57. `lib/financeiro/services/recebimento-lote-service.ts`

O adendo humano CONTINUAÇÃO DO OMNI-GESTAO-GASTOS-002 autoriza expressamente estes três arquivos para compatibilidade dos contratos, escopo/autorização, tipos e concorrência. Preserva a mesma branch, worktree, base G001 e implementação; não cria outro GOAL. A autorização substitui as pendências históricas destes caminhos registradas nas revisões anteriores. Sem cast/assertion para encobrir contexto inválido, fallback de loja, mudança de etapas/entrega/preços/cobrança/estoque/UI por conveniência. A proposta de locks continua sujeita a reprodução e validação real; nenhuma condição R é dispensada.

M1/item 9: o humano escolheu corrigir no G002 o defeito específico das parciais legadas. Antes de editar esse fluxo, registrar reprodução, causa, proposta mínima e caminhos exatos na decisão. Exigir identidade estável por operação, parciais iguais distintas preservadas, replay/concorrência/resposta perdida sem duplicação e histórico/movimento/saldo na mesma transação. Não implementar G004 completo nem backfill. Outros caminhos necessários exigem lista exata e justificativa prévias, continuando em paralelo lógico as correções já autorizadas.

Exceção de lint autorizada somente sob prova diferencial com mesmo comando/configuração/dependências da G001 e aceitação expressa por R: LINT_GLOBAL=BASELINE_FAIL e LINT_DELTA=PASS, sem novos diagnósticos, ignores ou fix global. Typecheck completo exit 0 obrigatório; os dois erros são consequência da mudança nullable G002, não herdados da G001. R real final deve cobrir M1, concorrência e a exceção, declarando o modelo utilizado. Commit somente após todos os gates e condições satisfeitas; sem push/merge/deploy/exposição pessoal/G003.

### Revisão 5 — seis caminhos M1 explicitamente autorizados antes de editar

58. `app/api/financeiro/pagar/route.ts`
59. `app/api/financeiro/receber/route.ts`
60. `app/api/pdv/receber-conta/route.ts`
61. `components/financeiro/lovable/context/FinanceiroRealContext.tsx`
62. `components/dashboard/vendas/pdv-recebimento-modal.tsx`
63. `lib/financeiro/pagamento-operacao-client.ts`

Resposta humana: **Autorizar os seis caminhos somente para M1 e seus testes já autorizados**. Somente exigir/propagar identidade e uma transação nos três handlers, conservar a identidade pendente nos dois chamadores e provar essa conservação pelo helper cliente. Não mudar interface, regras de PDV/OS ou implementar G004 integral. Testes/documentação continuam nos caminhos anteriores; nenhum wildcard ou novo teste fora da allowlist é liberado. Esta resposta substitui a pendência desses seis caminhos registrada na decisão; nenhuma nova confirmação desses mesmos arquivos é necessária.

Testes existentes só serão editados quando diretamente correspondentes, preservando asserções de negócio. Caminhos autorizados mas desnecessários não serão alterados nem adicionados ao commit. Sem wildcard amplo. Dependências/cliente Prisma/build regeneráveis ignorados somente nesta worktree; evidências e cluster em G002-execution fora do checkout. Não modificar a migration G001.

Inventário identificou os cinco writers diretos adicionais acima. A revisão 1 os deixou pendentes; a resposta humana explícita registrada na revisão 3 liberou somente esses caminhos e seus testes enumerados. Nenhuma ampliação para UI, leitores G003, auth, fiscal ou transporte.

## Fronteiras e aceites

EMPRESA por loja real; PESSOAL único por AdminUser sem loja; decisão G001 prevalece. Modelos canônicos do HUB, sem FinancialTransaction/FinancialAttachment paralelos. Nenhuma exposição operacional pessoal antes de G003. Não alterar auth, proxy, fiscal, transportes WhatsApp, modelos de IA, secrets/configuração produtiva ou redesenhar módulos.

| Aceite | Parte G002 | Prova integrada reservada |
|---|---|---|
| A02 | contexto opaco, ownership dos writers internos, novo pessoal sem loja, legado sempre empresarial, payload não concede perfil | leitores/KPI/exportação/documentos/cache G003; binding/ingresso G007; E2E G010 |
| A03 | conta/categoria/título/perfil e estado ativo, relações pessoais sem loja, FKs e validação PostgreSQL | canal/credenciais/telefone G006/G007, leitores G003, aplicação completa G004 |
| A09 | identidades empresariais preservadas; namespace pessoal; provisionamento concorrente; reimportação sem perda de pagamentos; M1 corrige os três endpoints autorizados com identidade explícita, replay/conflito, parciais iguais e transação única | aplicação geral/identidade entre origens G004; inbox G006/G007; documento/mídia G009/G010 |
| A19 | writers venda/OS/estoque/recebimentos/transferências preservam efeitos e vínculos ao receber perfil | aplicação de gastos/compensação por operação e divergência legada de estorno parcial O1 em G004; caixa reconciliado G005; cartões/canal/E2E G010 |

Não declarar A02/A03/A09/A19 integrais PASS nesta etapa. G003/G004/G006/G007/G010 continuam responsáveis por suas provas. Pagamento de caixa não se confunde com compra/obrigação; base caixa/consultas é G005.

## Gates e conclusão

N10/N11/W2 foram reproduzidos antes da edição e corrigidos após a ampliação humana da revisão 4. O lote trava todos os títulos encontrados em ordem binária estável, relê somente esses IDs e trava o conjunto de contas originais/destinos em ordem estável antes da primeira gravação. Mantém transação, localId, valores, caixa e regras atuais. As duas reproduções PostgreSQL controladas e os 51 testes unitários do lote passaram; a rodada final e R independente permanecem obrigatórias. As propostas externas com nome histórico “nao-aplicada” foram preservadas como registro anterior à autorização; não descrevem mais o estado do código. Nenhum timeout aumentado, lock removido, retry mascarador ou teste convertido em falha esperada.

M1 foi reproduzido nos dois handlers Financeiro com PostgreSQL real (duas parciais de 40: dois históricos, apenas um movimento e saldo de 40). Após a autorização dos seis caminhos na revisão 5, os três endpoints usam identidade explícita e transação única para histórico/movimento/saldo, incluindo caixa no PDV. Os chamadores conservam apenas UUID/hashes/sessão original no navegador até ACK da mesma identidade; o financeiro real persiste no servidor. Recibo legado consistente é somente consultado, sem backfill; divergência retorna erro. O teste unitário que aceitava a antiga identidade por título/valor foi atualizado para exigir chave e zero efeitos sem ela, conforme M1; as asserções de atomicidade e negócio foram mantidas.

Revisar SQL antes de aplicar exclusivamente em cluster novo, URL explícita e identidade/host/porta/data_directory comprovados. Ensaiar baseline sintético vazio e populado + G001 + G002; sem dados reais, .env de destino, DDL/backfill produtivo ou saneamento ambíguo. Separar bootstrap/owner do papel efetivo do app e negar RLS a papéis não autorizados sem afrouxá-lo.

Testar casos do comando, regressões G001 e financeiras/PDV/OS pertinentes. Sequenciar PostgreSQL/testes, lint, typecheck e build, sem encerrar processos alheios. Diagnosticar e corrigir falhas. R real no diff final e evidências, restrita ao material do GOAL, está autorizada. Commit apenas local após checks e R, adicionando caminhos explicitamente. Sem push/merge/deploy, canal ou mensagens. Não iniciar G003.

Conferência remota final somente leitura: origin/main em a874342f5366427f8f7cfebc96a9c14c8efe39ad. Comparação com 13700862405a89da3c7d16702318735a88348133: avanços em texto/voz de clientes e documentação de governança PDV, zero sobreposição com os 63 caminhos G002; schema/guards/writers financeiros não mudaram nesse intervalo. Prova externa origin-main-final-impact.json. Branch/base G001 preservadas, sem merge/cherry-pick/rebase. Voz no editor de clientes não comprova processamento de áudio do assistente WhatsApp.

Validação após D1–D3:854 PASS+1 esperada preexistente/855 casos/50 arquivos, zero falhas/skip;103 PG atuais+24 G001/109 V3 anteriores aceitos na R4. Typecheck integral exit0; build exit0/MIGRATION_SKIPPED; lint focado55 sem erros; global BASELINE_FAIL/deltaPASS por219 mensagens correspondentes. R4 aceitou núcleo e lint dos hashes anteriores. R5 real aprovou D1–D4/O1 e aceitou expressamente a exceção de lint nos hashes atuais:APPROVED/LOCAL_CLOSURE_APPROVED, satisfied=true/commit_allowed=true para commit local. Fonte/modelo/sessão/hashes em REVISAO_R.json. Allowlist63 preservada;62 arquivos alterados; sem G003.
