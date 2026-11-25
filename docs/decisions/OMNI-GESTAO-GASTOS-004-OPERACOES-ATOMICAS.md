# G004 — operações financeiras atômicas

Base exata G003 `451b0e41ccf96215ed6c30e45ea2844dd0101faf`. Contrato definido antes da implementação correspondente. Implementação e testes foram executados; os resultados dos gates e o estado da revisão independente ficam no relatório G004. C4 autorizado pelo comando humano, família executora OpenAI e R real Anthropic/Sonnet 5.5. Sem implantação ou ativação pessoal.

## Autoridade e identidades

PESSOAL continua único por AdminUser, com storeId NULL e acesso somente pelo contexto opaco G001 revalidado. EMPRESA exige loja real, usuário/papel/membership/grant atuais. A decisão G001 prevalece sobre a formulação inicial pessoal por loja no plano antigo. Não fabricar contexto por cast, sessão, grant ou Store. O motor pessoal é exclusivamente interno; o novo handler HTTP resolve somente EMPRESA no servidor.

GastoRevisao guarda a proposta privada de um grupo estável, inclusive propostas de pagar/estornar que não criam novo Gasto. Preparar não move dinheiro. Correção substitui a revisão com CAS de versão e encadeamento; cancelamento/expiração não lançam dinheiro. A confirmação identifica revisão, versão e chave. Conteúdo de revisão já aplicada não é editado; correção financeira usa compensação ligada ao pagamento original e nova proposta explícita, respeitando fechamento.

FinanceiroOperacao usa UNIQUE(perfilId,chave), grupo e revisão únicos e hash canônico. Identidade não depende de valor, horário ou caixa. Reserva por lock da chave e linha dentro da transação; nenhuma reserva incompleta persiste após falha. Mesmo conteúdo devolve o resultado/IDs persistidos; conteúdo diferente conflita. Duas parciais iguais com identidades diferentes permanecem válidas quando há saldo. A resposta depende do COMMIT.

Revisão expira por padrão em 30 minutos; o chamador pode informar prazo positivo de até 24 horas. Datas econômicas permanecem explícitas na proposta; retry não as recalcula com o relógio atual. O principal e os grants são revalidados inclusive no replay G004. A identidade deve ser conservada pelo consumidor quando houver falha/incerteza; isso não altera o replay M1 existente.

## Um único efeito monetário

ContaPagarTitulo, MovimentacaoFinanceira e CarteiraFinanceira continuam canônicos. Gasto representa o fato, não outro caixa; cartões/ciclos não são saldo bancário. FinancialTransaction/FinancialAttachment não participam.

Gasto novo já pago cria um Gasto, um pagamento/alocação no fato e uma saída, sem título avulso adicional. Obrigação cria Gasto e título aberto, sem pagamento/saída. Pagamento de título existente cria pagamento/alocação naquele título, sem Gasto ou título novos. Compra no crédito cria Gasto e obrigações nos ciclos informados, sem saída bancária. Pagamento de fatura aloca as obrigações escolhidas e cria uma única saída, sem Gasto ou título de fatura adicional.

Novos pagamentos espelham pagamentoId no histórico JSON exclusivamente para compatibilidade. O cálculo do G004 soma alocações estruturadas líquidas e apenas eventos legados sem pagamentoId; não soma duas vezes. Readers anteriores continuam consumindo a projeção compatível, sem acrescentar pagamentos estruturados à mesma soma. Reconciliação geral e bases das consultas são G005.

Valores novos são centavos inteiros em BRL, positivos quando exigido e limitados pelo limite G002 de 9.000.000.000.000 centavos. A projeção Float e a conversão legada usam a política auditada G002. Anomalia é recusa/revisão explícita; não arredondar silenciosamente ou reparar histórico. Saldo canônico é saldoInicial + entradas − saídas, calculado sob o lock da conta; a aplicação nova não confia em um saldo materializado desatualizado nem trata crédito como dinheiro disponível.

## Compensações individuais e legado

O meio do estorno conserva o meio original quando conhecido. Se um movimento legado não o informa ou usa uma classificação não suportada, a compensação registra explicitamente `nao_informado`; não supõe transferência/pix/dinheiro pela conta escolhida. Esse marcador só é aceito em ESTORNO; pagamentos novos continuam exigindo meio explícito. O movimento original permanece intacto. A revisão do CHECK é ensaiada em bases G003 novas, preservando as primeiras fixtures com nomes distintos.

PagamentoFinanceiro e AlocacaoPagamento são fatos imutáveis; estorno acrescenta um pagamento compensatório e alocações ligadas aos originais. Não modifica valor/conta/data de um pagamento antigo. Compensações não ultrapassam o valor ainda válido do pagamento nem de cada alocação. Uma fatura com várias alocações exige escolha explícita na devolução parcial ambígua; não inventar rateio.

A ponte do HUB para estorno de pagar passa a conservar idempotencyKey no recibo já existente do browser. Ela resolve o alvo uma vez e persiste revisão/identidade; resposta perdida não escolhe outro "último pagamento". Recibos M1 com movimentoId permitem compensação exata, sem criar/backfillar o pagamento original. Histórico anterior sem identidade inequívoca ou conta conhecida exige revisão/vínculo explícito, sem heurística por valor/horário. Não executar reparo/backfill real.

O movimento compensatório referencia o movimento individual original. Contadores de compensação são projeções derivadas controladas pelos triggers, para limitar concorrência inclusive em SQL; não representam saldo paralelo nem substituem os fatos. A migration G004 estende a função de validação G002 apenas para reconhecer essa prova individual numa conta histórica inativa; preserva suas demais regras e as migrations originais. Conta inativa não aceita um gasto novo. Uma compensação conserva a conta original; não escolhe outra conta ativa.

## Transação, locks e fechamento

O motor abre uma transação READ COMMITTED e mantém todos os writes de aplicação no mesmo TransactionClient: operação, CAS, Gasto/título, pagamento/alocação, movimento, saldo, auditoria privada e outbox. Erro de SQL, auditoria, outbox ou COMMIT propaga falha e reverte os efeitos. Não há catch que preserve título pago com movimento ausente, nem retry de deadlock para fabricar PASS.

Ordem prevista: usuário atual; chave da operação e grupo/revisão; competências em ordem estável; documentos; cartões/ciclos em ordem estável; todos os títulos em ordem binária; perfil/grants; todas as carteiras nas mesmas chaves e ordem binária do G002; pagamentos/alocações originais. A identidade é reservada pelo advisory antes dos recursos; sua linha com FK de perfil é escrita depois da autorização transacional, conservando títulos → perfil → contas. As fontes são relidas depois dos locks. Ajustes necessários serão registrados antes das edições correspondentes e comprovados nas corridas reais.

O lock de competência é compartilhado com fechar/reabrir período. O fechamento usa cliente transacional, inclusive seu snapshot DRE, preservando os cálculos existentes. Data do gasto, pagamento, vencimento, competência e registro permanecem distintas. Dias de pagamento usam America/Sao_Paulo e timestamps são normalizados para UTC. O schema atual de fechamento é empresarial; não inventar fechamento pessoal por Store fictícia. Retry não muda a data para contornar período fechado.

Os SELECTs que adquirem locks de título/conta também filtram perfil e storeId, incluindo NULL pessoal. A validação posterior não justifica bloquear recurso de outro owner/loja: um ID estrangeiro deve ser recusado mesmo quando esse recurso estiver travado por outra conexão. Adoção de perfil NULL permanece restrita ao legado empresarial da mesma loja. Esse ajuste conserva a ordem G002 e foi provado por duas conexões sem soltar o lock estrangeiro antes da recusa.

## Cartões, fornecedores e documentos

Cartão guarda apenas identificação não secreta e ciclos explicitamente informados. Crédito não usa limite como saldo. Parcelamento só é aceito com número/total, valores e ciclos completos e coerentes; dados ausentes permanecem ausentes ou pedem revisão. Não inventar juros, taxas ou datas. Débito usa uma conta financeira real do mesmo perfil.

Fornecedor é resolvido na loja autorizada. ID estrangeiro/inativo é recusado; documento inválido não vira identidade forte; homônimo exige escolha. Reusar validação pura existente de CPF/CNPJ, sem alterar fiscal ou cadastros. Contraparte pessoal é privada e opcional, sem criar fornecedor empresarial.

Vínculos documentais G003 são compostos com o mesmo TransactionClient e os locks do documento. Documento já ligado a título não autoriza um novo fato/despesa; deve ser resolvido como pagamento do título existente. Hash igual permite reusar armazenamento no perfil, não comprova sozinho identidade universal do fato. Bytes/paths/ownership não vão à outbox comum, logs ou outro perfil. Storage continua exclusivamente fixture, com todos os limites G003 preservados.

## Auditoria, outbox e fronteira de conclusão

FinanceiroOperacaoEvento é auditoria privada por perfil, append-only, ligada ao resultado. GastoOutbox é o registro transacional durável do resultado por operação, sem consumidor/envio/lease neste GOAL. PESSOAL não é espelhado na auditoria empresarial, Contador, Agent ou logs compartilhados. Não usar array em memória ou after como substituto de outbox.

FKs compostas (id,perfilId), verificação de storeId NULL, CHECKs, unicidades e triggers defendem os vínculos e a imutabilidade. Novas tabelas têm RLS fechado. Ensaios owner não certificam acesso não-owner nem produção; provar papel efetivo não-owner/NOBYPASSRLS separadamente. O proprietário SQL continua capaz de alterar o próprio schema; não se promete defesa contra DBA.

G004 prova os contratos financeiros A06–A12/A16/A19, não os aceites integrais do canal. Base de consultas/reconciliação é G005; entrega/retry da outbox é G006/G008; canal/vínculo é G007; STT/OCR/mídia/E2E são G009/G010. Não ativar UI/canal pessoal, WhatsApp, emissão fiscal ou estoque. Concessão/revisão de PerfilMembro por operador autorizado permanece condição antes de qualquer implantação, sem grants produtivos neste GOAL.

## Recusa definitiva e expiração do recibo HUB

O recibo só é descartado após ACK da identidade exata ou resposta4xx que identifique a mesma operação e operacaoRejeitada:true. Rede, JSON incompleto,5xx, identidade/flag ausentes ou divergentes mantêm a chave. OperacaoGastoError4xx do handler sinaliza recusa definitiva, após a transação financeira ter falhado sem efeitos. Se a revisão HUB PRONTA expirar sem operação, a aplicação devolve revisao_expirada409; o handler sinaliza a recusa e o browser pode iniciar uma intenção explícita nova. Não renovar silenciosamente revisão, data ou alvo. Uma operação já aplicada continua sendo replay pelo resultado persistido mesmo após a expiração da revisão.

## Limites de implantação e comportamento registrados após R1

O estorno HUB exige PerfilMembro empresarial atual: um operador que conseguia estornar antes pode receber403 até a concessão/revisão explícita por operador autorizado. Não há autoatribuição ou grant produtivo neste GOAL. Pagamentos anteriores ao M1 sem movimentoId/pagamentoId inequívocos e títulos com perfilId NULL podem retornar pagamento_exige_revisao/titulo_indisponivel. O UI atual não oferece resolução desses casos; requerem fluxo autorizado separado antes de uso produtivo, sem heurística ou backfill automático.

Falha de snapshot DRE ou da auditoria agora aborta integralmente fecharMes, em vez de produzir fechamento incompleto. Os cálculos DRE existentes foram preservados. Instantes Date e o fechamento diário sem data usam America/Sao_Paulo; strings de data civil conservam o dia explicitamente informado. O novo teste PG cobre01:59Z/03:00Z na fronteira outubro/novembro, fechamento diário/mensal, reabertura e replay sem alterar a data econômica.

A migration foi ensaiada por psql -f em baseline físico pré-G001 gerado do Git; não se afirma replay do histórico real nem execução de prisma migrate deploy. O SQL G004 mantém BEGIN/COMMIT explícitos. O pipeline de implantação, seus limites transacionais, a identidade/cutover do banco real e os grants exigem homologação separada; build continuou MIGRATION_SKIPPED. A prova efetiva RLS não-owner é de leitura; não certifica escrita não-owner, permissões produtivas ou proteção contra DBA/owner.

saldoCarteiraGasto relê o ledger sob lock e valida a precisão legada em memória, duas vezes em um pagamento. O custo é linear no histórico e pode provocar timeout seguro de20s em contas extensas; esse limite de disponibilidade exige medição e homologação de carga antes de implantação. Não foi substituído por soma SQL que deixasse de validar as anomalias. As medições de8000 linhas das regressões G002 são locais e não certificam esse caminho nem RTT/carga produtivos.

Documento ligado a título não sustenta uma nova despesa. Documento ligado somente a movimento pode acompanhar outro fato com grupo/chave distintos: deduplicação de bytes não é identidade universal do fato. Associação foto/áudio e deduplicação entre intenções pertencem ao fluxo futuro G006/G010, sem afirmar aceite integral de mídia neste GOAL.

Exceção necessária à recusa definitiva: acesso_negado e operacao_conteudo_divergente conservam o recibo, pois não provam ausência de resultado anterior da identidade. O PG HTTP prova COMMIT sem resposta, grant revogado403 mantendo a chave e restauração de acesso com replay dos IDs, sem outro estorno. Os41 handlers G002 foram repetidos sobre essa versão final; os97 da rodada r3 continuam como prova dos writers/migration, e seus41 casos repetidos são deduplicados por arquivo+nome.
