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

## Rodadas seguintes (cada falha investigada até a causa)
| Commit | Resultado do spec 10 | Causa | Correção |
|---|---|---|---|
| `16a2ed2` | parou na venda offline | diálogo "Impressão não enviada" da venda online por cima (CI sem agente de impressão) | spec fecha o diálogo do comprovante (`Agora não`/`Fechar`) |
| `41324a8` | parou em "Detalhes" | o painel já se expande após Reenviar com falha; o clique recolhia | spec só expande se recolhido |
| `428b6d1` | parou na mensagem do F6 | o shell do Clássico não exibe `info` | **produto**: toast "A venda anterior NÃO foi cancelada" |
| `1292ce6`/`06cc67b`/`37690c4` | F12 não abria a 2ª venda | captura no instante: `[role=dialog]` em animação de saída | **produto** (RC12): guarda ignora overlay `data-state="closed"` |
| `ec0275e` | painel com 1 pendência em vez de 2 | writer V1: 2ª venda absorvida pela 1ª | **produto** (RC13) |
| **`65889c5`, `b6d4d90`** | **PASS** | — | — |

## Resultado final — head `b6d4d90` (run 41672371685)
33 specs esperados, **0 inesperados, 0 instáveis** (`raw/ci-e2e-report-summary.json`). Passos do spec 10, todos PASS:
1. Produto pela interface.
2. T01 — venda online confirmada pelo servidor (estoque 20→19, carrinho limpo, diálogo do comprovante fechado).
3. T02/T04 — internet cai: venda registrada só no terminal; painel "Sem internet", 1 pendência; banco inalterado; carrinho preservado; sem F5.
4. T56/T07/T08 — Reenviar offline: "sem conexão — nada foi enviado"; linha "NÃO gravada"; banco inalterado.
5. T34 — F6 libera o carrinho (toast "A venda anterior NÃO foi cancelada"); 2ª venda IDÊNTICA offline pelo F12; 2 pendências com identidades distintas; banco inalterado; sem F5.
6. T03/T05/T10/T11 — rede volta sem recarregar: 3 vendas no banco (`pedidoId` únicos), painel some, estoque 20→17, 3 movimentações `origem=pdv`, sem F5.
