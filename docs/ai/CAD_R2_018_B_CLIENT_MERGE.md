# CAD-R2-018-B — Revisão de duplicados + merge de Cliente

Capability server-only própria de consolidação. Não mora no CRUD do
ClientWriteService (só reutiliza `updateClientTx` para os campos finais).

Código: `lib/cadastros/client-merge-service.ts` · contrato puro em
`lib/cadastros/client-merge-contract.ts` · discovery em
`lib/cadastros/client-merge-discovery.ts`.

## Fluxo

discovery read-only (`GET /api/clientes/duplicates`)
→ revisão humana lado a lado (HUB)
→ escolha explícita survivor/loser
→ resolução dos campos finais
→ plano + fingerprint (`POST /api/clientes/merge/plan`)
→ confirmação destrutiva explícita
→ execute em UMA transaction (`POST /api/clientes/merge/execute`)

## Execute (uma transaction, sem nested)

1. lock consultivo `pg_advisory_xact_lock` do par na loja;
2. recarregar survivor + loser (fail-closed se sumiram = stale);
3. revalidar mesma store + elegibilidade do par;
4. checar terceiros (survivor final não colide com mais ninguém);
5. recomputar fingerprint (updatedAt + resolução + contagens) e comparar;
6. reassign loser → survivor nas 6 referências vivas (escopo loja);
7. campos finais via `updateClientTx` (loser excluído do gate; terceiros bloqueiam);
8. audit `cliente.merged` (sem PII bruta);
9. delete físico do loser → commit.

Qualquer falha lança (rollback total). `P2003` no delete = relação não
inventariada: rollback + report, nunca contorno.

## Referências vivas reassociadas

OrdemServico, Venda, WhatsAppConversation, ClienteCredito, OmniAgentMemory
(FKs) + FinancialTransaction.clienteId (coluna solta, sem FK — update manual).
ContaReceberTitulo NÃO é tocada: só tem `cliente` textual + `payload.clienteId`
(snapshot histórico/matching operacional, sem FK).

## Preservado (nunca reescrito pelo merge)

Venda.clienteNome/payload, DevolucaoVenda.clienteNome/clienteDoc,
NotaFiscal.snapshotDestinatario (+ XML), ClienteCredito.clienteDoc/clienteNome,
payloads históricos, logs/auditorias existentes, totalSpent (não somado),
tags (substituição explícita, nunca concatenação silenciosa).

## Invariantes

- Nenhum auto-merge. Nenhuma IA escolhe survivor/resolve campos/decide identidade.
- Nome sozinho nunca gera candidato. Cross-store proibido. Sem merge em massa.
- Merge nunca introduz documento novo; documento forte divergente bloqueia.
- Fingerprint cobre store, par, updatedAt, identidade, resolução e dependências.
- Sem schema/migration neste GOAL (unique fica para CAD-R2-019).
