# RELATORIO_FINAL — PDV-CADASTROS-SYNC-AUTOFIX-CI-325-001

```
GOAL=PDV-CADASTROS-SYNC-AUTOFIX-CI-325-001 · MODE=AUTOFIX_END_TO_END · PR=325 (empilhado no #324)
FALHA_ORIGINAL=Ramos e Cadastros / e2e-authenticated, run 41479634312, head 87a334d — E2E 09, etapa offline: "Usar R$ 15,00" não apareceu em 50 s (31 aprovados, 1 reprovado)
CLASSIFICACAO=DEFEITO FUNCIONAL REAL (pré-existente ao #325), não problema de teste nem de ambiente
ROOT_CAUSE=@ducanh2912/next-pwa usa reloadOnOnline=true por padrão: sw-entry.js instala window "online" → location.reload() no app inteiro. Cada volta da rede recarregava o PDV e apagava o carrinho em memória
FIX_COMMIT=9375457 (next.config.mjs reloadOnOnline: false; skip offline no autoSync do catálogo; E2E 09 reforçada; contrato)
CI_FIX=run 41512338936 SUCCESS — e2e-authenticated 32/32 (09 incluída, 1.1m), validate, postgres-integration; next build "Compiled successfully" no CI; Vercel omni-gestao e omni-gestao-pro: Deployment completed
INDEPENDENT_REVIEW=APPROVE (sem P0–P2; 4 P3: 1 corrigido, 3 registrados)
TIMEOUTS=inalterados (50 s, justificativa: intervalo de 30 s como rede de segurança)
ASSERTIONS=nenhuma removida ou enfraquecida; acrescentadas (sem reload antes e depois da volta, carrinho intacto offline)
MIGRATIONS=0 · PRODUCTION_WRITES=0 · DADOS_COMERCIAIS=não acessados
PR_324=intocada · OUTRAS_WORKTREES=intocadas · MERGE=NÃO · DEPLOY=NÃO
```

## 1. Evidências inspecionadas (run 41479634312)

- Log do job: a falha é a linha 129 da spec (`Usar R$ 15,00`). Trecho da chamada:
  `waiting for navigation to finish... navigated to "http://127.0.0.1:3000/dashboard/vendas"`.
  Ou seja, a página do PDV navegou durante a espera.
- `test-failed-2.png` (aba do PDV): "Nenhum item bipado", total R$ 0,00, isto é, a página foi recarregada e
  o carrinho com o item de R$ 12,50 sumiu.
- `test-failed-3.png` (outro aparelho): produto salvo com SKU `E2E-SYNC-002` e preço R$ 15, então a edição
  remota funcionou.
- Log do servidor: às 16:22:19–21, nova sequência de `GET /api/ops/inventory` (loja-1, depois
  e2e-b-variedades). É o padrão de montagem do provider, ou seja, um reload completo.

## 2. Diagnóstico (2 execuções instrumentadas, commits c15861a e 4e656a5, já removidos)

A instrumentação registrou, na aba do PDV, buscas RSC e server actions com stack, eventos
online/offline/pagehide, navegações, requisições falhas e o stack do `beforeunload`. Uma navegação
iniciada por JS despacha esse evento de forma síncrona, então o stack mostra quem chamou.

Run 41510551865 (`4e656a5`):

```
+30730ms == setOffline(true)
+30734ms [diag-ev] offline online=false
+31048ms == setOffline(false)
+31060ms [diag-ev] online online=true
+31063ms [diag-ev] beforeunload online=true
    at <anonymous>:23:117
    at http://127.0.0.1:3000/_next/static/chunks/58928-….js:1:170750
+31064ms navrequest http://127.0.0.1:3000/dashboard/vendas
+31181ms pagehide
```

O reload acontece 3 ms após o evento `online`, sem nenhuma busca RSC no intervalo. Isso descarta a
hipótese inicial: o fallback MPA do Next.js para RSC falha. O chamador é um listener de `online` no bundle
do cliente. No código do app não existe `location.reload()` ligado a `online`. Na dependência existe:

```
node_modules/@ducanh2912/next-pwa/dist/sw-entry.js
  __PWA_RELOAD_ON_ONLINE__ && window.addEventListener("online", ()=>location.reload());
node_modules/@ducanh2912/next-pwa/dist/index.d.ts
  /** Reload the app when it has gone back online. @default true */ reloadOnOnline?: boolean;
```

`next.config.mjs` não definia `reloadOnOnline`, então valia o padrão (true). O script roda mesmo com o
service worker bloqueado (Playwright usa `serviceWorkers: "block"`) e em produção.

**Classificação.** É defeito funcional, e já existia antes do #325. Em produção, toda oscilação de rede
no caixa recarregava a página e descartava o carrinho aberto, que fica só em memória. O requisito
"reconexão → atualização sem F5 → carrinho preservado" era impossível de cumprir com esse
comportamento. A E2E estava certa em reprovar.

## 3. Correção (commit 9375457)

| Arquivo | Mudança |
|---|---|
| `next.config.mjs` | `reloadOnOnline: false`, com o motivo comentado |
| `lib/operations-store.tsx` | `autoSync` do catálogo não tenta offline (`navigator.onLine === false`), para não gastar o intervalo mínimo de 3 s que atrasaria o check da volta da rede |
| `e2e/cadastros-ramos/09-catalogo-sem-f5.spec.ts` | Instrumentação removida. Etapa offline reforçada: dispara um gatilho de sync offline e confere que nada chega, que o carrinho fica em R$ 12,50 e que não houve reload. Depois da volta da rede, exige o painel "Usar R$ 15,00", ausência de reload e carrinho intacto |
| `components/dashboard/vendas/pdv-catalog-sync.contract.test.ts` | Contrato: `reloadOnOnline: false` dentro do `withPWAInit` e o salto offline do autoSync |

A reconexão continua tratada pelos handlers de `online` que já existiam, sem recarregar a página:

- catálogo (com o PDV montado);
- envio de pendências e `refreshSalesFromServer`;
- `refreshCaixaSession`;
- verificação de versão do PWA.

## 4. Fluxo exigido no item 5 — verificado no navegador (CI, Chromium, `next start`, Postgres descartável)

| Etapa | Prova na E2E 09 |
|---|---|
| Offline | `caixa.setOffline(true)` (contexto do PDV) |
| Edição em outro aparelho | contexto de navegador separado, sessão própria, preço 14 → 15 pela interface do Cadastros |
| Sem chegar offline | gatilho de foco offline: sem painel, carrinho em R$ 12,50, marcador `window.__semF5` intacto |
| Reconexão | `caixa.setOffline(false)` |
| Atualização sem F5 | painel "Usar R$ 15,00" aparece, `__semF5` ainda presente |
| Revisão do carrinho preservado | uma linha só, ainda em R$ 12,50 até a decisão do operador; nenhuma venda criada; banco com SKU `E2E-SYNC-002` e preço 15 no mesmo `Produto.id` |

## 5. Checks

| Gate | Resultado |
|---|---|
| CI Ramos e Cadastros, run 41512338936 (head 9375457) | SUCCESS: e2e-authenticated 32/32, validate, postgres-integration |
| Build de produção | `✓ Compiled successfully in 94s` no job E2E; `MIGRATION_SKIPPED` |
| Demais workflows do PR | authenticated, validate (×3) e postgres-integration (×2) aprovados |
| Vercel (omni-gestao, omni-gestao-pro) | Deployment completed (preview) |
| Vitest focado, local (19 arquivos) | 291 aprovados, 8 ignorados, 0 falhas |
| `npm run typecheck` | PASS |
| ESLint nos arquivos tocados | 0 erros |

O ajuste P3 do contrato (seção 6) sobe no mesmo commit deste relatório e roda no CI do PR.

## 6. Revisão independente

Subagente separado, somente leitura, sobre o diff líquido `87a334d..9375457`. Veredito: **APPROVE**,
sem P0–P2.

| P3 | Tratamento |
|---|---|
| Telas montadas offline (cache do SW) e que só buscam dados ao montar ficam desatualizadas até navegar ou dar F5. Antes o reload resolvia isso, ao custo de apagar carrinhos e formulários | Registrado. Sugestão para GOAL próprio: aviso "conexão restabelecida, atualizar", sem reload forçado |
| A E2E não separa o gatilho `online` do intervalo de 30 s | Registrado. Exigir a requisição em menos de 3 s ficaria instável por causa do intervalo mínimo após o último check; o contrato estático cobre o listener |
| Asserção logo após o foco offline é só de sanidade | Registrado; vale junto com o marcador `__semF5` |
| Regex do `next.config` frouxo (aceitaria linha comentada) | **Corrigido**: recorte do `withPWAInit` mais âncora de início de linha |

## 7. Parecer de prontidão para merge

**Pronto para revisão humana e merge, na ordem de dependência.**

1. Merge do #324 primeiro.
2. Reapontar a base do #325 para `main` e conferir o diff.
3. Merge e deploy só com aprovação explícita.

Não há migration nem variável de ambiente nova. A mudança do PWA chega aos clientes na próxima
atualização do service worker.

Smoke pós-deploy, sem venda:

1. Abrir o PDV com um item no carrinho.
2. Tirar a rede do computador por alguns segundos e devolver. A página não deve recarregar e o carrinho
   deve permanecer.
3. Cancelar a venda (não finalizar).
