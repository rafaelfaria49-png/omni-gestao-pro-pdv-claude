# Revisão R7 independente — PADARIA-ESTOQUE-KG-A01-STORE-RELEASE-001 (PR #315)

Você é o revisor independente. Modo SOMENTE LEITURA. Não altere arquivos, não rode git que escreva, não acesse rede, não conecte em banco.
Worktree: a pasta atual (branch `claude/estoque-manual-kg-001`).

Na R6 você revisou `e1b31ad..4cb4baa` e pediu mudanças:
- P2 — `CadastrosHub.tsx`: com a leitura do link `?aba=produtos&produto=<id>` pendente, abrir Novo/Editar e depois receber a resposta substituía o rascunho do operador.
- P3 — em StrictMode, a leitura descartada que falhasse consumia o pedido e a válida era ignorada.
- O merge `e1b31ad` (main `0cd3418`, PR #320) foi confirmado limpo.

O conserto está no commit `5672462` (`git show 5672462`):
- cada pedido do link é um token próprio (`{ id }`), comparado por identidade;
- `encerrar()` consome o pedido só se ele ainda for o dono, antes de abrir a ficha;
- um efeito em `m.open` encerra o pedido pendente quando o editor abre por outro caminho;
- teste de componente novo `lib/cadastros/produto-ficha-link.component.test.ts` (abertura, outra loja → `null`, P2, P3; P2 e P3 reprovam com o efeito anterior — provado por mutação local);
- `.github/workflows/platform-pilot.yml` passa a rodar esse teste e `app/api/produtos/[id]/route.test.ts`;
- ajustes de seletor no E2E `e2e/platform-pilot/estoque-manual-kg.spec.ts`.

## Peça

1. Confirme se P2 e P3 estão resolvidos de fato, procurando qualquer sequência (troca de loja/remontagem por `key={storeId}`, link repetido para o mesmo id, editor fechado antes da resposta, resposta rejeitada, `onOpenProductConsumed` instável por ser arrow inline) que ainda abra a ficha errada, perca o pedido ou entre em laço de leituras.
2. Revise de novo o diff completo `git diff e1b31ad HEAD` (ignore `docs/ai-execution/_evidence/**`) em busca de achados novos, com o mesmo foco da R6: nenhum caminho A01 envia `stock` para produto KG, `obterProdutoFicha` isolado por loja, `parseStock` sem truncar e sem quebrar cliente legítimo, UN preservado, venda por peso e Ajuste KG continuam bloqueados.

## Formato

Primeira linha: `VEREDITO: APPROVE` ou `VEREDITO: REQUEST_CHANGES`.
Depois, achados numerados com severidade P0–P3, arquivo:linha, cenário concreto e correção. Sem achado: "0 achados".
