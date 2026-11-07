# FLUXOS_OFFLINE — o que o operador vê e o que o sistema garante

## Estados (nomes do painel)
| Estado | Quando | No servidor | Estoque/caixa do servidor | Reenviar |
|---|---|---|---|---|
| REGISTRADA_LOCALMENTE | criada, 1º envio ainda não respondeu | desconhecido | não lançados | sim |
| AGUARDANDO_CONEXAO | offline / rede / prazo / 5xx / resposta inconclusiva / sessão expirada | NÃO gravada ou desconhecido | não lançados | sim |
| VERIFICANDO_SERVIDOR | Reenviar consultando pela clientSaleId | — | — | botão desabilitado com a fase |
| ENVIANDO | POST em voo (manual ou automático) | — | — | botão desabilitado com a fase |
| CONFIRMADA | servidor devolveu a venda (prova) | gravada | lançados uma vez | — |
| REJEITADA | recusa definitiva (estoque, produto, pagamento, crédito, caixa) | NÃO gravada | não lançados | sim, após corrigir a causa |
| EXIGE_CORRECAO | caixa original fechado, drift, sem permissão, identidade recusada | NÃO gravada | não lançados | sim / retroativo / administrador |
| "Preservada" (quarentena) | conflito de identidade | desconhecido | — | não — conferência automática / administrador |

## Fluxo de balcão sem internet
1. A rede cai com carrinho aberto: o carrinho fica (sem reload — `reloadOnOnline: false`, #325).
2. Finalizar em dinheiro, Pix ou cartão: a venda é **gravada no navegador antes do envio**; o envio
   falha na hora; o PDV mostra "PENDENTE — AGUARDANDO CONFIRMAÇÃO" e o painel "Sem internet".
   Nada de cupom definitivo, auditoria de venda concluída ou baixa de estoque local (contrato CORREÇÃO-01).
3. Crédito/vale, a prazo e carnê: **recusados** com o motivo ("exige consulta online"); nada gravado.
4. Próximo cliente: F6 → "Cancelar venda" libera o carrinho. Mensagem: "A venda anterior NÃO foi
   cancelada: segue registrada neste terminal". Venda idêntica depois disso é uma venda nova.
5. Reenviar offline: responde na hora "sem conexão — nada foi enviado"; o desfecho fica na venda.
6. A rede volta: o evento `online` dispara o envio de toda pendência elegível (sem esperar backoff),
   cada uma com a sua identidade; o painel some quando todas confirmam.
7. F5 / fechar e reabrir o navegador: a fila volta do `localStorage`; o catálogo da carga inicial
   vem do cache do service worker; envio retoma quando houver rede e sessão.
8. Sessão expirada: a venda fica "Aguardando novo login"; depois do login, envia sozinha.
9. Após F5 ou em outra aba, carrinho IDÊNTICO a uma venda cujo envio ficou sem resposta (pode estar gravada): a finalização é barrada e o painel abre a decisão explícita — **Verificar a venda anterior** (consulta/reenvia a mesma identidade), **É outra venda** (a anterior fica na fila com a identidade dela; a próxima finalização cria identidade nova) ou **Voltar**. Repetir a finalização não decide nada.
10. Teclado: F1/F12 digitados logo após fechar um diálogo (ex.: Cancelar venda) funcionam — o guarda de atalhos ignora diálogos em animação de saída (antes descartava o atalho em silêncio).

## Pagamentos offline
- **Dinheiro**: declarado pelo operador (com troco, se informado) — rastreável na venda.
- **Pix / cartão**: **declarados**, sem conciliação — o PDV não tem TEF nem confirmação de Pix. O
  painel diz "pagamento declarado pelo operador — sem conciliação automática". A venda segue NÃO
  confirmada até o servidor gravar.
- **Crédito/vale, a prazo, carnê**: bloqueados offline (dependem de saldo/título no servidor).

## Fechamento de caixa
Com vendas da sessão não confirmadas, o fechamento mostra quantas e quanto, explica que não entram
no fechamento e exige marcar "Estou ciente". Sincronizada depois, a venda vai para a sessão original
pelo "Sincronizar retroativo" (ação manual com confirmação, já existente).

## Limites (não prometidos)
Navegador fechado / computador desligado não sincroniza; outro computador não vê a fila deste
durante a queda; a fila pertence à loja e ao navegador onde a venda nasceu.
