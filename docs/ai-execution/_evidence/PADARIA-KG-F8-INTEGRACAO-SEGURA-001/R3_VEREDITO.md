# R3 — veredito (revisor Claude, contexto limpo, somente leitura)

Este revisor substituiu o Codex, que parou na R3 por limite de cota da conta OpenAI ("usage limit… try again at Nov 10th, 2026"). A R3 do Codex continua pendente: pode ser repetida a partir de 2026-11-10 com `R3_PACOTE.md`.

**VEREDITO: APPROVE_WITH_LIMITATIONS** sobre `065bdf5`. Nenhum P0, P1 ou P2.

## R2 → R3

Os quatro achados da R2 estão fechados, sem regressão encontrada.

| Achado R2 | Correção confirmada |
|---|---|
| Replay × período fechado | O replay é reconhecido antes de política, período e sessão. `LOCAL_ID_CONFLITO` foi preservado. A tela mantém o `localId` em recusa transitória. |
| Vale da fila | `creditIssued`, linhas, `produtoId` e saldo seguem o corpo 200 do servidor. O casamento por chave do client funciona na gravação nova e no replay. |
| Estoque pendente | Usa `inventoryMatchesDevLine`: nunca casa produto por peso e, com `produtoId`, compara de forma estrita. |
| Centavos | Valor acumulado por produto menos o já restituído, com piso 0. O teto global foi mantido e o status segue calculado por quantidade. |

## Achados

**1. P3 — corrigido em seguida (commit desta rodada).**
- Onde: `trocas-devolucao.tsx`, reenvio da tentativa incerta quando a intenção muda.
- Problema: 401/403 (respondidos antes do replay) descartavam a anterior e abriam outro `localId`.
- Correção: recusa classificada "aguardar" mantém a tentativa.
- Prova: teste de componente "tentativa incerta + 403 no reenvio", RED com o código anterior e GREEN depois.

**2. P3 — especulativo, só no espelho local; não corrigido.**
- Onde: `operations-store.tsx`, no piso 0 do saldo local reconciliado.
- Se o titular gastou offline mais do que o servidor confirmou, a diferença some da tela.
- A autoridade continua sendo `ClienteCredito` no servidor.

## Riscos residuais (do revisor)

- Esta rodada não reexecutou PG nem E2E: só leitura.
- Sem `dbId` local, o estoque confirmado aparece apenas na próxima sincronização do catálogo.
- Pendências legadas já entregues dependem de conciliação no Financeiro.
- `valorUnitario` arredondado não fecha exatamente com `valorTotal` em parciais. É só aparência: o total gravado está certo.
