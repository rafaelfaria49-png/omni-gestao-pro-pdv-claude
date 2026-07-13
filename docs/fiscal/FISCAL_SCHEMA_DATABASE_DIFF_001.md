# Diff schema versus banco — FISCAL-STATUS-RECONCILE-001

- Data: 2026-07-13
- Base Git: `2b9c51accbf7200cfa840103b341d853065b42fc`
- Prisma: `6.19.3`
- Fonte: banco configurado via `DIRECT_URL`, somente leitura
- Destino: `prisma/schema.prisma`
- Resultado: exit code `0`; nenhuma diferença detectada

Comando lógico executado, com a URL mantida fora do terminal e deste artefato:

```text
prisma migrate diff --from-url <REDACTED> --to-schema-datamodel prisma/schema.prisma --script
```

Saída sanitizada integral:

```sql
-- This is an empty migration.
```

Classificação: **sem drift**. O checkpoint de drift material não foi acionado. Nenhuma migration,
alteração de schema ou escrita no banco foi executada.
