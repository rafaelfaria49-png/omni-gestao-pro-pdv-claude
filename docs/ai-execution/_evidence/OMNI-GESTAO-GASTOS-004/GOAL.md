# GOAL — OMNI-GESTAO-GASTOS-004

STATUS: DELTA_R1_VALIDADO_AGUARDANDO_R2. Gates atuais concluídos; parecer R1 real preservado; commit proibido até R final APPROVED e exceção de lint expressa para os hashes atuais.

classe: C4 — DINHEIRO / SCHEMA / PRIVACIDADE
familia_executor: openai
executor_solicitado: Codex / GPT-6.1 Sol / esforço máximo, conforme comando humano; não inferir metadados de modelo ausentes.
revisor_R: Claude Code / Anthropic / claude-sonnet-5-5 real, após validação, sem herdar R2 G003.

## Autorização e base

Comando humano integral em C:/Users/rafae/.codex/attachments/2e1df1ba-344f-4413-a660-7e0371afb8f5/Texto colado.txt. Autoriza G004 ponta a ponta, schema aditivo e nova migration somente em PostgreSQL descartável identificado, core financeiro/consumidores diretos comprovados, testes e um commit local após todos os gates e R final APPROVED. Não pedir outra aprovação para o escopo já concedido.

Base EXATA: 451b0e41ccf96215ed6c30e45ea2844dd0101faf (G003). Branch codex/omni-gestao-gastos-004; worktree C:/Projetos/omni-gestao/.worktrees/omni-gestao-gastos-004. G001/G002 são ancestrais e as três worktrees anteriores foram conferidas limpas. Principal permanece codex/db-migration-reconciliation-001 em 5ae661d730af827006fd10c389ddbdd4f18edc51, com todos os WIPs preservados.

Fetch sem integração: origin/main 2c0e996f3fefb09e991bc579013720c8d1e8112d; base comum 13700862405a89da3c7d16702318735a88348133; 144 caminhos remotos. Nenhum arquivo da allowlist abaixo coincide com os caminhos remotos reconfirmados. Alterações remotas PDV/ops-upsert-venda são externas ao escopo; não substituem a base G003 nem autorizam integração.

ENTRYPOINT, EXECUTION_PROTOCOL, TASK_LEVELS, governança/INDEX, decisões/relatórios/migrations G001-G003 e planejamento foram consultados. AEP é opt-in e .aep-active está AUSENTE nesta worktree; não chamar open/close nem escrever state/ledger/registry ou criar commit extra de close. Pedido humano já contém os gates C4 e a missão concreta; não é comando livre de hub nem exige novo intake.

## Contratos vinculantes

PESSOAL único por AdminUser, sem Store, opaco e revalidado no servidor; EMPRESA por loja/membership/grant atuais. A decisão G001 prevalece sobre a formulação antiga pessoal por loja no plano. Nenhum perfil, conta, grant, fornecedor ou autorização inferidos de body, primeira loja ou papel global. Não criar entrada pública/UI/canal pessoal.

Usar somente ContaPagarTitulo, MovimentacaoFinanceira e CarteiraFinanceira como autoridade monetária; Gasto é fato/revisão e não outro caixa. Gasto novo já pago cria Gasto/pagamento/alocação/movimento sem título avulso extra; obrigação cria título sem saída; pagar título/fatura conserva os títulos e não cria novo Gasto. Fatura agrega obrigações, não cria outro título. Centavos e conversão legada seguem LIMITE_CENTAVOS G002 = 9000000000000, sem arredondar anomalias.

Revisões persistidas com CAS/versão, confirmação/correção/cancelamento internos. Operação tem chave por perfil e hash normalizado; replay devolve IDs originais; divergência conflita. Auditoria privada e outbox mínima persistem na MESMA transação dos efeitos. Pessoal não vai à auditoria/log/Contador/Agent comuns. Outbox não envia nada: entrega/retry pertence ao G006.

Resolver O1/R5 G002: compensações referenciam pagamentos/movimentos individuais e limites líquidos sob lock, sem reescrever pagamentos ou apagar histórico. A correção nova da função SQL G002 será somente na migration G004, mantendo as restrições originais e acrescentando prova de compensação individual para conta histórica inativa. Legado ambíguo não é reparado/backfillado automaticamente. M1, N10/N11, ordem binária de títulos/contas e referências PDV/OS permanecem sob regressão real.

Documentos reusam G003, inclusive contexto, fixture, estado/quarentena, dedup privado e FKs. Documento já ligado a título exige resolver esse fato; não autoriza nova despesa. Hash de bytes isolado não é identidade universal de fato. Não alterar storage de produção ou políticas de retenção.

## Allowlist exata — registrada antes das edições de produto

| Caminho | Necessidade comprovada |
|---|---|
| `prisma/schema.prisma` | Modelos G004 e relações aditivas com os modelos canônicos; sem remover campos ou alterar migrations anteriores. |
| `prisma/migrations/20261022120000_gastos_operacoes_atomicas/migration.sql` | Migration exclusiva: modelos/identidades/FKs/CHECKs/RLS e consistência; estender na migration nova a validação G002 de compensação por fato individual, conservando as demais regras. |
| `lib/gastos/operacao-schema.ts` | Contratos puros de operação/revisão, centavos, datas, BRL, payload canônico e hash; sem nova autoridade financeira. |
| `lib/gastos/operacoes.ts` | Preparação/correção/cancelamento/expiração de revisão, CAS, contexto G001 revalidado e reservas idempotentes. |
| `lib/gastos/apply.ts` | Orquestrar uma transação de aplicação, resultado durável, auditoria e outbox; falhas financeiras propagadas. |
| `lib/gastos/pagamentos.ts` | Pagamento/alocação/compensação por pagamento individual; adaptar histórico sem dupla contagem ou backfill. |
| `lib/gastos/cartoes.ts` | Instrumento/ciclo informado, obrigações e alocação de fatura sem nova despesa; nenhum PAN/CVV. |
| `lib/gastos/fornecedores.ts` | Resolver ID/nome/documento validado na loja correta, recusando ambiguidades; contraparte pessoal privada sem autocadastro. |
| `lib/gastos/periodo.ts` | Datas America/Sao_Paulo e lock de competência comum à aplicação e fechamento comprovadamente concorrentes. |
| `lib/gastos/documentos.ts` | Extrair composição transacional do vínculo G003 para o mesmo COMMIT G004; preservar contexto, privacidade, locks e retenção. |
| `lib/financeiro/services/contas-pagar-service.ts` | Componente canônico transacional de saldo/status/histórico compatível dos pagamentos estruturados; preservar IDs/localKey e M1. |
| `lib/financeiro/services/movimentacoes-service.ts` | Componente canônico transacional por perfil, referência de compensação individual e ponte de estorno legado comprovada; preservar receber/M1/lote. |
| `lib/financeiro/services/carteiras-service.ts` | Materialização canônica de saldo por perfil, centavos e mesma chave/ordem de locks; conservar recálculo e transferências G002. |
| `lib/financeiro/services/fechamento-service.ts` | Consumidor financeiro direto: fechar/reabrir serializa com o G004 no lock do período e usa cliente transacional. |
| `lib/financeiro/services/dre-service.ts` | Somente composição de cliente transacional do snapshot chamado por fecharMes; sem mudar cálculos/base/reconciliação G005. |
| `app/api/financeiro/pagar/route.ts` | Substituir o estorno em duas etapas/catch que suprime falha por contrato atômico e identidade persistida; preservar GET privado e demais writers M1. |
| `app/api/financeiro/pagar/operacoes/route.ts` | Entrada HTTP empresarial autenticada do contrato real de revisão/aplicação; resolver perfil no servidor, sem rota pessoal. |
| `lib/financeiro/pagamento-operacao-client.ts` | Consumidor direto: conservar recibo/UUID do estorno de pagar após resposta perdida; manter os contratos M1 de pagar/receber/PDV. |
| `components/financeiro/lovable/context/FinanceiroRealContext.tsx` | Consumidor direto: enviar o estorno de pagar pelo recibo persistido; sem redesign, UI pessoal ou mudança no cache G003. |
| `lib/gastos/apply.test.ts` | Unitários dos contratos/identidades/centavos/datas e erros; não alegar atomicidade PostgreSQL por mock. |
| `lib/gastos/cartoes.test.ts` | Contrato puro de ciclo/parcelamento explícito e validação de instrumentos sem dados secretos. |
| `lib/financeiro/pagamento-operacao-client.test.ts` | Recibo do estorno: resposta perdida, replay, conflito e nova intenção após confirmação. |
| `lib/gastos/documentos.test.ts` | Teste diretamente correspondente se a extração transacional alterar a composição interna; manter asserts de privacidade. |
| `lib/gastos/read-cache.test.ts` | Regressão correspondente do Provider real se a integração do estorno exigir ajuste de fixture, sem enfraquecer cache. |
| `app/api/financeiro/pagar/pagar-liquidar-saldo.test.ts` | Atualizar o contrato unitário do estorno atômico; conservar parciais/baixa e não substituir a prova PG. |
| `test/gastos/g004-fixtures.ts` | Identidade do banco novo, dados e sessões sintéticos e limpeza exclusiva da fixture. |
| `test/gastos/operacoes.postgres.test.ts` | Aplicação real, R365,01/200/165,01, parciais iguais, replay/conflito e isolamento pessoal/empresa. |
| `test/gastos/cartoes.postgres.test.ts` | Compras/ciclos/parcelamento informado/fatura/débito, sem antecipar caixa ou duplicar gasto. |
| `test/gastos/concorrencia-g004.postgres.test.ts` | Duas conexões independentes, contenção real e ordem de locks, baixa/transferência/fechamento/inativação. |
| `test/gastos/rollback-g004.postgres.test.ts` | Falhas SQL controladas após cada fronteira, rollback integral, recuperação após COMMIT sem resposta. |
| `test/gastos/operacoes-http.postgres.test.ts` | Handlers oficiais chamando domínio/transação/movimento/saldo reais; request auth/cookies sintéticos. |
| `test/gastos/migration-g004.postgres.test.ts` | Baselines novo/histórico sintético, SQL exato G001-G004, catálogo/RLS/papel efetivo não owner e preservação. |
| `docs/decisions/OMNI-GESTAO-GASTOS-004-OPERACOES-ATOMICAS.md` | Decisões de identidade, revisão, locks, pagamentos/estornos, cartões, datas, compatibilidade e limites. |
| `docs/ai-execution/_evidence/OMNI-GESTAO-GASTOS-004/GOAL.md` | Escopo exato antes de editar e gates autorizados deste GOAL. |
| `docs/ai-execution/_evidence/OMNI-GESTAO-GASTOS-004/CONTRATOS_OPERACOES.json` | Contratos/consumidores reais, impactos e matriz de aceites e testes com hashes. |
| `docs/ai-execution/_evidence/OMNI-GESTAO-GASTOS-004/RELATORIO.md` | Resultado atual honesto dos gates/aceites/limites, sem herdar R2 G003. |
| `docs/ai-execution/_evidence/OMNI-GESTAO-GASTOS-004/REVISAO_R.json` | Pareceres reais Claude Code/Anthropic Sonnet 5.5 com modelo/sessão/hashes/lint atual. |

Não há wildcard app/lib/components. Caminho fora desta fronteira exige proposta concreta e autorização específica. Alterar só arquivos necessários; um caminho permitido não obriga alteração.

Artefatos ignorados regeneráveis limitados à worktree: junction node_modules para a instalação já existente (mesmo lock), generated/prisma, .next, tsbuildinfo e os arquivos PWA já ignorados emitidos exclusivamente pelo build oficial (public/sw.js/map, public/workbox-*.js/map, public/worker-*.js/map, public/swe-worker-*.js). Não são alterações de fonte/cache/configuração: esses arquivos não entram no commit. Sem alteração de dependência/package/lock/configuração para fabricar PASS. Harness, cluster, logs, snapshots e pacotes R em C:/Users/rafae/.codex/visualizations/2026/10/21/01a1601f-4e52-74a1-8887-2c958c8c5d2b/G004-execution, somente massa sintética e sem .env copiado/credenciais. Esse diretório externo não amplia a allowlist de produto.

## Gates e evidência obrigatórios

Antes de SQL: revisar a migration e cada DDL de injeção fixture; comprovar loopback/porta/current_database/current_user/data_directory e atributos do papel. Cluster G004 novo/exclusivo, baselines vazio e histórico sintético aplicando SQLs exatos G001-G004, sem desabilitar constraints/triggers/RLS canônicos. Prova owner distinta de papel efetivo não-owner/NOBYPASSRLS e inspeção de pg_catalog. Preservar registros sintéticos anteriores.

Testes obrigatórios: novo pago; obrigação; título365,01 ->200 ->165,01; parciais iguais distintas/replay; estorno parcial/total/repetido/concorrente por pagamento; crédito/ciclo/fatura/débito; fornecedor/ambiguidade/documento/isolamento; CAS/cancelamento/expiração; chave/payload/perfil; duas conexões independentes e recursos concorrentes; transferência/fechamento/inativação; falhas após reserva/Gasto/título/pagamento/alocação/movimento/saldo/auditoria/outbox/pré-COMMIT; resposta perdida; HTTP real. Sem skip/expected-fail/mocks de persistência como prova de atomicidade ou serialização artificial.

Rodar pesado em sequência: focados -> PG -> regressões pertinentes G001/G002/G003/M1/N10/N11/PDV/OS/cache -> npm run typecheck integral exit0 -> lint focado -> lint diferencial individual contra G003, mesmos comando/config/deps -> npm run build integral exit0 e MIGRATION_SKIPPED -> git diff --check -> R real -> corrigir/retestar/revisar delta -> único commit local por caminhos explícitos. Não matar processos de outros trabalhos.

Lint global G003 era BASELINE_FAIL (105 erros); não limpar fora do escopo. Exceção G004 só com zero novo diagnóstico, arquivos alterados sem erros e aceite EXPRESSO da R atual para os hashes atuais. O aceite R2 G003 não é herdado.

R deve receber schema.prisma INTEGRAL, migration/contratos/fontes e testes reais, diff completo inclusive novos arquivos, recibos/logs/hashes, todos os pareceres anteriores e delta se houver. Registrar modelo/família/sessão/veredito reais. Não simular aprovação nem esconder limitações.

## Fronteiras de conclusão

G004 comprova as partes financeiras A06-A12/A16/A19, CAS interno A07, identidade financeira A09, um fato/grupo A10, outbox/atomicidade A16. Não marcar A01-A20 completos. Reconciliação geral/base das consultas G005; transporte/entrega G006/G008; canal G007; STT/OCR/associação e E2E mídia G009/G010.

Concessão/revisão explícita de grants empresariais por operador autorizado continua condição antes de qualquer implantação, inclusive perfis criados por writers G002; não conceder em produção. Sem push, merge, deploy, reset/rebase/cherry-pick, DDL/grants/backfill/reparo produtivos, alteração fiscal/auth/WhatsApp, envio externo ou G005 automático. Ao final: relatório completo, SHA/parent/arquivos/árvore/G001-G003/WIPs conferidos e PARAR.


R1 exige comprovar recusa definitiva/expiração do recibo HUB, fronteira SP/mês e rollback de projeção de título/fatura/contador de estorno. O delta permanece nos mesmos37 caminhos permitidos. A chave só é descartada por ACK exato ou recusa4xx definitiva identificada; rede/5xx conservam a identidade. Limites explícitos acima (grants, legado sem resolução UI, abortar fechamento incompleto, custo linear do ledger e pipeline real de migration não ensaiado) estão detalhados em decisão/RELATORIO, sem ampliar implantação ou G005.

Exceção necessária à recusa definitiva: acesso_negado e operacao_conteudo_divergente conservam o recibo, pois não provam ausência de resultado anterior da identidade. O PG HTTP prova COMMIT sem resposta, grant revogado403 mantendo a chave e restauração de acesso com replay dos IDs, sem outro estorno. Os41 handlers G002 foram repetidos sobre essa versão final; os97 da rodada r3 continuam como prova dos writers/migration, e seus41 casos repetidos são deduplicados por arquivo+nome.
