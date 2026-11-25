# OMNI-GESTAO-GASTOS-006 — Fundação de canais, fila e worker

Estado inicial: EM IMPLEMENTAÇÃO. Classe C4; executor OpenAI Codex; R independente Anthropic Claude Code / Sonnet 5.5 real. Autorização humana: comando G006 desta sessão, anexo a73d1a74-3e1e-4f89-bdc3-11696ac7a750/Texto colado.txt. Código, schema/migration aditiva e PostgreSQL descartável estão autorizados; configuração/deployment, produção, credenciais reais, envio externo e G007 não estão.

## Preflight e base

Base EXATA G005 abec9e9dc4ca17f0c3dca342ef38fa9feaa43b6c; branch codex/omni-gestao-gastos-006; worktree C:/Projetos/omni-gestao/.worktrees/omni-gestao-gastos-006. Cadeia direta conferida: G005 → G004 fad3d202a5556c1170af07b94181e668aa4d21a7 → G003 451b0e41ccf96215ed6c30e45ea2844dd0101faf → G002 bcde32ca83a216c512e5234d599a4bd8471869b0 → G001 55bab9a7a93218433912761d6ce2f07b8b3fdfad. Principal 5ae661d730af827006fd10c389ddbdd4f18edc51 e WIPs de outras trilhas preservados.

Fetch somente de referência no preflight confirmou origin/main a288ea2ce1e92e457f35770213bc072511f2852a. Deltas relevantes incluem gates de módulo/credenciais em rotas WhatsApp, webhook sem segredo fail-closed, schema de acesso da plataforma e configuração Vercel. Não integrar automaticamente; manter a base G005 e registrar necessidade de conciliação futura dos gates. Sem reset/rebase/merge/cherry-pick.

ENTRYPOINT, EXECUTION_PROTOCOL, TASK_LEVELS, governança/CORE_RULES/INDEX, START_HERE, estado e memória consultados. AEP opt-in AUSENTE na principal e nesta worktree; não abrir outra trilha nem editar state/ledger/registry. O comando humano já concede os gates C4 de código e testes desta fundação. Não executar close AEP que produziria commit adicional de estado.

Referência lida: pacote OMNI-GESTAO-GASTOS-WHATSAPP-PLANO-001 em C:/Users/rafae/.codex/visualizations/2026/10/19/01a1556c-83ac-77e2-a447-7e0f152c7c8e/OMNI-GESTAO-GASTOS-WHATSAPP-PLANO-001, seção G006, canal oficial, critérios, plano técnico e auditoria. Decisões posteriores G001–G005 prevalecem: PESSOAL global por AdminUser, storeId NULL, não público; autoridade financeira canônica única.

Disco inicial 24.351.272.960 bytes livres; RAM total 8.258.002.944, livre cerca de 600 MB no preflight. Reavaliar antes de provas pesadas e executar sequencialmente. Node global26.12.1 preservado; runtime Node24.22.1 disponível em C:/Users/rafae/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe, a usar nos gates/worker. Reusar instalação com lock idêntico por junction local, sem instalar/alterar dependências.

## Inventário e decisão antes da edição

Consumidores existentes: lib/whatsapp.ts aceita credencial explícita; lib/whatsapp/store-credentials.ts escolhe primeiro número da loja, inadequado ao canal central; WhatsAppPhoneNumber e ingresso Meta atendem lojas e permanecem intactos. G004 apply.ts grava GastoOutbox/resultado na transação; constraint g004_outbox_check e trigger g004_imutavel proíbem atualizar a outbox. G005 leitores e writers G001–G004 não serão alterados. Não existe consumidor de Gastos em nuvem comprovado nem host de homologação autorizado no pedido.

Nova origem de canal imutável liga mensagem privada e grupo/perfil/autor verificados ANTES da aplicação futura. Dispatcher relaciona essa origem ao resultado G004 persistido e cria um job de entrega único por outbox. Isso é identidade de transporte, sem outra outbox ou autoridade financeira. Sem origem/binding válido não há envio. Verificador de binding é port explicitamente injetado, ausente por padrão até G007; fixtures sintéticas não são vínculo real.

## Allowlist EXATA de código, teste e documentação

| Caminho | Motivo |
|---|---|
| prisma/schema.prisma | Modelos aditivos de canal/inbox/origem/job/evento/pulso, sem alterar fatos financeiros. |
| prisma/migrations/20261025120000_gastos_canais_fila_worker/migration.sql | Constraints, índices, FKs, imutabilidade e RLS técnica; sem roles/grants de produção. |
| lib/gastos/messaging-types.ts | Tipos compartilhados de DB, vínculo verificado e erros técnicos redigidos. |
| lib/gastos/channels.ts | Registro e resolução por canal exato; ingresso privado inbox+job antes do ACK. |
| lib/gastos/queue.ts | Claim SKIP LOCKED, relógio DB, geração de lease, CAS, retry/DLQ e auditoria. |
| lib/gastos/retry.ts | Política pura de falhas, limite, backoff e jitter; ambiguidade externa separada. |
| lib/gastos/outbox.ts | Origem fixa, resultado G004 após COMMIT, autorização atual e dispatch simulado injetável. |
| lib/gastos/worker.ts | Bootstrap validado, concorrência limitada, heartbeat, shutdown, métricas e health. |
| workers/gastos/index.ts | Entrypoint Node24 independente de Next/request/browser, sem transporte Meta habilitado. |
| test/gastos/g006-fixtures.ts | Destino descartável identificado, papéis não owner/NOBYPASSRLS e dados sintéticos. |
| test/gastos/channels.postgres.test.ts | Identidade, colisão com atendimento, privacidade e deduplicação PostgreSQL. |
| test/gastos/queue.postgres.test.ts | Claim/lease/retry/DLQ com conexões reais e barreiras determinísticas. |
| test/gastos/worker-recovery.integration.test.ts | Quedas/reinício/outbox financeira real e transporte somente simulado. |
| test/gastos/mensageria.unit.test.ts | Configuração, política de erros, logs redigidos e contratos de segurança. |
| test/gastos/mensageria-migration.postgres.test.ts | Baselines vazio/histórico, constraints/índices/FKs/RLS e menor privilégio. |
| docs/ai-execution/_evidence/OMNI-GESTAO-GASTOS-006/GOAL.md | Escopo, autorização, allowlist e gates antes de editar. |
| docs/ai-execution/_evidence/OMNI-GESTAO-GASTOS-006/RELATORIO.md | Resultados reais, limites e estados CODE/CLOUD separados. |
| docs/ai-execution/_evidence/OMNI-GESTAO-GASTOS-006/REVISAO_R.json | Revisão Anthropic real, proveniência, hashes e exceção de lint expressa. |
| docs/ai-execution/_evidence/OMNI-GESTAO-GASTOS-006/ARQUITETURA_FILA_HOST.md | Escolha PostgreSQL/Node, host previsto, dependências/custo e gate cloud. |
| docs/ai-execution/_evidence/OMNI-GESTAO-GASTOS-006/RUNBOOK.md | Política SQL mínima, operação, health, DLQ/reconciliação e recuperação auditável. |

Nenhum wildcard de produto. Artefatos ignorados regeneráveis limitados à worktree (node_modules junction, generated/prisma, .next, PWA e tsbuildinfo). Harness, logs, cluster novo e pacotes R exclusivamente em C:/Users/rafae/.codex/visualizations/2026/10/23/01a16672-b095-7202-8895-5cf8f4aa76c5/G006-execution. Preservar todos os diretórios/evidências G001–G005.

## Gates e parada

Sequência: focados → PostgreSQL concorrência → worker/recovery → regressões G001–G005/M1/N10/N11/WhatsApp/Agent pertinentes → typecheck integral → lint focado → lint global/diferencial individual → build/MIGRATION_SKIPPED → whitespace inclusive arquivos novos → R real → eventual commit local por caminhos explícitos.

Lint global histórico105erros/113avisos NÃO é PASS. Exceção só com comparação individual atual, zero regressão e aprovação expressa R. TYPECHECK e BUILD exigem exit0. Nenhuma prova financeira/concorrência baseada apenas em mock. Transporte externo é simulado e assim rotulado; banco/locks/COMMIT são reais.

CODE_VALIDATED só após todos os gates locais/R. CLOUD_RUNTIME_PROOF=BLOCKED_EXTERNAL enquanto faltar autorização de host, identidade do ambiente e execução observada fora do computador. G006_COMPLETE somente com ambos comprovados. Commit local aprovado não libera implantação. Sem push/merge/deploy/provisionamento/produção/SMS/OTP/mensagens reais/ativação pessoal. Após relatório e eventual commit local, PARAR; não iniciar G007.


Estado atual: CODE_VALIDATED=true; R real APPROVED; CLOUD_RUNTIME_PROOF=BLOCKED_EXTERNAL; G006_COMPLETE=false.


Fechamento de código: CODE_VALIDATED=true; R real do pacote r4 APPROVED (Anthropic Sonnet5.5; sessão b2bc0680-adb5-464b-90dc-ae81f36ca734). A tentativa ampla r1 foi bloqueada antes de executar; r2 e o primeiro parecer real, conforme historico externo. Exceção de lint atual expressamente aceita. Apenas um commit local fica liberado, após stagedcheck e proteção de fontes. CLOUD_RUNTIME_PROOF=BLOCKED_EXTERNAL; G006_COMPLETE=false; implantação/produção/WhatsApp/G007 não liberados.
