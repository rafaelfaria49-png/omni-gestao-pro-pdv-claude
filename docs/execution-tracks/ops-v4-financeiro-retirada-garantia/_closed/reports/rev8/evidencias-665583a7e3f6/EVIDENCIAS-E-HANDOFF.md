# Evidências e handoff rev8 — AGUARDANDO_R_INDEPENDENTE

Objeto funcional congelado: 665583a7e3f6f1b9552b4c56b3d6a3dd97299167. Tentativa oficial 1/3, check PASS sobre esse SHA. O commit que arquiva estas evidências é documental; o diff funcional contra o objeto deve permanecer vazio. Não é aprovação R ou close.

R_STATUS=AGUARDANDO_FAMILIA_INDEPENDENTE (AGUARDANDO_R_INDEPENDENTE)
AEP_CLOSE=PENDENTE
MERGE=PENDENTE
PUBLICACAO=PENDENTE
SMOKE=OWNER_PENDING_AUTH

Anthropic/Claude Opus 5.5, sessão 1ae5fc8e-ca83-4d47-84dd-cfbd4f3df5dc, 120 chamadas de ferramenta: exit 1, is_error=true, mensagem de limite semanal com reset em 15/10/2026 às 11h America/Sao_Paulo. Sem veredito de código. A auditoria real comprovou 79/85 arquivos obrigatórios lidos integralmente e execução do verificador de hashes; seis arquivos obrigatórios ficaram sem leitura e a inspeção das evidências não foi concluída. O arquivo cli-message-sem-veredito preserva a resposta bruta e não é um parecer. P0/P1/P2/P3 da nova R são INDETERMINADOS.

A família Google consta em executors.json. Sua CLI instalada foi sondada somente em modo plan, sem ferramentas, e encerrou exit 1 antes de qualquer revisão: IneligibleTierError, cliente não suportado para a conta Gemini Code Assist for individuals. Nenhuma migração de produto/conta ou alteração global foi feita. A presença de Qwen no PATH não satisfaz declaração de família elegível no protocolo; não foi usada como R.

Comando ratificado integral: exit 0, 887 Vitest e 11 Playwright (incluindo setup), retries=0. Build seguro MIGRATION_SKIPPED, lint, diff-check, verify --all e check oficial passaram. MATRIZ-REV8 preserva todas as regressões atuais, comandos, SHA, bancos QA efetivamente consultados, logs e exits. Preview completo, T56c e E2E #235/#237 continuam com falhas de base documentadas, sem declaração de verde integral. Os cinco P3 rev7 continuam sem corretivo automático, pendentes da avaliação independente completa.

Pacote rev8: pacote-rev8-665583a7e3f6.zip; SHA-256 1552742edf104c00005a402c9a291aa3c0bef2258922878eaef161957ffdabc3. Manifesto: 05d1499b2544ff38589222d5bb1a88f937afbb1bb39160b01a99ce8d36a5c61c, 320 arquivos; verificador confirmou 50 snapshots Git. ZIP/manifesto/relatórios rev7 preservados conforme MATRIZ-REV8. INDEX-ARQUIVOS.json autentica as cópias arquivadas aqui; não substitui o manifesto selado.

Próxima decisão exata: disponibilizar revisão humana qualificada de outra família ou retomar Anthropic após a disponibilidade da cota. Revalidar main/árvore/tentativa, conferir o delta documental contra 665583a7e3f6f1b9552b4c56b3d6a3dd97299167, congelar o SHA a ser julgado e completar uma R real com todos os diffs/testes, evidências, hashes, cinco P3 e veredito explícito APPROVE/P0=P1=P2=0. O wrapper de close só pode ser utilizado quando suas provas correspondam ao SHA efetivamente revisado; esta sessão incompleta não o libera. Eventual nova coleta terá identidade própria e não sobrescreverá o pacote atual.

A tentativa continua 1/3, sem reset de .aep-active e sem falha oficial de check. Indisponibilidades de fornecedor não são novas tentativas de implementação. Não há close/DONE novo, retirada de draft, merge de produto ou deploy desta revisão. A governança rev8 foi integrada pela PR263 (9f1b511); a PR funcional existente é a #262.

Handoff 003: contrato READY plan_rev 8 e família/dependência preservados. Não iniciar antes de 002 DONE e mergeado, com nova sessão conforme AEP. 008, datas/Caixa retroativo, mutações produtivas e OS reais permanecem fora do trabalho. Worktrees, junction da base e WIP alheio preservados; servidores QA próprios encerrados pelos respectivos runners.
