# Instalar o OmniGestão Pro em outro computador — roteiro curto

GOAL `OMNI-WINDOWS-INSTALACAO-COMERCIAL-CUSTO-ZERO-003` · 23/11/2026 · sem login no GitHub no computador da loja.

## 1. Primeiro caminho — aplicativo pelo navegador (qualquer loja, R$ 0)

No computador novo (Windows 10 ou 11), **com o Microsoft Edge ou o Google Chrome**:

1. Abrir `https://omni-gestao-pro.vercel.app/baixar`.
2. No quadro **Aplicativo pelo navegador**, clicar em **Instalar OmniGestão Pro**. Se o botão não
   aparecer, seguir os 3 passos do menu mostrados no mesmo quadro (Edge: ··· → Aplicativos → Instalar este
   site como um aplicativo; Chrome: ⋮ → Transmitir, salvar e compartilhar → Instalar página como app).
3. No Edge, marcar *Fixar na barra de tarefas*, *Fixar em Iniciar* e *Criar atalho na área de trabalho*.
4. Abrir pelo atalho **OmniGestão Pro**: abre em janela própria, na tela de login.
5. Entrar com o email e a senha **da pessoa que vai usar este computador**. Ela só vê as lojas liberadas
   para ela. Para trocar de usuário: *Configurações → Segurança → Encerrar sessão*.
6. Impressão: no caixa, o cupom abre a janela de impressão — escolher a impressora térmica e confirmar.
   Fazer uma venda de teste de baixo valor **antes** de usar no atendimento.

Pronto. Atualizações chegam sozinhas (mesmo do site). Nada para baixar, nada para assinar.

Limites honestos: sem impressão automática do cupom ao finalizar, sem aviso de impressora desligada,
precisa de internet (o PDV guarda vendas sem conexão em armazenamento local por loja e envia quando volta).
O Service Worker não armazena APIs ou páginas autenticadas em cache offline e o logout limpa caches
autenticados legados; ainda assim, em computador dividido entre lojas diferentes, recomenda-se usar um
usuário do Windows separado para cada loja.

## 2. Só se precisar de impressão direta — programa Windows por instalação assistida

Para o caixa que precisa do cupom automático na térmica. **Feito pela equipe da plataforma**, nunca
pedido ao cliente por mensagem.

1. Quem tem acesso ao repositório baixa o rascunho de release interno
   `desktop-v1.0.3-366d630` (1.0.3, homologado na RAFACELL): `OmniGestaoPro-Setup.exe` (155.851.776 bytes).
   O cliente não precisa de GitHub: o arquivo vai por pendrive ou acesso remoto da equipe — nunca por link
   público.
2. No computador da loja, **antes de abrir**, conferir no PowerShell:
   ```powershell
   (Get-FileHash .\OmniGestaoPro-Setup.exe -Algorithm SHA256).Hash
   ```
   Deve ser exatamente `8F75E549386BD436A0ACF613EEC337909A7409276296EBA733A2CEA634A01523`.
   Diferente = apagar o arquivo e não instalar.
3. O Windows avisa "Editor desconhecido" porque o instalador interno **não é assinado**. Só o técnico, com o
   hash conferido, usa *Mais informações → Executar*. **Nunca** desativar SmartScreen, Defender ou
   antivírus, e nunca instalar certificado próprio na máquina do cliente.
4. Abre sozinho; atalhos na Área de Trabalho e no Menu Iniciar. Entrar, escolher a loja e configurar
   *Configurações → PDV e impressão → Impressão direta neste computador*. Imprimir o teste.
5. Registrar em `docs/ai-execution/_evidence/`: loja, computador, versão, SHA-256, data, técnico.

Este caminho é **interno e assistido**. Não é release pública e não aparece em `/baixar` (o botão do
programa só liga com instalador assinado e homologado — ver `DISTRIBUICAO_PUBLICA.md`).
