# GOAL 002 rev8 — N2 corrigido, tentativa 2/3

Estado: **AGUARDANDO_R_INDEPENDENTE**. N2 confirmado pelo executor como **P2** por quebra do contrato A (mensagem e destino também no misto do PDV V3). Corretivo mínimo concluído; check oficial PASS no novo SHA. Não há R elegível APPROVE; R_FAMILY/R_HEAD_REVIEWED/R_VERDICT da nova R estão ausentes e suas contagens P0/P1/P2/P3 permanecem indeterminadas. PR262 continua draft, sem close, merge da PR, push ou publicação nesta retomada. N1/N3 permanecem P3 e não foram corrigidos.

Objeto funcional congelado: **d5570e829057863a9f670823bb3367b527efb391**. Base integrada: 1fd90905e05656444576cf83c9df6c46919a917a. Candidato anterior preservado: 665583a7e3f6f1b9552b4c56b3d6a3dd97299167. Commit de produto N2: 0ab529099df817d8cc98651a336e23868942fe74; merge normal da main:50d5d55ee886b74694b35e86f28b0627fd4d6842; commits posteriores ajustaram somente a nova prova E2E. Um eventual commit posterior de arquivamento é documental e não substitui o SHA julgado.

## Falha e correção

registrarRecebimentoMistoOSV3 já retorna/persiste/reproduz comercial={codigo,destino}; use-pdv-servico-v3 descartava esse dado na recusa mista. O fallback local V3 cobre apenas pendente/recusado/expirado e não cobre PRECO_AUSENTE→comercial nem VALORES_DIVERGENTES→financeiro. Isso viola literalmente o contrato A. Não foi demonstrada duplicação de dinheiro pelo N2. Esta classificação é técnica do executor, sem substituir a nova R.

Só dois arquivos de produto mudaram contra665583a: components/operacoes-v3/hooks/use-pdv-servico-v3.ts preserva o par validado apenas na recusa comercial terminal, com propriedade própria e guarda loja/OS/visita; components/operacoes-v4-preview/use-v4-preview.ts evita o reload do hook que apagava a orientação mista. Detalhe/lista/projeção continuam relendo a autoridade. As telas V3/V4 usam os destinos canônicos já existentes e navegam só após clique. Nova operação, sucesso, erro posterior, reload, outra visita/loja/OS e fechamento/reabertura retiram a orientação antiga; respostas tardias e A–B–A não a publicam na visita atual.

Nenhum writer lib/operacoes-v3 ou lib/operacoes-v4 mudou contra665583a. Preservados P1-A (exceção não comprova recusa), P1-B (envelope único loja/OS entre modalidades), ID/fingerprint, ordem de locks, CAS/saldoEsperado, Caixa/sessão, savepoint, tombstone, fence, reconhecimento autenticado, título único e replay anterior à elegibilidade/caixa. Metadado comercial não comprova ausência financeira nem libera INCERTO.

## Evidências e testes

Vermelho preparatório:15 falharam,14 passaram,42 filtrados, sobre produto idêntico ao candidato anterior (HEAD documental86cbd77). As falhas esperadas demonstram perda de par/destino. A primeira correção só do hook ainda falhou nos dois montados V4 por reload destrutivo; o ajuste do wrapper deixou **36 novas provas N2 verdes** (25 hook,2 V3,7 V4,2 PostgreSQL real). O conjunto dedicado completo atual passou205/205 na cadeia ratificada.

PostgreSQL N2 comprova, para PRECO_AUSENTE e VALORES_DIVERGENTES, recusa inicial, único registro durável com par canônico/fingerprint, replay moderno/legado antes e após resolução comercial, nenhuma mutação de timeline/título/Caixa/movimento e nenhuma segunda recusa. Montados cobrem validação de metadados e ciclo de vida. E2E real cobre preço ausente, aprovação pendente e valores divergentes, persistência, ambos os destinos, clique explícito, ausência de navegação automática/efeitos financeiros e remoção da pendência local. A projeção atual bloqueada pode ocultar o formulário e manter o motivo inline; com autoridade estável, os montados comprovam preservação do rascunho.

Cadeia integral ratificada no SHA congelado: typecheck + oito pernas Vitest **923 passaram** (511+20+205+76+52+20+29+10) + Playwright **14 passaram** (inclui autenticação), retries0/workers1. Os315 filtrados da perna preview são do comando ratificado vigente; a execução completa adicional abaixo expõe suas falhas. Check oficial AEP da tentativa2: **PASS**, exit0, mesmo SHA e comando ratificado sem alterações. ESLint dos sete caminhos modificados PASS; verify da trilha e verify --all PASS. Logs integrais, JSON, exits, datas e alvos QA ficam junto deste relatório.

| Regressão atual | Passaram | Falharam |
| --- | ---: | ---: |
| datas-pg | 34 | 0 |
| fluxo003 | 4 | 0 |
| fluxo005 | 47 | 0 |
| fluxo007-full | 67 | 0 |
| main-pdv-paridade | 34 | 0 |
| preview-full | 325 | 10 |
| v3-misto-pg | 109 | 0 |
| v4-misto-pg | 1 | 0 |

Fluxo006 completo:70/70 no SHA integrado50d5d55, antes dos dois ajustes apenas no teste E2E; os inputs de produto são idênticos ao SHA final. A cadeia ratificada também executa as52 provas de retirada/hook desse fluxo no SHA final. Build local PASS executado em50d5d55, VERCEL_ENV=development e MIGRATION_SKIPPED. Git prova que o único delta posterior é a especificação E2E; não se afirma build executado no SHA final.

- E2E 001: 6 passed (3.2m); exit0; SHA d5570e829057863a9f670823bb3367b527efb391.
- E2E Fluxo006: 16 passed (3.3m); exit0; SHA d5570e829057863a9f670823bb3367b527efb391.
- E2E misto #234/#235/#238: 1 failed;   5 passed (46.2s); exit1; SHA d5570e829057863a9f670823bb3367b527efb391.
- E2E datas #237: 1 failed;   5 passed (18.8s); exit1; SHA d5570e829057863a9f670823bb3367b527efb391.

## Falhas anteriores e limites

Preview completo:325 passaram/10 falharam, os mesmos10 títulos nominais da baseline98ef717 e665583a, conferidos por ancestorTitles/title. Fluxo007 agora67/67, mas a observação histórica66/67 com T56c permanece preservada; nenhuma correção de T56c foi feita, e uma execução verde não prova todos os interleavings. Os quatro blobs envolvidos continuam idênticos à baseline. E2E misto #235 e datas #237 devem ser comparados pelos logs e assinatura às falhas históricas (“Recebido nesta operação” e “retirada por Cliente QA Entrega”); não ocultar as falhas nem afirmar cobertura posterior ao ponto que falhou. A matriz histórica e os logs base/candidato estão no pacote completo.

Falhas preparatórias ficam registradas: workers Vitest não inicializaram sob carga durante build; a rodada interrompida não comprova suites completas. A repetição sequencial após o build passou003/005 e demais PG. Typecheck preparatório teve tsc exit0, mas o runner exit1 por mudança de HEAD: invalidado, sem ser contabilizado; o typecheck ratificado/official é do SHA estável. As primeiras provas E2E N2 assumiam formulário visível mesmo após projeção bloqueada e usavam seletor exato inadequado; contextos DOM e saídas foram preservados. Ajustes afetaram só a prova nova e mantiveram as asserções financeiras. O comparador nominal também foi corrigido para respeitar o formato estruturado do JSON Vitest, sem mudar testes.

Todos os bancos são sintéticos locais, loopback127.0.0.1:45708, nomes QA validados por current_database/inet_server_addr/inet_server_port. Servidor próprio Next em127.0.0.1:3071 por rodada, encerrado pelo runner. Sem migração/deploy, dados reais ou formalização operacional. A auth seam mutável e os dois usuários ADMIN das provas PG continuam limitando a inferência de permissões, conforme P3.

## AEP, preservação e próximo gate

Mesmo GOAL002, plan_rev8, C4/ALTO, família executora openai. attempt --fail registrou N2 na tentativa1 e avançou para **2/3**. Sem novo plano/GOAL, sem alteração de allowlist/test_command/gates/executors. Após o merge normal da main, status/open idempotente oficial atualizou somente base_commit; snapshots provam a preservação de contador e attempts_log. Nenhuma edição manual de state/ledger/REGISTRY, nem close/block nesta retomada. Os pacotes rev7 e rev8 anteriores permanecem íntegros; hashes e arquivo rastreado foram auditados. A worktree principal e outras frentes não foram alteradas.

O pacote novo contém diff A–E integral contra a main integrada, fontes completas de produto/testes/runners, roteiro de leitura em blocos, histórico e logs atuais, manifesto, ZIP e verificador somente leitura. O pedido novo exige revisão independente COMPLETA sobre d5570e829057863a9f670823bb3367b527efb391, reavaliando os dois P1, P2-1, N2, contratos A–E e P3. Não foram chamados revisores/provedores/cotas nesta retomada. GLM preliminar e Anthropic parcial do SHA665583a não são R oficial desse objeto.

O usuário informou P0=0/P1=0/P2=0/P3=8 no GLM preliminar; o texto integral e descrições N1/N3 não foram fornecidos. N1/N3 ficam P3 registrados sem escopo automático. Os cinco P3 rev7 também não foram corrigidos ou aceitos: liveness pré-transação; formalização pendente em remount; auth seam/two ADMIN; título sem FOR UPDATE em gerarOrcamentoDaOS; validação de forma do atendimento rápido depois de criar OS com compensação. A nova R precisa avaliar os riscos explicitamente.

Próximo gate: R elegível de outra família, preferencialmente Anthropic, com R_FAMILY, R_HEAD_REVIEWED=d5570e829057863a9f670823bb3367b527efb391, R_VERDICT=APPROVE, P0=P1=P2=0 e avaliação explícita dos P3. Discriminar arquivos inspecionados, evidências lidas, hashes verificados e testes reexecutados (zero se só leitura). Até lá: **R_STATUS=AGUARDANDO_R_INDEPENDENTE; AEP_CLOSE/MERGE/PUBLICACAO=PENDENTE; PROD_SMOKE=OWNER_PENDING_AUTH**. PR262 permanece draft no remoto86cbd77; o novo candidato está local. Não iniciar003/008/datas.

## Artefatos para revisão

[Pacote completo ZIP](C:/Projetos/omni-gestao-ops-v4-frg-002/docs/execution-tracks/ops-v4-financeiro-retirada-garantia/_closed/reports/rev8/evidencias-n2-a2-d5570e829057/pacote-rev8-n2-a2-d5570e829057.zip), [manifesto](C:/Projetos/omni-gestao-ops-v4-frg-002/docs/execution-tracks/ops-v4-financeiro-retirada-garantia/_closed/reports/rev8/evidencias-n2-a2-d5570e829057/MANIFEST-PACOTE-N2-A2.json), [matriz](C:/Projetos/omni-gestao-ops-v4-frg-002/docs/execution-tracks/ops-v4-financeiro-retirada-garantia/_closed/reports/rev8/evidencias-n2-a2-d5570e829057/MATRIZ-N2-A2.json), [pedido da nova R](C:/Projetos/omni-gestao-ops-v4-frg-002/docs/execution-tracks/ops-v4-financeiro-retirada-garantia/_closed/reports/rev8/evidencias-n2-a2-d5570e829057/PEDIDO-R-COMPLETA.md) e [índice de integridade](C:/Projetos/omni-gestao-ops-v4-frg-002/docs/execution-tracks/ops-v4-financeiro-retirada-garantia/_closed/reports/rev8/evidencias-n2-a2-d5570e829057/INDEX-ARQUIVOS.json). Os logs crus estão integralmente no ZIP e no diretório local review-rev8-n2-a2.
