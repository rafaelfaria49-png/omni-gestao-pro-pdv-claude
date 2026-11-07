# Checklist de lojas — antes da janela do estoque KG

Para **RafaCell** e **Rafa Brinquedos**. Feito pelo operador de cada terminal, com o responsável no
telefone, **antes** de ligar a trava. Ninguém de fora abre PDV/Vendas em outro navegador: abrir essas telas
reenvia vendas pendentes sozinho (a cada 30 s), então conferir é tarefa do próprio terminal.

Por que importa: a fila de vendas pendentes vive no navegador, **por endereço**. Uma aba aberta numa URL
de deployment antigo só reenvia para aquele deployment; depois do corte ele não alcança mais o banco e a
venda fica presa naquele navegador (não some, mas não chega). Tempo de espera não resolve isso; só a
conferência abaixo.

## Por terminal (preencher uma linha cada)

| Loja | Terminal | Endereço na barra / atalho do app | Caixa encerrado? | Pendências = 0? | Pagamento em andamento? | Devolução/vale pendente? | Abas fechadas? | Quem / hora |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| RafaCell | | | | | | | | |
| RafaCell | | | | | | | | |
| Rafa Brinquedos | | | | | | | | |
| Rafa Brinquedos | | | | | | | | |

1. **Endereço**: o certo é `https://omni-gestao-pro.vercel.app`. Qualquer outro — `omni-gestao-…-rafaelfaria49-4373s-projects.vercel.app`,
   `omni-gestao-pi.vercel.app`, `localhost` — anotar e tratar primeiro (passo 3), **antes** do corte.
   No app instalado (PWA), conferir em "Sobre/Abrir no navegador" qual endereço ele abre.
2. **Caixa**: fechamento feito e conferido; nenhuma sessão de caixa aberta. Não abrir caixa até o aviso de reabertura.
3. **Vendas pendentes**: tela de Vendas/Pendências mostra **0**. Se houver:
   - endereço certo e internet ok → deixar a tela aberta até zerar (o reenvio é automático) e conferir de novo;
   - venda com "ação necessária" → **não** clicar em reenviar; anotar pedido, itens, pagamentos e o
     identificador da venda e mandar ao responsável;
   - endereço errado → deixar sincronizar ali mesmo (antes da janela o código antigo ainda grava certo)
     até zerar; se não zerar, anotar como acima.
4. **Pagamento em andamento**: nenhum PIX aguardando, nenhuma maquininha/TEF com transação aberta, nenhuma
   tela de pagamento aberta. Venda paga sem confirmação → anotar valor, forma e horário.
5. **Devolução / vale-crédito** pendente de envio: 0.
6. **Terminal offline**: se não tiver internet, não ligar a trava até ele voltar e zerar a fila.
7. **Fechar** todas as abas e o app do sistema. Não vender durante a janela.

## Para o responsável

- [ ] As duas lojas devolveram a tabela completa, sem pendência sem dono.
- [ ] Nenhum terminal fora de `omni-gestao-pro.vercel.app`, ou os que estavam já zeraram.
- [ ] Anotações de vendas com ação necessária guardadas (serão lançadas depois com a **mesma** identidade).
- [ ] `SALE_SERVER_NUMBERING_ENABLED` e o projeto canônico **não** serão alterados na janela (trocar o writer
      duplica venda confirmada cuja resposta se perdeu — `30-fila-pdv.txt`).

## O que foi provado sobre a fila (isolado, handlers reais)

`docs/ai-execution/_evidence/ESTOQUE-MANUAL-KG-001/rollout-remediation/30-fila-pdv.txt`:
trava ligada → 5xx e a fila classifica como reenvio automático, sem nenhum efeito parcial (venda, item,
financeiro, livro, saldo); trava desligada → grava uma vez; reenvio da mesma venda (resposta perdida),
reenvio em paralelo e reenvio sob nova trava → replay, sem duplicar; venda gravada antes da janela e
reenviada depois → replay. O formato da fila no navegador é o mesmo entre a `main` e a PR.
