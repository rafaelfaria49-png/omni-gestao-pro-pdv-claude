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
`evidence/d04/RESULTADO_D04.json` consolida os resultados dos artefatos de CI verificados por SHA; os logs locais e seus
resumos identificam as execuções em WIP e as tentativas anteriores, incluindo falhas corrigidas e interrupção da sandbox.
Os jobs limpam evidências derivadas e registram SHA/run/attempt antes da execução. A bateria D04 reutiliza o orquestrador e
todos os casos D03/D02/D01, sem repetir contratos. O workflow D03 continua cobrindo PostgreSQL 17, regressão, Playwright,
typecheck e build; o workflow D04 acrescenta recuperação e instalação efetiva somente no runner Windows descartável.

O runner testa a tarefa real por acionamento sob demanda e inspeciona seu gatilho de logon. Isso não é um reboot/logoff
físico do caixa. DPAPI usa texto sintético; o ensaio com segundo usuário cria/remove conta apenas no runner descartável.
Spooler dos testes de envio é simulado; o host real só faz DPAPI/inventário/fila inexistente, sem papel.

## Resultado por grupo e requisito

Código do pacote validado: `683b0178ad844d10191e7fb2a0c96d28270297b1`. Os artefatos abaixo foram baixados, comparados ao
digest da API GitHub e conferidos quanto a run/attempt/checkout, códigos de saída e hashes dos logs por executor e revisor
independente. O checkout de PR é o merge técnico `387d02e6b170401cdc2047169dd39916a94ca544`, sem merge de branch realizado
pelo executor. As provas locais em WIP não são atribuídas ao CI.

| Teste/requisito | Resultado | Evidência |
|---|---|---|
| Core, protocolo, agente, D01-A1 e guardas Windows | 78/78 PASS | `ci-windows-683b017.json` |
| Instalação, tarefa real, atualização e desinstalação | PASS em runner Windows 2022 descartável | `installer.log` no artefato Windows; hashes de diário/instância/config preservados |
| Tarefa no logon | gatilho, SID, Interactive/Limited/IgnoreNew PASS; acionamento sob demanda PASS | logon/logoff/reboot de equipamento seguem H03/D05 |
| Recuperação Windows D04 | 24/24 PASS | queda no envio, UNKNOWN sem replay, revogação no lote, rede, fila simulada bloqueada, diário truncado/corrompido, guard e PID reaproveitado |
| Host PowerShell órfão e legado | PASS | morte real do pai encerra host real; órfão sintético identificado é encerrado; host legado sem identidade bloqueia sem matar |
| Dois agentes e duplo pareamento | PASS; dois processos 1/1 | mesmo diário excluído pelo SO; código sintético consumido uma vez; credencial preservada |
| DPAPI correto/incorreto e formato 004C | PASS | API CurrentUser real, compatibilidade com ciphertext anterior e segundo usuário Windows descartável recusado |
| Portabilidade do harness Linux | 18/18 PASS, seis casos Windows cobertos no runner Windows | `ci-linux-683b017.json` |
| Provas de CI contra falso PASS | 6/6 PASS local em WIP; repetição no CI consolidado | timeout/exit nulo, zero, divergência de log, erro de coleta, nomes duplicados e caso válido; esses seis não pertencem ao artefato `683b017` |
| D03 retenção/limites/expurgo | 17/17 PASS | `ci-d03-683b017.json`; UNKNOWN e histórico preservados |
| Cenários D01/004C | 35/35 PASS | inclui autorização, segunda via, respostas perdidas, rotação, limites e terminal/loja |
| Dois processos / regressão 004B | 1/1 e 3/3 PASS | spooler simulado, kill real e nenhuma duplicata |
| Migrations e guardas D02 | 8/8 e 5/5 PASS; geradores sem divergência | banco PostgreSQL 17 descartável; migrations da entrega inalteradas |
| PDV Clássico/D01-A1 Playwright | 19/19 PASS | primeira/segunda via, fallback explícito, KG e recurso desligado; Chromium e spooler simulado |
| Regressão offline | 135/135 e PostgreSQL 10/10 PASS | venda/sincronização preservadas |
| Mutações críticas | 8/8 detectadas com exit inteiro `1` e asserção real; fonte restaurada | verificador recusa timeout, erro de preparo/coleta e prova genérica |
| Typecheck completo / ESLint | saída 0 / saída 0 | typecheck do projeto; lint das fontes alteradas e da regressão D03 |
| Build de produção local e no CI | saída 0 | `MIGRATION_SKIPPED`; `PROXY_PRISMA_ARTIFACT_VERIFIED`; nenhum deploy/migration |
| Revisão independente | APPROVE, sem achados pendentes | `REVISAO_INDEPENDENTE_D04.md` |
| D05 físico | PENDING | `RUNBOOK_D05.md`, nenhum caso físico promovido a PASS |

CI de código: [D04 Windows/Linux](https://github.com/rafaelfaria49-png/omni-gestao-pro-pdv-claude/actions/runs/41946614613)
e [D03 completo](https://github.com/rafaelfaria49-png/omni-gestao-pro-pdv-claude/actions/runs/41946614583), ambos PASS.
Os checks do último commit consolidado são acompanhados na [PR draft #333](https://github.com/rafaelfaria49-png/omni-gestao-pro-pdv-claude/pull/333),
sem merge. As primeiras execuções encontraram ACL com SID tratado como nome, descoberta de vários Nodes no PATH e espera
de EOF do guard Linux; correções e repetições aprovadas. Um erro de tipo no harness Windows foi corrigido. Nenhum timeout
é classificado como PASS; resumos antigos de tentativas permanecem identificados separadamente.

## Pacote e operação

[Pacote Windows do CI, sem assinatura](https://github.com/rafaelfaria49-png/omni-gestao-pro-pdv-claude/actions/runs/41946614613/artifacts/13378488760).
ZIP: `omni-print-agent-0.2.0-d04.zip`. SHA-256 atual (finalização D05, 2026-11-08, agente com `JOURNAL_MISSING`):
`e974ca03a8ae862b8f7b7da5d78cd6aa5fca0c1664b5bf114d79870f0452bc77`,
`contentId=f6af488c0c5d59e70f555f640b2fd97224dbd315b26da8e669335051dec56a40`; reproduzido byte a byte com Node 24.22 e 26.12.
Pacote D04 anterior (substituído, nunca instalado): `f48b30977a4cff2384e0ccfb8bf45bcc741d7da36c6edb3790cb55561255832a`,
`contentId=1cfecac07faec9fea0d3e5e5c582ebb509564c9a502fc4be28b9884dcc7db540`.
Agente atual: identidade `.instance` sem `journal.jsonl` recusa iniciar (`JOURNAL_MISSING`); o diário é criado e
sincronizado antes da identidade. Recuperação: parar, arquivar a pasta de dados inteira e parear de novo.
Os mesmos bytes foram reproduzidos localmente; os 17 arquivos manifestados conferem com o código revisado. Node 24
>=24.12 e PowerShell 5.1 são pré-requisitos externos; não há dependências npm no agente nem certificado produtivo.
Procedimentos em português no README do pacote. O gerador oficial de `HASHES.json` cobre fontes, documentos e provas;
artefatos temporários e dados sintéticos ficam fora do manifesto de fontes.

Próximo passo: autorização própria de D05 com local/data/operador/consentimento, POS-80 USB e bobinas 58/80, seguida do
preparo autorizado do banco/Preview de homologação, instalação no usuário escolhido e execução documentada de H01–H18.
Não criar esse ambiente nem instalar no caixa antes da autorização. Depois da integração da #332 à #327, conferir heads e
ancestralidade e retarget da #333 para `claude/omni-print-004c-e2e-001`; nenhum merge foi realizado nesta entrega.

Revisão independente: `REVISAO_INDEPENDENTE_D04.md`. Instalação e recuperação: `tools/omni-print-agent/README.md`.
Homologação preparada: `RUNBOOK_D05.md`. As provas por SHA ficam em `evidence/d04/ci-*-683b017.json` e `package-integrity.json`.

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
