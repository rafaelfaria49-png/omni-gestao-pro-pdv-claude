# D05 — homologação física preparada, não executada

Estado físico: **PENDING**. Todas as linhas abaixo permanecem **NÃO EXECUTADO**. O proprietário autorizou em 2026-11-05
o ambiente exclusivo D05 e a instalação no RAFACELL/usuário consentido, sujeitos aos requisitos registrados no plano.
Neon QA novo já preparado; Preview/transporte aguardam commit revisado, CI verde e isolamento. Nome/janela ainda pendentes.
`APPROVED_RELEASE=null`. Não houve operação produtiva nesta entrega.

Preparação técnica D05: **D05_PREPARED**, branch `codex/omni-print-d05-homologacao-fisica-001` baseada no head
`0e9eb95d578c6c57e7e7f4b8b71355f460d970a4` da #327, com #332/#333 integradas. Nenhum caso físico foi executado.
Plano de ambiente e rollback: [PLANO_AMBIENTE_D05.md](PLANO_AMBIENTE_D05.md). Comandos e consentimentos:
[CHECKLIST_OPERADOR_D05.md](CHECKLIST_OPERADOR_D05.md). Relatório: [RELATORIO_D05.md](RELATORIO_D05.md).
Registro inicial com H01–H18 BLOCKED: `evidence/d05/H01-H18.template.json`. Copiar para a pasta privada de uma execução
futura; não substituir o template por resultados. Verificador offline:

```powershell
node --test tools/print-d05/readiness.test.mjs
node tools/print-d05/readiness.mjs check
node tools/print-d04/package.mjs tools/print-d05/.artifacts
node tools/print-d05/readiness.mjs package tools/print-d05/.artifacts/omni-print-agent-0.2.0-d04.zip tools/print-d05/.artifacts/omni-print-agent
```

Esses comandos preparam/validam arquivos locais. Não instalam agente, não acessam banco e não autorizam hardware.
Preview Git automático desta branch está bloqueado em `vercel.json`. Release de homologação ainda não publicada:
`OMNI-PRINT-D05-HOMOLOGACAO-1`. O novo runtime é restrito ao Preview/projeto/branch/banco autorizados, com validação TLS
estrita; exige revisão e CI do commit específico. Release produtivo NULL. O `PLAN.json` é o snapshot histórico inicial;
estado atual em `evidence/d05/authorized-environment/`, sem valores de segredos.

## Próxima liberação necessária

O proprietário já confirmou RAFACELL, `RAFACELL\rafae`/SID terminado 1002, consentimento e POS-80 USB/USB005, bobina80mm.
Faltam nome do operador e dia/horário presencial; os placeholders da resposta não são uma janela válida. Diagnosticar
a fila offline antes de imprimir. 58 mm depende de suporte real e N/A aprovado. Conferir acesso HTTPS do agente
ao deployment e isolamento comprovado, sem relaxar TLS ou seguir redirects. Reinício, interrupção do atendimento e falhas
provocadas aguardam confirmação presencial própria. Não instalar, parear ou imprimir antes dos requisitos pendentes.

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

## Finalização 2026-11-08

- Usar somente o ZIP do CI do head final da #334 (SHA-256 `e974ca03a8ae862b8f7b7da5d78cd6aa5fca0c1664b5bf114d79870f0452bc77`); o pacote `f48b3097…` foi substituído e nunca instalado.
- URL do servidor para pareamento: alias da branch D05 (`PLANO_AMBIENTE_D05.md`, seção de finalização). Não usar a URL por deployment.
- `JOURNAL_MISSING` ao iniciar: não apagar `.instance`, não recriar diário. Parar, arquivar a pasta de dados inteira, revogar a instalação e parear de novo; conferir papel das tentativas UNKNOWN.
- Instância morta com tentativa UNKNOWN mantém a impressora bloqueada (`DESTINATION_BLOCKED`) por design: conferir o papel, revogar e parear de novo; nunca liberar a fila à mão.
- Estado de execução, SHAs e pendências: `FINALIZACAO_INTEGRAL_D05.md`.
- `D05_ISOLATION_BLOCKED` num build sem `VERCEL_GIT_COMMIT_REF` (deploy por CLI de pasta sem git/HEAD destacado) é
  intencional: sem ref não há prova de que não é a branch D05. Builds Git de outras branches (main, #327) passam direto
  para `scripts/vercel-build.mjs`. O alias em `private-state.ps1` duplica `D05_TARGET.origin`; se o alias mudar, atualizar
  os dois (o `readiness`/isolamento recusa divergência no build).
