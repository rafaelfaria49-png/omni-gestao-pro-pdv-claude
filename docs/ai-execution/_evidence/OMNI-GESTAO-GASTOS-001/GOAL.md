# OMNI-GESTAO-GASTOS-001 — Perfis financeiros e autorização

Execução autorizada pelo comando humano desta sessão de 19/10/2026. Somente G001 do pacote OMNI-GESTAO-GASTOS-WHATSAPP-PLANO-001, revisão 2, com o delta de produto desse comando.

- classe: C4; risco: ALTO; familia_executor: openai (codex).
- revisao_independente: obrigatória; revisor deve declarar outra família da tabela `docs/ai-execution/executors.json`; fluxo R de `TASK_LEVELS.md` (diff, allowlist e provas, sem reimplementar).
- base: origin/main após fetch, `13700862405a89da3c7d16702318735a88348133`.
- branch: `codex/omni-gestao-gastos-001`; worktree isolada `.worktrees/omni-gestao-gastos-001`.
- AEP opt-in: `.aep-active` ausente tanto na origem quanto nesta worktree. Não abrir/fechar outra trilha, editar registry/state ou herdar bloqueios históricos.
- gates humanos liberados: schema aditivo, migration exclusivamente no PostgreSQL descartável identificado, novos helpers de Gastos, correção necessária E24 no guard WhatsApp e testes/documentação correspondentes. Commit local somente após validação e R. Push, merge e deploy proibidos.

## Allowlist exata, registrada antes de editar produto

1. `prisma/schema.prisma`
2. `prisma/migrations/20261019194000_gastos_perfis_autorizacao/migration.sql`
3. `lib/gastos/types.ts`
4. `lib/gastos/access.ts`
5. `lib/gastos/access.test.ts`
6. `test/gastos/perfis.postgres.test.ts`
7. `lib/whatsapp/whatsapp-api-guard.ts`
8. `lib/whatsapp/whatsapp-api-guard.test.ts`
9. `docs/decisions/OMNI-GESTAO-GASTOS-001-PERFIS.md`
10. `docs/ai-execution/_evidence/OMNI-GESTAO-GASTOS-001/GOAL.md`
11. `docs/ai-execution/_evidence/OMNI-GESTAO-GASTOS-001/RELATORIO.md`
12. `docs/ai-execution/_evidence/OMNI-GESTAO-GASTOS-001/REVISAO_R.json`

Sem curingas. Nenhuma alteração em auth.ts, auth.config.ts, proxy.ts, permissões compartilhadas, lib/prisma.ts, motores financeiros, PDV, Operações, importadores ou configurações de produção. Artefatos regeneráveis ignorados (node_modules, generated/prisma, .next, tsbuildinfo e saídas PWA do build) só nesta worktree. Logs, snapshot dos WIPs e cluster descartável ficam fora do checkout em área de evidência isolada.

## Decisão anterior ao schema

Ver `docs/decisions/OMNI-GESTAO-GASTOS-001-PERFIS.md`: EMPRESA único por Store real; PESSOAL único por AdminUser, sem Store e sem compartilhamento com gestores. Empresa exige vínculo financeiro explícito e vínculo atual AdminUserStore. Identidade e permissões são revalidadas no servidor. Nenhuma escrita/leitura financeira pessoal é ativada neste GOAL.

## Matriz de aceite por etapa (substitui a atribuição integral A01–A03 a G001)

| Aceite original | Prova do G001 | Responsáveis pelas provas restantes |
|---|---|---|
| A01 identidade/vínculo | Sessão AdminUser real/ativa; contexto não forjável; revogação de membership financeiro/loja | G007: OTP/desafio, binding e recuperação; G006/G007: canal; G008–G010: revalidação antes de aplicar e conversa real |
| A02 usuário/perfil | Ownership, dois usuários na mesma loja, pessoal privado até contra outro ADMIN, mesmo PESSOAL em duas lojas e após perder empresa; constraints e guard | G002: writers/contas; G003: listas, KPI, documento, logs, cache, Contador/exportação; G007: ingresso privado; G010: fechamento E2E |
| A03 loja/conta | Contexto EMPRESA obrigatório, loja real/vínculos atuais, IDs/header/query/cookie forjados e regressão E24 | G002: contas e FKs financeiras; G003: readers; G006/G007: canal e credencial; G004/G008–G010: aplicação/integração |

Nenhuma linha futura recebe PASS por inferência. A01–A20 integrais continuam obrigatórios em G010, A21/A22 continuam G011/G012. OTP, Meta, mídia e worker não são dependências de fechamento do G001.

## Validação e pronto

Revisar diff de schema antes de aplicar SQL. Validar identidade do cluster PostgreSQL local criado vazio para este GOAL; aplicar baseline do schema e migration aditiva, sem copiar dados reais. Testes reais devem recusar URL não descartável. Cobrir exclusividades, composição inválida e FKs no PostgreSQL; isolamento, revogação e concorrência. Executar testes focados, regressões pertinentes, typecheck e build local com migration de produção desabilitada pelo guard existente. R independente de família distinta é condição de conclusão/commit; falha ou ausência não é simulada.

Não iniciar G002. Relatório final deve distinguir comprovado, reservado às etapas seguintes e pendências externas atuais.
