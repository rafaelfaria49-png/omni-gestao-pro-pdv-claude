# Omni Print USB Windows — finalização real 001

GOAL `OMNI-PRINT-USB-WINDOWS-FINALIZACAO-REAL-001` · 2026-11-11 · RAFACELL.

**A página de teste do Windows saiu completa e cortou, conforme confirmação presencial do operador.** O pacote oficial
Omni Print foi instalado em QA e detecta a POS-80 USB online. A tarefa permanece desabilitada e sem pareamento.
Ainda não houve cupom físico Omni Print. Produção não foi alterada.

## Código e integração

| Referência conferida no GitHub | SHA / situação |
|---|---|
| main | `74e84f36ee7276e15f9a7284153ee9cec53597ab` |
| #327 | `055d7853ad80bacd7174ffed96e4d4ae196cf96d`, aberta, draft |
| #334 | `797b7ee297e624217feb9f66c504e09c47bf0a94`, aberta, draft, base #327 |
| #330 | `d31e8208d56dd41b44b01f5f038e3ce734f783a8`, integrada à pilha da #327; não equivale à aplicação das migrations |
| #342 | `ce2e0ac28f77ed0840209c35fb76b5ee3251a976`, já integrada na main |
| #346 | PR corretiva em draft, base #334, branch `codex/omni-print-usb-windows-finalizacao-real-001` |
| Base reconciliada local | `0dbeb5d9267f9920dc1a763649989b3e37546d49`: merge normal main → D05, sem conflito |
| Commits corretivos | `541ced8`, `2066b30`, `58015fe`; ajustes CI `2292119` e `7a0abe923884e5faa1a6b1ffb51bec80dc48e939` |

Worktree exclusiva: `C:\Projetos\omni-gestao\.worktrees\omni-print-usb-windows-finalizacao-real-001`.
As worktrees e PRs de F8, aparelhos, KG, F9, D03/D04/D05 foram preservadas. Inventário de HEADs, commits não integrados
e WIP em `evidence/usb-windows-001/worktree-inventory.json`. Não houve reset, rebase, force-push, descarte ou merge remoto.
`.aep-active` ausente nesta worktree: AEP opt-in inativo; nenhum `open`/`close` executado.

## Causa raiz e correção

`app/api/print/raw/route.ts` usava `THERMAL_PRINT_HOST || "127.0.0.1"` e porta 9100, e aceitava host/porta do navegador.
O socket era aberto pelo runtime Node do servidor. Na Vercel esse endereço aponta para a própria função, sem acesso
automático à USB da RAFACELL. As PRs do agente continuam em draft; a existência delas não publica nem pareia o agente.

O corretivo:

- Exige destino legado configurado no servidor; o navegador não substitui host/porta. Mantém a autorização de plataforma
  já existente e o suporte a destino de rede/bridge explicitamente configurado.
- Recusa loopback na Vercel, inclusive IPv6 expandido/mapped e aliases numéricos, URL inválida, credenciais embutidas,
  redirect de bridge, payload inválido/excessivo e origem/Content-Type incompatíveis. Não mostra erro bruto de bridge/socket.
- Liga `requireAgent` à solicitação de impressão da venda do Clássico: falta de disponibilidade/vínculo não autoriza TCP
  nem navegador automático. A recusa de documento não suportado com zero job libera o fluxo anterior de KG.
- Mantém o runtime compartilhado dos outros PDVs/OS. O fallback explícito do navegador continua disponível.
- Informa aceite do transporte sem afirmar saída física do papel.

Nenhuma alteração no motor do agente, protocolo de spooler, diário, estados UNKNOWN, writers de venda/pagamento/estoque,
schema, migrations, `APPROVED_RELEASE` ou chaves. Não houve reenvio da venda operacional que originou o erro.

## Windows e pacote

| Verificação | Evidência observada |
|---|---|
| Computador / usuário | RAFACELL / `RAFACELL\rafae`; Windows 11 Home Single Language, build 26200 |
| Modelo detectado | descriptor USB `POS80 Printer USB`; driver do fabricante identificado como POS. Marca/modelo físico por etiqueta/foto ainda pendente |
| Fila / driver / porta | `POS-80` / `POS-80 11.3.0.1` / `USB005` |
| Spooler / fila | serviço ativo, automático; zero trabalhos pendentes no diagnóstico |
| USB / estado | dispositivo VID_0416/PID_5011 presente; agente oficial informa `portKind=USB, online=true` |
| Particularidade PnP | também existe `USBPRINT\UNKNOWNPRINTER` com descrição “Nenhuma Impressora Conectada”; a página física manual foi confirmada depois |
| Impressora padrão | EPSON no primeiro diagnóstico; POS-80 em consulta posterior. Este executor não mudou a padrão |
| Bobina | 80 mm confirmada pelo operador; 58 mm não foi configurada/testada |
| Página Windows automática | CIM retornou 5 (`Acesso negado`); operador confirmou que nenhum papel saiu |
| Página Windows manual | operador presente confirmou: “Imprimiu uma página completa e cortou.” Sem foto anexada |
| Fonte do pacote | CI D04 da #334, run `42483852556`, commit `1c39fcd2e06a434f8e1dd49b67ef49f17b0bacbf`, artifact `13619046097` |
| Digest do artifact ZIP | `01537f788c7a1ab2fccf0cc56588c7bf98e34985be6f42ef27c1cf5be143ea8a` |
| ZIP interno | `omni-print-agent-0.2.0-d04.zip`, SHA256 `e974ca03a8ae862b8f7b7da5d78cd6aa5fca0c1664b5bf114d79870f0452bc77` |
| Manifesto | contentId `f6af488c0c5d59e70f555f640b2fd97224dbd315b26da8e669335051dec56a40`; 17 arquivos + manifesto, integridade PASS |
| Assinatura | ausente, comprovada no manifesto; não é software assinado |
| Node instalado usado | 24.22.1 existente; instalador exige 24.x >=24.12. Não foi instalado Node/driver novo |

Instalação QA executada pelos scripts oficiais, depois do teste de papel e do aceite presencial para testar:

- Binários: `C:\Users\rafae\AppData\Local\OmniPrintAgentApp-USB001`.
- Dados: `C:\Users\rafae\AppData\Local\OmniPrintAgent-USB001`.
- Tarefa: `OmniPrintAgent-Lab-USB001`, **Disabled**, Interactive/Limited/IgnoreNew, mesmo usuário, `haltReason=INTENTIONAL`.
- `Install-Agent.ps1 -Apply -AuthorizedLab`: `INSTALL_PASS_TASK_DISABLED_DATA_PRESERVED`.
- `Diagnose-Agent.ps1`: integridade PASS, mesma conta, instância única, `paired=false`. O comando oficial `printers`
  detectou POS-80 USB online. Não houve `pair`/`Start-Agent`, credencial real criada ou job físico enviado.
- A tarefa antiga `OmniPrintAgent-Lab-D05` está desabilitada e aponta para instalação sem `installation.json`.
  Foi preservada, sem tentativa de recriar manifesto, limpar diário, atualizar ou remover a tarefa.

Evidências locais em `evidence/usb-windows-001/`: detecção, confirmação do operador, pacote, plano/aplicação e diagnóstico.
Aceite do Windows não certifica perfil ESC/POS, acentos, largura de colunas, logo ou corte do cupom Omni.

## QA e gates

Inspeção somente leitura do alvo D05 já existente:

- Neon `super-credit-72834107`, branch `br-billowing-cake-b627zsxv`, banco `omni_print_d05`, PostgreSQL 17.11.
  Apenas `d05-synthetic-store`, zero vendas, 11 tabelas de impressão, três migrations D02 registradas.
  As três constam finalizadas, sem rollback. Esse QA foi criado por baseline de schema + D02: seu histórico Prisma
  registra somente D02 e não certifica o histórico inteiro da main. Conferir compatibilidade do schema da versão a
  publicar; não executar migrate deploy/reset genérico para reconciliar esse histórico.
- Vercel Preview `dpl_7WpCYjjAzai3weEYYUd4rjx9U8EQ`, projeto `prj_wjkHKw2jFQfY8regMYtkYXwgavuz`, team
  `team_IInBSQbKO8P5XpAsvz16Kc3g`, código `1c39fcd`, alias D05 do runbook, estado READY.
- Probe atual: HTTP404 `DIRECT_PRINT_DISABLED`, motivo `OWNER_APPROVAL_REQUIRED`.
- Nenhum recurso cloud, segredo, variável, deployment ou dado remoto foi criado/alterado nesta execução.

O corretivo #346 ainda não está no Preview autorizado. Sua integração/publicação exige decisão humana: o pedido proíbe
merge automático e o runbook limita o transporte à branch D05 exata, commit revisado, CI verde e isolamento comprovado.
Não se contornou esse gate usando outra branch, LAB em Production ou alteração de `APPROVED_RELEASE=null`.

## Validação e limites

Logs oficiais em `evidence/d05/2026-11-11T13-58-54-555Z/`, `2026-11-11T14-12-37-243Z/`,
`2026-11-11T14-15-09-378Z/` e repetição final em `2026-11-11T14-29-42-020Z/`.
Cada `summary.json` registra sourceCommit, workingTreeChanged, Node, plataforma, exit, tempo e hash dos logs.
Os primeiros runs antecedem os corretivos da revisão e não substituem a repetição final/CI.

| Bateria | Resultado |
|---|---|
| Regressão final de runtime/rota/auth | 48/48 PASS |
| PW21/PW22, feedback/runtime reais | PASS na bateria final, incluindo zero job no fallback KG e recusa de raw inesperado nos cenários anteriores |
| PG17: retenção / cenários / dois agentes / 004B | 17/17, 35/35, 1/1, 3/3 PASS na bateria inicial e repetidos conforme summary final |
| D02: migrations / ensaio | 8/8 e 5/5 PASS também na repetição final |
| Offline | 135/135 PASS também na repetição final |
| Playwright oficial | 22/22 PASS na repetição final |
| Unidade final / contratos de cupom/SW | 136/136 e 51/51 PASS |
| Windows recovery / DPAPI / instância única | 30/30 PASS também na repetição final |
| Tipos / lint focado / build | PASS também na repetição final (build em 423 s) |
| Service Worker real do build | PASS também na repetição final: worker controla a página; offline por proxy derruba página E worker; sentinel de outra loja não é servido pela API de impressão |
| Lint completo `eslint .` | FAIL: 105 erros / 109 warnings; os cinco arquivos com erro e a configuração são idênticos à main. Sem erros novos atribuídos ao delta |
| CI #346 no código `7a0abe9` | Primeira execução: 7 jobs PASS e 4 FAIL no provisionamento DNS. Retomadas dos três workflows e de um job individual: startup_failure interno do GitHub, sem novos jobs/testes |
| Revisão independente | APROVADO tecnicamente, com os achados corrigidos; ver `REVISAO_USB_WINDOWS_FINALIZACAO_001.md` |

ESLint de todo o delta final: zero erros, quatro warnings preexistentes no Clássico, sem `--fix` nem alteração da
configuração. Os dois testes de navegador adicionais e o reforço de suas asserções foram aprovados pelo revisor em
revisão suplementar no `58015fe`. O run local final começou no `2066b30` com `workingTreeChanged=true`; o reforço só de
teste do `58015fe` já estava no disco quando os 22 cenários foram executados. As execuções remotas estão ligadas aos
SHAs exatos. Os commits seguintes alteram somente provisionamento CI/manifesto; o código da aplicação permaneceu igual.

Primeira execução concluída do código `7a0abe923884e5faa1a6b1ffb51bec80dc48e939` (snapshot às 12:33 BRT):

| Workflow | Run | Resultado dos jobs |
|---|---|---|
| D03 | [43048161987](https://github.com/rafaelfaria49-png/omni-gestao-pro-pdv-claude/actions/runs/43048161987) | Windows PASS; software Linux FAIL no DNS antes de PG/Playwright/bateria/mutações |
| D04 | [43048161297](https://github.com/rafaelfaria49-png/omni-gestao-pro-pdv-claude/actions/runs/43048161297) | Windows e portabilidade Linux PASS |
| D05 | [43048161353](https://github.com/rafaelfaria49-png/omni-gestao-pro-pdv-claude/actions/runs/43048161353) | Preparação Linux/Windows PASS |
| Plataforma | [43048161752](https://github.com/rafaelfaria49-png/omni-gestao-pro-pdv-claude/actions/runs/43048161752) | validate PASS; build autenticado PASS, provisionamento DNS FAIL, E2E não executado |
| Ramos | [43048161339](https://github.com/rafaelfaria49-png/omni-gestao-pro-pdv-claude/actions/runs/43048161339) | PG real PASS; contratos/tipos/lint/build PASS; dois jobs FAIL no DNS antes de smoke/E2E |

Identificadores, etapas e trechos dos quatro erros em `evidence/usb-windows-001/ci-final.json`.

**Retomada de 2026-11-11, 17:31–17:40 BRT:** repetidos somente os jobs falhos dos runs D03, Plataforma e Ramos no mesmo
SHA. Os três workflows encerraram com `startup_failure`, sem criar novos jobs. A anotação pública informa erro interno
inesperado do GitHub, com IDs de suporte preservados em `ci-retry-2026-11-11T20-31Z.json`. A tentativa adicional de
reexecutar apenas o job D03 `130617633176` também encerrou antes de iniciar, com o mesmo tipo de erro interno
(request ID `BCB1:30A7BC:D82F00:166F6E3:6AF4D1EC`), registrada em `ci-retry-single-job-2026-11-11T20-37Z.json`.
O status público de Actions consultado estava operacional e sem incidente; isso não elimina os erros específicos
observados nestas requisições. Não há novos resultados de testes nessas retomadas. D04/D05 continuam PASS; CI completo
continua bloqueado. Não há workflow em execução após o encerramento das retomadas.

Tentativas remotas preservadas: `azure.archive.ubuntu.com` não resolveu durante `playwright install --with-deps`,
exit 100 na instalação de pacotes Ubuntu, sem chegar aos testes dependentes de navegador. Builds, tipos e contratos
anteriores passaram. A repetição só dos jobs falhos sofreu a mesma falha. O corretivo CI `2292119` exige o fallback
HTTPS oficial já presente e remove somente a linha Azure da lista da imagem antes de apt/Playwright. Nenhum teste,
versão, TLS ou gate foi alterado; YAML/Bash e revisão independente PASS. A execução seguinte também falhou DNS no
`archive.ubuntu.com`. Último corretivo `7a0abe9`: seleciona apenas um dos dois fallbacks HTTPS oficiais já presentes que
resolva DNS IPv4, com timeout de 10 segundos por host. Os quatro jobs finais que precisam desse provisionamento
confirmaram falha dos dois e encerraram com `UBUNTU_OFFICIAL_MIRRORS_DNS_UNAVAILABLE`, antes dos testes dependentes.
Nenhuma alteração global de DNS, `/etc/hosts`, proxy,
TLS, dependências ou testes. O bloqueio externo foi preservado; CI completo não é declarado PASS. Fonte do ambiente
de mirrors: [configuração oficial dos runners GitHub](https://github.com/actions/runner-images/blob/main/images/ubuntu/scripts/build/configure-apt-sources.sh).

S20 compara digest comercial antes/depois de impressão, falhas, retries, segunda via e reinícios: venda, estoque, caixa
e financeiro permanecem idênticos. O cenário de dois processos mata um envio em voo, preserva UNKNOWN e limita a uma
submissão por venda. São evidências com PostgreSQL real e spooler simulado, não comprovação física do papel.
PW21 não permite raw/navegador quando o agente foi escolhido mas não há disponibilidade. PW22 permite raw apenas no
fallback KG comprovadamente recusado sem job. Os 20 testes anteriores continuam recusando qualquer raw inesperado.

O primeiro RED local incluiu timeouts de um mock síncrono de socket, corrigido no próprio teste; não é contabilizado como
12 defeitos de produto. A primeira porta PG escolhida estava reservada pelo Windows; o laboratório exclusivo foi iniciado
em `127.0.0.1:55491`, sem mudar reservas, firewall ou outros serviços.

O campo `windowsPhysicalInstallation=false` dos summaries do verificador descreve a bateria offline, que não instala
hardware. A instalação QA real foi executada separadamente pelos scripts oficiais e tem logs próprios.

## Superfícies

| Superfície | Contrato confirmado / limite |
|---|---|
| PDV Clássico | integração direta existente, com ledger/agente; 22 cenários de navegador na repetição final |
| Histórico / Conferência | painel compartilhado de reimpressão registrada da #327; segunda via e confirmação de risco nos testes existentes |
| KG | agente direto ainda não suporta KG; recusa com zero job e caminho anterior preservado. Não alterar worktrees KG/F8 |
| Assistência / Supermercado | não possuem integração própria com o feedback direto; usam runtime legado compartilhado, preservado pelo corretivo. Não declarar impressão USB pelo agente homologada nessas telas |
| Venda Completa Enterprise | integração própria com Omni Print não encontrada; não declarada como suportada |
| F9 | frente de recibos separada, ainda não incorporada à pilha do agente; sem declaração de suporte direto |
| Browser / A4 | preservados; testes existentes e fallback explícito. Sem impressão física A4/Chrome/Edge nesta execução |

## H01–H18

H01 tem diagnóstico USB/driver/fila e página manual confirmada; faltam foto/etiqueta/série e identificação nominal completa
do operador no registro formal. H02 tem instalação íntegra e tarefa desabilitada; pareamento/credencial real não existem.
Nenhum caso completo H01–H18 foi promovido a PASS. H04/58 mm permanece sem equipamento compatível/autorização; não foi
exigida configuração incorreta da bobina de 80 mm. H05–H18 aguardam o Preview corrigido e os gates presenciais.
Nenhuma energia, USB, rede, serviço ou computador foi interrompido para provocar falha.

## Próximos passos e rollback

1. Proprietário decide a integração da #346 na pilha D05, mantendo #327/#334 em draft e sem merge produtivo automático.
2. Conferir HEAD/CI/revisão do commit integrado e o isolamento D05; publicar somente o Preview aprovado e ativar transporte
   apenas nas variáveis fixadas na branch D05. Não reaproveitar credenciais produtivas.
3. Com operador presente, usar Configurações → PDV → código temporário único; parear a instalação USB001 no mesmo usuário,
   conferir DPAPI, vincular loja sintética/terminal/fila POS-80/80 mm e iniciar pelo script oficial. Código/token não entram
   em logs, chat, fotos ou PR.
4. Venda sintética pelo PDV real: uma confirmação no servidor → um pedido → aceite do spooler → conferir e fotografar
   papel/acentos/largura/corte. Nada de repetir a venda operacional original.
5. Executar H01–H18 aplicáveis, com autorização específica por reinício/desconexão/falha, e obter aceite final das evidências.
6. Só depois elaborar/aprovar a liberação produtiva com alvo, executor, janela e restauração: D02 manual conforme
   [RUNBOOK_D02 §6](RUNBOOK_D02.md#6-aplicação-segura), merge/deploy autorizado da #327 e corretivos de runtime,
   release/chaves D03, instalação produtiva, pareamento e ativação de uma loja/terminal. O §6 detalha índices CONCURRENTLY
   → núcleo transacional → verify → preparação de espelho externo → resolve no banco pelo schema do espelho → verify
   --prisma → APLICACAO.json produtivo → promoção canônica para prisma/migrations → guarda/verificações → commit e merge
   autorizado. Os §6/§12 foram harmonizados documentalmente conforme o contrato existente e a revisão independente:
   espelho externo não é promoção canônica. Nenhum desses passos foi executado aqui. Não levar ferramentas D05 à main sem
   decisão própria. Coordenar com MIG-X KG; não usar migrate deploy genérico contra Production.

Rollback QA/prod segue RUNBOOK_D03/D04/D05: pausar emissões, preservar relatos/UNKNOWN, desativar a flag no alvo correto,
revogar instalação e Stop controlado, preservar dados/diário/instância/hosts/fila. Não restaurar diário antigo nem limpar
fila para tentar de novo. Nenhuma remoção de banco, deployment ou tarefa antiga está autorizada por este relatório.

## Entrega e preservação

Lista completa de arquivos criados/alterados, distinguindo o delta USB da main incorporada por merge:
`evidence/usb-windows-001/changed-files.json`. Nenhum arquivo removido. As fontes próprias se limitam à rota raw,
runtime/feedback do PDV e seus testes, prova SW, runners/manifesto e configuração de deploy da branch; o core comercial,
auth, proxy e schema não foram alterados por este corretivo. A mudança do pós-venda foi expressamente solicitada no GOAL.

`docs/changelog/CHANGELOG.md` registra o candidato. `CURRENT_STATUS.md` e `MASTER_CONTEXT.md` não foram alterados:
não houve mudança do estado produtivo nem nova arquitetura. Este relatório registra a preparação QA e os bloqueios.
O `RUNBOOK_D02.md` foi harmonizado somente na documentação: espelho externo antes do registro, promoção canônica após
registro produtivo comprovado. Essa sequência já era suportada pela ferramenta e usada no D05; revisão independente
suplementar APROVADO, sem findings P0–P3. Nenhuma ferramenta, migration ou gate foi alterado.

O último commit de entrega contém somente documentos/evidências/HASHES, com `[skip ci]`; fontes e workflows permanecem
idênticos ao código `7a0abe9` executado acima. Isso não torna o CI verde: o bloqueio remoto permanece explícito.
O manifesto oficial foi regenerado e a worktree própria fica sem WIP após o commit, com artefatos locais ignorados
preservados. Inventário final das demais worktrees em `evidence/usb-windows-001/worktree-inventory-final.json`.

Encerramento somente leitura em `evidence/usb-windows-001/cleanup-final.json`: tarefas D05 e USB001 desabilitadas,
nenhum processo Node/PostgreSQL do laboratório próprio, Spooler Running e POS-80 sem jobs. Cluster PG parado, dados,
instalações e diários preservados. Revisor independente encerrado, sem outros subagentes deste GOAL em execução.

## Resultado solicitado

```text
GOAL=OMNI-PRINT-USB-WINDOWS-FINALIZACAO-REAL-001
PR327=055d7853ad80bacd7174ffed96e4d4ae196cf96d_DRAFT
PR334=797b7ee297e624217feb9f66c504e09c47bf0a94_DRAFT
MAIN_SHA=74e84f36ee7276e15f9a7284153ee9cec53597ab
PRINTER_MODEL=POS80_USB_DESCRIPTOR_PHYSICAL_LABEL_PENDING
PRINTER_CONNECTION=USB
PRINTER_QUEUE=POS-80
PRINTER_DRIVER=POS-80_11.3.0.1
USB_PORT=USB005
PRINTER_WIDTH=80MM_OPERATOR_CONFIRMED
WINDOWS_DETECTION=PASS_WITH_UNKNOWNPRINTER_PNP_NOTE
WINDOWS_TEST_PRINT=OPERATOR_CONFIRMED_COMPLETE_PAGE_AND_CUT
AGENT_PACKAGE=CI_42483852556_SHA256_e974ca03a8ae862b8f7b7da5d78cd6aa5fca0c1664b5bf114d79870f0452bc77_UNSIGNED
AGENT_INSTALLATION=QA_USB001_INTEGRITY_PASS_TASK_DISABLED
AGENT_PAIRING=NOT_EXECUTED
AGENT_ONLINE=NOT_STARTED_PRINTER_ENUMERATION_ONLINE
HTTPS_TRANSPORT=IMPLEMENTED_TESTED_D05_PREVIEW_DISABLED
DPAPI=LOCAL_RECOVERY_AND_WINDOWS_CI_PASS_REAL_CREDENTIAL_PENDING
SPOOLER=RUNNING
LOCALHOST_9100_ROOT_CAUSE=LEGACY_ENDPOINT_DEFAULTS_TO_SERVER_LOOPBACK
LEGACY_TCP_CORRECTION=IMPLEMENTED_REVIEWED_PR346_NOT_DEPLOYED
AUTOMATIC_PRINTING=SOFTWARE_TESTED_PHYSICAL_PENDING
PRINT_80MM=WINDOWS_PAGE_ONLY_OMNI_RECEIPT_PENDING
CUT_TEST=WINDOWS_PAGE_CONFIRMED_ESCPOS_PENDING
ACCENTS_TEST=AUTOMATED_BYTES_PASS_PHYSICAL_PENDING
SECOND_COPY=AUTOMATED_PASS_PHYSICAL_PENDING
BROWSER_FALLBACK=AUTOMATED_PASS_PHYSICAL_PENDING
NO_DUPLICATE_SALES=S20_DIGEST_PASS_SYNTHETIC_DB
NO_DUPLICATE_PAYMENTS=S20_DIGEST_PASS_SYNTHETIC_DB
NO_DUPLICATE_STOCK=S20_DIGEST_PASS_SYNTHETIC_DB
NO_DUPLICATE_PRINT=TWO_AGENTS_UNKNOWN_PASS_SIMULATED_SPOOLER
STORE_ISOLATION=AUTOMATED_PASS
PHYSICAL_H01_H18=0_COMPLETE_PASS_H01_H02_PARTIAL
PG_TESTS=PASS_FINAL_REPEAT
PLAYWRIGHT=22_OF_22_PASS_FINAL
TYPECHECK=PASS_FINAL_REPEAT
LINT=DELTA_ZERO_ERRORS_4_WARNINGS_GLOBAL_FAIL_105_INHERITED_ERRORS
BUILD=PASS_FINAL_REPEAT
CI=BLOCKED_GITHUB_ACTIONS_STARTUP_FAILURE_PRIOR_7_PASS_4_DNS_FAIL
INDEPENDENT_REVIEW=APPROVED_NO_PENDING_FINDINGS
PRODUCTION_MERGES=0
PRODUCTION_MIGRATIONS=0
PRODUCTION_DEPLOYS=0
PRODUCTION_FLAGS_CHANGED=0
NEW_PRS=346_DRAFT_BASE_334
REMAINING_BLOCKERS=GITHUB_ACTIONS_STARTUP_FAILURE_PRIOR_DNS_CI_CORRECTIVE_QA_INTEGRATION_PAIRING_PHYSICAL_H01_H18
OWNER_APPROVAL_REQUIRED=CORRECTIVE_INTEGRATION_QA_PREVIEW_AND_PER_EVENT_PHYSICAL_GATES
WORKTREE_CLEANUP=OWN_PG_STOPPED_DATA_PRESERVED_TASK_QA_DISABLED_OTHER_WIP_PRESERVED
FINAL_STATUS=BLOCKED_WITH_EVIDENCE
```
