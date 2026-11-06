# RISCOS_E_DEPLOY — PDV-CADASTROS-SYNC-AUTOMATICO-001

## Ordem de deploy

1. **PR #324 primeiro** (este PR está empilhado sobre ele; o servidor precisa resolver `produtoId`).
2. Depois do merge do #324, reapontar a base deste PR para `main` e conferir o diff.
3. Merge e deploy só com aprovação humana. **Sem migration, sem variável de ambiente nova.**
4. O service worker muda (`next.config.mjs`): os clientes pegam a nova regra NetworkOnly na próxima
   atualização do PWA (barra "atualizar"). Até lá, o `catalogSync=1` ainda pode passar pelo
   NetworkFirst antigo, o que equivale ao comportamento de hoje.

Compatibilidade: cliente velho × servidor novo usa a carga completa sem `versionOnly` (campo `version` a
mais é ignorado). Cliente novo × servidor velho: `versionOnly` é ignorado, a resposta não tem `storeId`
nem `version` válidos e o controlador trata como "indisponível". Nada quebra; só não há sync até o
servidor novo subir.

## Smoke pós-deploy (somente leitura / sem venda)

1. Abrir o PDV Clássico numa aba e o Cadastros em outra, na mesma loja.
2. Bipar um item e alterar o preço dele no Cadastros. O aviso "O cadastro mudou com a venda aberta"
   deve aparecer no PDV sem F5.
3. "Manter" o preço e **cancelar a venda** (não finalizar).
4. Rede (DevTools): `/api/ops/inventory?…&catalogSync=1&versionOnly=1` a cada 30 s só com a aba do PDV
   visível; em outras telas do dashboard, nenhum.

## Riscos remanescentes

| Risco | Severidade | Mitigação |
|---|---|---|
| E2E 09 nunca executado | médio | CI `Ramos e Cadastros` roda no PR; ajustar se falhar antes de pedir merge |
| Produto editado por fluxo sem aviso imediato (importador, O.S., venda em outro terminal) | baixo | versão no foco/aba/rede/30 s |
| Polling: 1 `aggregate` por PDV visível a cada 30 s | baixo | indexado por loja, resposta mínima, só com PDV montado |
| Venda em espera salva **antes** deste deploy, com dois produtos que trocaram SKU entre si | raro | linha adota o produto do código atual (comportamento anterior); comentado no código |
| Outros PDVs sem painel de revisão | médio (fora do escopo) | catálogo e taxonomia já valem para eles; o painel fica para GOAL próprio |
| Venda pendente real da loja do incidente | — | **intocada** por este PR; a recuperação segue o procedimento do #324, com autorização |

## Fora do escopo (relatado)

- Devolução, cancelamento e corrigir-itens ainda resolvem pelo SKU do payload (herdado do #324).
- PDV Assistência / Supermercado / Venda Completa: levar `produtoId` na linha e o painel de revisão.
