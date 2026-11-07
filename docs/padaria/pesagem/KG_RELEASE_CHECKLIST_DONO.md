# Conferência das lojas na janela KG — roteiro do proprietário

Para usar **somente na janela autorizada (W1/J0)**, em cada terminal, pelo próprio operador, com o
proprietário acompanhando. Ninguém acessa os terminais remotamente. Nada aqui está preenchido nem aprovado.
O modelo técnico completo (inventário de origens, consulta das sessões, deployments) está no
`ESTOQUE_MANUAL_KG_CHECKLIST_LOJAS.md` da #315; este roteiro é a versão para a loja.

**Por que isto importa:** vendas que ainda não chegaram ao servidor ficam guardadas **no navegador**, ligadas ao
**endereço** em que foram feitas. Depois do corte, um endereço antigo não alcança mais o banco e a venda fica
presa naquele aparelho. Não limpar cache, histórico ou "dados do site": isso pode apagar a única cópia da venda.

## Lojas (identificar sempre pelo código)

| Código | Loja | Atenção |
| --- | --- | --- |
| `loja-1` | RAFACELL | — |
| `loja-2` | RAFA BRINQUEDOS | existe uma loja de teste `loja-11` com o mesmo nome: conferir o código |

## Passo a passo em cada terminal (computador, celular, app instalado, cada perfil de navegador)

1. **Anote** o aparelho (ex.: "Caixa 1, notebook Dell"), o navegador/perfil ou "app instalado", e o operador.
2. **Endereço**: na barra do navegador deve aparecer `omni-gestao-pro.vercel.app`. No app instalado, use a
   opção do próprio app/navegador que mostra ou abre o endereço (por exemplo "Abrir no navegador") e anote-o. Qualquer outro endereço: **anote e avise o responsável
   antes de continuar** — não feche essa aba ainda.
3. **Vendas pendentes**: abra **Vendas → Arquivo geral** (`/dashboard/vendas-arquivo-geral`).
   - Nenhuma venda com selo **"Pendente"** e nenhum botão **"Verificar pendentes locais"** → pendentes = 0.
   - Tem pendente e a internet funciona → deixe a tela aberta 2 minutos (o reenvio é automático) e confira de novo.
   - Continua pendente ou aparece "ação necessária" → **não clique em reenviar**. Fotografe a tela (pedido,
     valor, forma de pagamento, horário) e avise o responsável. A janela não começa até decidir.
4. **Pagamentos**: nenhum PIX aguardando, nenhuma maquininha com transação aberta, nenhuma tela de pagamento
   aberta. Venda paga sem confirmação na tela → guarde o comprovante e avise; não cobre de novo.
5. **Trocas e devoluções**: nenhuma devolução ou vale "pendente de sincronização".
6. **Caixa**: fechamento normal do dia feito pelo responsável. Não abrir caixa até a reabertura autorizada.
7. **Feche** todas as abas do sistema e o app instalado. Não vender durante a janela.
8. **Terminal desligado, guardado ou que não foi encontrado**: a janela **não começa**. Ele precisa ser ligado
   e conferido, porque pode ter vendas guardadas.

## Folha de conferência

| Código | Loja | Aparelho / navegador ou app | Endereço confere? | Pendentes = 0? | Pagamento aberto = 0? | Devolução pendente = 0? | Caixa fechado? | Abas fechadas? | Operador | Horário |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| loja-1 | RAFACELL | | | | | | | | | |
| loja-1 | RAFACELL | | | | | | | | | |
| loja-2 | RAFA BRINQUEDOS | | | | | | | | | |
| loja-2 | RAFA BRINQUEDOS | | | | | | | | | |

Acrescente uma linha para **cada** aparelho/perfil usado nas lojas, inclusive os que ficam guardados.

## Depois da janela (J13 e W2/W3)

- Abrir o sistema **só** pelo endereço `omni-gestao-pro.vercel.app` e esperar a tela carregar inteira.
- Fazer uma venda UN normal de conferência indicada pelo responsável (não usar venda de cliente como teste).
- Venda por peso continua **desligada** até autorização separada.
- Qualquer mensagem de "manutenção programada" ou venda pendente que não zera: avisar e **não** limpar o navegador.

**Resultado da conferência:** GO / NO-GO · responsável: ______ · data e hora: ______ · autorização: ______
