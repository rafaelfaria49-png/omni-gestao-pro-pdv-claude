# OMNI-GESTAO-GASTOS-005 — Consultas e exportações reconciliadas

STATUS: IMPLEMENTADO E VALIDADO; R APPROVED; fechamento em commit local único.

Base exata fad3d202a5556c1170af07b94181e668aa4d21a7; branch codex/omni-gestao-gastos-005; worktree C:/Projetos/omni-gestao/.worktrees/omni-gestao-gastos-005. AEP opt-in ausente; nenhum state/ledger/registry modificado. Ancestralidade G001→G004 confirmada. WIPs de outras worktrees preservados. Um commit local apenas após R APPROVED.

## Autoridade e bases

lib/gastos/query.ts e query-calculo.ts centralizam consulta tipada autorizada, centavos BigInt/strings JSON, BRL e America/Sao_Paulo. RepeatableRead READ ONLY nas consultas públicas, com sessão/membership/grant revalidados dentro da transação. Contexto pessoal opaco exclusivamente interno; seletores forjados recusados. Ausência de perfil restringe legadoNULL da mesma Store, nunca todos os perfis, sem provisionamento por GET.

Caixa realizado líquido de compensações válidas; crédito é obrigação sem saída e fatura aloca os consumos uma vez. Transferência é neutra no resultado e preserva as pernas físicas. Histórico JSON espelhado não duplica pagamento. Categoria é estruturada, não inferida da descrição; texto legado de categoria só apresenta. Títulos usam saldo restante atual no snapshot; quitado legado sem histórico não cria caixa. IDs CP/CR e localKey separados, FK explícita prevalece.

Saldo de contas significa abertura+ledger COM carteira até corte/asOf. Receita/despesa também consideram fatos autorizados SEM carteira. semCarteira sinaliza quantidade, entradas e saídas não atribuídas até o mesmo corte, independentemente dos filtros de conta/categoria. Não há promessa de que o saldo das contas seja todo o dinheiro da loja. As APIs de carteiras, indicadores/resumo/Agent e fluxo propagam a cobertura.

DRE mantém política/classificações/exclusões/ticket próprios e rótulo CAIXA_COM_CLASSIFICACAO_DRE. Fluxo físico é separado do resultado líquido; Contador apresenta brutos/estornos e posição de títulos por vencimento na competência. Cancelamento PDV legado sem vínculo estruturado permanece saída/despesa na política herdada do caixa/DRE e é estorno na apresentação própria do Contador; resultado líquido coincide. Tipo de exportação dre é fonte de caixa rotulada para DRE, não demonstração classificada; cobrancas_os explicita valor original.

## A13, demais critérios e consumidores

Oito posições com motor G004 real e SQL independente para banco, caixa, aberto, receita e despesa líquidas. Unidade: centavos.

| Passo | Banco | Caixa | Aberto | Despesa líquida |
|---|---:|---:|---:|---:|
| inicial | 100000 | 0 | 36501 | 0 |
| pix20 | 98000 | 0 | 36501 | 2000 |
| parcial200 | 78000 | 0 | 16501 | 22000 |
| quitacao16501 | 61499 | 0 | 0 | 38501 |
| transferencia50 | 56499 | 5000 | 0 | 38501 |
| credito100 | 56499 | 5000 | 10000 | 38501 |
| fatura100 | 46499 | 5000 | 0 | 48501 |
| estorno20 | 48499 | 5000 | 0 | 46501 |

Final53499 consolidado, despesa46501. Prova integral C:\Users\rafae\.codex\visualizations\2026\10\23\01a16672-b095-7202-8895-5cf8f4aa76c5\G005-execution/a13-numerico.json. Nenhum esperado do comando humano foi alterado.

Serviço, pagar/receber/carteiras, analytics, relatórios, Provider React real em JSDOM, CSV/XLSX serializados/parseados, Omni Agent e Contador/pacote concordam em16501 após parcial20000 de36501 e zero após quitação. Agent ignora valor da IA e exige filtro inequívoco. A14 usa601movimentos sem somar página; A17 cobre data econômica versus sincronização, SP23h59/00h01/mês/DST, vencimento distinto, compra setembro/fatura outubro, estorno posterior, precisão anômala e consulta histórica após fechamento. A19 cobre vínculos CP/CR, ID/localKey e documento sem nova despesa.

Snapshot de duas conexões reais:21840/29152, repeatable read, readonly=on, semsleep. Antes doCOMMIT:aberto36501/despesa0/saldo100000; depois:0/36501/63499. Indicadores/rankings usam uma única consulta por resposta e projetores puros; teste prova1transaction e asOf comum às partes. GETs não gravam dinheiro, perfis, documentos ou categorias.

## Anomalias e operação

Erros financeiros recusam totais, com code estável ao chamador; servidor registra code/tabela/id técnico sem descrição, payload, valores ou PII. DRE/fechamento consultam eventos sem calcular posições de títulos; título anômalo1.001 não bloqueia a DRE. Overview Agent separa indisponibilidade de permissão. Preset inválido422 em seis rotas; tipo export desconhecido400.

auditarQualidadeFinanceiraEmpresa é pré-auditoria interna autorizada RepeatableRead READ ONLY que devolve contagens por código para precisão do valor base, tipo/valor de movimento e parcial sem histórico/alocação. Verificações explicitamente limitadas: não certificam conteúdo integral do JSON, todos os vínculos ou remediação. QA:audit antes=[], depois=[{"code":"precisao_legada_exige_revisao","quantidade":"1"}], estadoInalterado=true. Prova C:\Users\rafae\.codex\visualizations\2026\10\23\01a16672-b095-7202-8895-5cf8f4aa76c5\G005-execution/auditoria-qualidade-qa.json. Nenhum dado produtivo foi consultado.

Antes de implantação, humano autorizado deve executar o precheck no contexto empresarial permitido, avaliar os contadores e os códigos técnicos dos logs, revisar inconsistências por registro e aprovar eventual remediação por writers canônicos. Repetir auditoria e reconciliação após correção. Enquanto houver anomalia relevante, a consulta permanece recusada; não retornar zero ou arredondar para liberar fluxo. Execução/alteração/grants produtivos não são autorizados neste GOAL. Volume real produtivo permanece desconhecido.

DRE standalone usa snapshot somente leitura. Na composição do fechamento G004, a transação é herdada READ COMMITTED; não se promete isolamento G005 frente a writers legados concorrentes que não tomam lock de competência. Nenhum writer/lock/isolation de fechamento foi alterado para resolver isso. Limitação P3 declarada, sem homologação de produção.

## Gates e proveniência atuais

418PG distintos +898unitários,0skip. G00523(pg-g005-r9), G003102(r4), G00457(r6, rodada completa com6migrations), G00124/G00297/PDV6/V3OS109 preservados com writers imutáveis. A única mudança de teste apósR2 foi remover uma linha vazia do EOF de g005-fixtures.ts; conteúdo anterior ao whitespace final é idêntico, e não há mudança produtiva. As provas G003/G004 não importam esta fixture e permanecem válidas; G005 e unitários foram renovados.

Typecheck integral typecheck-r7 exit0; lintfocado lint-focused-r5 0/0; buildoficial build-r3 exit0/MIGRATION_SKIPPED. LINT_GLOBAL=BASELINE_FAIL105erros/113avisos em ambos; LINT_DELTA=PASS,218pares individuais,0novos/0removidos. Hash base=024a59a400aee86a7a73d6030bce2055043dfd7a8cc54f679c14fdade1201469; atual=25c4b9808a002d90522b2451c4a458db386877d0fdc71cee0f418d2386662442; diferencial=dcdd1292f694df49c605e1f83c9505bf95fae3d8e36fd6d92c2ec878ac166671. A R3 renovou expressamente a exceção sobre estes hashes. Brutos anteriores e pareceres R1/R2 preservados.

Fetch inicial040fcc76fdf739100d9dd5a7d798d456a6b8aff5; reconfirmação2026-10-23T04:34Z origin/main0adec2121ed463844f1af325f05f924f6952eddf. Analytics remoto contém gate de módulo finance e guards distintos: integração futura exige conciliar ambos os controles sem regressão de privacidade. Nenhuma integração automática; base exataG004 mantida.

## Banco, recursos e fronteira

Clusters NOVOS exclusivos de G005: principal127.0.0.1:55506/gastos_g005_test, user gastos_g005, data C:\Users\rafae\.codex\visualizations\2026\10\23\01a16672-b095-7202-8895-5cf8f4aa76c5\G005-execution/pgdata; regressões portas55493–55496 conforme guards originais, data C:\Users\rafae\.codex\visualizations\2026\10\23\01a16672-b095-7202-8895-5cf8f4aa76c5\G005-execution/regressoes/G004-execution/pgdata. Aplicação NOSUPERUSER/NOBYPASSRLS/NOCREATEDB/NOCREATEROLE; bootstrap separado; pg_read_all_settings QA somente para provar diretório. Schema baseline +SQL imutávelG001–G004, sem migrationG005/produção. Identidade SQL, papéis, diretórios e provas não-owner/RLS nos recibos. Dados/logs preservados e apenas clusters próprios encerrados após identidade e zero outros clientes.

Disco>=8GiB conferido antes dos trabalhos pesados; RAM7.69GiB frequentemente<1GiBlivre, gates sequenciais sem encerrar processos alheios. Node26.12.1 versus engines24.x permanece limitação, sem validação em24 nem mudança global/dependências. Ledger completo em memória e buscas repetidas não possuem SLA produtivo certificado. Adapters legados em reais recusam limites fora do inteiro seguro.

33paths exatos enumerados no GOAL. As seis adições após R1 são leitores diretamente afetados já autorizados no §4 humano, concretizados ANTES de editar; nenhum escopo genérico novo. Auditoria AST preserva outras ações Agent e writers; schema/migrations/auth/core/cache/fixtures anteriores intactos. diff--check limpo é confirmado em source-audit antes de R/commit.

Um único commit local após APPROVED e condições satisfeitas. SHA final no recibo externo e entrega, evitando autorreferência ou segundo commit. Sempush/merge/deploy/DDL/backfill/grants produtivos/WhatsApp/ativação pessoal/G006.

## Histórico do parecer R2 anterior ao ajuste de EOF

{"verdict":"APPROVED","modelsObserved":["claude-sonnet-5-5"],"cli":"2.1.288 (Claude Code)","sessionId":"4c3d1b67-f4bd-4d1e-a061-e20d7c2aaab5","lintExceptionAccepted":true,"lintEvidenceHashes":{"baseline":"024a59a400aee86a7a73d6030bce2055043dfd7a8cc54f679c14fdade1201469","current":"ce0c35b4fd27e5e7df235200d3ed8fff69e7f136a633476d70b97c730d00d048","differential":"e05970d16b3ea22ea31719c5157a5f356daf785f2a6c8eb4440a5de93f39d91e"},"approvedForLocalCommit":true,"productionApproval":false,"limitations":["Revisão estática (Read/Glob/Grep): não executei testes, build, typecheck nem lint e não recomputei sha256. Confiei nos recibos e conferi sua consistência cruzada (sha de query.ts e query-calculo.ts, contagens, exitCode, sourceUnchanged). O sha256 de cada JSON de lint e o do arquivo de pares não foram recomputados por mim; conferi que os declarados no prompt batem com lint-differential.json.","O commit local deve incluir somente os 33 caminhos da allowlist. A finalização de REVISAO_R.json, GOAL.md e RELATORIO.md depois deste parecer não pode alterar fontes produtivas; qualquer mudança em fonte invalida este parecer e o aceite de lint.","G001 (24), G002 (97), PDV (6) e V3/OS (109) rodaram em recibos anteriores ao delta R1, com query.ts 8fd76398… (versão anterior). A vinculação é aos writers imutáveis por AST e hash de protectedProof. Esses testes carregam os módulos de rota (PATCH/DELETE de pagar/receber), cujo grafo de import mudou, mas G003-r4 e G004-r6 rodaram sobre as fontes finais e exercitam as mesmas rotas. Aceito como suficiente, não como reexecução completa desses conjuntos sobre as fontes finais.","Que as 6 adições à allowlist foram enumeradas ANTES da edição é uma alegação documental (GOAL e REVISAO_R) que o pacote estático não permite verificar por timestamp. O §4 humano já autoriza leitores diretamente afetados, e os 33 caminhos correspondem exatamente ao source-audit.","A suficiência do fail-closed depende do volume real de anomalias legadas em produção, que é desconhecido e não foi consultado, por proibição do GOAL. Um único título ou movimento anômalo bloqueia pagar/receber, fluxo, relatórios, Agent e exportações da loja afetada (o DRE e o fechamento ficam isolados de anomalias de títulos). A implantação exige antes: precheck, GETs e logs em ambiente autorizado, remediação humana por writers canônicos e nova reconciliação. Não houve SQL, grant ou consulta de produção, e este parecer não aprova nada disso.","O DRE no fechamento herda READ COMMITTED (sem promessa de snapshot G005 frente a writers legados que não tomam o lock de competência). O DRE avulso e as consultas públicas usam RepeatableRead READ ONLY.","Política herdada mantida e declarada: cancelamento_pdv sem vínculo estruturado conta como saída/despesa bruta na consulta e como estorno na apresentação do Contador. O resultado líquido coincide, mas os brutos diferem.","Performance: o ledger e os títulos do escopo são carregados e agregados em memória a cada consulta, e algumas buscas são lineares. Não há SLA de produção.","Node 26.12.1 versus engines 24.x: nada foi validado em runtime 24.x.","Merge futuro com origin/main (0adec212…): o analytics remoto acrescenta requireModuleApi(finance) e altera guards. Exige conciliação manual com os guards G003/perfil, sem regressão de privacidade. Nenhuma integração foi feita.","Este parecer não aprova produção, push, deploy, DDL/backfill/grants, WhatsApp, ativação pessoal nem G006. Autoriza apenas um commit local dos caminhos da allowlist, após confirmar SHA, branch codex/omni-gestao-gastos-005, pai fad3d202… e árvore limpa."]}

Proveniência integral e decisão em REVISAO_R.json. Fontes do pacote revalidadas por SHA256 depois do parecer; somente estes metadados finais mudaram. Nenhuma aprovação de produção. O SHA do único commit local fica no recibo externo e na entrega, sem auto-referência ou segundo commit documental.

## Esclarecimentos finais sem alteração de código

Consolidado de contas soma somente contas ativas não crédito, comportamento preservado da base; contas[] mantém detalhe de inativas/crédito. semCarteira representa apenas ausência de atribuição, não exclusão por tipo/estado da conta. A matriz agora explicita essa distinção documental.

O lint analisou4491arquivos na base e4501nesta worktree: sete fontes/testes novos de G005 e três artefatos PWA gerados pelo build oficial. A diferença é exatamente:

- lib/gastos/query-calculo.ts (0diagnósticos)
- lib/gastos/query.test.ts (0diagnósticos)
- lib/gastos/query.ts (0diagnósticos)
- lib/omni-agent/interpret-finance-query.test.ts (0diagnósticos)
- public/sw.js (0diagnósticos)
- public/swe-worker-5c72df51bb1f6ee0.js (0diagnósticos)
- public/workbox-79213d1a.js (0diagnósticos)
- test/gastos/consumidores-g005.postgres.test.ts (0diagnósticos)
- test/gastos/g005-fixtures.ts (0diagnósticos)
- test/gastos/reconciliacao.postgres.test.ts (0diagnósticos)

Os três public/*.js são ignorados por regras existentes .gitignore:38,40,44 e não entram no commit. Resultados integrais de lint continuam inalterados; inventário/hashes em C:\Users\rafae\.codex\visualizations\2026\10\23\01a16672-b095-7202-8895-5cf8f4aa76c5\G005-execution\lint-file-inventory-delta.json. Não há arquivo removido nem diagnóstico ocultado.

Os seis P3 não bloqueantes da R2 são não bloqueantes: precisão da documentação do consolidado (esclarecida acima), generalização futura do oráculo de resíduo, limites do precheck e remediação por lote, borda401 do overview e inventário do lint (esclarecido acima). Antes de qualquer implantação autorizada, além do precheck parcial, validar os próprios GETs/DTO e logs em cópia/ambiente autorizado, remediar por writers e repetir reconciliação. Um precheck vazio não certifica disponibilidade dos GETs. Nenhuma produção ou objetivo futuro foi iniciado.

## Finalização de whitespace e R3

O primeiro gitdiff--cached--check encontrou somente uma linha vazia extra no fim da fixture nova. Nenhum commit havia sido criado; índice dos33paths próprios foi retirado explicitamente e o EOF corrigido. A auditoria passou a executar gitdiff--no-index--check para cada arquivo novo, além do diffnormal. Nenhuma fonte produtiva mudou apósR2. G00523, unitários898, typecheck, lintfocado, build e lintintegral foram renovados para ligar os hashes finais, sem alterar comportamento, fixtures monetárias ou esperados. R3 APPROVED sobre o delta exclusivo de EOF e hashes finais.

## Parecer R real e liberação local

{"verdict":"APPROVED","modelsObserved":["claude-sonnet-5-5"],"cli":"2.1.288 (Claude Code)","sessionId":"8db88b8c-ad1f-40ab-8620-c88873f18ee0","lintExceptionAccepted":true,"lintEvidenceHashes":{"baseline":"024a59a400aee86a7a73d6030bce2055043dfd7a8cc54f679c14fdade1201469","current":"25c4b9808a002d90522b2451c4a458db386877d0fdc71cee0f418d2386662442","differential":"dcdd1292f694df49c605e1f83c9505bf95fae3d8e36fd6d92c2ec878ac166671"},"approvedForLocalCommit":true,"productionApproval":false,"limitations":["Revisão estática (Read/Glob/Grep): não executei testes, lint, build nem typecheck e não recomputei nenhum sha256. O hunk da fixture, as contagens dos gates e os pares de lint foram conferidos por leitura e contagem. Os hashes dos JSONs de lint e do arquivo de pares não foram recomputados por mim.","Só revisei o delta pós-R2. Os resultados funcionais da R2 (P1/P2/P3, A13, autorização, bases e rótulos) não foram refeitos e dependem de as fontes produtivas terem hashes iguais aos da R2. Isso eu verifiquei pelos hashes do source-audit e dos recibos, sem recomputá-los.","O commit local deve incluir somente os 33 caminhos da allowlist, depois de confirmar o SHA base fad3d202…, a branch codex/omni-gestao-gastos-005 e um stagedcheck limpo (git diff --cached --check). A finalização pós-R3 só pode atualizar GOAL, RELATORIO, MATRIZ e REVISAO_R. Qualquer mudança em código ou teste invalida este parecer e o aceite de lint.","Mantidas as limitações da R2: precheck parcial; validação por GETs/DTO e logs, com remediação humana por writers canônicos e nova reconciliação antes de futura implantação; READ COMMITTED herdado no fechamento; política herdada de cancelamento_pdv; ledger e títulos agregados em memória, sem SLA; Node 26.12.1 contra engines 24.x; risco de merge com origin/main (analytics remoto com gate de módulo finance) que exige conciliação manual. Nenhuma produção foi consultada.","Este parecer não aprova produção, push, merge, deploy, DDL/backfill/grants, WhatsApp, ativação pessoal nem G006. Autoriza apenas um commit local dos caminhos da allowlist."]}

Proveniência integral e decisão em REVISAO_R.json. Fontes do pacote revalidadas por SHA256 depois do parecer; somente estes metadados finais mudaram. Nenhuma aprovação de produção. O SHA do único commit local fica no recibo externo e na entrega, sem auto-referência ou segundo commit documental.

## Esclarecimentos finais sem alteração de código

Consolidado de contas soma somente contas ativas não crédito, comportamento preservado da base; contas[] mantém detalhe de inativas/crédito. semCarteira representa apenas ausência de atribuição, não exclusão por tipo/estado da conta. A matriz agora explicita essa distinção documental.

O lint analisou4491arquivos na base e4501nesta worktree: sete fontes/testes novos de G005 e três artefatos PWA gerados pelo build oficial. A diferença é exatamente:

- lib/gastos/query-calculo.ts (0diagnósticos)
- lib/gastos/query.test.ts (0diagnósticos)
- lib/gastos/query.ts (0diagnósticos)
- lib/omni-agent/interpret-finance-query.test.ts (0diagnósticos)
- public/sw.js (0diagnósticos)
- public/swe-worker-5c72df51bb1f6ee0.js (0diagnósticos)
- public/workbox-79213d1a.js (0diagnósticos)
- test/gastos/consumidores-g005.postgres.test.ts (0diagnósticos)
- test/gastos/g005-fixtures.ts (0diagnósticos)
- test/gastos/reconciliacao.postgres.test.ts (0diagnósticos)

Os três public/*.js são ignorados por regras existentes .gitignore:38,40,44 e não entram no commit. Resultados integrais de lint continuam inalterados; inventário/hashes em C:\Users\rafae\.codex\visualizations\2026\10\23\01a16672-b095-7202-8895-5cf8f4aa76c5\G005-execution\lint-file-inventory-delta.json. Não há arquivo removido nem diagnóstico ocultado.

Os seis P3 não bloqueantes da R2 são não bloqueantes: precisão da documentação do consolidado (esclarecida acima), generalização futura do oráculo de resíduo, limites do precheck e remediação por lote, borda401 do overview e inventário do lint (esclarecido acima). Antes de qualquer implantação autorizada, além do precheck parcial, validar os próprios GETs/DTO e logs em cópia/ambiente autorizado, remediar por writers e repetir reconciliação. Um precheck vazio não certifica disponibilidade dos GETs. Nenhuma produção ou objetivo futuro foi iniciado.

R3 real confirmou o ajuste exclusivamente de EOF da fixture; fontes produtivas preservadas e gates renovados. Histórico R1/R2 integral em REVISAO_R.json. O aceite atual de lint é o da R3, limitado aos hashes finais registrados. A mudança do hash bruto do lint R2→R3 foi explicada campo a campo: somente files[4292].sourceSha256(public/sw.js regenerado pelo build) e files[4387].sourceSha256(fixture com EOF corrigido). Nenhuma regra, mensagem, posição, sugestão ou contagem mudou. Prova em lint-raw-r2-r3-field-delta.json e REVISAO_R. O hash do próprio differential é registrado externamente ao JSON em quality-summary/REVISAO_R, evitando autorreferência.
