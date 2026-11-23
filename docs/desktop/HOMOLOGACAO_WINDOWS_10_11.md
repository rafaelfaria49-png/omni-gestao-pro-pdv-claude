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

## Instalador do piloto (custo zero) — decisão de 22/11/2026

O proprietário escolheu **custo zero**: sem certificado, sem Microsoft Store por enquanto e **sem**
instalador não assinado em página pública. O Windows 10 da Rafa Brinquedos recebe o programa por
**instalação assistida**, feita pela equipe.

**Instalador recomendado: 1.0.3 interno** (o mesmo que roda e foi homologado na RAFACELL).

| Campo | Valor |
|---|---|
| Release (rascunho, privada) | `desktop-v1.0.3-366d630` — *OmniGestão Pro Desktop 1.0.3 (interno, não assinado)* |
| Arquivo | `OmniGestaoPro-Setup.exe` · 155.851.776 bytes · x64 · canal `production` |
| **SHA-256** | `8f75e549386bd436a0acf613eec337909a7409276296eba733a2cea634a01523` |
| Origem | Workflow `desktop-windows` (run `43966294028`, `workflow_dispatch`, `internal_release`) no commit `366d630` da `main` (merge da #371); arquivos enviados por `github-actions[bot]` |
| Conferências | hash igual em 3 fontes independentes: `SHA256SUMS.txt`, `artifacts.json` e o *digest* que o próprio GitHub calcula do arquivo; 17/17 checagens do pacote ok; teste automático de instalação no runner ok |
| Assinatura | **nenhuma** (`"signature": "NAO_ASSINADO"`) |

Por que não a 1.0.4: ela só muda o pipeline de release e a consulta do manifesto de atualização (que hoje
responde 404, porque não existe release pública). Nunca foi gerada como instalador nem testada numa
máquina física. Para o teste de Windows 10, trocar de versão juntaria duas variáveis sem ganho. Limite
conhecido: a 1.0.3 **não** avisa sozinha sobre versão nova, então a próxima atualização da Rafa Brinquedos
(assim como a da RAFACELL) será manual, pelo mesmo processo.

## Antes de ir à loja (equipe)

1. **Obter o arquivo autenticado.** Só quem tem acesso ao repositório vê o rascunho: GitHub →
   *Releases* → `desktop-v1.0.3-366d630` → baixar `OmniGestaoPro-Setup.exe` e `SHA256SUMS.txt`. Ou, no
   terminal com o `gh` já logado:
   ```powershell
   gh release download desktop-v1.0.3-366d630 -R rafaelfaria49-png/omni-gestao-pro-pdv-claude -p OmniGestaoPro-Setup.exe -p SHA256SUMS.txt -D C:\OmniPiloto
   ```
   O link nunca vai para o cliente, para WhatsApp ou para página pública.
2. **Conferir o hash** antes de copiar para o pendrive:
   ```powershell
   (Get-FileHash -Algorithm SHA256 C:\OmniPiloto\OmniGestaoPro-Setup.exe).Hash
   ```
   Tem de ser `8F75E549386BD436A0ACF613EEC337909A7409276296EBA733A2CEA634A01523`. Se der diferente,
   **não instale**: apague o arquivo e baixe de novo.
3. **Usuários de teste:** a loja Rafa Brinquedos e um usuário dela precisam **já existir** na plataforma.
   Se não existirem, pare: criar loja ou usuário é provisionamento, com autorização própria do
   proprietário, e não faz parte deste roteiro.
4. Levar o Setup.exe **1.0.3** também para o rollback da RAFACELL, se for o caso.

## LOJA 2 — Rafa Brinquedos · Windows 10 · instalação nova

### 1. Conferir o Windows (anotar)

- [ ] `Windows + R` → `winver`: versão **22H2**, build **19045.x** — anotar build: ______
- [ ] *Configurações → Sistema → Sobre*: "Tipo de sistema" = **Sistema operacional de 64 bits, processador baseado em x64**.
      Se aparecer 32 bits ou ARM: **pare** — use o sistema pelo navegador.
- [ ] Espaço livre em C: ≥ 1 GB — anotar: ______
- [ ] Impressora térmica instalada no Windows e imprimindo página de teste do próprio Windows (nome): ______
- [ ] Antivírus instalado (nome): ______

### 2. Conferir o arquivo na própria máquina

- [ ] Copiar o Setup.exe do pendrive e repetir `Get-FileHash` **nesta máquina**: hash = o da tabela acima
- [ ] Propriedades → *Assinaturas Digitais*: a aba **não existe** (esperado: instalador interno sem assinatura). Anotar "sem assinatura — instalação assistida"

### 3. Instalar (só o técnico)

- [ ] Executar o Setup.exe. O SmartScreen deve mostrar **"O Windows protegeu o computador / Editor desconhecido"**.
      Isso é o esperado sem certificado. O **técnico** decide, já com o hash conferido, em *Mais informações →
      Executar assim mesmo*. Fotografar o aviso.
- [ ] **Não** desativar o SmartScreen, o Defender ou o antivírus, **não** criar exclusão, **não** instalar
      certificado autoassinado e **não** pedir ao cliente que faça isso. Se o antivírus bloquear ou
      colocar em quarentena: **pare**, fotografe e registre como falha.
- [ ] O programa abre sozinho; atalho na Área de Trabalho e no Menu Iniciar; aparece em *Aplicativos instalados*
- [ ] Ctrl+Shift+Alt+V (*Sobre*) mostra **1.0.3**

> A página pública `/baixar` diz para cancelar quando aparecer "editor desconhecido". Isso continua
> certo para o público. A exceção vale só para esta instalação assistida, feita pela equipe com o hash
> conferido.

### 4. Login e isolamento entre lojas

- [ ] Login com o usuário da Rafa Brinquedos: entra e mostra **somente** a loja Rafa Brinquedos
- [ ] Nenhum dado da RAFACELL aparece (clientes, vendas, produtos, caixa)
- [ ] Usuário só da RAFACELL não enxerga Rafa Brinquedos (e vice-versa), salvo permissão explícita
- [ ] Credencial inválida: mensagem de erro, sem entrar
- [ ] Logout volta ao login
- [ ] ADMIN/GERENTE com 2+ lojas: troca para a loja permitida funciona

### 5. PDV, caixa e impressora

Abrir caixa, vender ou sangrar **gera registro real** na Rafa Brinquedos. Fazer só o que o proprietário
autorizar na hora e anotar.

- [ ] Terminal/caixa mostrado é o deste computador
- [ ] PDV abre e busca produto pelo nome e pelo código de barras
- [ ] *Configurações → PDV e impressão → Impressão direta neste computador*: escolher a térmica; **imprimir teste**
- [ ] Desligar a impressora e imprimir teste: o sistema avisa que ela não responde; religar e *Tentar novamente* funciona
- [ ] Se autorizado: abrir caixa, fazer uma venda real (ou de valor simbólico combinado), imprimir o cupom e fechar o caixa. Anotar o nº da venda: ______

### 6. Reiniciar e confirmar persistência

- [ ] Fechar e reabrir o programa: continua logado, mesma loja, mesma impressora
- [ ] Reiniciar o **Windows**: o programa abre pelo atalho, continua logado, mesma loja, mesma impressora
- [ ] Se o caixa foi aberto: o estado do caixa é o mesmo de antes de reiniciar
- [ ] (Opcional) Desinstalar e reinstalar: login e impressora continuam

### 7. Registrar falhas e evidências

- Fotos/prints de cada passo: `winver`, *Sobre* do Windows, hash, aviso do SmartScreen, *Sobre* do
  programa, loja logada, impressão de teste e o cupom, se houver.
- Salvar em `docs/ai-execution/_evidence/OMNI-DESKTOP-WIN10-PILOTO-CUSTO-ZERO-002/` com: data, técnico,
  build do Windows, versão, SHA-256, antivírus e resultado de cada item.
- Qualquer item que falhe: anotar o que apareceu na tela, sem "dar um jeito". O Windows 10 só vira
  **Homologado** (com a versão em `versoesHomologadas`) em `lib/desktop-distribution/compatibility.ts` depois desta lista inteira aprovada com evidência.

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
