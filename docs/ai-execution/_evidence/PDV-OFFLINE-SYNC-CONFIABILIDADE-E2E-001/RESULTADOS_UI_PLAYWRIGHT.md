# RESULTADOS_UI_PLAYWRIGHT

## Ambiente
GitHub Actions, workflow **"Ramos e Cadastros"**, job `e2e-authenticated`: `npm run build` (produção, sem migrations),
`next start` em 127.0.0.1:3000, PostgreSQL 16 descartável do job, login NextAuth real com usuários sintéticos e
senha aleatória por execução, Chromium (Playwright) com service worker bloqueado (a prova lê o servidor, nunca o cache).
O banco só é LIDO pelo teste; toda escrita passa pela aplicação. Build local não executado (disco < 1 GB livre).

Spec: `e2e/cadastros-ramos/10-pdv-offline-sync.spec.ts` (produto pela UI → PDV Clássico → abrir caixa pela UI →
venda online → offline → venda → Reenviar offline → F6 libera → venda idêntica offline → rede volta → 3 vendas, 3 baixas).

## Rodada 1 — commit `15323ff` (run 41547031391)
| Passo | Resultado |
|---|---|
| Specs 01–09 (inclui **09 catálogo sem F5** da #325) | 32/32 PASS |
| 10 · produto pela UI, abrir caixa pela UI, **T01 venda online** gravada no banco, estoque 20→19 | PASS |
| 10 · **T02/T04** venda offline | **FAIL** — o modal de pagamento não abriu |

Causa (snapshot `error-context.md` do artefato): a página inteira era **"Sua sessão foi encerrada. Entrar novamente"**.
O poll de 30 s do NextAuth falhou offline, a sessão virou `null` e o `WorkspaceAccessBoundary` desmontou o PDV.
Defeito real de produção (sem internet o PDV some em ≤ 30 s), corrigido em `16a2ed2` — ver `REVISAO_INDEPENDENTE.md`.

## Rodada 2 — commit `16a2ed2`
Resultado registrado em `RELATORIO_FINAL.md` (seção CI).
