# Matriz de 80 casos — OMNI-PRINT-004C

Totais: PASS_REAL_SOFTWARE=52 · PASS_SIMULATED_TRANSPORT=13 · BLOCKED_HUMAN_GATE=6 · DEFERRED_PHYSICAL_HARDWARE=9

Nenhum PASS_SIMULATED_TRANSPORT é impressão física. Cenários S## = tools/print-004c-e2e/scenarios.pg.test.ts; PW# = e2e/specs/print-direct-004c.spec.ts; unit = lib/printing/direct/*.test.ts e tools/omni-print-agent/*.test.ts.

| ID | Caso | Resultado | Evidência |
|---|---|---|---|
| P01 | Normalização de comando equivalente | PASS_REAL_SOFTWARE | S02 (uiContextId diferente por envelope → mesmo job); ressalva histórica resolvida |
| P02 | Mesmo key com comando diferente | PASS_REAL_SOFTWARE | S22 (REQUEST_CONFLICT com comando alterado) |
| P03 | Texto com ESC/GS/DLE/NUL, C0/C1 e DEL | PASS_REAL_SOFTWARE | unit P03 + S19 (ESC/GS/DLE/C0/C1/DEL/bidi inertes; NUL recusado pelo PostgreSQL) |
| P04 | HTML, atributos, logo e rodapé maliciosos | PASS_REAL_SOFTWARE | S28/PW8 (HTML do navegador gerado e escapado no servidor, sem script) + S19 |
| P05 | Encoding e largura 58/80 mm | PASS_REAL_SOFTWARE | unit 58/80 (≤32/≤48 colunas, WPC1252 ã/ç/É, ESC t 16) + S03; aparência no papel em F02 |
| P06 | Snapshot imutável por via | PASS_REAL_SOFTWARE | unit P06 (duas renderizações byte a byte) + S23 (imutabilidade); ressalva histórica resolvida |
| P07 | Agregação de vias aceitas/incertas/falhas | PASS_REAL_SOFTWARE | unit P07 (ACEITO+INCERTO → PARCIAL sem retry da incerta) + S26; ressalva histórica resolvida |
| P08 | Matriz de transições inválidas | PASS_REAL_SOFTWARE | S23 (transições/imutabilidade/exclusão recusadas no banco) + R4 |
| P09 | Segunda via e teste versus gaveta | PASS_REAL_SOFTWARE | unit (INITIAL/REPRINT sem pulso de gaveta; validador recusa ESC p); teste sintético não exposto |
| P10 | Documentos PENDING/quarentena e estado comercial | PASS_REAL_SOFTWARE | S05/PW2 (venda pendente nunca imprime) + S22 (quarentena) + S14 |
| P11 | Limites de comando, itens, vias e payload | PASS_REAL_SOFTWARE | S21 (COMMAND_LIMIT/SNAPSHOT_LIMIT/PAYLOAD_LIMIT/ITEM_LIMIT, zero efeitos) + S18; ressalva histórica resolvida |
| P12 | Grant expirado/revogado e replay após cleanup | PASS_REAL_SOFTWARE | S15 (sessionVersion/usuário inativo/delegação → AUTHORIZATION_LOST); limpeza não implementada (D03) |
| P13 | Minimização e logs | PASS_REAL_SOFTWARE | S19 (CPF fora do snapshot; nenhuma credencial/cipher na resposta) |
| P14 | Venda histórica sem job anterior | PASS_REAL_SOFTWARE | S24 (segunda via de venda sem job anterior fecha o slot INITIAL) |
| P15 | Ações permitidas com payload expirado | PASS_REAL_SOFTWARE | unit (payload expirado não permite retry) + retry() exige payload vigente |
| P16 | Equivalência de intenção entre principais autorizados | PASS_REAL_SOFTWARE | S02 (dois usuários autorizados convergem no mesmo INITIAL) |
| B01 | Duas criações INITIAL concorrentes, keys distintas | PASS_REAL_SOFTWARE | S02 (duas criações INITIAL concorrentes → 1 job) |
| B02 | Duas abas, manual versus automático e dois usuários | PASS_REAL_SOFTWARE | S02 + PW5 (abas/usuários/manual×auto convergem) |
| B03 | Dois terminais/destinos ou versão/vias diferentes | PASS_REAL_SOFTWARE | S03 (outro terminal converge) + S30 (TERMINAL_MISMATCH para venda de outro caixa) |
| B04 | Replay idêntico, resposta perdida após commit | PASS_REAL_SOFTWARE | S09 (POST reenviado) + S13 (consentimento repetido converge) |
| B05 | Replay alterado e outra identidade com key conhecida | PASS_REAL_SOFTWARE | S22 (chave conhecida com outra identidade → REQUEST_EXPIRED) |
| B06 | Crash/rollback antes do commit T1 | PASS_REAL_SOFTWARE | S21 (falha antes do commit T1 deixa zero linhas) |
| B07 | Crash após T1 e antes de T2/T3 | PASS_SIMULATED_TRANSPORT | S10/PW6 (sem T3: lease vence → não enviado, retry explícito imprime uma vez) |
| B08 | Dois executores disputam uma via | PASS_SIMULATED_TRANSPORT | S25 + two-agents.pg (2 processos reais, mesma credencial, perdas de resposta, kill -9: 0 duplicatas em 3 execuções) |
| B09 | Lease expira antes de T3 e executor antigo acorda | PASS_SIMULATED_TRANSPORT | S10/S12 (lease vencido: nada é reivindicável, sem impressão tardia) |
| B10 | Crash após T3 antes da chamada e após envio antes de T4 | PASS_SIMULATED_TRANSPORT | S11 (crash após envio: UNKNOWN) + S12 + two-agents (kill -9 e reinício) |
| B11 | Revogação concorre com T3 | PASS_REAL_SOFTWARE | S15 (revogação antes da T3 → cópia expirada, nada enviado; sequencial) |
| B12 | Correção/cancelamento da venda concorre com criação/envio | PASS_REAL_SOFTWARE | S14 (cancelamento/correção após o job → cópia cancelada) |
| B13 | Bindings e previousJobId de outra loja | PASS_REAL_SOFTWARE | S04 (vínculos/agentes/provas de outra loja recusados) |
| B14 | Duas confirmações concorrentes de segunda via | PASS_REAL_SOFTWARE | S25 (duas confirmações concorrentes da segunda via → 1 job) |
| B15 | Múltiplas vias com aceite/falha/incerteza parcial | PASS_SIMULATED_TRANSPORT | S26 (2 vias: aceite + falha → PARCIAL; retry só da não enviada) |
| B16 | Evidência/callback duplicado e atrasado | PASS_REAL_SOFTWARE | S22 (UNKNOWN tardio não rebaixa; NO_EFFECT após aceite → RESULT_CONFLICT) + S09 |
| B17 | Retenção de payload sem remoção de dedup | BLOCKED_HUMAN_GATE | D03 retenção/expurgo de payload não aprovado; expurgo não implementado |
| B18 | Remoção posterior de tombstone de requisição | BLOCKED_HUMAN_GATE | D03 remoção de tombstone de requisição não aprovada |
| B19 | Retenção/arquivamento de marca inicial | BLOCKED_HUMAN_GATE | D03 retenção/arquivamento da marca inicial (ressalva histórica mantida no gate) |
| B20 | Auditoria e falha de persistência | PASS_REAL_SOFTWARE | eventos por transição; S21/S23 (rollback integral, sem auditoria parcial) |
| B21 | Dois jobs compartilham fila física | PASS_SIMULATED_TRANSPORT | S19/S26 (um destino admite uma tentativa por vez; fila serializada) |
| B22 | REPRINT histórico concorre com INITIAL | PASS_REAL_SOFTWARE | S24 (REPRINT histórico fecha INITIAL; sequencial) |
| B23 | INITIAL após REPRINT histórico e após cleanup | PASS_REAL_SOFTWARE | S24 (INITIAL após REPRINT histórico recusado); após limpeza → D03 |
| B24 | Emissão substituta seguida de reconciliação antiga como não enviada | PASS_REAL_SOFTWARE | S26 (via substituída não volta) + S28 (navegador cancela vias térmicas seguras) |
| B25 | Executor A pausa após T3, posse do destino vence, B de outro job/loja disputa e A retorna | PASS_SIMULATED_TRANSPORT | S07/S12/S29 (destino retido até prova; outro job aguarda) |
| B26 | INITIAL A4 concorre com INITIAL térmico | BLOCKED_HUMAN_GATE | D01.5: A4/legado não migrado ao ledger; alternativa do navegador é registrada (S28/PW8/PW9) |
| I01 | A01/PLATFORM com loja explícita | PASS_REAL_SOFTWARE | S22 (A01/PLATFORM com loja explícita) |
| I02 | STORE autorizado com módulo/papel efetivos | PASS_REAL_SOFTWARE | S01/PW1 (STORE autorizado) |
| I03 | Usuário sem permissão, módulo ou de outra loja | PASS_REAL_SOFTWARE | S15 (papel técnico/inativo/sessão) + S22 (módulo removido) |
| I04 | Reader canônico PDV/sales e propriedade da venda | PASS_REAL_SOFTWARE | S04 (leitor escopado por loja; venda de outra loja → 404) |
| I05 | Documento inexistente, pendente, cancelado ou em quarentena | PASS_REAL_SOFTWARE | S05/S14/S22 (inexistente/pendente/cancelada/quarentena) |
| I06 | Terminal/impressora incompatíveis e deviceId forjado | PASS_REAL_SOFTWARE | S22 (terminal inativo → TERMINAL_UNAVAILABLE) + S30 (navegador não autorizado → DEVICE_NOT_AUTHORIZED) |
| I07 | Pareamento, desafio repetido e segredo compartilhado | PASS_REAL_SOFTWARE | S22 (código de pareamento de uso único) + S16 (token inválido/revogado) |
| I08 | Duas lojas no computador e dois terminais na loja | PASS_SIMULATED_TRANSPORT | S04 (dois agentes/lojas) + S03 (dois terminais na loja) |
| I09 | Substituição/renomeação de computador ou fila | PASS_SIMULATED_TRANSPORT | unit PRINTER_NOT_FOUND + S16 (revogar/parear novo computador) |
| I10 | Binding revogado antes e depois de início | PASS_REAL_SOFTWARE | S16 (instalação revogada derruba vínculos; antes da T3 → BINDING_CHANGED) |
| I11 | Troca de loja/configuração durante solicitação | PASS_REAL_SOFTWARE | S15 (STORE_CONTEXT_CONFLICT) + geração/descartes no cliente |
| I12 | Logout/revogação e ACK atrasado | BLOCKED_HUMAN_GATE | G-AUTH: logout comum não incrementa sessionVersion (revogação por sessionVersion = PASS em S15) |
| I13 | Input de bytes, HTML, host/porta/URL/path/credenciais | PASS_REAL_SOFTWARE | S18 (host/porta/bytes/URL/HTML recusados como campos desconhecidos) |
| I14 | Origin/CSRF e consultas/replays sem autorização | PASS_REAL_SOFTWARE | S15 (Origin/CSRF) + S04 (consultas cruzadas) |
| I15 | Adaptador aceita; conexão/resposta HTTP se perde | PASS_SIMULATED_TRANSPORT | S09 (resposta HTTP perdida em claim/report) |
| I16 | Falha comprovada antes de envio | PASS_SIMULATED_TRANSPORT | S06/S07/S08/PW3 (falha comprovada antes do envio) |
| I17 | Timeout, lease vencido e consulta não encontrado | PASS_SIMULATED_TRANSPORT | S12 (consulta 'não encontrado no diário' mantém UNKNOWN, zero reenvio); ressalva histórica resolvida |
| I18 | Cancelamento solicitado após aceite/spooler | DEFERRED_PHYSICAL_HARDWARE | cancelamento na fila do Windows exige fila real; nenhuma ação de cancelar após aceite é oferecida |
| I19 | Capacidades ausentes/limitadas do adaptador | PASS_SIMULATED_TRANSPORT | unit (pausada/sem papel/erro/não encontrada) + host PowerShell real (inventário, status, OpenPrinter inexistente) |
| I20 | Fila offline com entrega tardia | DEFERRED_PHYSICAL_HARDWARE | entrega tardia pela fila offline do Windows só é observável com impressora física |
| I21 | Segundo job de reimpressão e venda histórica sem anterior | PASS_REAL_SOFTWARE | S13/S24 |
| I22 | Segunda via após resultado incerto | PASS_REAL_SOFTWARE | S20/S29/PW9 (segunda via após incerto; nada reenviado sozinho) |
| I23 | Fallback explícito antes/depois de envio possível | PASS_REAL_SOFTWARE | PW8/PW9/S28 (navegador só por clique, registrado, SEGUNDA VIA quando aplicável); papel em F07 |
| I24 | Gaveta em inicial, segunda via e teste | PASS_REAL_SOFTWARE | unit (nenhuma via com gaveta) |
| I25 | Integridade comercial em sucesso, erro, retry e crash | PASS_REAL_SOFTWARE | S20 + PW1 (digest de todas as tabelas comerciais inalterado) |
| I26 | Rate limit, payload expirado e grant invalidado | PASS_REAL_SOFTWARE | S18 (rate limit) + S15 (grant invalidado) + unit (payload expirado) |
| I27 | Concessão adulterada, callback falso e replay entre instalações | PASS_REAL_SOFTWARE | unit (token adulterado/domínio errado) + S04 (prova de outra instalação → 403) + S16 |
| I28 | Segunda via/fallback omite previousJobId com job incerto conhecido | PASS_REAL_SOFTWARE | S13/S28 (risco descoberto pelo servidor; sem previousJobId) |
| I29 | Risco muda entre preparação, T1 e T3; reconhecimento aponta outra via/revisão | PASS_REAL_SOFTWARE | S27 (consentimento obsoleto) + S29 (risco muda na T3 → RISK_CHANGED) |
| I30 | Via substituta autorizada e resposta antiga reconciliada depois | PASS_REAL_SOFTWARE | S26 (via substituída + callback antigo 'sem efeito' segue sem retry) |
| I31 | A4/fallback com destino lógico e replay de criação | BLOCKED_HUMAN_GATE | D01.5: A4 lógico não exposto no ledger 004C |
| F01 | Windows + Chrome e Windows + Edge | DEFERRED_PHYSICAL_HARDWARE | automatizado só em Chromium (Playwright); Windows+Chrome/Edge com impressora pendente |
| F02 | Perfil térmico 58 mm e 80 mm | DEFERRED_PHYSICAL_HARDWARE | perfis 58/80 validados em bytes; papel real pendente |
| F03 | Frio/quente, reinício, desligamento e falta de papel | DEFERRED_PHYSICAL_HARDWARE | frio/quente, reinício, desligamento e falta de papel com impressora real |
| F04 | Duas vias, falha parcial e resposta perdida real | DEFERRED_PHYSICAL_HARDWARE | duas vias e resposta perdida reais |
| F05 | Fila padrão trocada/removida e binding revogado | DEFERRED_PHYSICAL_HARDWARE | fila padrão trocada/removida e vínculo revogado com fila real |
| F06 | Gaveta desligada e teste sintético | DEFERRED_PHYSICAL_HARDWARE | gaveta desligada verificada em bytes; teste físico pendente |
| F07 | A4 e fallback em Chrome/Edge | DEFERRED_PHYSICAL_HARDWARE | impressão do navegador em Chrome/Edge com impressora real |
