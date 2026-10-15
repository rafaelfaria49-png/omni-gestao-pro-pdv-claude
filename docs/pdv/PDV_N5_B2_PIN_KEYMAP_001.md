# PDV N5-B2 — política de PIN e teclado

GOAL: `PDV-PARITY-N5-B2-PIN-KEYMAP-001`. Quatro superfícies oficiais; rápido é um modo explicitamente ativado. Base da execução: `6b0b240f7ceb5cd9b8c87e55be55a52ccb04eca2`, descendente da base publicada `d5d61b98ac644690203f73d68c673f5c485461d4` (PR #270).

## Política de PIN

| Superfície | Remover item / limpar carrinho |
| --- | --- |
| Classic | Sem novo PIN. Delete remove selecionado/último fora de campos; F6 abre confirmação para cancelar venda. |
| Assistência | Sem novo PIN. F5 pede confirmação explícita da linha; F6/Delete preservam remoção direta fora de campos. Ctrl+L e botão Limpar pedem confirmação do carrinho. |
| Supermercado padrão | PIN vigente via `/api/auth/admin` para remover/limpar. Sessão de administrador já autorizada preserva a exceção existente. |
| Supermercado rápido | Exceção existente, somente com `isModoRapido=true`: clique remove/limpa sem PIN; Escape remove último fora de campos, sem busca e sem modal/menu aberto. |
| Venda Completa | Sem novo PIN. Preserva remoção de linha pelo clique. |

Autorizações de desconto e formas de pagamento já existentes no modal compartilhado continuam vigentes nas quatro superfícies. Não há autenticação nova nem PIN persistido no cliente. PIN negado, erro de rede e cancelamento preservam o carrinho. Cancelar uma verificação em voo invalida sua resposta tardia; aprovação só executa a ação solicitada.

## Matriz final

| Tecla | Classic | Assistência | Supermercado | Venda Completa |
| --- | --- | --- | --- | --- |
| F1 | Pagamento | Dinheiro ou primeira forma ativa | Alias seguro de F2, primeira forma rápida ativa | Finalizar/pagamento |
| F2 | Cliente | Cliente | Primeira forma rápida | Buscar/limpar cliente |
| F3 | Busca de produto | Foco na busca | Segunda forma rápida | Foco no produto |
| F4 | Quantidade da linha selecionada | Quantidade da selecionada/última | Terceira forma rápida | Sem atalho |
| F5 | Recebimento de Contas | Remoção da selecionada/última com confirmação | Sem atalho | Sem atalho |
| F6 | Cancelar venda com confirmação | Remover selecionada/última fora de campos | Sem atalho | Sem atalho |
| F7 | Colocar/retomar espera | Colocar/retomar espera | Colocar/retomar espera | Colocar/retomar espera |
| F8 | Foco no bipe | Trocas/devoluções | Trocas/devoluções | Sem atalho |
| F9 | Recebimento, alias legado F5 | Recebimento de Contas | Recebimento de Contas | Sem atalho |
| F10 | Pagamento com desconto no modal | Desconto no pagamento, modo padrão | Cliente/CPF | Sem atalho |
| F11 | Sem atalho | Tela cheia | Sem atalho | Sem atalho |
| F12 | Pagamento múltiplo | Pagamento múltiplo ativo | Pagamento múltiplo ativo | Sem atalho; múltiplo pelo modal |
| Insert | Item avulso | Item avulso | Item avulso | Item avulso |
| Escape | Modal/contexto; rápido explícito remove último somente fora de campos e com busca vazia | Idem | Idem, mesma autorização do clique | Fecha ajuda, sugestões ou modal pertinente |
| Delete | Remove selecionada/última fora de campos | Remove selecionada/última fora de campos | Sem atalho | Sem atalho |
| End | Ajuda | Ajuda | Sem atalho | Ajuda |
| Ctrl+L | Sem atalho | Limpar com confirmação, fora de campos | Sem atalho | Sem atalho |
| Ctrl solto | Operações avançadas | Sem atalho | Sem atalho | Sem atalho |

As formas rápidas são posicionais: a primeira responde a F1/F2, a segunda a F3 e a terceira a F4. Os hints mostram somente essas teclas reais, independentemente do campo `hotkey` da configuração. Sem primeira forma ativa, F1 não cria um fallback. Abertura de pagamento mantém os gates de capability, caixa/sessão, cliente quando obrigatório, estoque, identidade pendente e concorrência existentes.

## Proteções e ajuda

- Um evento consumido não alcança outro handler. Teclas repetidas, composição de texto e combinações não previstas não disparam os atalhos.
- Modais locais e portais com dialog/alertdialog/menu/listbox bloqueiam ações globais. Escape fica com o modal e não remove uma linha em seguida.
- Input, textarea, select e contenteditable (inclusive descendentes) bloqueiam remoção/limpeza por teclado. Escape na busca limpa o texto pelo handler do campo. Mesmo com busca vazia, foco em campo não remove item.
- Remoção por Escape exige modo rápido explicitamente ativo, foco fora de campos, busca vazia e ausência de overlay. No modo padrão, Escape não remove.
- Insert e teclas de abertura não destrutivas continuam utilizáveis a partir de campos quando não há overlay; não confirmam a venda.
- A finalização conserva o busy do PaymentModal e o mutex próprio da Venda Completa. Enquanto em voo, o modal protege o carrinho e bloqueia reentrada.
- Ajuda do Classic: End abre ajuda, F1 abre pagamento; Espaço/Ctrl+L não são anunciados. Assistência: F5 confirma remoção, F9 recebe contas, Ctrl+L limpa com confirmação, F10 aplica desconto no modo padrão. Supermercado: hints F1/F2 e PIN contextual. Venda Completa: teclas ausentes são declaradas sem atalho.

## Evidências e limites

Comandos, contagens, SHA técnico e revisão independente: [evidência do GOAL](../ai-execution/_evidence/PDV-PARITY-N5-B2-PIN-KEYMAP-001.md).

A prova é local em jsdom com componentes/handlers de produção e I/O sintético. Não substitui sessão autenticada, loja/terminal reais nem smoke produtivo. N5-B1-004 continua BLOCKED. Sem banco, Docker, build completo, mudança de auth/schema/motor, merge em main ou início de N5-C nesta sessão.
