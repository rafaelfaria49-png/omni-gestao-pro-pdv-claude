# Revisão independente — SAAS-001A (PR #398)

GOAL `OMNI-SAAS-001A-MERGE-MIGRATION-READINESS-002` · 2026-11-24.

Revisor: agente separado, sem o contexto da implementação. Fez revisão **somente leitura** do diff
contra `origin/main` (36 arquivos), além de `vercel-build.mjs`, `migration-authority-guard.mjs`,
`auth.config.ts`, `proxy.ts` e `lib/prisma.ts`. Não acessou banco nem rede. Os achados abaixo
foram conferidos pelo implementador, e cada um tem destino registrado.

**Veredito do revisor:** nenhum P0. Dois P1 e nove P2.

## Eixos

| Eixo | Veredito | Observação |
|---|---|---|
| 1. Isolamento entre organizações e lojas | sem achado | lojas vêm só do banco (`adminUserStores`/`lojaId`); a organização vem de `Store.organizationId`; há defesa explícita quando a assinatura pertence a outra organização; o claim não vai para a Session |
| 2. Clientes legados | sem achado | `organizationId NULL` → pleno; `session-entitlement.ts` só recebeu comentário |
| 3. Segurança do modo sombra | sem achado | try/catch completo; o Prisma usa `log: []`; nada toca `storeModules`/`allowedStoreIdsJson`; o enforce só registra aviso |
| 4. Autenticação | sem achado | o cálculo novo roda depois dos `return null` de revogação, `sessionVersion` e `active`; plataforma fica fora |
| 5. Tamanho do JWT | P2 → corrigido | legado saiu do claim (0 bytes por loja) |
| 6. Concorrência da outbox | sem achado no núcleo; 2 P2 | SKIP LOCKED + fencing corretos; as condições de reivindicar e de encerrar se complementam |
| 7. Segurança do cron | sem achado | falha fechada sem consultar o banco; tempo constante; 40 s + 10 s < 60 s |
| 8. Idempotência | sem achado | dedupe + releitura; chave `outbox:<id>` estável |
| 9. Notificação duplicada | **P1 → corrigido** | ver P1-1 |
| 10. Integridade da migration | aditiva, sem P0; P1 → corrigido no documento | ver P1-2 |

## Achados e destino

| ID | Achado | Destino |
|---|---|---|
| **P1-1** | Resultado `desconhecido` reagendado voltava a `pendente`, e a reivindicação de `pendente` não respeitava a janela de 23 h. Com o cron diário, a nova tentativa sairia ~24 h depois, fora da idempotência do Resend: email duplicado possível. | **Corrigido** em `outbox.ts`: o ramo `pendente` exige a janela quando `ultimoErroTipo = desconhecido` (filtro NULL-safe), e `encerrarResultadosDesconhecidos` também fecha esse caso. Teste PG: fora da janela → `falhou/resultado_desconhecido`, 1 envio só; dentro da janela → repete com a mesma chave. |
| **P1-2** | O documento dizia que código publicado antes da migration "funciona". Na verdade, rotas que leem a loja inteira (`/api/stores*`, `perfil-loja`) dariam 500. Além disso, com `MIGRATION_AUTHORITY_ENABLED` ligado, o merge aplica **todas** as pendentes. | **Corrigido** no documento §5/§11 e no procedimento de Production: a ordem migration → merge é obrigatória; Preview precisa da coluna; conferir o guard e a lista de pendentes antes. |
| P2-1 | `dedupeKey` UNIQUE global, sem escopo de organização | **Documentado** como contrato (a chave deve conter o id da entidade dona). Não há chamador no 001A. Validar nos produtores do 001B/005. |
| P2-2 | Item reivindicado e não tentado (prazo do ciclo) consumia tentativa e poderia terminar `falhou` sem envio | **Corrigido**: `liberarNaoTentados` devolve para `pendente` sem gastar tentativa (só os de 1ª tentativa, com fencing). Teste PG. |
| P2-3 | Lease vencido durante o envio pode gravar `falhou` para um email que o provedor aceitou | **Aceito**: improvável (timeout de 10 s, lease de 120 s, `maxDuration` de 60 s); o estado `falhou/resultado_desconhecido` já indica conferência manual. Reavaliar no SAAS-005. |
| P2-4 | Claim para toda loja legada sem consumidor | **Corrigido**: legado fica fora do mapa (mapa presente + loja ausente = legado). |
| P2-5 | Consulta sombra sem tempo limite | **Corrigido**: 1,5 s (`TEMPO_LIMITE_SOMBRA_MS`); ao estourar, claim ausente e evento de falha. Teste unitário. |
| P2-6 | Migration sem `lock_timeout`; transação única não garantida pelo Prisma | **Corrigido no procedimento**: `psql -1` + `PGOPTIONS=lock_timeout=3s`, ensaiado com transação concorrente (abortou sem aplicar nada). |
| P2-7 | `POST /api/stores` cria loja sem organização, que fica legada para sempre e contorna o enforcement futuro | **Handoff SAAS-002** (fora do escopo; nada a enforçar no 001A). |
| P2-8 | Textos desatualizados: "pendente de aceite", nomes antigos de log, arquivo de teste errado no comentário | **Corrigido**. |
| P2-9 | Sem CHECK que restrinja `suspendedMode` a `status = 'suspended'` | **Corrigido** na migration (ainda não aplicada em nenhum banco real); teste PG. |

## Verificação depois das correções

- Vitest unitário: `lib/saas`, `app/api/cron/saas`, `lib/auth/**`, `lib/relatorios/session-compat` — verdes.
- PG descartável (preparador oficial + migration real): `lib/saas/saas.pg.test.ts` **20/20**; 16 CHECKs, 4 gatilhos, drift zero.
- Ensaio do procedimento de Production: `ensaio-migration.txt`.
