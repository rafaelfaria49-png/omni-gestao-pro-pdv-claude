# Changelog

## 2026-09-17

### Cadastros — Voz no Cadastro Inteligente de Produto (CAD-R2-017)

- Em **Descrever produto**, o operador pode ditar a descrição (Chrome/Edge, HTTPS ou localhost) ou continuar só com texto.
- A transcrição fica editável e segue o interpretador de texto livre já existente; aplicar só preenche o formulário.
- Áudio e transcrição não são gravados no produto. Disponibilidade do microfone é detectada de forma honesta.

## 2026-08-29

### PDV — Venda em espera

- Restaurado o acesso visível `Em espera` em Assistência, Clássico e Supermercado.
- Reutilizada a persistência local existente de `lib/pdv-hold`, com atualização da UI, múltiplos holds e isolamento por loja/terminal/tipo de PDV.
- Resume preserva itens, quantidades, preços, descontos, cliente, acessórios e metadados de linha suportados por cada PDV.
- Retomar com carrinho ocupado exige confirmação e guarda o carrinho atual; descartar confirma que apenas o hold local será removido.
- Hold continua sem criar venda, baixar estoque ou movimentar Financeiro, Caixa ou Fiscal.
