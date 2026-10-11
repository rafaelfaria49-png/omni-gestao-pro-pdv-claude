# GOAL 002 — revisão 8, evidências anteriores ao congelamento

Executor OpenAI/Codex, exceção C4/ALTO expressamente ratificada pelo proprietário. Revisão R independente de outra família continua obrigatória. Tentativa oficial 1/3. Este relato não é aprovação R nem autorização para fechar/publicar antes dos gates.

Governança: PR #263 (merge normal 9f1b511a21ab98a924513428d465725e6839fdc2), contendo o BLOCKED rev7 oficial bfded919, com ledger anterior preservado, e a reativação do MESMO GOAL como revisão 8. Integração normal da main no produto: 7fab1d12ccb447dec318a7045b11c34cf21d8269. GOAL 001 continua DONE; GOAL 003 apenas acompanha plan_rev 8, sem iniciar.

## Correção localizada P2-1

O writer moderno preserva comercial={codigo,destino} somente para a recusa canônica de elegibilidade, no resultado inicial e no tombstone escrito após rollback do savepoint. Replay lê o motivo original, antes da situação atual; legado mantém RecebimentoInelegivelErroV3 quando o par é válido. O parser exige propriedades próprias, strings e par canônico. Histórico ausente/inválido não ganha motivo por backfill. Nenhuma mudança em identidade, fingerprint, locks, savepoint, prova terminal, fence ou ACK.

O hook publica orientação vinculada à loja/OS, visita (incluindo A→B→A/reload) e confirmação. Uma nova confirmação, também em outra instância do mesmo alvo, invalida a orientação anterior. Sucesso, recusa não comercial, incerteza posterior, reload e fechamento/reabertura limpam a apresentação. Pendência financeira continua exigindo a mesma confirmação e nunca recebe atalho comercial. V3 usa openOS; V4 fecha o sheet e usa goOrcamento/goFinanceiro. O motivo histórico não bloqueia uma nova operação legítima.

## Reprodução e validação preparatória

red-R8-cd69780.*: execução no HEAD exato cd69780c81b3bc159cd5f0810daabc98aae06a34, fontes lib/components intocados. Vinte falhas comportamentais esperadas: dez casos canônicos PG sem comercial; cinco motivos do hook; A→B→A; quatro cenários posteriores que exigem motivo inicial. 21 passam e 50 são excluídos somente pelo filtro -t R8. Exit 1 preservado; não é tentativa de check do candidato.

O PostgreSQL verifica resposta, registro durável, replay sem sequer duplicar recusa, comercial atual alterado, replay legado, conflito de conteúdo, matriz completa (rascunho/enviado e validade inclusos), oito históricos inválidos/ausentes e fotos econômicas. Os montados usam hook V3 e useV4Preview reais, actions controladas e navegação existente. E2E usa app local de produção e writers reais, muda apenas massa QA concorrente, fotografa ausência de efeitos no atalho e confirma operação nova após resolução sintética.

Os JSON/logs deste diretório são execuções preparatórias, com HEAD 7fab1d1 e WIP explícito nos hashes dos cinco fontes. Não representam o SHA congelado final. As provas finais, comando integral ratificado, check, baseline, pacote e R serão arquivados separadamente em review-rev8 para conservar o objeto funcional.

## Observações preparatórias preservadas

- A primeira montagem de V4 tentava R$ 100 como quitação de R$ 300; cenário corrigido para selecionar Pagamento parcial. O seletor V3 de OS-B era ambíguo; passou a selecionar o heading único. A prova focused intermediária e seus exits não foram ocultados.
- Lint apontou sonda de teste escrita durante render; passou a publicar a sonda em useEffect. Typecheck detectou a opção exact (de Playwright) num seletor Testing Library; removida, mantendo o nome textual exato da consulta.
- Typecheck encontrou dez cópias temporárias .ts/.tsx da proposta antiga sob docs. Apenas a extensão dessas cópias, fora do pacote selado, mudou para .snapshot.txt. Bytes preservados e mapeados em snapshots-proposta-rev7.json. ZIP e manifesto rev7 tiveram hashes conferidos; relatórios rev7 idênticos ao HEAD inicial 107640d.
- O primeiro build falhou EPERM no prisma generate porque o próprio runner mantinha a DLL carregada após o probe PG. Probe passou a processo curto separado, liberando a DLL antes do build. Build seguinte passou com MIGRATION_SKIPPED. Nenhuma migration, configuração global ou dependência alterada.

Nenhuma mutação produtiva, acesso administrativo produtivo, mudança nas OS reais ou início dos GOALs 003/008/datas retroativas. Worktrees, junction da base e WIP alheio preservados. Só servidores QA próprios têm encerramento programado no finally do runner.
