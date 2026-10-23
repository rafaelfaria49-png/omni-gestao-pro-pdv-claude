# Baseline e Preview privado Pessoas QA — 15/10/2026

GOAL: PESSOAS-DP-FRONTEND-001B-RECOVERY-001.
Executor: Codex/OpenAI. Evidência de execução isolada e smoke manual; não é revisão cross-family nem homologação integral.

## Autorização e escopo

Pedido humano de 15/10/2026, missão “CONCLUIR BASELINE, R2 E PREVIEW PRIVADO REAL”: baseline no projeto Neon QA identificado, conexão restrita, acesso exclusivamente R2, fixtures sintéticas, credenciais mínimas e Preview privado. Sem serviço pago novo, produção, merge, close/DONE ou GOAL 002.

Worktree: C:/Projetos/omni-gestao-pessoas-001b-recovery-001.
Branch: goal/pessoas-001b-recovery-001.
HEAD inicial, aplicado e visitado: 3ed789c689b41acbdc3e8f5ca5e10c26ff6d7479.
Base canônica do schema: 1a80f2c51671c9f8a23d64ea2f3c1f096fd78b8d.
AEP: RUNNING, sessão aberta, tentativa 1/3. PR #273 permanece draft.
Main remota consultada: 4a85dd95202b56873487b31c318fc2d751fc26f5. Sem rebase/merge/force push. Nenhum arquivo de outra trilha foi incorporado.

Esta evidência atualiza as pendências do preflight anterior, que retratava o banco ainda vazio. Nenhum PASS antigo é reaproveitado.

## Neon: identidade, baseline e invariantes

Plugin Neon conectado e utilizado para SQL no projeto orange-voice-83394974, nome omni-gestao-pessoas-001b-qa, organização Omni Gestão QA (Free/free_v3).
Branch br-twilight-shape-b5zrtyts, endpoint ep-steep-hall-b5ml41wv.
Banco pessoas_001b_qa, ator de baseline pessoas_001b_qa_owner, PostgreSQL 17.11.
Hostname direto confirmado pelo provedor: ep-steep-hall-b5ml41wv.c-7.us-east-2.aws.neon.tech.
Hostname pooled: ep-steep-hall-b5ml41wv-pooler.c-7.us-east-2.aws.neon.tech.
A branch padrão denominada production pertence somente a este novo projeto QA; não identifica o banco da aplicação produtiva.

Antes do DDL, SQL confirmou identidade esperada e zero tabelas públicas. O schema foi extraído da base fixa para diretório temporário externo, seguindo a receita de scripts/pessoas/run-official-tests.mjs. O diff Git de schema/migrations base → HEAD é vazio.

Geração offline com Prisma 6.19.3:
```text
prisma migrate diff --from-empty --to-schema-datamodel ./base.prisma --script
```

Baseline: 129453 bytes, SHA-256 74A3C5B88CCDAF70161F60143024C7D2EED20F14902C839506390CC11D302C79.
Inspeção: 109 tabelas, 36 enums, 169 FKs, 275 índices ordinários; zero alvos de FK ausentes e zero comandos destrutivos/de dados/GRANT/REVOKE na baseline gerada.

Uma transação aplicou guard de identidade/vazio, 590 statements da baseline e 31 statements do trecho de invariantes existente da migration 0022, sem repetir seu DDL de tabelas. O resultado confirmou 109 tabelas públicas.
Catálogo verificado: 10 CHECKs, sete índices únicos parciais, dez triggers e quatro funções esperadas, zero ausentes. Relação exata em QA_BASELINE_PREVIEW_2026-10-15.json.

Histórico adotado: baseline QA por schema fixo + invariantes 0022, com proveniência/hash e identidade nesta evidência. _prisma_migrations permanece ausente. A cadeia histórica não foi replayada nem marcada ficticiamente como aplicada. Sem migrate reset, db push, migrate resolve ou schema/migration de produto novos.

A conexão local do Prisma retornou P1001; essa tentativa não comprovou drift. A conferência específica foi executada no ambiente Vercel QA com credencial de aplicação:
```text
npx prisma migrate diff --from-schema-datasource prisma/schema.prisma --to-schema-datamodel prisma/schema.prisma --exit-code
No difference detected.
PESSOAS_QA_SCHEMA_DRIFT_ZERO
```
Exit zero na instalação do deployment final. As invariantes complementares foram verificadas separadamente no catálogo, pois não são todas expressas pelo schema Prisma.

## Credenciais e fixtures

Role de runtime exclusiva pessoas_001b_qa_app: sem SUPERUSER, CREATEDB, CREATEROLE, INHERIT, REPLICATION ou CREATE no schema public. CONNECT/USAGE, SELECT nas tabelas QA, INSERT/UPDATE/DELETE apenas em dp_*, e acesso às sequências. O runtime não recebe o owner. DATABASE_URL pooled e DIRECT_URL direto apontam para a mesma role QA.

Credenciais aleatórias QA, chaves DP e AUTH_SECRET exclusivos, sem reaproveitamento produtivo. Foram preservados fora do Git em arquivo CLIXML protegido por DPAPI CurrentUser e ACL restrita ao usuário Windows/SYSTEM. Transportes temporários de login foram removidos. Senhas, URIs de conexão, CPF, cipher/hash de CPF, cookies e URLs assinadas não integram esta evidência.

Fixtures via SQL autorizado: Stores qa-pessoas-a/qa-pessoas-b; usuários admin.pessoas.qa@example.invalid e restrito.pessoas.qa@example.invalid; memberships A/B; capacidades completas do administrador e apenas viewCadastro para o leitor. Não se atribui criação pela UI a essas fixtures. O bootstrap UI concedeu o acesso inicial do administrador na Store A; o vínculo da unidade B e demais grants foram fixtures SQL.

Empregador cmv9llplm0001lf08a0i4qq9a e estabelecimento cmv9llpnu0005lf08c1pt0t52 foram criados pela interface/Server Actions reais, com nomes e inscrições explicitamente QA. SQL confirmou versão inicial e auditoria.

## Preview dedicado e proteção

Projeto Vercel: prj_oeXN2OJGa0fXLvkoLynD39H3hPOK, omni-gestao-pessoas-001b-qa, time rafaelfaria49-4373s-projects, Hobby.
Deployment final: dpl_BiqCTkxCT5kNZmLj7ermmFnyoZmH, READY, target API staging (ambiente Preview), Git SHA 3ed789c689b41acbdc3e8f5ca5e10c26ff6d7479.

[URL HTTPS de visita — Pessoas](https://omni-gestao-pessoas-001b-fiohd84il-rafaelfaria49-4373s-projects.vercel.app/dashboard/pessoas).
[Painel do deployment](https://vercel.com/rafaelfaria49-4373s-projects/omni-gestao-pessoas-001b-qa/BiqCTkxCT5kNZmLj7ermmFnyoZmH).
O commit documental posterior não está incluído nesse deployment; o código de produto é o mesmo.

Projeto sem Git link/auto-deploy de main, publicSource=false e ssoProtection.deploymentType=all. Somente variáveis Preview: PESSOAS_DP_ENABLED=on, PESSOAS_STORAGE_PROVIDER=r2, DATABASE_URL, DIRECT_URL, AUTH_SECRET, AUTH_TRUST_HOST e três chaves DP. Nenhuma variável production no projeto QA. Sem credenciais R2 enquanto o storage está pendente.

GET sem cookies à URL final retornou HTTP 302 para vercel.com/sso-api. Atrás da proteção Vercel, os dois usuários sintéticos entraram pelo formulário NextAuth normal. Login e rotas permaneceram no hostname QA. O login redireciona ao dashboard; abrir novamente o link Pessoas. O wizard global opcional de identificação da loja pode ser adiado em “Voltar depois”.

Ocorrência operacional: o primeiro POST de deployment omitiu target e a Vercel classificou dpl_D93hDttKdiYhzifQcfgH37kuNtxR como production no projeto QA recém-criado. Foi cancelado imediatamente, estado CANCELED confirmado pelo provedor, sem variáveis produtivas. Os deployments seguintes usaram explicitamente staging/Preview. Não se declara ausência de tentativa com target production. Os projetos/bancos/variáveis de produção existentes não foram alterados.

Compilação remota final concluída, MIGRATION_SKIPPED confirmado. O build do provedor informou que pulou validação de tipos; não comprova typecheck, lint ou testes. Sem build local ou runner oficial nesta missão.

## Smoke manual real e persistência

| Fluxo | Observação concreta |
| --- | --- |
| Visão geral | Store A mostra um vínculo, um ativo, zero rascunhos e arquivados, consistentes com o banco. |
| Lista/filtros | Pesquisa por matrícula e ATIVO localizam o vínculo A; termo inexistente mostra “Nenhum resultado para esses filtros.”. |
| Novo A | Cadastro completo pela UI, vínculo cmv9lrx2i000jlf08qokb78z8, matrícula QA-001B-A-001, ATIVO. CPF sintético mantido somente na fixture privada; SQL consultou apenas presença de criptografia. |
| Recarga/edição A | Mesmo vínculo após reload. Nome alterado pela UI para Funcionário QA 001B — Store A (editado); versão pessoal 2, duas versões preservadas. |
| Contrato/histórico A | Nova versão ALTERACAO pela UI: salário sintético 2800.00 → 3000.00, vigência 02/10/2026. Vínculo v2, contrato v1 superseded e v2 atual com supersedesId correto; UI mostra histórico e resultado positivo. |
| Novo B | Pela UI, somente nome/matrícula/motivo; vínculo cmv9n3lhl0005ie083wgpmip0, QA-001B-B-001, RASCUNHO v1, persistente após reload. |
| Store A/B | Troca pelo seletor real Gestão da Rede. B inicialmente vazia, sem registro A. URL direta da ficha A em contexto B retorna “Registro não encontrado neste contexto.”. Após cadastro B, SQL confirma exatamente A=1/B=1. Retorno a A mostra apenas A. |
| Leitor restrito | Login NextAuth próprio; ficha mostra Remuneração restrita, Motivo restrito e Acesso documental não concedido. Sem ações de edição/contrato. Inspeção read-only do DOM/HTML não encontrou 2800/3000 nem os motivos pessoais/contratuais. Não inspecionou payload de rede. |
| Configuração | Empregador/estabelecimento gravados por Server Actions reais e confirmados no banco; nenhuma alteração de setup produtivo. |
| Documentos | Zero registros documentais. Nenhuma confirmação/upload é declarada bem-sucedida. |

As verificações manuais não cobrem revogação durante request, rede oscilante, respostas tardias, conflitos entre sessões, todos os cenários R1–R5 ou F-01 em runtime.

## R2 e upload: pendências concretas

Acesso limitado a dash.cloudflare.com/.../r2/overview. O usuário informou login concluído; a nova inspeção ainda encontrou a tela de login e o aviso “Esta conta utiliza login único (SSO)”, sem painel de buckets. Foi solicitada somente a conclusão do método SSO, sem senha/token no chat. Sem acesso confirmado ao plano/franquia: nenhum bucket, token, CORS ou serviço pago R2 criado; nenhum DNS/zona/outro serviço acessado.

PDF fictício preparado: 673 bytes, SHA-256 2ec690891bb826e2d9934b2c84a1e1d9b472e45bbdf0e93bad17103fdb03b02d, sem dados pessoais. A extensão Edge recusou filechooser.setFiles por exigir “Allow access to file URLs”. Não se ampliou a permissão nem se contornou o navegador. Nenhum arquivo selecionado; upload-intent → PUT → complete → list/download não foi executado. O provider R2 permanece sem credenciais QA; documentos indisponíveis nesta entrega parcial, sem mock de sucesso.

Custo: Neon Free e Vercel Hobby, sem contratação paga nova. Franquia/cobrança da conta R2 não verificadas. Uma configuração R2 que exigir plano pago ou exceder a autorização precisa de decisão humana.

## Capturas e limites visuais

Capturas reais da lista, inspecionadas, sem CPF, segredo ou documento: Light, Soft Ice, Midnight e Black, cada um em 1440×900 e 390×844. Dimensões DOM verificadas; largura da página igual à viewport nas oito observações. Black observado como data-studio-theme=black e class black-edition.
Imagens adicionais: visão geral, histórico do leitor restrito e recusa Store B.
Esta amostra não homologa a matriz completa do GOAL (todas as telas/estados, 360×800, foco/teclado/contraste/reduced-motion).

| Tema | Desktop | Mobile |
| --- | --- | --- |
| Light | [1440×900](pessoas-qa-light-1440.jpg) | [390×844](pessoas-qa-light-390.jpg) |
| Soft Ice | [1440×900](pessoas-qa-soft-ice-1440.jpg) | [390×844](pessoas-qa-soft-ice-390.jpg) |
| Midnight | [1440×900](pessoas-qa-midnight-1440.jpg) | [390×844](pessoas-qa-midnight-390.jpg) |
| Black | [1440×900](pessoas-qa-black-1440.jpg) | [390×844](pessoas-qa-black-390.jpg) |

[Visão geral](pessoas-qa-overview-1440.jpg) · [Histórico restrito](pessoas-qa-restricted-history-1440.jpg) · [Recusa por Store](pessoas-qa-store-b-denial-1440.jpg).

## Estado de entrega

```text
NEON_PLUGIN=CONNECTED_AND_VERIFIED
DATABASE_IDENTITY=EXACT_QA_PROJECT_BRANCH_DATABASE_OWNER
BASELINE=APPLIED_QA_TRANSACTION_109_TABLES_INVARIANTS_VERIFIED
MIGRATION_HISTORY=FIXED_SCHEMA_QA_BASELINE_NO_FAKE_REPLAY
SCHEMA_DRIFT=ZERO_TARGETED_PROVIDER_CHECK
SYNTHETIC_DATA=ONLY_QA_FIXTURES_AND_REAL_UI_RECORDS_A_B
R2_PRIVATE=PENDING_AUTHENTICATED_SSO_DASHBOARD
LOGIN_QA=REAL_NEXTAUTH_ADMIN_AND_RESTRICTED_PRIVATE_VERCEL
CADASTRO_MANUAL=CREATE_RELOAD_EDIT_CONTRACT_HISTORY_AND_DRAFT_OBSERVED
DOCUMENT_UPLOAD=NOT_STARTED_R2_AND_BROWSER_FILE_SELECTION_BLOCKED
STORE_ISOLATION=MANUAL_A_B_LIST_AND_DIRECT_ID_DENIAL_OBSERVED
VISUAL_SCREENSHOTS=11_REAL_IMAGES_PARTIAL_MATRIX
ADDITIONAL_COST=NO_NEW_PAID_SERVICE_R2_ALLOWANCE_UNVERIFIED
PRODUCTION_UNCHANGED=EXISTING_PRODUCTION_RESOURCES_UNCHANGED
AUTOMATED_TESTS=PENDING
TYPECHECK=NOT_RUN
LINT=NOT_RUN
LOCAL_BUILD=NOT_RUN
REMOTE_COMPILE=COMPLETED_TYPES_SKIPPED_MIGRATION_SKIPPED
GLM_F01=APPROVE_RECEIVED_USER_SHA_6cd20313ad7f1404a99d691644c82fc92ae47a55
GLM_INTEGRAL=PENDING
AEP_CLOSE=NOT_RUN
PR_DRAFT=YES
NEXT_GATE=R2_SSO_PRIVATE_BUCKET_REAL_BYTES_THEN_FULL_VALIDATION_AND_INDEPENDENT_REVIEW
```

A execução continua limitada ao GOAL ativo. Sem ratificação AEP, liberação de dados reais ou produção.
