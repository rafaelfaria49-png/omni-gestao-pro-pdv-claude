# 025-A · Proveniência das revisões independentes

Data: 2026-10-12 (America/Sao_Paulo).
PR: [#265](https://github.com/rafaelfaria49-png/omni-gestao-pro-pdv-claude/pull/265).
Autor/executor documental: Codex / OpenAI. Revisor independente: Google/Gemini.

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

## Decisão humana e revisão incremental

O humano aprovou B explicitamente após o parecer, rejeitou A para ameaça administrativa forte e manteve C como alternativa. HUMAN_ARCHITECTURE_DECISION=B_APPROVED. O perfil de referência é S3 Object Lock COMPLIANCE; R2 exige nova aceitação humana de riscos administrativos.

O SHA acima é a âncora da R já concluída. A ratificação, promoção da ADR/índice, contratos de B e reconciliação de main mudam o HEAD: **exigem nova R incremental efetiva no SHA final antes do merge**. A solicitação está em [REVIEW_REQUEST.md](REVIEW_REQUEST.md). Resultado/modelo/família/SHA/comment URL do novo parecer e estado de merge serão registrados no PR, sem alegar aprovação antecipada neste commit.

Se não houver inferência efetiva independente: R_VERDICT=NOT_ISSUED para a tentativa incremental e STOP=R_RUNTIME_BLOCKED; não substituir por autoavaliação Codex.

IMPLEMENTATION_AUTHORIZED=false; STORAGE_PROVISIONING_AUTHORIZED=false.
CODE_CHANGED=false; SCHEMA_CHANGED=false; DB_WRITES=0; SEFAZ_TRANSMISSIONS=0.
G_F7=BLOCKED; G_F12=BLOCKED. Nenhuma abertura de 025-B/C/D.
