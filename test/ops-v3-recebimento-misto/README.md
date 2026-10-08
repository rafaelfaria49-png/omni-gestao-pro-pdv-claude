# OPS-V3-RECEBIMENTO-MISTO-A-PRAZO-001 — provas locais

Recebimento misto na Operações V3 (pagamento imediato + saldo a prazo numa única
confirmação). Toda prova mutante roda **somente** em PostgreSQL local descartável com
massa sintética. Nada aqui aponta para produção.

| Prova | Comando |
| --- | --- |
| Modelo puro + regressões V3/V4 | `npx vitest run lib/operacoes-v3/recebimento-misto-model.test.ts lib/operacoes-v3/pdv-servico-a-prazo.test.ts lib/operacoes-v3/os-conta-receber-unica.test.ts` |
| Tela montada (jsdom) | `npx vitest run --config test/ops-v3-recebimento-misto/vitest.config.ts` |
| PostgreSQL real | `npx vitest run --config test/ops-v3-recebimento-misto/vitest.pg.config.ts` |
| E2E (app local) | `npx playwright test e2e/specs/ops-v3-recebimento-misto-001.spec.ts --retries=0` |

Os testes PG usam o sufixo `.pg.ts` de propósito: ficam fora do include global
(`**/*.test.ts`) e falham explicitamente (`BLOQUEIO_EXPLICITO_PG`) se o banco não for
loopback + `ops_v3_misto_qa*` — nunca são pulados em silêncio.

## Preparação reproduzível (Windows, PostgreSQL 17)

1. Cluster novo em pasta descartável, porta própria (nunca a 5432):

   ```powershell
   & "C:\Program Files\PostgreSQL\17\bin\initdb.exe" -D <scratch>\data -U pgqa --auth=trust -E UTF8 --locale=C
   & "C:\Program Files\PostgreSQL\17\bin\pg_ctl.exe" -D <scratch>\data -o "-p 55471 -c listen_addresses=127.0.0.1" -l <scratch>\pg.log start
   & "C:\Program Files\PostgreSQL\17\bin\createdb.exe" -h 127.0.0.1 -p 55471 -U pgqa ops_v3_misto_qa_r1
   ```

2. Schema em banco **novo e vazio** (a cadeia histórica de migrations não é executável
   do zero: falha em `0005_multitenant_product_sku_composite`):

   ```powershell
   npx prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma --script > <scratch>\schema-init.sql
   & "C:\Program Files\PostgreSQL\17\bin\psql.exe" -h 127.0.0.1 -p 55471 -U pgqa -d ops_v3_misto_qa_r1 -1 -v ON_ERROR_STOP=1 -f <scratch>\schema-init.sql
   ```

3. `.env` local (gitignorado) com as chaves abaixo — valores QA gerados localmente,
   senha e segredo aleatórios, nunca reais:
   `DATABASE_URL`, `DIRECT_URL`, `OPS_V3_MISTO_TEST_DATABASE_URL` (as três iguais, loopback),
   `AUTH_SECRET`, `AUTH_TRUST_HOST=true`, `AUTH_URL`/`NEXTAUTH_URL`/`PLAYWRIGHT_BASE_URL`
   = `http://127.0.0.1:3020`, `PLAYWRIGHT_E2E_SKIP_WEBSERVER=1`, `PLAYWRIGHT_E2E_EMAIL`
   (`*.test`) e `PLAYWRIGHT_E2E_PASSWORD`.

4. Massa QA (loja + usuário sintéticos): `node test/ops-v3-recebimento-misto/qa-bootstrap.mjs`.

5. App local para o E2E (nunca a porta 3000): `npm run build` e
   `npx next start -p 3020 -H 127.0.0.1`.
