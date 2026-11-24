# Roteiro de homologação física na loja — OMNI-PRINT-004C

## Estado em 2026-11-24 (GOAL `OMNI-PRINT-D05-FINAL-HOMOLOGATION-READINESS-002`)

**Nada físico do Omni Print foi executado. H01–H18: 0 PASS.** Este bloco é o procedimento guiado para o proprietário; as
seções 1–9 abaixo continuam valendo como detalhe e critérios.

| Item | Valor conferido |
|---|---|
| Pilha | main `f97e9de` → #327 `cd1cc6a` → #334 `ddfbc31` (ambas DRAFT, nenhum merge) |
| Pacote do agente | `omni-print-agent-0.2.0-d04.zip`, SHA-256 `e974ca03a8ae862b8f7b7da5d78cd6aa5fca0c1664b5bf114d79870f0452bc77`, contentId `f6af488c…6a40`, **sem assinatura**. Reproduzido byte a byte do head `ddfbc31` em 2026-11-24; código do agente sem mudança desde `1c39fcd` |
| Estação autorizada | RAFACELL, `RAFACELL\rafae` (SID …-1002), POS-80 USB, fila `POS-80`, driver 11.3.0.1, porta USB005, bobina 80 mm |
| Instalação já existente | `OmniPrintAgentApp-USB001` / `OmniPrintAgent-USB001`, tarefa `OmniPrintAgent-Lab-USB001` **desabilitada**, **não pareada**, integridade PASS (#346, 2026-11-11) |
| Servidor de pareamento | alias da branch D05 `https://omni-gestao-pro-git-codex-o-ab41e6-rafaelfaria49-4373s-projects.vercel.app` (banco Neon QA `omni_print_d05`) |
| Transporte no Preview | **desligado** (`OMNI_PRINT_DIRECT_ENABLED=0`); Production: `APPROVED_RELEASE=null`, nada ligado |
| Já observado (não conta como PASS) | página de teste do **Windows** saiu completa e cortou (relato do operador em 2026-11-11, sem foto) |

### Antes de começar: três decisões do proprietário

1. **Qual instalação usar.** Existe a `USB001` (mesmo pacote, desabilitada, sem credencial). Recomendado: **reutilizá-la**
   (variáveis do passo B apontando para `-USB001`). A alternativa é desinstalá-la (`Uninstall-Agent.ps1`, sem pareamento
   não há credencial a revogar) e instalar a `-D05` do CHECKLIST. **Nunca** duas tarefas pareadas para a mesma fila.
2. **Janela e operador.** Nome do operador, dia e horário presencial; loja real fora do horário de vendas ou com outro caixa.
3. **Ligar o transporte só na janela.** Uma variável da branch D05 (`OMNI_PRINT_DIRECT_ENABLED=1`) + novo deployment
   Preview + probe `enabled`, imediatamente antes de H01. Ação remota que exige o "sim" do proprietário no momento.

### Canal certo: navegador, não o app desktop

A homologação D05 é do **agente Omni Print**. O app OmniGestão Desktop (spooler do Windows, homologado em 2026-11-17)
é **outro canal** e imprime na mesma fila `POS-80`. Durante H01–H18: **fechar o app desktop** e operar o PDV só no Chrome e
no Edge, no alias da branch D05. Com o vínculo do agente ativo, o PDV exige o agente (`requireAgent`) e não cai para TCP,
spooler do app nem navegador sozinho. O aviso do agente é "Comprovante enviado à fila da impressora" ("a fila do Windows
aceitou o comprovante. Confira o papel na impressora."). Se aparecer "<venda> · enviado à fila de <nome da impressora>",
o cupom saiu pelo app desktop — **parar**: o caso não vale para D05.

### Procedimento guiado (uma ação por vez; contar e fotografar todo papel antes e depois de cada passo)

| Passo | O que fazer | Esperado | Casos |
|---|---|---|---|
| A. Ambiente isolado | Conferir no navegador que a URL é o alias D05 e que só aparece a loja `d05-synthetic-store`; nenhuma venda real | login ADMIN/CAIXA sintéticos; nenhuma loja real visível | pré-condição |
| B. Pacote e integridade | Baixar o ZIP do CI da #334 (head revisado) para `C:\HomologacaoD05\`; `Get-FileHash … -Algorithm SHA256` | hash = `e974ca03…bc77`; divergiu → **parar** | H02 |
| C. Impressora | `Get-CimInstance Win32_Printer` e `Get-PnpDevice` (CHECKLIST §1); fila não pausada nem offline; foto da montagem, modelo e série | fila `POS-80`, USB005 presente | H01 |
| D. Instalação | Reutilizar `USB001` (`Diagnose-Agent.ps1`) ou instalar `-D05` (`Install-Agent.ps1 … -Apply -AuthorizedLab`) | tarefa desabilitada, mesmo SID, Interactive/Limited/IgnoreNew, integridade PASS | H02 |
| E. Impressora vista pelo agente | `agent.mjs printers --data-dir <dataRoot>` | a fila `POS-80` aparece | H01/H02 |
| F. Pareamento | No caixa: Configurações → PDV → gerar código (10 min, uso único); `agent.mjs pair --server <alias D05> --code …`; `Diagnose-Agent.ps1 -ProbeCredential`; `Start-Agent.ps1 -Apply` | computador **online**; nenhum código/credencial em foto, log ou chat | H02 |
| G. Selecionar a impressora | Vincular terminal → computador, fila `POS-80`, bobina 80 mm, "Somente este navegador"; ligar "Usar impressão direta nesta loja" | vínculo ativo no terminal sintético | H02/H15 |
| H. Comprovante de teste | Venda sintética: "Pão de queijo", "Café com açúcar", "Maçã/Ç/ã/é", dinheiro com troco | sem diálogo do navegador; aviso "Comprovante enviado à fila da impressora"; exatamente 1 papel | H05/H06 |
| I. Acentuação | Conferir no papel Ç, ã, é, ç, "NÃO É DOCUMENTO FISCAL" | todos corretos, nenhum `?` ou caractere trocado | H05 |
| J. Largura | 48 colunas na bobina 80 mm, nada cortado na borda; 58 mm só com guia suportada — senão N/A com aprovação | linhas inteiras | H04 (N/A?) / H05 |
| K. Corte | Ao fim de cada cupom | corte total (ou registrar parcial); **gaveta não abre** | H05/H17 |
| L. Duas vias | 2ª via pelo PDV, pelo Histórico e pela Conferência (confirmação dupla); depois fallback explícito do navegador | papel "SEGUNDA VIA - REIMPRESSAO"; original não reimprime; nenhum cupom por dois canais | H07/H08 |
| M. Falta de papel | Retirar a bobina e vender | resultado "aceito pela fila"/incerto; **nenhum reenvio automático**; não limpar a fila | H10 |
| N. Impressora desligada | Desligar antes de vender | falha antes de enviar bytes; religar → "Tentar novamente" → exatamente 1 cupom | H09 |
| O. Reconexão | Desconectar o USB antes e depois do envio; desligar a rede antes e depois do envio | nenhum segundo cupom não pedido; reconexão só reporta o que já se sabe | H11/H12 |
| P. Retry | "Tentar novamente" só após conferir o papel; nunca em resultado incerto sem decisão humana | 1 cupom por tentativa autorizada | H09–H12 |
| Q. Impressão duplicada | Duas abas na mesma venda; dois caixas na mesma fila (H15 exige segunda estação autorizada) | uma via por pedido; segunda aba pede confirmação; sem cruzar loja/terminal | H07/H15 |
| R. Reinício do agente | Encerrar o processo no meio de um envio; logoff/logon; reboot (só com confirmação presencial) | UNKNOWN preservado, nada reenviado; uma única instância volta | H03/H13/H14 |
| S. Revogação e atualização | Revogar no sistema; próximo logon não volta a imprimir | parada persiste; diário/instância/DPAPI preservados | H16 |
| T. Segurança | `Get-NetTCPConnection -OwningProcess <pid do agente>` | só saída HTTPS 443; nenhuma porta escutando | H17 |
| U. Limites D03 / regressão | Conferir na CI do head as baterias D02/D03/PDV Clássico/offline | referência da CI verde do head usado | H18 |
| V. Desinstalação e rollback | Stop → desligar `OMNI_PRINT_DIRECT_ENABLED` na branch D05 → revogar → `Uninstall-Agent.ps1 … -RevocationConfirmed` (CHECKLIST §5) | PDV volta ao fluxo anterior; diário/UNKNOWN preservados para reconciliação | encerramento |

Critérios de parada: seção 8 (duplicidade, venda não confirmada, gaveta, dado real, impacto na loja). Registro:
`evidence/d05/H01-H18.template.json` copiado para pasta privada; cada PASS exige foto do papel, IDs técnicos sintéticos,
log redigido, operador e horário. Aceite do spooler não prova papel. `PHYSICAL_HOMOLOGATION=PASS` só com aceite escrito final.

---

**D05 PENDING — não executado.** Checklist operacional atualizado: [RUNBOOK_D05.md](RUNBOOK_D05.md),
[comandos Windows](CHECKLIST_OPERADOR_D05.md) e [plano isolado](PLANO_AMBIENTE_D05.md). D04-A liberou a
preparação do software; não liberou instalação/pareamento/impressão real ou configuração de banco/Preview nesta sessão.

Pré-condições (gates humanos, nenhum foi aberto por este candidato):

- D02 (schema) e D04 (transporte por agente local) aprovados pelo proprietário; D03 (limites/retenção/chaves) com valores definidos; D05 (hardware) com consentimento.
- D02 aplicado **somente no banco de homologação autorizado**, conforme RUNBOOK_D02.md, com índices concorrentes fora de transação e conferência de `indisvalid`; nenhuma promoção produtiva nesta D05.
- Release de homologação em commit revisado com ativação exclusiva de Preview/branch/projeto/release autorizados, conforme PLANO_AMBIENTE_D05.md. Esse commit ainda está bloqueado pela autorização do transporte. `APPROVED_RELEASE` de produção permanece NULL; não mudar NODE_ENV nem contornar o gate usando variáveis de LAB. Chaves distintas de 32 bytes só no secret store da homologação.
- Banco de homologação = branch Neon separado (nunca o banco da loja), com o D02 aplicado pelo plano de `DECISOES_PROPRIETARIO_OMNI_PRINT.md` (lock_timeout, `00` fora de transação). As variáveis acima ficam com escopo **Preview fixado na branch de homologação** na Vercel (Preview sem branch vale para todas as branches), apontando para esse branch Neon; **nunca** escopo Production. Conferir se a proteção de deployment da Vercel barra o agente (usar o bypass de automação só nesse deployment). Ao final: remover as variáveis, remover os deployments de homologação (deployments antigos mantêm as variáveis) e revogar o agente.
- Loja piloto com usuário ADMIN (configurar) e CAIXA (vender); terminal PDV cadastrado.

## 1. Impressora

1. Ligar a térmica (ex.: POS-80 USB). No Windows: Configurações → Impressoras → confirmar a fila (nome exato), driver instalado, **não** pausada, **não** "usar offline".
2. PowerShell (somente leitura): `Get-CimInstance Win32_Printer | Select Name,PortName,WorkOffline,PrinterStatus` e, para USB, `Get-PnpDevice -PresentOnly | ? InstanceId -like 'USBPRINT*'` → a porta (ex.: USB005) deve aparecer presente.
3. Imprimir uma página de teste do Windows **uma vez** para confirmar papel, alinhamento e corte. Registrar foto.
4. Anotar largura da bobina (58 ou 80 mm).

## 2. Instalação e pareamento autorizado do agente

1. Após autorização própria de D05, seguir o pacote íntegro e os scripts em `tools/omni-print-agent/README.md`, com Node 24 >=24.12. Não usar cópia manual nem laço de reinício antigo. A tarefa é instalada desabilitada no usuário autorizado.
2. Usar o comando `printers` do release instalado e o `dataRoot` registrados em `installation.json` → a fila do passo 1 deve aparecer.
3. No OmniGestão, **a partir do navegador do próprio caixa**, Configurações → PDV → "Impressão direta pelo agente local" → "Gerar código de pareamento" (válido 10 min, uso único).
4. Usar `agent.mjs pair --data-dir <dataRoot> --server https://<domínio-homologação> --code XXXX-XXXX-XXXX` do release instalado, no mesmo SID da tarefa. Conferir DPAPI pelo diagnóstico; não exibir nem fotografar `config.json`.
5. Fazer diagnóstico e iniciar pela tarefa controlada conforme README. Na configuração, o computador deve aparecer **online** com a impressora listada.
6. Vincular o terminal: escolher computador, fila e bobina (58/80), manter "Somente este navegador" marcado, "Vincular". Ligar "Usar impressão direta nesta loja". Ligar "Imprimir automaticamente" no cartão de impressão, se for o caso.
7. Confirmar que o agente não abre porta: `Get-NetTCPConnection -OwningProcess (Get-Process node).Id` → somente conexões de saída 443.

## 3. Teste de cupom

1. Venda exclusivamente sintética no banco de teste, sem cliente real/CPF, com 2 itens com acentos (ex.: "Pão de queijo", "Café com açúcar"), pagamento sintético em dinheiro com troco; nenhuma movimentação em loja real.
2. Esperado: nenhuma janela/diálogo do navegador; aviso "Comprovante enviado à fila da impressora"; papel sai com: nome/CNPJ da loja, "NÃO É DOCUMENTO FISCAL", número da venda, itens, valores, forma de pagamento, troco, rodapé, **acentos corretos**, linhas dentro da largura (32/48 colunas).
3. Medir tempo venda→papel (meta < 3 s com o host PowerShell já aquecido). Registrar foto do cupom e o `spoolJobId` mostrado no log do agente.

## 4. Corte

1. Conferir corte total ao final de cada cupom (GS V 0). Se a impressora só tiver corte parcial, registrar comportamento (não alterar o perfil sem nova revisão).
2. Conferir que **nenhuma gaveta abre** (o candidato não envia pulso de gaveta).

## 5. Segunda via

1. No aviso, "Imprimir 2ª via" → a tela deve informar que 1 via pode já ter saído → "Confirmar 2ª via".
2. Esperado: novo papel com "SEGUNDA VIA - REIMPRESSAO 1/1" no topo.
3. "Abrir impressão do navegador" após um cupom aceito deve pedir confirmação e imprimir com "SEGUNDA VIA - IMPRESSAO PELO NAVEGADOR" (testar em Chrome e Edge).

4. **Reimpressão pelo Histórico de vendas e pela Conferência do caixa (D01-A1):** abrir o cupom de uma venda impressa no item 3 → "Reimprimir como 2ª via" → o painel deve informar que 1 via pode já ter saído → "Imprimir 2ª via na impressora do caixa" pede um segundo clique → papel com "SEGUNDA VIA - REIMPRESSAO". Repetir pelo navegador: "SEGUNDA VIA - REIMPRESSAO PELO NAVEGADOR". Com duas abas abertas na mesma venda, a segunda deve pedir confirmação de novo.
5. Venda feita há mais de 30 min sem nenhuma via impressa: a impressão pelo navegador também sai marcada SEGUNDA VIA (regra conservadora: fora da janela da 1ª via é reimpressão).

## 6. Falha e recuperação

| Teste | Como provocar | Esperado |
|---|---|---|
| Impressora desligada | desligar a térmica e vender | "Não enviado: impressora desligada ou desconectada"; nada imprime depois sozinho; religar → "Tentar novamente" → 1 cupom |
| Sem papel | remover a bobina | registrar o que o Windows reporta (status) e o resultado mostrado; nenhum reenvio automático |
| Agente parado | fechar o agente e vender | após ~20 s "o agente de impressão não respondeu"; reabrir agente → nada imprime sozinho; "Tentar novamente" → 1 cupom |
| Rede cai após envio | desconectar o cabo de rede logo após vender | se o papel saiu, o resultado é registrado quando a rede volta; se ficar "incerto", conferir o papel antes de pedir 2ª via |
| Reinício do computador no meio | reiniciar durante um envio (piloto controlado) | ao voltar, a via fica "Resultado incerto"; **nada é reenviado**; decisão humana via 2ª via |
| Venda pendente | desconectar a internet e vender | venda fica pendente; **nenhum cupom** até confirmar no servidor |
| Dois caixas | dois terminais vinculados à mesma fila | cupons saem um de cada vez, sem duplicar |

## 7. Encerramento da homologação

- Revogar o agente piloto (Configurações → Revogar) e confirmar que ele para (credencial recusada).
- Registrar evidências (fotos, logs do agente sem a credencial, prints da tela) e preencher F01–F07 na matriz.
- Somente após aprovação escrita: `PHYSICAL_HOMOLOGATION=PASS` e decisão sobre empacotamento/assinatura do agente e execução como serviço.

## 8. Critérios de parada

Interromper, revogar o agente (Configurações → Revogar) e registrar o ocorrido se acontecer **qualquer** um destes:

- um mesmo cupom sai duas vezes sem pedido de 2ª via;
- sai cupom de venda que não foi confirmada no servidor;
- a gaveta abre;
- aparece dado de cliente real no cupom de teste;
- qualquer venda da loja deixa de gravar ou fica lenta durante o teste.

## 9. Registro de execução

Cada linha começa **NÃO EXECUTADO**. Só muda com evidência anexada (foto do papel, trecho do log do agente sem a credencial, print da tela) e o nome de quem executou. Nenhuma linha pode ser preenchida por inferência ou por resultado simulado.

| Caso | Passo do roteiro | Resultado | Evidência | Executor / data |
|---|---|---|---|---|
| F01 Windows + Chrome / Edge | §3, §5.3 | NÃO EXECUTADO | | |
| F02 bobina 58 / 80 mm | §1.4, §3 | NÃO EXECUTADO | | |
| F03 frio/quente, reinício, desligamento, sem papel | §6 | NÃO EXECUTADO | | |
| F04 duas vias, falha parcial, resposta perdida real | §5, §6 | NÃO EXECUTADO | | |
| F05 fila trocada/removida, vínculo revogado | §6, §7 | NÃO EXECUTADO | | |
| F06 gaveta desligada | §4.2 | NÃO EXECUTADO | | |
| F07 navegador (A4/fallback) em Chrome e Edge | §5.3 | NÃO EXECUTADO | | |
| I18 cancelamento após aceite na fila | observar a fila do Windows | NÃO EXECUTADO | | |
| I20 fila offline com entrega tardia | §6 (impressora desligada com fila ativa) | NÃO EXECUTADO | | |
| Tempo venda → papel (meta < 3 s) | §3.3 | NÃO EXECUTADO | | |

`PHYSICAL_HOMOLOGATION=PASS` só com todas as linhas preenchidas com evidência e aprovação escrita do proprietário.
