# Matriz de aceitação 004B — 80 IDs preservados

Execução core-6909ccad em v24.19.0. PASS é restrito ao núcleo interno sintético e PostgreSQL descartável. Integração real, políticas D03/D04 e homologação permanecem separadas.

Resultado: 53 PASS, 0 FAIL, 27 DEFERRED. 35 provas executáveis do núcleo. R01/R02 têm IDs adicionais.

| ID | Estado | Cenário | Prova ou impedimento |
|---|---|---|---|
| B01 | PASS | Duas criações INITIAL concorrentes, keys distintas | CORE-CONCURRENT-INITIAL |
| B02 | PASS | Duas abas, manual versus automático e dois usuários | CORE-CONCURRENT-INITIAL |
| B03 | PASS | Dois terminais/destinos ou versão/vias diferentes | CORE-SEMANTIC-CONFLICT, CORE-NORMALIZATION |
| B04 | PASS | Replay idêntico, resposta perdida após commit | CORE-REPLAY-LOST-RESPONSE |
| B05 | PASS | Replay alterado e outra identidade com key conhecida | CORE-REPLAY-LOST-RESPONSE |
| B06 | PASS | Crash/rollback antes do commit T1 | CORE-ATOMIC-T1 |
| B07 | PASS | Crash após T1 e antes de T2/T3 | CORE-ATOMIC-T1 |
| B08 | PASS | Dois executores disputam uma via | CORE-TWO-EXECUTORS |
| B09 | PASS | Lease expira antes de T3 e executor antigo acorda | CORE-LEASE-FENCING |
| B10 | PASS | Crash após T3 antes da chamada e após envio antes de T4 | CORE-CRASH-UNKNOWN, CORE-CRASH-BEFORE-CALL |
| B11 | PASS | Revogação concorre com T3 | CORE-REVOCATION, CORE-REVOCATION-CONCURRENT-T3 |
| B12 | PASS | Correção/cancelamento da venda concorre com criação/envio | CORE-FINGERPRINT, CORE-REVIEW-REGRESSIONS |
| B13 | PASS | Bindings e previousJobId de outra loja | CORE-CROSS-SCOPE |
| B14 | PASS | Duas confirmações concorrentes de segunda via | CORE-REPRINT-COALESCENCE |
| B15 | PASS | Múltiplas vias com aceite/falha/incerteza parcial | CORE-PARTIAL-COPIES |
| B16 | PASS | Evidência/callback duplicado e atrasado | CORE-CRASH-UNKNOWN |
| B17 | PASS | Retenção de payload sem remoção de dedup | CORE-PURGE-REQUEST-EXPIRY |
| B18 | PASS | Remoção posterior de tombstone de requisição | CORE-PURGE-REQUEST-EXPIRY |
| B19 | PASS | Retenção/arquivamento de marca inicial | CORE-PURGE-REQUEST-EXPIRY, CORE-HISTORICAL-CLOSURE |
| B20 | PASS | Auditoria e falha de persistência | CORE-ATOMIC-T1, CORE-DEFERRED-COMMIT-AND-IMMUTABILITY, CORE-AUDIT-FAILURE-AFTER-T3 |
| B21 | PASS | Dois jobs compartilham fila física | CORE-SHARED-DESTINATION |
| B22 | PASS | REPRINT histórico concorre com INITIAL | CORE-HISTORICAL-INITIAL-RACE |
| B23 | PASS | INITIAL após REPRINT histórico e após cleanup | CORE-PURGE-REQUEST-EXPIRY |
| B24 | PASS | Emissão substituta seguida de reconciliação antiga como não enviada | CORE-REPLACEMENT-LATE-NO-EFFECT |
| B25 | PASS | Executor A pausa após T3, posse do destino vence, B de outro job/loja disputa e A retorna | CORE-SHARED-DESTINATION |
| B26 | PASS | INITIAL A4 concorre com INITIAL térmico | CORE-A4-THERMAL-SLOT |
| F01 | DEFERRED | Windows + Chrome e Windows + Edge | Homologação física/navegador/transporte real fora do GOAL. Nenhuma simulação foi usada como prova de hardware, papel, gaveta, pareamento ou A4 real. |
| F02 | DEFERRED | Perfil térmico 58 mm e 80 mm | Homologação física/navegador/transporte real fora do GOAL. Nenhuma simulação foi usada como prova de hardware, papel, gaveta, pareamento ou A4 real. |
| F03 | DEFERRED | Frio/quente, reinício, desligamento e falta de papel | Homologação física/navegador/transporte real fora do GOAL. Nenhuma simulação foi usada como prova de hardware, papel, gaveta, pareamento ou A4 real. |
| F04 | DEFERRED | Duas vias, falha parcial e resposta perdida real | Homologação física/navegador/transporte real fora do GOAL. Nenhuma simulação foi usada como prova de hardware, papel, gaveta, pareamento ou A4 real. |
| F05 | DEFERRED | Fila padrão trocada/removida e binding revogado | Homologação física/navegador/transporte real fora do GOAL. Nenhuma simulação foi usada como prova de hardware, papel, gaveta, pareamento ou A4 real. |
| F06 | DEFERRED | Gaveta desligada e teste sintético | Homologação física/navegador/transporte real fora do GOAL. Nenhuma simulação foi usada como prova de hardware, papel, gaveta, pareamento ou A4 real. |
| F07 | DEFERRED | A4 e fallback em Chrome/Edge | Homologação física/navegador/transporte real fora do GOAL. Nenhuma simulação foi usada como prova de hardware, papel, gaveta, pareamento ou A4 real. |
| I01 | DEFERRED | A01/PLATFORM com loja explícita | Contexto A01 confiável de fixture usa guards reais; integração com endpoint/sessão de autenticação real não foi autorizada. |
| I02 | DEFERRED | STORE autorizado com módulo/papel efetivos | Papéis, módulos e vínculos STORE de fixture exercitam os guards reais; requireEnterprise/rotas/sessão real continuam fora do núcleo. |
| I03 | PASS | Usuário sem permissão, módulo ou de outra loja | CORE-AUTHORITY, CORE-REPLAY-LOST-RESPONSE |
| I04 | DEFERRED | Reader canônico PDV/sales e propriedade da venda | Reader isolado usa SELECT coerente, projeção e mapper existentes. Não foi extraído/conectado o reader da rota canônica nem alterada sua ACL. |
| I05 | PASS | Documento inexistente, pendente, cancelado ou em quarentena | CORE-ELIGIBILITY, CORE-REVIEW-REGRESSIONS |
| I06 | DEFERRED | Terminal/impressora incompatíveis e deviceId forjado | Vínculos e terminal ACTIVE são testados no banco. Identidade/prova real de instalação, computador ou impressora requer gate de adaptador. |
| I07 | DEFERRED | Pareamento, desafio repetido e segredo compartilhado | Pareamento/challenge/segredos por instalação reais fora do 004B. HMAC de fixture não certifica esse mecanismo. |
| I08 | DEFERRED | Duas lojas no computador e dois terminais na loja | O banco usa duas lojas e terminais com destino compartilhado sintético; o cenário de duas lojas no computador com pareamento real está pendente. |
| I09 | DEFERRED | Substituição/renomeação de computador ou fila | Provisionamento, substituição e renomeação de fila/computador exigem instalação/prova reais. Nenhuma fila Windows foi consultada. |
| I10 | DEFERRED | Binding revogado antes e depois de início | Revalidação de binding existe no núcleo, mas o workflow completo de revogação/configuração por instalação não foi integrado/homologado. Delegação sintética tem prova separada. |
| I11 | DEFERRED | Troca de loja/configuração durante solicitação | Loja e destino são fixos no ledger; troca de contexto da UI, descarte de resposta e handlers reais não foram conectados. |
| I12 | DEFERRED | Logout/revogação e ACK atrasado | Revogação de delegação/sessionVersion sintéticas testadas; logout global e ACK de instalação real não foram alterados nem certificados. |
| I13 | PASS | Input de bytes, HTML, host/porta/URL/path/credenciais | CORE-INPUT |
| I14 | DEFERRED | Origin/CSRF e consultas/replays sem autorização | Não há API pública nova. Origin/CSRF/cache/headers e sessão de consulta real requerem gate de integração. |
| I15 | PASS | Adaptador aceita; conexão/resposta HTTP se perde | CORE-CRASH-UNKNOWN, CORE-AUDIT-FAILURE-AFTER-T3 |
| I16 | PASS | Falha comprovada antes de envio | CORE-PARTIAL-COPIES |
| I17 | PASS | Timeout, lease vencido e consulta não encontrado | CORE-CRASH-BEFORE-CALL, CORE-SHARED-DESTINATION |
| I18 | DEFERRED | Cancelamento solicitado após aceite/spooler | Cancelamento seguro de vias locais não comprova cancelamento de fila/spooler nem ausência de papel. |
| I19 | DEFERRED | Capacidades ausentes/limitadas do adaptador | Não existe adaptador real neste GOAL; capacidades, prazos de dedup e consultas de fornecedor precisam de evidência própria. |
| I20 | DEFERRED | Fila offline com entrega tardia | Pausa/egresso tardio simulados não homologam fila offline, autenticação ou entrega real após revogação. |
| I21 | PASS | Segundo job de reimpressão e venda histórica sem anterior | CORE-HISTORICAL-CLOSURE, CORE-RISK-NOT-SELF-INVALIDATING |
| I22 | PASS | Segunda via após resultado incerto | CORE-REPLACEMENT-LATE-NO-EFFECT |
| I23 | DEFERRED | Fallback explícito antes/depois de envio possível | Substituição lógica e supressão são testadas; UI/handoff/fallback reais não foram habilitados. |
| I24 | PASS | Gaveta em inicial, segunda via e teste | CORE-SYNTHETIC-TEST, CORE-POSITIVE |
| I25 | PASS | Integridade comercial em sucesso, erro, retry e crash | CORE-COMMERCIAL-INTEGRITY |
| I26 | DEFERRED | Rate limit, payload expirado e grant invalidado | Limites, rate limit e retenção são somente fixtures finitas. D03 produtivo, incluindo composição loja/terminal, não está aprovado. |
| I27 | DEFERRED | Concessão adulterada, callback falso e replay entre instalações | MAC/AAD/correlação de fixture são testados; assinatura, segredo e replay entre instalações reais requerem gate de adaptador. |
| I28 | PASS | Segunda via/fallback omite previousJobId com job incerto conhecido | CORE-REPLACEMENT-LATE-NO-EFFECT |
| I29 | PASS | Risco muda entre preparação, T1 e T3; reconhecimento aponta outra via/revisão | CORE-STALE-RISK-T0-T1, CORE-RISK-NOT-SELF-INVALIDATING, CORE-REPLACEMENT-LATE-NO-EFFECT |
| I30 | PASS | Via substituta autorizada e resposta antiga reconciliada depois | CORE-REPLACEMENT-LATE-NO-EFFECT |
| I31 | DEFERRED | A4/fallback com destino lógico e replay de criação | A4 tem somente identidade/slot/replay lógico. Execução é bloqueada com A4_LOGICAL_ONLY antes de T3; navegador legado não foi alterado. |
| P01 | PASS | Normalização de comando equivalente | CORE-NORMALIZATION |
| P02 | PASS | Mesmo key com comando diferente | CORE-NORMALIZATION, CORE-REPLAY-LOST-RESPONSE |
| P03 | PASS | Texto com ESC/GS/DLE/NUL, C0/C1 e DEL | CORE-PURE-CRYPTO-AND-CANONICAL, CORE-POSITIVE |
| P04 | DEFERRED | HTML, atributos, logo e rodapé maliciosos | HTML, atributos, logo e rodapé dos renderers reais ainda precisam de revisão. O renderer novo emite somente JSON de fixture; nenhum HTML é executado. |
| P05 | DEFERRED | Encoding e largura 58/80 mm | 58/80 mm e encoding térmico exigem renderer/driver/perfil reais. JSON UTF-8 de fixture não homologa largura ou caracteres do equipamento. |
| P06 | PASS | Snapshot imutável por via | CORE-POSITIVE, CORE-DEFERRED-COMMIT-AND-IMMUTABILITY |
| P07 | PASS | Agregação de vias aceitas/incertas/falhas | CORE-PARTIAL-COPIES |
| P08 | PASS | Matriz de transições inválidas | CORE-LEASE-FENCING, CORE-CRASH-UNKNOWN, CORE-DEFERRED-COMMIT-AND-IMMUTABILITY |
| P09 | PASS | Segunda via e teste versus gaveta | CORE-POSITIVE, CORE-SYNTHETIC-TEST |
| P10 | PASS | Documentos PENDING/quarentena e estado comercial | CORE-ELIGIBILITY, CORE-REVIEW-REGRESSIONS |
| P11 | PASS | Limites de comando, itens, vias e payload | CORE-INPUT |
| P12 | PASS | Grant expirado/revogado e replay após cleanup | CORE-PURGE-REQUEST-EXPIRY |
| P13 | PASS | Minimização e logs | CORE-POSITIVE, CORE-AUTHORITY |
| P14 | PASS | Venda histórica sem job anterior | CORE-HISTORICAL-CLOSURE |
| P15 | PASS | Ações permitidas com payload expirado | CORE-PURGE-REQUEST-EXPIRY |
| P16 | PASS | Equivalência de intenção entre principais autorizados | CORE-CONCURRENT-INITIAL |
