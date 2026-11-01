# RELATORIO_FINAL — PDV-SYNC-PRODUTO-NAO-RESOLVIDO-RECOVERY-001

```
GOAL=PDV-SYNC-PRODUTO-NAO-RESOLVIDO-RECOVERY-001
BASE_SHA=35a3971c31f62e6e802b7dd8763be81475334780
PRODUCTION_DEPLOY_SHA=35a3971c (dpl_Atqrf9hWMh5adQtjd5JRARmcYG2m, alias git-main, criado 4 s após o merge — SHA inferido)
ROOT_CAUSE=PDV envia SKU (mutável) como identidade do produto sem o cuid estável; servidor responde 409 PRODUTO_NAO_RESOLVIDO (nada gravado) e o cliente convertia essa rejeição definitiva em PENDING com payload congelado — Reenviar repete o 409 e a guarda de identidade trava novas vendas. Gatilho cadastral específico deste incidente NÃO PROVADO.
SCREEN_PENDING_SALE_IDENTIFIED=NO
CURRENT_CART_NOT_CONFUSED_WITH_PENDING=YES
ORIGINAL_SALE_IDENTITY_PRESERVED=UNPROVEN (nada foi apagado/alterado; identidade só existe no navegador do operador)
ORIGINAL_SALE_SERVER_STATE=UNKNOWN (código implica NOT_FOUND; consulta de produção negada nesta sessão)
PROD_CORRECTION_REQUIRED=UNKNOWN
PRODUCT_MAPPING=OPERATOR_APPROVAL_REQUIRED
DUPLICATE_ECONOMIC_EFFECTS=NONE_PROVED (nenhuma escrita feita; 409 reverte a transação inteira)
PATCH_IMPLEMENTED=YES
UNIT_TESTS=PASS — 32 novos (4 arquivos); suíte focada 1501 pass / 215 fail, as 215 idênticas na base (ambiente Node 26), 0 regressões
INTEGRATION_TESTS=NOT_RUN (sem PostgreSQL descartável; patch não altera transação/locks)
TYPECHECK=PASS
LINT=PASS (arquivos tocados)
BUILD=NOT_RUN (1,3 GB livres no C:; .next ~1,5 GB)
INDEPENDENT_REVIEW=R1 REQUEST_CHANGES (0 P0/P1, 4 P2, 3 P3) → corrigido → R2 APPROVE
PR=branch claude/pdv-sync-produto-nao-resolvido-recovery-001, commit de código b2c82846
MERGE=NONE_UNLESS_EXPLICITLY_APPROVED
DEPLOY=NONE_UNLESS_EXPLICITLY_APPROVED
PRODUCTION_WRITES=0
SAME_SALE_VISIBLE_IN_HISTORY=NOT_PROVEN
NEW_SALES_UNBLOCKED=NOT_PROVEN (em produção; com o patch, PRODUTO_NAO_RESOLVIDO em venda nova vira FAILED e não registra a guarda)
REMAINING_HUMAN_ACTIONS=(1) operador: "Cancelar venda" no PDV para voltar a vender já, sem finalizar de novo a mesma venda; (2) autorizar leitura read-only de produção OU enviar o clientSaleId/inventoryId da pendência; (3) revisar e aprovar merge + deploy; (4) após deploy: Reenviar 1x, regularizar o cadastro do código mostrado (autorização do proprietário), Reenviar, conferir no Histórico
WORKTREES_WIPS_PRESERVED=YES
NEXT_GATE=Aprovação humana do PR (merge) e do deploy; depois recuperação assistida da venda pendente
```

## O que mudou

1. Linhas de produto levam `produtoId` (cuid do catálogo); o servidor resolve só por `{storeId, id}`
   quando presente, sem cair para o SKU (sem falso match). Pendências antigas seguem a resolução legada.
2. `PRODUTO_NAO_RESOLVIDO` numa venda NOVA (identidade criada na chamada) é FAILED honesto: nada
   gravado, carrinho intacto, catálogo recarregado, sem trava de identidade. Pendências existentes
   nunca são apagadas.
3. O banner diz qual venda (ref + horário) e qual linha (nome + código) falhou, a partir da própria
   venda, sem PII; copy corrigida (inclui o caso de produto excluído).
4. Preflight da recuperação de quarentena e rota V1 alinhados.

## O que NÃO foi feito (e por quê)

- Nenhuma leitura/escrita no banco de produção (leitura bloqueada pela política de permissões).
- Nenhuma ação sobre a venda real; identidade não acessível daqui.
- Sem ferramenta de revínculo de linha a outro produto (precisa de desenho e aprovação próprios).
- Devolução/cancelamento/corrigir-itens ainda resolvem por SKU do payload — GOAL próprio.
- Build e teste com PG real não executados (disco / sem banco descartável).

## Não afirmado

Não está provado que a venda pendente entrou no histórico, nem que as novas vendas foram
desbloqueadas em produção. Isso só fica provado após o merge, o deploy e os passos de recuperação
assistida.
