# Ambiente D05 — execução autorizada em alvo exclusivo

GOAL `OMNI-PRINT-D05-HOMOLOGACAO-FISICA-END-TO-END-001`. Resultado desta etapa: **D05_PREPARED**.
Plano inicial legível por máquina: `tools/print-d05/PLAN.json`. É um snapshot histórico da preparação anterior à autorização,
mantido como fixture dos gates fechados; seus campos pending não representam o estado atual. Autorizações e execução atuais:
`evidence/d05/authorized-environment/AUTHORIZATION.json`, `NEON_TARGET.json`, `DATABASE_READY.json` e `VERCEL_TARGET.json`.
Nenhuma chave, URL de conexão, código de pareamento ou senha deve ser acrescentada ao plano.

## Escopo autorizado em 2026-11-05

| Gate | Alvo a preencher pelo proprietário | Estado |
|---|---|---|
| NEON_TEST_BRANCH | organização QA free `org-young-bar-55840347`; novo projeto `super-credit-72834107`, branch raiz `br-billowing-cake-b627zsxv`, banco `omni_print_d05` | AUTHORIZED / CREATED; vazio antes do baseline versionado, sem parent |
| VERCEL_TEST_PREVIEW | projeto OmniGestão `prj_wjkHKw2jFQfY8regMYtkYXwgavuz`, team Hobby `team_IInBSQbKO8P5XpAsvz16Kc3g`, branch D05 exata | AUTHORIZED; provisionamento/deploy aguardam commit, revisão, CI e isolamento |
| WINDOWS_PHYSICAL_INSTALL | RAFACELL, usuário `RAFACELL\rafae`, SID terminado 1002; consentimento confirmado; pacote sem assinatura | AUTHORIZED_CONDITIONALLY; nome do operador e janela ainda não informados |
| REAL_PRINTER_USE | POS-80 USB / USB005 / driver 11.3.0.1, bobina disponível 80 mm | AUTHORIZED_CONDITIONALLY; fila observada offline, diagnosticar sem imprimir |
| D05_PHYSICAL_EXECUTION | bancada da loja/assistência; proprietário ou operador presente | PENDING_OPERATOR_AND_WINDOW; 0/18 testes físicos |

Transporte autorizado apenas nesse Preview após commit específico revisado, CI verde e prova de isolamento. Reinício,
interrupção do atendimento, energia, desconexão e falhas provocadas dependem de confirmação presencial específica.
Nenhuma instalação, tarefa, pareamento ou impressão real foi executada. Custos pagos, merge e produção continuam proibidos.

## Banco e dados

Usar projeto de teste e parent com dados exclusivamente sintéticos. **Não derivar branch normal da produção, não obter
connection string produtiva, não consultar ou copiar linhas comerciais.** Se esse parent ainda não existe, sua criação
também exige aprovação; o projeto criado é novo/vazio na organização QA free. Uma branch schema-only
ainda exigiria acesso ao schema da origem: não é alternativa autorizada para esta sessão.

O schema baseline pode ser gerado do arquivo versionado `prisma/schema.prisma` da base `37acc3b7e71d20dcbe623e6a2f87347e54f49ee6`,
como faz o laboratório local aprovado. Esse baseline e D02 foram aplicados/verificados no alvo novo autorizado. Não usar
`migrate reset`, `db push` ou o histórico quebrado desde o vazio
como atalho. Reutilizar `RUNBOOK_D02.md`: status, índices, core, verify e registro controlado no banco de teste.
Não promover migrations para `prisma/migrations` nem alterar `APLICACAO.json` produtivo nesta D05.

Separar papel de aplicação, papel mínimo de retenção D03 e credencial administrativa temporária. `DIRECT_URL`/D02 usam
endpoint direto; aplicação pode usar conexão pooled do mesmo branch. Conferir projeto/branch/endpoint/banco/papel antes
de qualquer acesso. `environment.mjs` exige operação explícita e diretório DPAPI externo ao repositório.
Prisma D05 exige `sslmode=require&sslaccept=strict`; libpq usa `verify-full` com as CAs públicas do Node 24.
O ajuste restrito no `resolve` D02 traduz verify-full/verify-ca para strict e conserva a CA; SQL/migrations D02 inalterados.
O papel de retenção tem NOINHERIT e nenhum privilégio administrativo; o cron permanece desligado.

Massa: loja D05 sintética, ADMIN de configuração e CAIXA de operação, dois terminais/dispositivos, produtos “Pão de queijo”,
“Café com açúcar”, “Maçã/Ç/ã/é”, unidades e KG, dinheiro com troco, vendas confirmadas/pendentes/offline. Sem CPF real,
integração fiscal, adquirente, conciliação ou movimentação em loja real. IDs correlatos vão para o registro H01–H18.
Reutilizar fixtures e cenários D01–D04 no laboratório; não copiar indiscriminadamente um seed administrativo para o Preview.

## Preview, release e segredos

O primeiro push contém `git.deploymentEnabled["codex/omni-print-d05-homologacao-fisica-001"]=false` em `vercel.json`.
Isso bloqueia o deploy Git automático desta branch; as regras já existentes foram preservadas.
Não executar `vercel`, `vercel --prod`, deploy hook ou mudança remota de variáveis antes da liberação.
Referência: [configuração Git da Vercel](https://vercel.com/docs/project-configuration/git-configuration).

O release ID é `OMNI-PRINT-D05-HOMOLOGACAO-1`, ainda **não publicado**. O delta autorizado acrescenta modo HOMOLOGATION
limitado a Preview + projeto + branch + endpoint/banco/papel + release, com TLS estrito e chaves distintas. O wrapper do
build confere o isolamento antes do build original; Production falha antes de qualquer etapa. `APPROVED_RELEASE=null`
permanece intacto. O commit, sua revisão e o CI antecedem a criação do Preview operacional.

Todas as variáveis listadas no plano deverão ter `target=preview` e `gitBranch` exata. Não criar variável Preview global.
Conferir também variáveis herdadas de integrações: banco, autenticação, webhooks, storage, fiscal, pagamentos e jobs precisam
ser isolados/desativados; herança não comprovada bloqueia deploy. `MIGRATION_AUTHORITY_ENABLED=false`, sem cron; D02 manual.
Usar `AUTH_SECRET` independente e usuários sintéticos. Planejar `NEXTAUTH_URL`/domínio final e trusted host sem reutilizar
cookies de produção. [Escopo e persistência das variáveis](https://vercel.com/docs/environment-variables).

Responsável designado gera conteúdo e assinatura como dois valores distintos de CSPRNG de 32 bytes, temporários, guardados
só no secret store do ambiente. Chaves D05 independentes foram geradas em CSPRNG e cifradas com DPAPI CurrentUser em pasta
privada fora do Git; nenhum valor integra evidências. A credencial do agente nasce de pareamento único
nessa instância, fica cifrada com DPAPI CurrentUser e nunca é fornecida ao navegador ou reaproveitada de outro ambiente.
Aplicar RUNBOOK_D03 para rotação/revogação; sem dar acesso de owner ao job de retenção.

Proteção do deployment: manter HTTPS, sem redirects e com acesso do agente comprovado. O cliente D04 não possui opção
de header de bypass Vercel. Se o domínio exigir esse header, **BLOCKED**: preparar solução revisada/autorizada ou domínio
de homologação com controle de acesso compatível. Não colar segredo na URL, relaxar TLS ou desproteger projeto globalmente.

## Sequência e progresso

1. Autorização de recursos/Windows registrada; nome do operador e janela continuam pendentes. Baseline/CI anterior preservados.
2. Projeto/branch novos criados em QA free, sem parent, vazio comprovado e autenticação por senha obrigatória.
3. Baseline/D02 aplicados; três migrations registradas apenas no alvo, mirror fora do Git. Seed idempotente: uma loja,
   dois usuários, dois terminais, três produtos, estoque pelo ledger canônico; zero vendas/jobs; impressão da loja desligada.
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

## Finalização 2026-11-08 — origem de autenticação do Preview

`AUTH_URL`/`NEXTAUTH_URL` da branch D05 **não podem ser string vazia**: no Auth.js, `trustHost = !!(AUTH_URL ?? AUTH_TRUST_HOST ?? VERCEL …)` e `""` não é nulo, então `trustHost=false` e todo `/api/auth/*` responde 500 (`UntrustedHost`) — causa do `ADMIN_CSRF` do probe de 2026-11-07. Valor obrigatório: o alias estável da branch `https://omni-gestao-pro-git-codex-o-ab41e6-rafaelfaria49-4373s-projects.vercel.app` (`D05_TARGET.origin`). `d05IsolationErrors` recusa qualquer outro valor (build e runtime). `private-state.ps1 -Mode Initialize` já grava o alias. O alias é a URL do servidor para o pareamento do agente.
