# OmniGestão Pro no Windows — distribuição com custo zero

GOAL `OMNI-DESKTOP-DISTRIBUICAO-PUBLICA-SAAS-001` · 20/11/2026 · orçamento para certificado: **R$ 0**

Decisão do proprietário: nada de certificado, domínio ou serviço pago agora. O download público continua
**desligado** até existir uma solução homologada. A instalação da RAFACELL (1.0.3) não muda.
A integração da assinatura paga (SSL.com eSigner) fica preservada e dormente: ver
`RELEASE_PUBLICA_CONFIGURACAO.md`.

## Resumo

| Canal | Custo | Para quem | Quando |
|---|---|---|---|
| **A. Navegador + "Instalar app" (PWA)** | R$ 0 | Todos os clientes (canal comercial oficial) | **Agora** |
| **B. Programa Windows por instalação assistida** | R$ 0 | Só lojas piloto autorizadas, instalado pela equipe | **Agora** |
| C. Microsoft Store (pacote MSIX assinado pela Microsoft) | R$ 0 (exige desenvolvimento) | Download público com confiança do Windows | Futuro |
| D. Certificado pago (Certum / Sectigo / SSL.com) | ~R$ 1.500–1.900/ano | Download público pelo site | Futuro, quando a receita justificar |

## A. Agora — navegador como canal comercial (R$ 0)

Funciona em Windows 10, Windows 11, Windows ARM, Mac e Linux: o Windows não confere assinatura, porque
não há executável. Atualiza a cada deploy da Vercel.

Já existe no código:

- Manifesto PWA (`app/manifest.ts`): `display: standalone`, `start_url: /login`. Chrome e Edge oferecem
  **"Instalar OmniGestão Pro"**, com ícone na Área de Trabalho e no Menu Iniciar e janela própria, sem
  barra de endereço.
- Service worker (`next-pwa`) com `reloadOnOnline: false` (não apaga o carrinho ao reconectar).
- `/baixar` já orienta "use pelo navegador" enquanto o download está desligado.
- PDV: sem o app Windows, o cupom cai no fallback HTML do navegador (`lib/pdv-print-runtime.ts`), que abre
  o diálogo de impressão.

Impressão do cupom sem diálogo no caixa (gratuito, **a homologar num PC de teste, não no caixa da
RAFACELL**):

1. Definir a POS-80 como **impressora padrão** do Windows nesse caixa.
2. Criar um atalho dedicado ao caixa (perfil separado, para não afetar o navegador pessoal):
   ```
   "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe" --user-data-dir="C:\OmniCaixa\Perfil" --kiosk-printing --app=https://omni-gestao-pro.vercel.app/login
   ```
   `--kiosk-printing` imprime direto na impressora padrão, sem diálogo. Só vale quando esse perfil é aberto
   por esse atalho: por isso o `--user-data-dir` próprio.
3. Na 1ª abertura, permitir pop-ups do domínio, porque o cupom abre em janela própria.

Limites em relação ao programa Windows: a escolha da impressora por estação é substituída pela impressora
padrão do Windows; não há o aviso de USB desconectada do spooler direto; a gaveta só abre pelo comando do
driver da impressora, se ele tiver essa opção.

Ação de produto sugerida (pequena, futura e com autorização própria): um botão "Instalar no computador"
que use o `beforeinstallprompt`, e um guia em `/baixar` com os 3 passos acima.

## B. Agora — instalação assistida para lojas piloto (R$ 0)

Para loja piloto que precise do programa Windows (impressão direta pelo spooler, estação de impressão
fixa):

1. Gerar o instalador pelo canal **interno** já existente: *Actions → desktop-windows → Run workflow* na
   `main` com `internal_release=true`. Sai um **rascunho** de release no GitHub com o `Setup.exe` e o
   `SHA256SUMS.txt`, visível só para quem tem acesso ao repositório. O instalador da `main` passou pelo
   teste automático de instalação, atualização e desinstalação no runner.
2. A equipe baixa o arquivo e confere o hash (`Get-FileHash -Algorithm SHA256`) **antes** de levar à loja,
   por pendrive ou acesso remoto. O link nunca vai para o cliente nem para página pública.
3. Na loja, o **técnico** instala. O SmartScreen vai mostrar "Editor desconhecido": *Mais informações →
   Executar assim mesmo*, feito pelo técnico depois de conferir o hash. Nunca pedir isso ao cliente por
   mensagem, nunca desativar o SmartScreen ou o antivírus, nunca instalar certificado autoassinado na
   máquina do cliente (seria uma autoridade raiz falsa nesse computador).
4. Registrar em `docs/ai-execution/_evidence/`: loja, versão, SHA-256, data e técnico.
5. Atualização: a 1.0.4 em diante avisa versão nova só quando houver `latest.json` público, o que hoje
   não existe. No piloto, atualizar pelo mesmo processo, com o novo `Setup.exe` sobre o antigo (perfil,
   impressora e vendas pendentes são preservados).

A RAFACELL continua na 1.0.3, que já foi homologada. Atualizar só com autorização do proprietário.

## C. Futuro — Microsoft Store (R$ 0, exige desenvolvimento)

É o caminho gratuito para um download público **confiável**:

- Conta de desenvolvedor **empresa gratuita** desde 07/05/2026 (antes US$ 99), com verificação da empresa
  feita pela Microsoft.
- Pacote **MSIX publicado pela Store é assinado pela Microsoft**: sem certificado próprio, sem aviso do
  SmartScreen, com atualização automática pela Store.

Trabalho e riscos antes de decidir (cada item exige autorização própria):

1. Empacotar o Electron como MSIX (novo *maker* no Forge) e homologar a impressão direta dentro do
   contêiner MSIX.
2. O MSIX isola `%AppData%`: o perfil, o `print-station.json` e as vendas pendentes da instalação Squirrel
   **não migram sozinhos**. Exige um plano de migração para as lojas piloto.
3. Política da Store: um app que só embrulha um site pode ser recusado. A impressão direta é um diferencial
   nativo, mas a aprovação não é garantida.
4. Exige uma URL de política de privacidade e um canal de suporte reais (hoje `/suporte` tem contatos de
   exemplo).
5. Alternativa mais leve: publicar o **PWA** na Store (PWABuilder, também assinado pela Microsoft), sem a
   impressão direta.

## D. Futuro — certificado pago

Quando houver orçamento, a integração SSL.com eSigner já está pronta (dormente). Opções comparadas em
`RELEASE_PUBLICA_CONFIGURACAO.md`: Certum ou Sectigo + Google Cloud HSM (~R$ 1.500/ano) e SSL.com
(~R$ 1.880/ano). O domínio de downloads (~R$ 40/ano) também fica para essa etapa.

Descartados: **SignPath Foundation** (gratuito só para código aberto, com licença OSI, e o editor passa a
ser a SignPath, não a empresa); **Azure Artifact Signing** (empresas brasileiras não são elegíveis em
11/2026; reavaliar, porque seria o mais barato, ~US$ 120/ano).

## O que NÃO muda

- `DESKTOP_PUBLIC_DOWNLOAD` desligado; `/baixar` continua com "acesso pelo navegador".
- Nenhum bucket, domínio ou certificado criado.
- O environment `desktop-release` (aprovação do proprietário, só `main`) fica configurado, sem custo e sem
  segredos.
