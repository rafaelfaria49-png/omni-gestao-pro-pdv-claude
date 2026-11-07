# VENDA_PENDENTE_ESTADO — PDV-SYNC-PRODUTO-NAO-RESOLVIDO-RECOVERY-001

Sem PII. Nenhuma consulta foi inventada: o que não foi lido está marcado como não lido.

## Identidade da pendência

| Campo | Estado |
|---|---|
| storeId / terminal | Loja do PDV Clássico (Assistência Técnica), terminal PDV1 — pela captura; storeId exato **não lido** |
| clientSaleId / ref local (`PEND-…`) | **NÃO LIDO** — vive no `localStorage` do navegador do operador |
| Linhas / pagamentos / total | **NÃO LIDOS** |
| Hash do payload | **NÃO CALCULADO** (payload não acessado) |

O carrinho visível (PELÍCULA 2 × R$ 4,00) **não** é tratado como a pendência: pelo contrato PENDING
o carrinho da venda pendente costuma ficar na tela, mas isso não prova identidade, quantidade nem
pagamento da pendência.

## Classificação (A–E do GOAL)

**A — pendente apenas localmente, não persistida** é o estado implicado pelo código: a resposta é um
409 de negócio lançado dentro da transação (numeração, Venda, ItemVenda, estoque, caixa e financeiro
revertem juntos), e o replay por `clientSaleId` roda **antes** da resolução de produto
(`ops-upsert-venda.ts:665`), então um 409 `PRODUTO_NAO_RESOLVIDO` também prova que não existia venda
com aquele `clientSaleId` naquele instante.

Mas **não está comprovado no servidor** para ESTA venda: confirmar exige (i) o `clientSaleId` da
pendência e (ii) uma consulta `SELECT … FROM vendas WHERE "storeId"=$1 AND "clientSaleId"=$2` em
produção — leitura negada nesta sessão. Status reportado: `ORIGINAL_SALE_SERVER_STATE=UNKNOWN`
(esperado `NOT_FOUND`).

## Plano de recuperação da MESMA venda (nada executado)

Pré-condição: deploy do patch (o Reenviar passa a registrar e mostrar a linha exata).

1. Operador clica **Reenviar** uma vez → banner passa a mostrar `Venda PEND-… de dd/mm hh:mm` e
   `Item: <nome> (código <ref>)`. Nada é gravado se continuar sem casamento.
2. Gerente regulariza o cadastro **daquele código** em Cadastros (ex.: devolver o SKU antigo ao
   produto correto, ou recadastrar o item com o mesmo código), com autorização do proprietário.
   Nunca vincular a outro produto "parecido".
3. Operador clica **Reenviar** → a mesma identidade (`clientSaleId`) é gravada uma única vez
   (venda, estoque, caixa, financeiro) — sem novo pagamento.
4. Conferir no Histórico de Vendas que a venda aparece com número `VDA-…` e o total original.

Se o código apontar um produto que não deve voltar a existir, ou a referência for um cuid (produto
sem SKU) já excluído, não há regularização por cadastro: **PENDING_HUMAN_ACTION** — exige ferramenta
de revínculo aprovada (fora deste patch; ver RELATORIO_FINAL.md, próximo gate).

## Para voltar a vender AGORA (sem deploy)

No PDV, **Cancelar venda** (limpar o carrinho) libera a guarda de identidade; a pendência continua
guardada no banner e no Histórico — não é apagada. Não finalize a mesma venda de novo (criaria outra
identidade e cobraria duas vezes).
