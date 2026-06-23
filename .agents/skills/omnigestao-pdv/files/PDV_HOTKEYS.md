# PDV — Atalhos de teclado

**Fonte canônica:** `docs/ai/MASTER_CONTEXT.md` §7.5–7.8.

> Os atalhos **não são idênticos** entre `uiShell === "default"` (Services legado) e **`omni-smart`**, e o **PDV Assistência Enterprise** tem matriz própria. Sempre qualificar **arquivo + shell** ao documentar ou alterar atalhos.

## A) Layout legado Services (`uiShell === "default"`) — `pdv-classic.tsx`

- **F1:** ajuda de teclado  
- **F2 / Alt+P:** abrir pagamento  
- **F3:** foco busca produto  
- **F4:** foco quantidade ou busca se carrinho vazio  
- **Alt+D:** pagamento  
- **F10** e **Espaço** (fora de input): finalizar / abrir pagamento  
- **Escape:** fecha modais; em modo rápido pode remover último item (condições aplicáveis)

## B) Shell omni-smart — `openShellShortcut` em `pdv-omni-classic-shell.tsx`

- **F1:** finalizar (abre pagamento)  
- **F2:** busca cliente  
- **F3:** busca produto  
- **F4:** editar quantidade do item selecionado  
- **F5:** remove item selecionado  
- **F6:** cancelar venda  
- **F7 / F8:** voltar ao bipe  
- **F9:** contas a receber (modal)  
- **CTRL** solto após pressionar Control: funções avançadas  

Barra visual pode listar F1–F9 + CTRL; o classic pode estender F10–F12 onde implementado no assistência.

## C) PDV Assistência Enterprise — `keydown` global

- **F1:** pagamento modo dinheiro (abre modal)  
- **F2 / F3:** foco cliente / bipe  
- **F4:** ✅ alterar quantidade do item selecionado (dialog inline)  
- **F5:** remove último item (fora de input)  
- **F6:** cancela item selecionado ou último  
- **F7:** desconto (modo não rápido) ou toast  
- **F8:** trocas / devoluções  
- **F9:** ✅ abre Contas a Receber em nova aba (`window.open`)  
- **F10:** desconto / acréscimo  
- **F11:** ✅ Suspender venda (carrinho em espera) — salva carrinho + cliente com label "Venda #N", limpa o caixa para novo atendimento; retomar via badge "N em espera" no header do carrinho; persiste em localStorage  
- **F12:** pagamento múltiplo  
- **End:** alterna help  
- **Delete:** remove último item (regras de contexto)
