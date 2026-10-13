# 025-A · Proveniência das revisões independentes

Data original: 2026-10-12; regularização: 2026-10-13 (America/Sao_Paulo).
PR: [#265](https://github.com/rafaelfaria49-png/omni-gestao-pro-pdv-claude/pull/265).
Autor/executor documental: Codex / OpenAI, família openai. Revisores históricos: Google/Gemini e ZCode/GLM, família zai.

## Tentativas iniciais sem parecer

As solicitações iniciais tiveram alvo 9cb53355b303fa64255a8fe70439b7b08ee27311, base 1fd90905e05656444576cf83c9df6c46919a917a. Esse alvo não foi aprovado por essas tentativas.

- Gemini CLI legado: exit 55, IneligibleTierError / UNSUPPORTED_CLIENT; trust ausente e recusa headless. Nenhum parecer. Não houve alteração de auth/trust/permissões nem contorno.
- Claude Code: HTTP 429 semanal, exit 1, session_id=20c9ee6c-26d6-44c8-a54a-37a109f2f7c7; duration_api_ms=0, input/output_tokens=0, modelUsage vazio. Nenhum parecer. Reset informado: 2026-10-15 às 11:00 America/Sao_Paulo. Alternativa após reposição de cota, sem nova tentativa nesta ratificação.

Esses impedimentos históricos não são vereditos técnicos e não invalidam a execução independente posterior.

## R efetiva Google via Antigravity

[Texto integral atribuível publicado na PR](https://github.com/rafaelfaria49-png/omni-gestao-pro-pdv-claude/pull/265#issuecomment-6134615719).

~~~text
PR=265
REVIEWED_SHA=e3c9d4a416972a65b1283b568ae5b13d3897b5c8
R_EXECUTOR=Antigravity CLI 1.3.2 / Gemini
R_MODEL=gemini-3.8-flash-high
R_FAMILY=google
INDEPENDENCE_VALID=true
OPTION_A_VERDICT=REJECTED_UNDER_STRONG_ADMIN_THREAT_MODEL
OPTION_B_VERDICT=VIABLE_RECOMMENDED
OPTION_C_VERDICT=VIABLE_CANDIDATE
RECOMMENDED_OPTION_AFTER_REVIEW=B_WORM_OBJECTS_WITH_PROTECTED_REFERENCE
NEW_BLOCKERS=NONE
R_VERDICT=APPROVE
~~~

Conversa a1a0e0e3-97b1-46a7-aac8-a6a9545bb774. Transporte stream-json por stdin, corpus versionado completo com caminhos/linhas/blobs, GOAL/plano, ADRs, governança, contratos fiscais e diff integral. Corpus: 752514 bytes, SHA-256 07b14d409e29cc7aec17c8f602f85d3232e7005376e93c936c73e4914267aba3; diff: 69928 bytes, SHA-256 3a55b4e0b01aa10da2dc0899c6c3f4134a9f1374164d4977e412e1d212bf34c2.

Modelo confirmado no catálogo/init: gemini-3.8-flash-high, família Google. Gemini 3.1 Pro do PR #247 não estava no catálogo; não é o modelo desta R. Execução terminou SUCCESS com análise efetiva; consolidação e erratas foram feitas pelo próprio revisor. Chamadas de ferramenta observadas: zero. O catálogo anunciava ferramentas; o wrapper instruía uso exclusivo do corpus e interromperia qualquer chamada. permission_mode reportado: request-review. Não se declara plan mode ou remoção do catálogo. Nenhuma alteração de autenticação, confiança ou permissões.

O parecer foi publicado como comentário de Conversation pela conta GitHub do usuário, com Codex/OpenAI identificado como publicador e Google como revisor. **Não é review nativa GitHub**, decisão humana ou prova de backend.

## R histórica ZCode/GLM e autorização humana restrita

[Texto integral atribuível publicado no PR](https://github.com/rafaelfaria49-png/omni-gestao-pro-pdv-claude/pull/265#issuecomment-6137375809), em 2026-10-13T03:13:34Z. Revisor efetivo: ZCode (agente interativo), família zai; publicador: conta GitHub do coordenador, a pedido humano. O comentário registra análise efetiva do checkout exato, sem escrita ou acesso DB/storage/SEFAZ. Não é review nativa GitHub.

~~~text
PR=265
REVIEWED_SHA=6def6fabc407434562330e5b6274f4c8df167a85
R_EXECUTOR=ZCode
R_FAMILY=zai
R_MODEL=GLM-5.3
R_VERDICT=APPROVE
NEW_BLOCKERS=NONE
~~~

O identificador publicado é GLM-5.3; nenhuma variante Flash foi confirmada ou atribuída. O parecer declarou originalmente o desvio das famílias google/anthropic autorizadas à época. Em 2026-10-13 (America/Sao_Paulo), Rafael Faria autorizou explicitamente registrar zcode/zai em executors.json e habilitar essa família como alternativa adicional de R exclusivamente para Fiscal 025-A; [registro da autorização](../../../execution-tracks/fiscal/phases/025-A-ARCHITECTURE.md). Mantêm-se preferência google, alternativa anthropic e implementador openai.

O parecer é preservado como revisão histórica tecnicamente válida sobre o SHA declarado. A regularização não muda seu alvo nem atribui APPROVE ao novo commit. O registro conservador classes=[C1], verificado=false não concede C4 nem confunde classes de execução com R. A política global de independência e os gates fiscais permanecem inalterados; a autorização não se estende a outros GOALs críticos.

## Decisão humana e revisão incremental

O humano aprovou B explicitamente após o parecer, rejeitou A para ameaça administrativa forte e manteve C como alternativa. HUMAN_ARCHITECTURE_DECISION=B_APPROVED. O perfil de referência é S3 Object Lock COMPLIANCE; R2 exige nova aceitação humana de riscos administrativos.

Os dois SHAs históricos acima são âncoras distintas de R já concluídas. A ratificação documental B foi revisada pelo ZCode em 6def6fabc407434562330e5b6274f4c8df167a85. Este commit regulariza o executor e sua autorização específica, muda o HEAD e **exige nova R independente efetiva do ZCode/GLM sobre o novo SHA completo após o push e antes de qualquer merge**. A solicitação está em [REVIEW_REQUEST.md](REVIEW_REQUEST.md). Conferir inclusão correta em executors.json, independência zai versus openai, limite 025-A, arquitetura B/ADR-0024 preservadas, ausência de mudanças funcionais e de novos blockers. Resultado/executor/modelo/família/SHA/comment URL serão registrados no PR, sem alegar aprovação antecipada neste commit.

Exigir R_VERDICT=APPROVE ou R_VERDICT=REQUEST_CHANGES, em parecer atribuível no PR. Se ZCode/GLM estiver indisponível ou não houver inferência efetiva independente: registrar R_VERDICT=NOT_ISSUED para a nova tentativa e parar; não substituir por autoavaliação Codex nem pelo parecer histórico. Nenhum merge autorizado nesta execução. FINAL_DECISION=AWAITING_PR_265_DOCUMENTARY_MERGE_AUTHORIZATION; STOP=AWAITING_PR_265_DOCUMENTARY_MERGE_AUTHORIZATION.

IMPLEMENTATION_AUTHORIZED=false; STORAGE_PROVISIONING_AUTHORIZED=false.
CODE_CHANGED=false; SCHEMA_CHANGED=false; DB_WRITES=0; SEFAZ_TRANSMISSIONS=0.
G_F7=BLOCKED; G_F12=BLOCKED. Nenhuma abertura de 025-B/C/D.
