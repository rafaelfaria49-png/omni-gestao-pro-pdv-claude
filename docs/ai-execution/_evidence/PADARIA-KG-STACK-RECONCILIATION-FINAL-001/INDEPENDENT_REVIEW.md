# Revisão independente — ressincronização da pilha KG (2026-11-07)

Revisor: subagente Claude de contexto limpo, somente leitura (sem edição, commit, push, banco, Vercel ou Neon).
Alvo: merges locais `3ebbd76` (#335), `bc1c3fc` (#336), `2d638a4` (#337), antes do push.

**Veredito: APPROVE_WITH_LIMITATIONS** — limitação só documental (texto desatualizado no plano A4–A8), tratada.

| # | Verificação | Resultado |
| --- | --- | --- |
| 1 | Pais e ancestralidade | PASS — `3ebbd76` = 406ea48 + bed911a; `bc1c3fc` = adbc66e + 3ebbd76; `2d638a4` = 1df1e79 + bc1c3fc; sem rebase/squash |
| 2 | Código fora de `docs/` vs 1º pai | PASS — diff vazio nos três merges; proteção contra venda duplicada, estoque fracionado, quantidade, replay offline, F8/vale e bloqueios KG byte-idênticos a 406ea48/adbc66e/1df1e79; `2d638a4` tem o mesmo código de `4385d3f` (run-06) |
| 3 | Mudança descartada em silêncio | Nenhuma — `git merge-tree --write-tree` reproduz exatamente as árvores commitadas; os 12 arquivos tocados dos dois lados (bases 37acc3b/104d768) mantêm a versão da #335 porque ambas as bases são ancestrais dela; o único código novo do lado #315 são os 4 pins `ubuntu-24.04`, presentes nos três heads |
| 4 | Schema e migrations | PASS — `schema.prisma` blob `bab013e1` nos três heads; `20261025` sha256 `f07242c4…a06a47e`, `20261029` `8757ee99…1d83ddb3` nos três; `20261106` `56ac126a…0273547e` só na #337, blob idêntico ao de 1df1e79 |
| 5 | `07-guard-check-opcional.sql` | PASS — sha256 LF `dea40868…51935` (o aprovado no A6), igual ao de bed911a |
| 6 | Preview pode rodar `migrate deploy`? | Não — `evaluateMigrationAuthority` só devolve RUN com `VERCEL_ENV=production` + project ID canônico + `MIGRATION_AUTHORITY_ENABLED==='true'`; erro/valor inválido = BLOCK |
| 7 | Texto desatualizado em `KG_RELEASE_READINESS_A4_A8.md` | P2 docs — T1/T2 ainda como pendentes, SHAs antigos, árvore J4 "sem CI". **Tratado** no commit de docs desta PR (cabeçalho, §1, §2, §3, §4.2, §6.1, §9, §10) |

P3: CI dos novos heads ainda não existia no momento da revisão — equivalência provada por comparação de árvores; CI registrado no README desta pasta.
