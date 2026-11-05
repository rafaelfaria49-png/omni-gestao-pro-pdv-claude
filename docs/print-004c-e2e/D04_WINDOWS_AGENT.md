# D04-A — finalização do agente Windows

GOAL `OMNI-PRINT-D04-WINDOWS-AGENT-FINALIZACAO-001`. D04-A_CONFIRMED. Base confirmada no GitHub e por ls-remote:
#327 `027bba5c9c505b349844cd22da62bb480b29b249`; #332 `5fd8743ce0c67c0847b09429f1b9e6ae5cae1e5a`, ainda aberta.
A D04 é empilhada sobre a branch da #332. Depois da integração da #332 à #327, conferir ancestralidade e retarget para
`claude/omni-print-004c-e2e-001`, sem realizar merge. Worktree própria; trabalhos anteriores preservados.

`APPROVED_RELEASE=null`, homologação física PENDING, zero operação/escrita/migration/deploy/env produtivo. Nenhuma branch
Neon ou Preview real foi preparada, nenhum caixa recebeu instalação, nenhum pareamento/impressão real foi realizado.

## Mudanças delimitadas

- Mantidos Agent, protocolo, spooler RAW, diário, contratos de loja/terminal, deduplicação, D01-A1, migrations D02 e retenção D03.
- Instalação/atualização/desinstalação em PowerShell com plano padrão, usuário/SID, Node 24 >=24.12, ACL, integridade e trava de manutenção.
- Pacote ZIP determinístico e sem assinatura, manifestado por arquivo e contentId, sem dependências npm; runtime Node é pré-requisito externo.
- Tarefa ao logon Interactive/Limited/IgnoreNew, instalada desabilitada. Supervisor com orçamento persistente; parada/revogação/fatal não entram em laço.
- Exclusão do SO antes de tocar diário/configuração; proteção do arquivo de proprietário também contra agentes legados; nunca remoção de trava por PID apenas.
- Registro durável de hosts antes de permitir enviar, monitor do pai por handle, reap pelo mesmo handle verificado; legado sem prova bloqueia sem matar.
- Linha final truncada preservada com hash; corrupção estrutural/intermediária falha fechado. Escrita completa e fsync antes de bytes; UNKNOWN não é reenviado.
- Pareamento serializado e sem sobrescrever credencial; erro deixa checkpoint para reconciliação. HTTPS obrigatório no CLI, sem listeners/redirects.

## Validação

Resultados novos e hashes dos logs ficam em `evidence/d04/VALIDACAO_D04.json`. Ausência é PENDING; exit nulo é FAIL.
Os jobs limpam evidências derivadas e registram SHA/run/attempt antes da execução. A bateria D04 reutiliza o orquestrador e
todos os casos D03/D02/D01, sem repetir contratos. O workflow D03 continua cobrindo PostgreSQL 17, regressão, Playwright,
typecheck e build; o workflow D04 acrescenta recuperação e instalação efetiva somente no runner Windows descartável.

O runner testa a tarefa real por acionamento sob demanda e inspeciona seu gatilho de logon. Isso não é um reboot/logoff
físico do caixa. DPAPI usa texto sintético; o ensaio com segundo usuário cria/remove conta apenas no runner descartável.
Spooler dos testes de envio é simulado; o host real só faz DPAPI/inventário/fila inexistente, sem papel.

Revisão independente: `REVISAO_INDEPENDENTE_D04.md`. Instalação e recuperação: `tools/omni-print-agent/README.md`.
Homologação preparada: `RUNBOOK_D05.md`. O relatório final será preenchido com os resultados efetivamente concluídos,
os checks do último commit e os limites físicos restantes.

## Recuperação e limites

Uma queda após o diário durável deixa UNKNOWN. A próxima partida fecha/verifica todos os hosts antigos antes de liberar
o destino; só reenvia relatórios, nunca a via. PID com criação diferente não é morto. Guard morto com Node vivo continua
bloqueado pelo proprietário persistido. Lock/registry ilegível, diário corrompido ou identidade inacessível param o agente.
Nenhum histórico, fila ou journal é limpo automaticamente. Caso legado exige diagnóstico e, se necessário, reboot
controlado do laboratório; não se apaga trava nem se mata processo apenas por nome/PID.

Rede usa backoff, mantendo resultados pendentes. Impressora indisponível antes de submit produz NO_EFFECT comprovado;
falha/timeout depois do possível envio permanece UNKNOWN. Revogação interrompe o lote. Atualização e desinstalação esperam
supervisor/agente/host encerrarem e mantêm todos os dados. Rollback de binários pode selecionar um pacote revisado anterior
pelo Update, sempre desabilitado, mas **nunca** restaurar diário/credencial antigos ou retornar ao runtime 004C inseguro.

Faltam autorização de bancada/loja e equipamento para logon/reboot/energia reais, USB, filas/driver comerciais, acentuação,
corte, bobinas 58/80, Chrome/Edge físicos e contagem de cupons. A aprovação desses itens continua sendo D05.
