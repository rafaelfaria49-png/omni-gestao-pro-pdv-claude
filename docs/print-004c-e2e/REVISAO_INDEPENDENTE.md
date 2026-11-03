# Revisões independentes — OMNI-PRINT-004C

Revisores: agentes separados, somente leitura (sem editar, sem banco, sem push), com acesso ao diff completo e aos logs.

## Rodada 1 — REQUEST_CHANGES

2 P1 (impressão dupla com dois processos de agente; migrations candidatas dentro de `prisma/migrations`), 4 P2
(relatório transitório bloqueando a impressora; host PowerShell órfão; lease curto no envio; navegador sem rastreio)
e 10 P3. Todos tratados — ver `RELATORIO_FINAL_004C.md` §3.

## Rodada 2 — APPROVE

Sem P0/P1. Confirmou as correções da rodada 1 e os invariantes (venda confirmada apenas; UNKNOWN nunca reenviado;
nenhum aceite apresentado como papel; isolamento por loja; autoridade rederivada no banco; CSRF; credencial do agente;
ESC/POS sem gaveta; gate fechado em produção; PDV inalterado com o recurso desligado).

Achados P2/P3 da rodada 2 e tratamento:

| Achado | Tratamento |
|---|---|
| P2 `reset()` perdia a referência ao host que não morreu | conjunto de hosts "morrendo"; `reset` re-mata e só devolve `true` quando todos saíram |
| P2 despacho enfileirado podia imprimir após o servidor já mostrar "incerto" | servidor envia `leaseRemainingMs`; o agente recusa iniciar envio sem orçamento (NO_EFFECT `TIMEOUT_BEFORE_SUBMIT`) |
| P2 venda fora do contrato (KG/fracionada/limites/pagamento) ficava sem impressão | volta ao diálogo de impressão manual existente (PW10) |
| P3 INITIAL não revalidava cópia do navegador sob o lock | revalidado em `create()` |
| P3 `window.open` após `await` | janela aberta no clique; nada é registrado se o navegador bloquear |
| P3 consulta de tentativa mais nova que o diário | tombstone para a tentativa nova |
| P3 cache do PWA em `/api/print/*` | `NetworkOnly` em `next.config.mjs` |
| P3 teste instável do host | timeouts maiores |
| P3 evidência fraca do kill -9 | teste força o kill durante envio: 11 aceitos + 1 incerto, 12 chamadas, nenhuma venda duas vezes |
| P3 comentário de schema apontando caminho antigo | corrigido |
| P3 corrida de lock obsoleto entre dois processos no mesmo microssegundo; PID reutilizado após reinício; host órfão após SIGKILL do agente | **residual documentado**: improvável (DPAPI introduz segundos de defasagem); recuperação = remover o `.lock` após conferir; matar o host órfão pelo PID persistido fica para o empacotamento do agente (D04/D05) |
| P3 logs de regressão comparados só por contagem | comparados por nome: `evidence/regression-failure-diff-candidate-vs-main.txt` |

Ao final das correções da rodada 2, toda a bateria foi reexecutada (`evidence/battery-summary.json`).

## Rodada 3 (delta após a rodada 2) — APPROVE

Sem P0/P1/P2. Confirmou: a recusa por orçamento acontece antes de qualquer byte (nunca NO_EFFECT indevido); o TOMBSTONE
não libera impressora com tentativa anterior escrevendo; `reset` só declara saída fechada após o host sair; venda
elegível nunca cai em navegador silencioso; regra `NetworkOnly` segura.

P3 aplicados: relatório enviado logo após cada despacho; orçamento inválido (NaN) recusado; janela fechada pelo operador
não registra nada; host que falhou ao iniciar não trava resets; venda fora do contrato volta **exatamente** ao fluxo
anterior (automático → aviso legado; manual → diálogo); testes unitários para recusa por orçamento e TOMBSTONE de
tentativa nova (PW10/PW11 no Playwright). Residual: o orçamento de lease é medido no servidor antes do envio da resposta
(margem de ~15 s mitiga; o efeito possível é só exibir "incerto" por alguns segundos, nunca reenviar).

## Rodada 4 (CI corretivo da PR #327) — APPROVE

Escopo: mocks de `@/lib/operations-store` nos testes `parity-pin-keymap`/`classic-weight-sale-guard` e renomeação
`PrintDelegation.sessionVersion` → `principalSessionVersion`. Sem P0/P1/P2. Confirmou: causa raiz das duas falhas; mocks
não escondem comportamento que esses testes deveriam afirmar (o catálogo tem teste próprio do #325); renomeação neutra no
banco (`migrate diff` vazio, coluna/índice/FKs iguais) e sem consumidor do client Prisma; nada alterado em
`prisma/migrations`, `scripts/platform`, `.github/workflows` ou nas migrations candidatas; nenhum outro workflow passa a
disparar.

| Achado P3 | Tratamento |
|---|---|
| `HASHES.json` desatualizado após os ajustes | manifesto regenerado (inclui os 2 testes do PDV) |
| `typecheck-full.log` sem código de saída | regravado com `exit=0` |
| `main` segue com os mocks desatualizados | relatado (fora do escopo desta PR; correção própria na main) |
| `run-pilot-e2e.mjs` frágil a homônimos dos 4 campos | observação; script do piloto não alterado |
| restante do E2E do piloto nunca rodou no CI | confirmado pela rodada de CI do novo commit |
