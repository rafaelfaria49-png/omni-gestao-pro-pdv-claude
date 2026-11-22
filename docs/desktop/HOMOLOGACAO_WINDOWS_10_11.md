# Homologação física — Windows 10 e Windows 11

GOAL `OMNI-DESKTOP-WINDOWS-10-11-DOWNLOAD-RELEASE-001` · 22/11/2026

Roteiro curto para o proprietário (ou técnico) executar nas lojas. **Nenhum resultado abaixo foi
preenchido por IA**: só marque o que foi visto na tela. Windows 10 só vira "Homologado" em
`lib/desktop-distribution/compatibility.ts` depois desta lista aprovada com evidência
(fotos/prints em `docs/ai-execution/_evidence/`).

## Por que um único instalador

O Electron 45 suporta oficialmente "Windows 10 and up" com binário x64. O instalador Squirrel é o
mesmo para os dois sistemas. Por isso os botões **Baixar para Windows 10** e **Baixar para Windows 11**
de `/baixar` apontam para o **mesmo** `OmniGestaoPro-Setup.exe`, com a mesma versão e o mesmo SHA-256.
Suporte da biblioteca não conta como homologação: cada botão só fica ativo quando aquele Windows
está homologado aqui **e** existe release pública assinada.

## Antes de ir à loja (equipe)

1. Ter o `OmniGestaoPro-Setup.exe` da versão a homologar, vindo do pipeline oficial (`desktop-release.yml`)
   ou, enquanto não houver certificado, do rascunho interno `desktop-windows` (`internal_release=true`).
2. Conferir o hash: `Get-FileHash -Algorithm SHA256 .\OmniGestaoPro-Setup.exe` = valor publicado.
3. Usuários de teste já existentes, um por papel (ADMIN, GERENTE, CAIXA), sem criar dados em lojas reais.

## LOJA 2 — Rafa Brinquedos · Windows 10 · instalação nova

Pré-checagem (anotar):

- [ ] `Windows + R` → `winver`: versão **22H2**, build **19045.x** — anotar build: ______
- [ ] *Configurações → Sistema → Sobre*: "Tipo de sistema" = **Sistema operacional de 64 bits, processador baseado em x64**
- [ ] Espaço livre em C: ≥ 1 GB — anotar: ______
- [ ] Impressora térmica instalada no Windows (nome): ______

Instalação e uso:

- [ ] Abrir `/baixar` no navegador da loja: a sugestão destacada é "Windows 10" (Chrome/Edge)
- [ ] Propriedades do arquivo → *Assinaturas Digitais*: titular = ______ (se release interna não assinada: anotar "sem assinatura — instalação assistida")
- [ ] Instalar: abre sozinho; atalho na Área de Trabalho e no Menu Iniciar; aparece em *Aplicativos instalados*
- [ ] Login com usuário da Rafa Brinquedos: entra e mostra **somente** a loja Rafa Brinquedos
- [ ] Usuário só da RAFACELL não enxerga Rafa Brinquedos (e vice-versa), salvo permissão explícita
- [ ] Credencial inválida: mensagem de erro, sem entrar
- [ ] Logout volta ao login
- [ ] ADMIN/GERENTE com 2+ lojas: troca para a loja permitida funciona
- [ ] Terminal/caixa mostrado é o deste computador
- [ ] PDV abre e busca produto (sem finalizar venda real, a menos que o proprietário decida)
- [ ] *Configurações → PDV e impressão → Impressão direta neste computador*: escolher a impressora; imprimir teste
- [ ] Fechar e reabrir o programa: continua logado, mesma loja, mesma impressora
- [ ] Ctrl+Shift+Alt+V (*Sobre*) mostra a versão instalada: ______
- [ ] Desinstalar e reinstalar: login e impressora continuam

## LOJA 1 — RAFACELL · Windows 11 · atualização 1.0.3 → nova versão

Só com autorização do proprietário (a RAFACELL está em 1.0.3 por decisão dele).
Fazer com o **caixa fechado** e sem venda em andamento.

- [ ] Antes: *Sobre* mostra 1.0.3; anotar impressora escolhida: ______; vendas pendentes de envio: ______
- [ ] Executar o novo Setup.exe por cima (não desinstalar antes)
- [ ] Depois: *Sobre* mostra a versão nova: ______
- [ ] Continua logado, mesma loja, mesmo terminal
- [ ] Impressora configurada continua a mesma; impressão direta POS-80 ok
- [ ] Vendas pendentes de envio continuam lá e sincronizam
- [ ] Reiniciar o programa: tudo mantido
- [ ] Rollback (se algo falhar): reinstalar o Setup.exe 1.0.3 guardado; perfil é preservado

## Resultado

| Loja | Windows / build | Versão | Assinatura | Resultado | Quem / data |
|---|---|---|---|---|---|
| RAFACELL | Win 11 | | | PENDENTE | |
| Rafa Brinquedos | Win 10 22H2 | | | PENDENTE | |
