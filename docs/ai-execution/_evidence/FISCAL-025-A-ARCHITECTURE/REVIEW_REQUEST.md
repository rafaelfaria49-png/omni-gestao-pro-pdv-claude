# 025-A · Solicitação de R incremental da decisão B

Autor/publicador: Codex / OpenAI. Preferência autorizada: Google/Gemini via Antigravity CLI; alternativa Anthropic/Claude Code após disponibilidade. Somente corpus versionado por stdin, sem chamadas de ferramentas ou escrita.

## Âncoras e escopo

PR [#265](https://github.com/rafaelfaria49-png/omni-gestao-pro-pdv-claude/pull/265), branch codex/fiscal-025-a-architecture.
R anterior: [APPROVE Google/Gemini](https://github.com/rafaelfaria49-png/omni-gestao-pro-pdv-claude/pull/265#issuecomment-6134615719), modelo gemini-3.8-flash-high, SHA e3c9d4a416972a65b1283b568ae5b13d3897b5c8, NEW_BLOCKERS=NONE, preferência B.
Base reconciliada: 1a80f2c51671c9f8a23d64ea2f3c1f096fd78b8d; merge de drift independente de main: 4bb7025ffc5d9384701ce242377dff6289155df6, sem conflitos.
O SHA incremental completo é informado na chamada e no parecer publicado; conferir HEAD/PR exatos, sem referência circular dentro do commit.

Rafael Faria aprovou explicitamente B: WORM OBJECT STORAGE + PROTECTED POSTGRESQL REFERENCE; rejeitou A para ameaça administrativa forte; C permanece alternativa não escolhida. S3 Object Lock COMPLIANCE é referência técnica. R2 só substitui esse perfil com nova aceitação humana explícita dos riscos administrativos. A arquitetura aprovada não define prazo, região, custo, RPO/RTO ou fornecedor contratado.

Revisar integralmente os documentos finais e o delta desde a R anterior, incluindo a [ADR-0024 aceita](../../../decisions/ADR-0024-arquivo-historico-worm-referencia-protegida.md), [índice oficial](../../../decisions/INDEX.md), [ponte da proposta](../../../decisions/drafts/ADR_PROPOSAL_0024_FISCAL_025_A_PRESERVACAO_IMUTAVEL.md), [matriz](../../../decisions/drafts/FISCAL_025_A_PERSISTENCE_MATRIX.md), [fase](../../../execution-tracks/fiscal/phases/025-A-ARCHITECTURE.md) e todos os documentos desta pasta. Entregar também GOAL 025 canônico rev. 5/plano, ADR-0017/0018, governança R/AEP, contratos relevantes de storage/emission/reconciliation/queue/schema por leitura e diff completo contra a base do PR. Preservar caminhos, linhas, SHAs, blobs e referências.

## Focos obrigatórios

1. Comparação A/B/C coerente com a R e decisão humana; nenhuma dependência indevida de réplica integral PostgreSQL herdada de C; B contém referência/custódia/hashes/identidade/linhagem protegidos.
2. Bytes originais, ArchiveBundle/v1 determinístico binário, manifesto e hashes sem ciclos; tentativa 588/cadeia B2, xMotivo NOT_PERSISTED, mesma identidade por loja, série 1/número 2/contador 3.
3. Privilégios runtime/owner/superuser/administrador cloud, funções de custódia/search_path, RLS autenticada e isolamento por loja; limitações explícitas e nenhuma prova real inventada.
4. COMPLIANCE/retention, versionId permanente, overwrite/delete markers/novas versões, separação administrativa e criação exclusiva enforcement no backend; nenhuma aceitação implícita de R2.
5. PUT antes de DB, verificação integral da versão, CAS/serialização/fencing, falhas entre storage/DB, órfãos e concorrência; replay sem segunda nota/job/tentativa ou efeitos duplicados.
6. Recuperação byte a byte por GET da versão, retenção sem prazo inventado, backup de referências, cópia WORM independente/DR e disponibilidade de chaves; indisponibilidade bloqueia.
7. Compatibilidade ADR-0017/0018: colunas correntes primárias, mirror opcional corrente preservado, arquivo histórico distinto; nenhum retry ou novo byte autorizado por esta ratificação.
8. Custo/complexidade de B versus C sem números presumidos e decisões operacionais ainda sob gates.
9. GOAL rev. 5 intacto; main drift independente incorporado sem editar derivados; AEP sem contorno; nenhuma implementação/provisionamento/schema/migration/DB/SEFAZ e G_F7/G_F12 bloqueados.
10. Ratificação documental humana distinta de R técnica e de prova de backend; gates de merge/checks e futura autorização 025-B preservados.

Não carregar segredos, XML privado, payload integral ou dados de produção. Não editar arquivos, conectar DB/storage do projeto, iniciar worker/provider, provisionar recursos, executar migrations/testes com escrita ou contatar SEFAZ.

## Veredito exigido

Identificar executor, modelo, família, SHA efetivamente revisado e independência. Emitir R_VERDICT=APPROVE ou R_VERDICT=REQUEST_CHANGES. Em REQUEST_CHANGES: severidade, caminho, linha, problema e correção mínima. Procurar novos blockers; distinguir bloqueio documental de pendências operacionais deliberadamente não autorizadas.

Informar OPTION_A_VERDICT, OPTION_B_VERDICT, OPTION_C_VERDICT, RECOMMENDED_OPTION_AFTER_REVIEW e NEW_BLOCKERS. Aprovação anterior não vale automaticamente para o novo SHA; indisponibilidade sem análise efetiva resulta NOT_ISSUED. Parecer não autoriza 025-B/C/D nem libera gates.
