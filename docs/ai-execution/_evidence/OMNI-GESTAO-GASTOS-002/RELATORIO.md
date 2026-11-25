# G002 — contas, categorias e writers com perfil explícito

Implementação, gates técnicos e R5 concluídos. A revisão independente aprovou fechamento e commit local com os hashes verificados. SHA definitivo/arquivos do commit: consultar G002-execution/local-commit-final-receipt.json. Falhas e pareceres anteriores permanecem preservados.

## Base, escopo e decisão

Branch codex/omni-gestao-gastos-002; worktree C:/Projetos/omni-gestao/.worktrees/omni-gestao-gastos-002. Base/HEAD anterior ao commit: 55bab9a7a93218433912761d6ce2f07b8b3fdfad (G001). origin/main conferida por fetch na preparação: 13700862405a89da3c7d16702318735a88348133; a leitura posterior da ref local não é apresentada como fetch novo. AEP opt-in ausente: sem edição de state/ledger/registry ou close histórico. WIPs e G001 preservados.

EMPRESA por loja real autorizada; PESSOAL único por AdminUser, sem loja, conservado após troca/perda de empresa e privado de outros gestores. Contexto opaco G001 revalidado no servidor; JSON, clone ou IDs do cliente não concedem ownership. Sem loja fictícia, fallback loja-1, primeira conta ativa, membership automático ou financeiro paralelo. Pessoal continua interno/dormente até leitores G003.

Allowlist exata prévia em GOAL.md: 63 caminhos, ampliados por autorização humana nas revisões 3, 4 e 5. Conferência final em diff-final-proof.json: esperados 62 alterados (56 fontes/testes/schema/SQL e seis documentos). O persistidor do importador permanece intacto. Scripts/logs/dumps sintéticos/pacotes R em G002-execution são externos e não entram na contagem do repositório. Commit somente de caminhos explícitos após todos os gates/R.

Executor observado: Codex/OpenAI gpt-6.1-sol, esforço max segundo turn_context da própria sessão (executor-model-observed.json). Rodadas R1–R5: Claude Code 2.1.288, claude-sonnet-5-5, Anthropic. R5: resultado/modelo extraídos da resposta bruta real, sessão01c84800-0acc-4843-aa1f-dac3ed72b0e8,54 turnos e zero recusas; sem simular aprovação dos pareceres anteriores.

## Schema, contas e writers

CarteiraFinanceira, ContaPagarTitulo, ContaReceberTitulo e MovimentacaoFinanceira continuam canônicos do HUB. Expansão aditiva: perfilId opcional para legado empresarial; storeId NULL somente em PESSOAL explícito; default loja-1 removido nesses quatro campos. CategoriaGasto por perfil/natureza, FKs compostas e triggers conferem relações inclusive com NULL. Ownership atribuído é imutável. Relações pessoais não aceitam venda/OS/fornecedor empresariais. IDs, origem, referenciaId, localKey, payload e FKs históricos preservados; sem FinancialTransaction/FinancialAttachment paralelo.

Novos writers internos exigem contexto validado, conta e categoria do mesmo perfil e estado compatível. Namespace pessoal próprio e UNIQUE(perfilId, identidadePessoal), sem reinterpretar UNIQUE(storeId, localKey) empresarial. Centavos novos são inteiros NUMERIC(20,0), JSON string, limite explícito de 9 trilhões de centavos; Float legado anômalo finito é preservado/sinalizado, sem arredondamento silencioso. Ruído binário de centavos exatos é aceito; NaN/infinitos são bloqueados. Sem backfill real.

Provisionamento EMPRESA idempotente por loja, dentro da transação da escrita; não cria PerfilMembro nem permissões; perfil inativo recusado. Falha posterior reverte perfil recém-criado e efeitos. Conta histórica hoje inativa continua vinculada a metadados/cancelamento/compensação; novo destino de pagamento/transferência exige ativa. A conta original do título pode diferir da conta do pagamento: ambas são conferidas, sem trocar vínculos/saldos silenciosamente.

Inventário atual: 49 pontos de escrita direta em 14 arquivos app/lib e nove consumidores delegados. Cobre serviços canônicos, venda/PDV, OS, snapshots pagar/receber, importador delegado, cinco writers adicionais de vendas/OS e os consumidores de compatibilidade/locks/M1 autorizados. Regex não prova todos os scripts manuais: manutenção legada não foi adaptada/executada em dados reais; o seed oficial V3 foi usado só nas fixtures QA identificadas.

Snapshot/reimportação não sobrescreve ownership, principal, histórico/pagamentos servidor ou conta protegida pelo ledger. Sugestão opcional estrangeira/inativa/obsoleta é ignorada com aviso genérico e preserva o canônico; legado inconsistente é bloqueado para auditoria, sem saneamento. Até quatro chaves distintas em paralelo; mesma localKey mantém ordem; falha aguarda trabalhos já iniciados. Lote parcialmente aplicado em erro conserva o contrato anterior; não é unidade financeira geral G004 ou fila G006. Medições locais de 8000 linhas não certificam RTT/pool/timeout/SLA externos.

## M1, tipos e concorrência

Reprodução antes da edição: duas PATCH parciais de 40 no título de 200 geravam dois históricos, apenas um movimento/saldo de 40. A heurística aggregate suprimia a segunda parcela; pagar/receber separavam transações e suprimiam falha do movimento com HTTP200. FAIL real preservado em m1-reproduction-endpoints.*. Humano escolheu opção1 e autorizou os seis caminhos exatos antes de editar.

As três rotas pagar/receber/PDV singular exigem identidade explícita estável. Intenções distintas de mesmo valor conservam ambos os pagamentos; mesma chave/conteúdo retorna replay; conteúdo divergente conflita. ID determinístico apenas dos novos movimentos; recibo/fingerprint no histórico servidor. Histórico, movimento e saldo na mesma transação, incluindo CaixaOperacao no PDV. Falha SQL retorna erro e reverte tudo, inclusive perfil provisionado. Consulta de replay precede período/sessão mutáveis; não cria pagamento ou inverte locks de título/sessão. Autorização empresarial obrigatória em todo request.

Os dois chamadores e o helper conservam UUID/hashes/sessão original até ACK da mesma chave. Web Locks reserva entre abas e libera antes da rede; localStorage contém só identidade, sem dados financeiros/credenciais. Reabertura, resposta perdida ou nova sessão de caixa não gera outra chave para a intenção pendente. Falha de armazenamento impede envio; 503/conflito/resposta incerta conserva a chave. Recibo legado mantém IDs: consistência é conferida somente em leitura; divergência retorna409, sem backfill. Teste antigo de fallback por título/valor foi atualizado para exigir chave e zero efeitos sem ela, conforme M1; demais asserções de negócio/rollback preservadas.

N10/N11: 40P01 reproduzido antes; lote agora trava todos os títulos em ordem binária, relê somente IDs efetivamente travados e trava todas as contas originais/destinos em ordem binária antes da primeira escrita. Provas PG controladas mostram contenção real e conclusão das duas operações. W2 manteve a asserção original de ordem e passou junto aos 51 casos unitários do lote. Sem retry mascarador, timeout ampliado, lock removido ou serialização artificial desses testes.

N1 mantém título antes de conta. N12 conserva ownership legado durante recálculo de saldo, evitando ciclo KEY SHARE/advisory; adoção ocorre nos writers antes dos movimentos. Seis PG originais do PDV passaram. Os dois chamadores nullable V3/V4 agora refinam somente após conferir a mesma loja real, sem cast/fallback e dentro do tratamento de erro; sem mudança de entrega, preço, cobrança, estoque ou UI.

Compra/obrigação registrada e pagamento realizado são fatos distintos. Transferências preservam duas pernas sem receita/despesa nova. Vendas, recebimentos, fornecedor, estoque, conta original/destino e origens continuam vinculados. Base caixa/consultas reconciliadas e distinção compras/pagamentos continuam implementação G005, sem PASS antecipado.

## Banco e validação

PostgreSQL17.10, 127.0.0.1:55494, cluster próprio G002-execution/pgdata, identidade/diretório reconfirmados. Apenas esse cluster alternou para55493 no harness G001 e foi restaurado. Nenhum outro serviço parado; nenhum .env definiu destino. Papel app sintético gastos_g002 é NOSUPERUSER/NOBYPASSRLS e OWNER: isso não prova runtime produtivo não owner. Papel não owner com SELECT recebeu zero linhas nas sete tabelas protegidas, sem alterar RLS.

Migration G002: prisma/migrations/20261020130000_gastos_contas_writers/migration.sql, SHA256 AA2CAE61B9585AA0D16AC1F54B301C5F8DCDF1F27BDE616358466756D449D488. SQL revisado antes de aplicar só em descartáveis. Baseline vazio/histórico +G001+G002 preservaram IDs/registros/relações; auditoria de ambiguidades e drift Prisma conferidos. Mesmo hash reaplicado ao banco V3 novo ops_v3_misto_qa_gastos_g002_closure_perfil. Sem DML/backfill na migration. Conteúdo G001 intacto; diferença preexistente de CRLF entre checkouts registrada sem reescrever o arquivo.

| Prova/gate | Estado/evidência externa |
|---|---|
| Regressões pertinentes | 854 PASS +1 falha esperada preexistente; 855 casos/50 arquivos; zero skip/falha, exit0; validation-r4-delta2-final.* |
| PG incluído nessa suíte | 97 G002 +6 PDV nativos =103; isolamento, FKs/precisão, snapshots, M1, recuperação e contenção reais |
| G001 original | 24/24 PASS com limite original5s; g001-postgres-regression-adendo-final-logged.* |
| OS V3 oficial | 109/109 PASS em banco novo; v3-postgres-regression-closure_perfil.* |
| Total PG atual | 236 casos:103 da rodada final +24 G001 e109 V3 anteriores aceitos na R4; focados não são somados novamente |
| Typecheck integral | PASS, exit0, projeto completo; typecheck-r4-delta2.* |
| Lint focado | 55 caminhos TS/TSX, exit0, zero erros/10 avisos; lint-r4-delta.* |
| Lint global/diferencial | LINT_GLOBAL=BASELINE_FAIL (105 erros/114 avisos em ambos), LINT_DELTA=PASS (219 iguais/0 novos/0 removidos); exceção expressamente aceita na R5 para os56 hashes atuais |
| Build atual | PASS, exit0/MIGRATION_SKIPPED=true; build-r4-delta2.*; typecheck independente exit0 |
| Diff/escopo | PASS, somente allowlist explícita; fontes idênticas à rodada final; provas atualizadas antes de R/commit |
| R final | PASS R5 real:claude-sonnet-5-5/Anthropic, APPROVED/LOCAL_CLOSURE_APPROVED, satisfied=true/commit_allowed=true; parecer/hash/sessão em REVISAO_R.json |

Tentativas de infraestrutura preservadas: EPERM de cache do sandbox antes de testes; bloqueio TCP10013; execução posterior com temporário isolado/acesso local passou sem mudar testes/configuração. G001 teve 23PASS+timeout na última conferência; diagnóstico READ ONLY confirmou sete zeros em715ms e nova execução com SQL instrumentado passou no mesmo limite (176ms no caso). A causa exata de agendamento do Windows não é afirmada. Nenhuma falha de negócio virou skip/expected-fail; a única esperada da suíte financeira já existia na base.

## Revisão e fronteiras

R1 CHANGES_REQUESTED e R2–R4 condicionais foram preservados. R5 real:Claude Code2.1.288, claude-sonnet-5-5/Anthropic, sessão01c84800-0acc-4843-aa1f-dac3ed72b0e8,54 turnos e zero permission_denials. APPROVED/LOCAL_CLOSURE_APPROVED, satisfied=true e commit_allowed=true, apenas para commit local dos hashes revisados. D1–D4/O1 atendidos; exceção de lint expressamente aceita nos56 hashes atuais. Revisor leu código/evidências, sem alegar reexecução de testes. Fonte bruta imutável, SHA, manifest/prompt e modelos em REVISAO_R.json. Três observações não bloqueantes registradas; sem nova implementação ou ampliação do GOAL.

Antes de uso fora do ensaio: identidade/privilégios reais de runtime/RLS; auditoria zero BLOQUEIO ou decisão por linha; volume/locks/janela da migration; pool/RTT/timeout e suporte de navegador ao recibo pendente. Não foram presumidos/configurados/aplicados em produção. Não exigem canal/OTP/mídia para fechar esta etapa.

A02/A03/A09/A19 separados em GOAL.md: writers/ownership/vínculos/M1 verificados nesta etapa; leitores/documentos/KPI/exportação/cache G003, aplicação financeira geral G004, base caixa/consultas G005, fila G006, telefone/canal G007 e mídia/E2E G009/G010 permanecem reservados. Pessoal segue interno/dormente; assistente WhatsApp não está pronto. Sem credenciais de clientes, mensagens, push, merge, deploy, DDL/backfill produtivo ou início de G003.

Conferência remota final somente leitura: origin/main em a874342f5366427f8f7cfebc96a9c14c8efe39ad. Comparação com 13700862405a89da3c7d16702318735a88348133: avanços em texto/voz de clientes e documentação de governança PDV, zero sobreposição com os 63 caminhos G002; schema/guards/writers financeiros não mudaram nesse intervalo. Prova externa origin-main-final-impact.json. Branch/base G001 preservadas, sem merge/cherry-pick/rebase. Voz no editor de clientes não comprova processamento de áudio do assistente WhatsApp.

Criação inicial: N13–N15/N17 foram confirmados com 40P01 e corrigidos pela ordem títulos → perfil → contas nos writers. A materialização de saldo apenas valida perfil existente e conserva legado NULL restrito à Store real; não provisiona nem adota. O teste nativo que já retém advisory foi preservado. Transferência provisiona antes das contas e reverte perfil em recusa, mantendo ok:false; SQL continua erro. N16/N18 cobrem recálculo global explícito e recusa sem perfil/fatos. A rodada final atual passou os seis casos novos e os seis PG nativos; a anterior que detectou N12 permanece FAIL histórico, sem waiver.

Lint global repetido após D1–D3 no G002; baseline G001 completo preservado e conferido limpo. Mesma configuração, package/lock e diretório físico de dependências. Mesmos105 erros/114 avisos,219 correspondências e zero adições/remoções. Normalização exclusiva das duas raízes absolutas em três mensagens React, sem mudar texto relativo/regra/severidade; brutos e coordenadas preservados. Cinco arquivos de erro byte a byte iguais à G001. Lint focado55 caminhos:zero erros/10 avisos. LINT_GLOBAL=BASELINE_FAIL; LINT_DELTA=PASS. A R5 aceitou expressamente a exceção para os hashes atuais, sem estendê-la a código futuro. Provas: lint-full-differential-r4-delta2.json e comparador/JSONs.

## Delta R4 e qualificação da rodada atual

D1: caixa fechado após replay sob lock e conta/perfil indisponível na operação NOVA são rejeições tipadas sem efeito. Rollback inclui perfil/adoção/histórico/movimento/saldo/caixa. Cliente só libera nova intenção em 4xx com a mesma identidade e flag explícita. SQL 5xx, conflito, período pré-check e resposta incerta conservam chave; perfil desativado depois de commit também. Validação de limites conhecidos precede reserva. Mensagens humanas preservam code.

D2: política explícita recusa conta informada inativa/estrangeira/inexistente e perfil inativo nos três endpoints M1; sem degradação para NULL. Doze casos PostgreSQL provam zero efeitos e recuperação por nova intenção. D3: status=fechado explícito e chave nova409 no mesmo estado do replay200. D4: logs RAW originais N10/N11 com 40P01 em validation-r4-pending-final.*, indexados com SHA/linhas em r4-d4-original-deadlocks-proof.json, sem reverter produto.

O1/G004: estorno último pagamento altera só a última entrada do título, enquanto compensação por referência soma os fatos originais e é de disparo único. Coerência de estorno parcial não recebePASS no G002; exige solução por operação antes da ativação correspondente. Sem backfill/reparo real ou implementação ampla G004.

Após a R4, sete fontes mudaram;49 permaneceram iguais. Cinco suítes focadas passaram101 casos. O primeiro typecheck identificou dois TS2322 NOVOS na fixture de restauração JsonValue nullable; corrigidos com objeto explícito, sem cast/supressão. Rodada final atual855 casos e typecheck integral0 usam os mesmos56 hashes de fonte; lint/build foram refeitos depois. G00124 e V3109 são evidências anteriores mantidas das áreas não alteradas por esse delta, aceitas pela R4; não apresentados como reexecução nesta rodada. Resumo atual: final-r4-delta-validation-summary.json.

Fechamento R5: não há condição técnica local aberta. Antes de uso fora do ensaio permanecem os gates externos acima. Observações não bloqueantes: a política D2 também alcança carteiraId canônico do título (caso dedicado reservado ao G004); texto genérico de conta pode representar divergência de perfil/título; falha de remoção do recibo local mantém a chave, embora possa ocultar a mensagem original. Sem risco monetário novo identificado pela R5. Pessoal segue dormente; A02/A03/A09/A19 integrais e G003–G010 não são declarados PASS.

Evidências externas: C:/Users/rafae/.codex/visualizations/2026/10/19/01a1556c-83ac-77e2-a447-7e0f152c7c8e/G002-execution. Recibo do commit/SHA: C:/Users/rafae/.codex/visualizations/2026/10/19/01a1556c-83ac-77e2-a447-7e0f152c7c8e/G002-execution/local-commit-final-receipt.json.

O cluster próprio foi encerrado após conferência do diretório e PID20536; somente127.0.0.1:55494, dados/logs preservados. Prova:cluster-final-stop-r5.json. Nenhum outro processo/serviço foi pausado ou encerrado nesta continuação; WIPs preservados.
