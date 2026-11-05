# Ambiente D05 — plano sem provisionamento

GOAL `OMNI-PRINT-D05-HOMOLOGACAO-FISICA-END-TO-END-001`. Resultado desta etapa: **D05_PREPARED**.
Plano legível por máquina: `tools/print-d05/PLAN.json`. Ele é uma proposta, não um comprovante de aprovação.
Nenhuma chave, URL de conexão, código de pareamento ou senha deve ser acrescentada ao plano.

## Escopo exato da liberação futura

| Gate | Alvo a preencher pelo proprietário | Estado |
|---|---|---|
| NEON_TEST_BRANCH | projeto exclusivamente de teste, parent sintético, nome/ID de branch, endpoint, banco, executor e janela | PENDING_OWNER_APPROVAL |
| VERCEL_TEST_PREVIEW | projeto, branch `codex/omni-print-d05-homologacao-fisica-001`, deployment, domínio HTTPS, controle de acesso | PENDING_OWNER_APPROVAL |
| WINDOWS_PHYSICAL_INSTALL | bancada, equipamento, SID/usuário Windows, responsável e consentimento, pacote sem assinatura | PENDING_OWNER_APPROVAL |
| REAL_PRINTER_USE | POS-80 USB, número de série, fila, driver, bobinas suportadas e responsável | PENDING_OWNER_APPROVAL |
| D05_PHYSICAL_EXECUTION | operador, local/data/janela, H01–H18, falhas provocadas e plano de parada/rollback | PENDING_OWNER_APPROVAL |

Também registrar autorização específica para ativar o transporte nessa release de homologação. Instalação, pareamento,
rede/USB, morte de processos e corte de energia exigem consentimento do responsável; nenhum desses atos foi executado.

## Banco e dados

Usar projeto de teste e parent com dados exclusivamente sintéticos. **Não derivar branch normal da produção, não obter
connection string produtiva, não consultar ou copiar linhas comerciais.** Se esse parent ainda não existe, sua criação
também entra na aprovação; não escolher silenciosamente o projeto produtivo disponível na conta. Uma branch schema-only
ainda exigiria acesso ao schema da origem: não é alternativa autorizada para esta sessão.

O schema baseline pode ser gerado do arquivo versionado `prisma/schema.prisma` da base `37acc3b7e71d20dcbe623e6a2f87347e54f49ee6`,
como faz o laboratório local aprovado. A preparação do schema da aplicação e a aplicação D02 nesse banco remoto exigem
plano revisado e autorização para o alvo exato. Não usar `migrate reset`, `db push` ou o histórico quebrado desde o vazio
como atalho. Reutilizar `RUNBOOK_D02.md`: status, índices, core, verify e registro controlado no banco de teste.
Não promover migrations para `prisma/migrations` nem alterar `APLICACAO.json` produtivo nesta D05.

Separar papel de aplicação, papel mínimo de retenção D03 e credencial administrativa temporária. `DIRECT_URL`/D02 usam
endpoint direto; aplicação pode usar conexão pooled do mesmo branch. Conferir projeto/branch/endpoint/banco/papel antes
de qualquer acesso. Nenhum comando D05 conecta ao Neon automaticamente.

Massa: loja D05 sintética, ADMIN de configuração e CAIXA de operação, dois terminais/dispositivos, produtos “Pão de queijo”,
“Café com açúcar”, “Maçã/Ç/ã/é”, unidades e KG, dinheiro com troco, vendas confirmadas/pendentes/offline. Sem CPF real,
integração fiscal, adquirente, conciliação ou movimentação em loja real. IDs correlatos vão para o registro H01–H18.
Reutilizar fixtures e cenários D01–D04 no laboratório; não copiar indiscriminadamente um seed administrativo para o Preview.

## Preview, release e segredos

O primeiro push contém `git.deploymentEnabled["codex/omni-print-d05-homologacao-fisica-001"]=false` em `vercel.json`.
Isso bloqueia o deploy Git automático desta branch; as regras já existentes foram preservadas.
Não executar `vercel`, `vercel --prod`, deploy hook ou mudança remota de variáveis antes da liberação.
Referência: [configuração Git da Vercel](https://vercel.com/docs/project-configuration/git-configuration).

O release ID proposto é `OMNI-PRINT-D05-HOMOLOGACAO-1`, **não ativo**. O runtime atual, corretamente, não liga em
`NODE_ENV=production` com `APPROVED_RELEASE=null`, inclusive em Preview. Portanto só criar variáveis não habilita D05.
Após aprovação própria do transporte, será necessário um commit revisado com ativação limitada a **Preview + projeto +
branch/release autorizados**, recusando Production e mantendo `APPROVED_RELEASE=null`. Não substituir NODE_ENV, remover
checagens, ligar o LAB em build produtivo nem preencher o release produtivo para contornar esse bloqueio. Esse commit e
seus testes antecedem qualquer Preview operacional. Nenhuma alteração desse runtime foi feita nesta preparação.

Todas as variáveis listadas no plano deverão ter `target=preview` e `gitBranch` exata. Não criar variável Preview global.
Conferir também variáveis herdadas de integrações: banco, autenticação, webhooks, storage, fiscal, pagamentos e jobs precisam
ser isolados/desativados; herança não comprovada bloqueia deploy. `MIGRATION_AUTHORITY_ENABLED=false`, sem cron; D02 manual.
Usar `AUTH_SECRET` independente e usuários sintéticos. Planejar `NEXTAUTH_URL`/domínio final e trusted host sem reutilizar
cookies de produção. [Escopo e persistência das variáveis](https://vercel.com/docs/environment-variables).

Responsável designado gera conteúdo e assinatura como dois valores distintos de CSPRNG de 32 bytes, temporários, guardados
só no secret store do ambiente. Nenhuma chave foi gerada nesta etapa. A credencial do agente nasce de pareamento único
nessa instância, fica cifrada com DPAPI CurrentUser e nunca é fornecida ao navegador ou reaproveitada de outro ambiente.
Aplicar RUNBOOK_D03 para rotação/revogação; sem dar acesso de owner ao job de retenção.

Proteção do deployment: manter HTTPS, sem redirects e com acesso do agente comprovado. O cliente D04 não possui opção
de header de bypass Vercel. Se o domínio exigir esse header, **BLOCKED**: preparar solução revisada/autorizada ou domínio
de homologação com controle de acesso compatível. Não colar segredo na URL, relaxar TLS ou desproteger projeto globalmente.

## Ordem após aprovação (não executada)

1. Registrar os cinco gates, consentimentos, executor/janela e IDs não sensíveis dos alvos. Conferir baseline e regressão.
2. Criar somente o branch de teste autorizado; comprovar fonte sintética, papéis, backup e retenção das evidências.
3. Aplicar/verificar D02 e carregar massa sintética conforme plano revisado. Não tocar Production.
4. Revisar/testar o commit de ativação exclusiva de Preview; provisionar apenas as variáveis da branch; autorizar um
   deployment exato e comprovar banco, domínio, proteção e release no destino antes de parear.
5. Instalar pacote D04 no usuário consentido, tarefa desabilitada; conferir integridade e DPAPI; parear e iniciar somente
   após conferir ambiente. Executar checklist do operador e H01–H18, preservando cada tentativa e contagem física.
6. Falha reproduzível: parar caso, diagnosticar/corrigir, regressão afetada, revisão independente e repetição física
   autorizada. Duplicidade, gaveta, venda indevida ou risco de dados interrompem toda a execução física e exigem nova liberação.

## Rollback e desmontagem

Parada normal: pausar solicitações humanas; aguardar relatos comprovados com gate disponível quando seguro, pois desligar
o gate também recusa `agentReport`. UNKNOWN permanece no diário/ledger para reconciliação, nunca novo envio.
Na emergência, desativar imediatamente novas emissões; preservar relatos que ficarem pendentes. Revogar instalação no
servidor e executar Stop no mesmo SID, sem limpar fila/lock/diário. Atualização mantém tarefa desabilitada e todo histórico.

Arquivar fotos, registros e logs redigidos fora da pasta de dados; backup completo do diretório de dados apenas depois de
parada controlada. Conferir hashes e casos pendentes. Desinstalar somente com revogação confirmada; preservar binários
inertes, credencial cifrada, instância, hosts e diário conforme D04. Não restaurar diário antigo ou reativar runtime 004C.

Remover variáveis da branch **e deployments antigos** autorizados: eles retêm a configuração anterior. Remover banco/branch
somente após autorização separada, evidências preservadas e UNKNOWN reconciliado/decisão humana registrada. Sem TTL que
destrua automaticamente banco com provas pendentes. Registrar responsável, horário e IDs removidos, confirmar Production
inalterada por escopo/ações; não acessar banco produtivo para produzir esse atestado.
