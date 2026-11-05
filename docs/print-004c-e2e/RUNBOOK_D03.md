# Roteiro operacional D03-A

Preparado para revisão e ensaiado somente em PostgreSQL descartável. **Não autoriza executar job, criar papel, gerar chaves, mudar ambiente ou agendar em produção.** `APPROVED_RELEASE=null`, `PRODUCTION_CRON=DISABLED`, `PHYSICAL_HOMOLOGATION=PENDING`.

## 1. Preparar uma execução futura

1. Obter liberação escrita para o ambiente, loja, executor e janela. Conferir D02 aplicado/registrado conforme seu próprio runbook, backup/PITR e o commit aprovado de D03.
2. Usar o Node 24 e dependências do checkout revisado. Executar `node tools/print-d02/generate.mjs --check`; nenhuma migration D02 é alterada/aplicada por D03.
3. O DBA provisiona um papel `omni_print_retention`, sem superuser, create-role, create-db, bypass-RLS ou membership no dono da aplicação. Conceder CONNECT apenas ao banco selecionado, USAGE de `public` e o template `tools/print-d03/least-privilege.sql`. Não conceder leitura de vendas/usuários nem DELETE/DDL. A credencial é exclusivamente de operação interna, nunca fornecida ao caixa/lojista.
4. Receber a credencial em secret store. Carregar `OMNI_PRINT_RETENTION_DATABASE_URL` só na sessão protegida. Não usar arquivo `.env`, argumento com senha, print da variável, shell tracing ou log de conexão. O job não precisa de `OMNI_PRINT_CONTENT_KEY` nem `OMNI_PRINT_SIGNING_KEY`.
5. Conferir host, porta/endpoint, banco e papel no ambiente protegido. `--expect-host`/`--expect-db` recusam divergência de URL; o CLI confere também `current_database()`. Nunca executar usando credencial de owner por conveniência.

## 2. Simular, conferir e executar

Exemplos PowerShell com placeholders. Atribuir a URL por mecanismo protegido, sem colá-la em relatório. No Bash use `export` para as mesmas variáveis.

```powershell
# OMNI_PRINT_RETENTION_DATABASE_URL já injetada pelo ambiente protegido.
$D03 = @('--expect-host', '<host-conferido>', '--expect-db', '<banco-conferido>', '--store', '<id-da-loja>', '--batch-size', '25')
node node_modules/tsx/dist/cli.mjs tools/print-d03/run.ts @D03 --dry-run
```

Sem `--execute`, toda chamada é simulação. Rever a contagem por tipo e `errors`, `busyDocuments`, `oversizedDocuments`. Guardar somente o JSON de métricas, commit, operador, ambiente/loja selecionados e horário. Elegíveis são candidatos revalidados sob lock naquela página, não uma contagem global do banco.

Somente após a autorização específica de execução:

```powershell
$env:OMNI_PRINT_RETENTION_ENABLED = '1'
node node_modules/tsx/dist/cli.mjs tools/print-d03/run.ts @D03 --execute
Remove-Item Env:OMNI_PRINT_RETENTION_ENABLED
```

Para continuar uma passagem, adicionar `--after <nextDocumentId>` retornado. Cada chamada mantém limites e revalida o estado. **Não usar laço ilimitado**: impor orçamento de páginas/tempo no operador futuro. Ao terminar (`hasMore=false`), a próxima passagem começa sem `--after`; também revisita ocupados/falhas. A simulação e a execução são consultas distintas; diferenças de contagem sob concorrência são esperadas.

Saídas: `0` página concluída, `2` opções/habilitação/alvo recusados, `3` erro de execução ou documento acima do limite. Recusa não mostra URL, SQL nem mensagem bruta do driver. Ocupados são reportados e revisitados na próxima passagem.

## 3. Interrupção, falha e retomada

| Caso | Procedimento |
|---|---|
| Falha antes de COMMIT | conteúdo e evento voltam juntos; repetir a página após verificar a causa |
| Resposta perdida depois de COMMIT | repetir é seguro; filtros de conteúdo/carimbo impedem reexpurgo e novo evento |
| Dois operadores/jobs | documento ocupado é pulado por `SKIP LOCKED`; não aumentar timeout nem matar sessões de venda |
| `DATABASE_TIMEOUT` / `DATABASE_BUSY` | parar a passagem se recorrente, verificar carga e repetir em nova janela; transação tem limites próprios |
| `DATABASE_ACCESS_DENIED` | conferir a credencial e grants mínimos; nunca trocar para owner como fallback |
| `RETENTION_FAILED` | preservar e investigar em ambiente protegido; não registrar erro bruto em canal aberto |
| `oversizedDocuments>0` | preservar o documento; registrar necessidade de evolução para processamento limitado desse volume; não reduzir provas nem editar histórico |
| UNKNOWN, fila retida ou falta de timestamp final | preservação esperada; investigação da operação, nunca forçar estado final para liberar expurgo |

Para desativar, remover `OMNI_PRINT_RETENTION_ENABLED`/não invocar `--execute`. Nenhum cron foi criado. Futuro agendador deverá ser instalado **desabilitado**, usar conta/grants próprios, impedir loops sem orçamento, guardar métricas e reiniciar cada passagem do começo. Ativação produtiva exige nova autorização e não faz parte desta PR.

## 4. Gestão de chaves (procedimento, sem gerar segredos nesta entrega)

- Designar responsável e substituto, com acesso auditado ao secret store. Gerar **dois** valores independentes de 32 bytes de CSPRNG no ambiente autorizado; conteúdo e assinatura não podem ser iguais. Nunca usar senhas humanas/UUIDs como chaves nem reutilizar chave de outra função.
- Guardar somente em `OMNI_PRINT_CONTENT_KEY` e `OMNI_PRINT_SIGNING_KEY`, com codificação base64/base64url canônica. Nunca em Git, banco, chat, logs, tickets ou `.env` distribuído. O CLI de retenção não deve recebê-las.
- Manter inventário fora do segredo: responsável, data de criação, próxima revisão (anual), `keyRef` de conteúdo, identificador da versão no secret store, aprovação e instante de revogação. A referência da assinatura fica no inventário operacional; o schema atual não possui coluna dessa versão.
- Rotação a cada ano, e imediatamente sob suspeita de exposição. Revogar acessos da pessoa/aplicação comprometida; verificar separadamente se a credencial do agente também foi exposta (revogação/novo pareamento pelo fluxo já existente). Não mudar autenticação de usuários nesta tarefa.

## 5. Rotação planejada

1. Escolher baixo movimento e registrar autorização. Coordenar uma pausa humana no caixa para não solicitar novas impressões, **mantendo o gate ligado enquanto recebe os relatos pendentes**. Não existe pausa seletiva de emissão no runtime atual: desligar o gate global também recusa `agentReport` com 404. Não apagar diário, sendKey, lease, slot inicial ou evidência para esvaziar fila.
2. Conferir vias READY/SENDING/UNKNOWN e filas retidas. Esperar conclusão comprovada quando possível; **não** tratar timeout como prova de não impressão. Qualquer UNKNOWN fica para investigação/segunda via explícita.
3. Trocar o par no ambiente protegido, publicar a configuração autorizada em todas as instâncias e retirar versões antigas da rota. Evitar frota indefinidamente misturada. Registrar referências/datas sem registrar as chaves. Esse passo é procedimento futuro, não executado pelo D03.
4. Testar em ambiente autorizado: nova venda, leitura de estado, relato atrasado e nova cotação de segunda via. Confirmar que chaves distintas/32 bytes são aceitas e uma chave antiga/token antigo é recusado.
5. Conteúdo da chave anterior deixa de ser aberto (`CONTENT_UNAVAILABLE`); token de consentimento anterior deixa de validar (`INVALID_PROOF`). Não existe aceitação de chave anterior/keyring automático. Requisição já preparada continua sujeita ao ledger e a seus prazos; repetir requestKey converge, não cria outro original.
6. No cenário S32, claim com conteúdo antigo em voo é pulado; o agente segue e a tentativa pode tornar-se UNKNOWN. Ele nunca recebe ordem para reenviar uma via incerta. Relato atrasado usa a credencial do agente e ainda pode registrar a prova. Uma via antiga READY ilegível não deve entrar em laço de retry; usar investigação e segunda via reconstruída, autorizada e marcada.
7. Revogar/desabilitar a versão antiga no secret store segundo o plano autorizado; não reintroduzi-la em produção para contornar falha de conteúdo. Retomar solicitações só depois de conferir saúde e referências em todas as instâncias.

## 6. Suspeita de vazamento, perda de chave e recuperação

- Sob suspeita, interromper novas emissões e rotacionar/revogar imediatamente pelo procedimento autorizado. Se a emergência exigir desligar o gate global, os relatos também serão recusados temporariamente: devem continuar no diário para replay após a retomada, **sem reenviar os bytes da via**. Preservar o ledger e diário para investigação. Exposição do conteúdo não é resolvida apenas pelo expurgo lógico: avaliar separadamente backups, acessos e política de incidente.
- Perda da chave de conteúdo torna o conteúdo antigo indisponível. O sistema não oferece recuperação dessa chave pelo banco. Segunda via é reconstruída da venda confirmada após autorização e consentimento; provas/identidades permanecem. Perda da assinatura invalida tokens; obter nova cotação.
- Falha de rollout: manter desligado e corrigir a configuração. Nunca restaurar conteúdo expurgado, reabrir INITIAL, limpar diário ou liberar manualmente tentativa UNKNOWN para “resolver a fila”.
- Backup/PITR: restauração integral é ação administrativa fora dos gatilhos de imutabilidade e pode trazer conteúdo e estado antigos. **Não abrir o serviço diretamente de um backup anterior.** Isolar a recuperação, reconciliar tombstones de expurgo e identidades/relatos até o incidente e provar novamente a deduplicação; o plano específico exige autorização própria. Não prometer irrecuperabilidade física enquanto WAL/backups ainda retêm versões cifradas.
- O expurgo não revoga credenciais do agente nem de usuários. Se for necessária mudança de autenticação protegida, registrar o bloqueio e solicitar aprovação separada.

## 7. Registro desta entrega

| Item | Situação |
|---|---|
| PostgreSQL | descartável local, somente dados sintéticos |
| Criação/cadastro de chaves reais | NÃO EXECUTADO |
| Papel/grants produtivos | NÃO EXECUTADO |
| Banco comercial/produção, migrations, deploy | NÃO EXECUTADO |
| Cron produtivo | DESABILITADO; nenhum agendamento instalado |
| Testes físicos/Chrome/Edge com impressora | PENDENTE |
| Relatório de software/CI | `D03_EXPURGO_RETENCAO_CHAVES.md` e `evidence/d03/` |
