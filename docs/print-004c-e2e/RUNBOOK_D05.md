# D05 — homologação física preparada, não executada

Estado: **PENDING**. Todas as linhas abaixo começam **NÃO EXECUTADO**. D04-A autoriza a preparação do software;
não autoriza instalar no caixa, criar branch Neon, configurar Preview, parear, imprimir ou declarar homologação.
`APPROVED_RELEASE=null`. Não houve operação produtiva nesta entrega.

## Próxima liberação necessária

O proprietário deve definir por escrito: local/bancada ou loja piloto, data, operador responsável, consentimento da loja,
computadores/usuários Windows, impressora POS-80 USB e autorização de ambiente de homologação. Só depois preparar banco
isolado e Preview fixado na branch autorizada, pelo RUNBOOK_D02; chaves sintéticas distintas pelo RUNBOOK_D03; registrar
release de homologação revisada sem tocar Production. Não reutilizar dados/clientes reais. Conferir acesso HTTPS do agente
ao deployment, incluindo proteção de deployment, sem relaxar TLS ou seguir redirects.

Registrar antes de iniciar: PR/SHA, SHA-256 do ZIP, assinatura ausente, operador, loja de teste, terminal, SID/usuário
Windows, versão do Windows/Node/Chrome/Edge, modelo e número de série da impressora, USB/porta, nome exato da fila, driver
e versão, largura de bobina. O instalador exige Node 24 >=24.12 e instala tarefa desabilitada no mesmo usuário do pareamento.
Seguir `tools/omni-print-agent/README.md`; preservar evidências fora do diário, sem copiar código/token/chaves em fotos/logs.

## Registro obrigatório

| ID | Execução e critério de aceite | Estado | Evidência / operador / horário |
|---|---|---|---|
| H01 | Fila POS-80 USB e driver identificados; porta USB presente; impressora não pausada/offline; foto da montagem | NÃO EXECUTADO | preencher |
| H02 | Instalação íntegra no usuário autorizado; DPAPI abre nesse usuário e falha em outro; tarefa Interactive/Limited/IgnoreNew | NÃO EXECUTADO | preencher |
| H03 | Logoff/logon e reboot reais iniciam somente uma instância; usuário do pareamento preservado | NÃO EXECUTADO | preencher |
| H04 | Chrome, bobina 58 mm, 32 colunas: Pão, Café, açúcar, Ç/ã/é, total/troco; sem corte de texto | NÃO EXECUTADO | foto do papel |
| H05 | Chrome, bobina 80 mm, 48 colunas: mesmo conteúdo; corte funciona; gaveta não recebe pulso | NÃO EXECUTADO | foto + observação |
| H06 | Edge nas duas larguras: primeira via única; sem diálogo; resultado mostra aceite de fila, sem prometer papel | NÃO EXECUTADO | foto + vídeo opcional |
| H07 | Segunda via no PDV, Histórico e Conferência: autorização/consentimento e marca SEGUNDA VIA; original não reenviado | NÃO EXECUTADO | IDs job/via + fotos |
| H08 | Fallback explícito no navegador em Chrome/Edge: clique do operador, registro e marca correta; sem impressão por dois canais | NÃO EXECUTADO | log + fotos |
| H09 | Impressora desligada antes do envio: falha comprovada antes de bytes, recuperação controlada sem novo original | NÃO EXECUTADO | log + foto |
| H10 | Papel acaba/fila pausa/bloqueia após envio: estado incerto/aceite tratado sem reenviar; não limpar a fila automaticamente | NÃO EXECUTADO | fila + papel |
| H11 | USB desconectada e reconectada antes/depois do envio: nenhum segundo cupom não autorizado | NÃO EXECUTADO | horários + logs |
| H12 | Rede cai antes e após envio; reconexão só repete relatório conhecido, sem repetir bytes | NÃO EXECUTADO | diário + servidor |
| H13 | Morte forçada do agente/host, travamento e reboot no envio: órfão encerrado/verificado, UNKNOWN preservado | NÃO EXECUTADO | PIDs/criação + logs |
| H14 | Queda de energia de computador e impressora: retomada após logon sem duplicar; nenhum resultado incerto reenviado | NÃO EXECUTADO | papel contado + logs |
| H15 | Dois agentes simultâneos no mesmo diário recusados; dois caixas/filas/vínculos corretos, sem cruzar loja/terminal | NÃO EXECUTADO | duas estações + IDs |
| H16 | Revogação interrompe novas vias; parada persiste no próximo logon; atualização preserva diário/instância/DPAPI | NÃO EXECUTADO | hashes antes/depois |
| H17 | Segurança: somente HTTPS de saída do agente, nenhuma escuta; gaveta não abre em primeira/segunda/fallback/teste | NÃO EXECUTADO | conexões + observação |
| H18 | D03: limites de vias/itens/bytes, expurgo preserva provas/UNKNOWN; D02 compatível e PDV Clássico/offline sem regressão | NÃO EXECUTADO | referência de CI + observação |

Cada caso exige data/hora, resultado observado, foto de todo papel, IDs técnicos sintéticos correlatos, log redigido e
identificação do operador. Antes e depois de falhas, contar os cupons e anotar sendKey/attemptId. Uma segunda via só pode
ser solicitada pelo fluxo autorizado após avaliar o risco atual; nunca limpar trava/diário/fila para tentar novamente.
Aceite do spooler não prova saída física, corte ou gaveta.

## Parada e desmontagem

Parar imediatamente em duplicidade, pulso na gaveta, impressão sem venda confirmada, dados reais ou impacto na loja.
Desligar novas emissões pelo procedimento aprovado; preservar relatórios pendentes conforme RUNBOOK_D03. Revogar o agente,
executar Stop/Uninstall controlados no mesmo usuário e guardar diário/instância/registro de hosts/credencial cifrada para
reconciliação. Não purgar histórico nem restaurar backup antigo em operação. Registrar filas com jobs incertos e decisão
humana sobre cada via; não reenviar nem cancelar silenciosamente.

Após o ensaio, desativar o recurso, revogar a instalação, remover somente as variáveis Preview fixadas na branch e os
deployments de homologação autorizados, desmontar o banco de teste conforme autorização e confirmar que Production não
mudou. Recolher a impressora/cabos e restaurar a organização física da bancada. Arquivar evidências e o responsável.

`PHYSICAL_HOMOLOGATION=PASS` só depois de todos os casos aplicáveis executados, desvios resolvidos, evidências conferidas
e aprovação escrita do proprietário. Esta preparação não muda nenhum caso físico para PASS.
