# CAD-R2-008 — ClientWriteService canônico

Boundary server-only de escrita de Cliente. Substitui os motores paralelos
de create/update/upsert identificados em CAD-R2-018-A.

Código: `lib/cadastros/client-write-service.ts` · contrato puro em
`lib/cadastros/client-write-contract.ts`.

## Fluxo

adapter (Action / REST / import / OS V3 wrapper)
→ contexto autorizado server-side (`storeId` + `principal`)
→ `createClient` / `updateClient` (ou variantes `*Tx`)
→ normalização / validação cadastral
→ `client-identity` lookup **na mesma TransactionClient**
→ revisão humana explícita quando o veredito ≠ `NO_MATCH`
→ persistência + `LogsAuditoria` atômicos

## Invariantes

- `storeId` / `principal` nunca vêm do payload como autoridade.
- Nenhuma dedupe cross-store; update em outra loja é `NOT_FOUND`.
- Nenhuma IA decide identidade. Nenhum auto-merge. Nome não é identidade forte.
- Nenhum writer cria política própria de dedupe.
- `force=true` é ignorado.
- Revisão: contrato `ClientIdentityReviewDecision` vinculado ao **veredito atual**
  e ao principal. Só `POSSIBLE_CONTACT_MATCH` + `PROCEED_CREATE`/`PROCEED_UPDATE`
  continua. `EXACT_DOCUMENT_MATCH` / `AMBIGUOUS` / `IDENTITY_CONFLICT` fail-closed.
- Erros/logs não interpolam documento, telefone ou email bruto.
- Sem schema/migration neste GOAL.

## Adapters

Actions `createCliente`/`updateCliente`, REST POST/PATCH/quick, imports
(JSON, handler, avançado, Smart Genius) e inativação em lote são adapters
finos. `criarCliente` (OS) continua wrapper da Action. Cliente Balcão permanece
singleton operacional no resolver V3 (match por nome **só** para esse cliente
de sistema).

Hard delete (`DELETE`, bulk-delete, inactivate-with-history delete) permanece
fora deste boundary.

## Gap de concorrência (CAD-R2-019)

Não há unique `(storeId, document)` no schema atual. Lookup+write na mesma
transação reduz a janela, mas **não** elimina corrida entre requests
concorrentes. Duas criações simultâneas com o mesmo CPF válido ainda podem
persistir duas linhas até o 019. Constante:
`CLIENT_WRITE_CONCURRENCY_GAP`.
