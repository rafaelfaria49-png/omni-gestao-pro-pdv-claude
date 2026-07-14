# Worker fiscal XSD

Worker interno e server-only para validação offline da NFC-e 4.00. A imagem compila o
`xmllint/libxml2 2.15.3` a partir da fonte oficial, aplica o patch upstream `d335255`, verifica todos
os hashes e embute apenas os cinco schemas oficiais de `PL_010e_v1.02`.

O endpoint `POST /validate` não é público. O caller usa o adapter em `lib/fiscal/xsd-worker`.
`GET /health` verifica o processo e `GET /ready` verifica binário, versão, manifesto e schemas.

Execução local controlada:

```sh
docker compose -f docker-compose.fiscal-xsd.yml up --build --wait
npm run test:fiscal-xsd:integration
docker compose -f docker-compose.fiscal-xsd.yml down
```

A composição impõe raiz somente leitura, `/tmp` limitado, usuário 10001, memória de 768 MiB, uma
CPU, 64 PIDs, capabilities removidas, `no-new-privileges` e rede Docker `internal`.
