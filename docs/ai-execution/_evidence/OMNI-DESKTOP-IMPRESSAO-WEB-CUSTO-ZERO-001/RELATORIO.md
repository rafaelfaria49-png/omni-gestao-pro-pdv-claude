# OMNI-DESKTOP-IMPRESSAO-WEB-CUSTO-ZERO-001 — impressão de cupom pelo navegador

Data: 20/11/2026 · base `main` 08dc0d7 · Edge **157.0.4341.60**

## Resultado: homologação física PENDENTE

O único computador disponível nesta sessão é o **da RAFACELL** (nome `RAFACELL`, POS-80 como impressora
padrão em USB005, OmniGestão Pro 1.0.3 instalado). Pela regra do GOAL, **nada foi impresso**, nenhuma
política foi criada, a impressora padrão não foi trocada e o Electron não foi tocado. As políticas do Edge
foram só lidas: não há nenhuma em HKLM nem em HKCU.

`--kiosk-printing` envia para a impressora **padrão** do Windows (aqui, a POS-80 da loja). Por isso **não**
foi executado. Só foram feitas verificações técnicas sem impressora.

## O que foi verificado (sem impressora)

| Item | Resultado | Como |
|---|---|---|
| HTML real do cupom no navegador | Capturado (`cupom-real.html`): 1 janela, `via: "html"` | `printPdvSaleReceipt` real com `window.open` simulado (sem rede e sem banco) |
| Acentuação (ã õ ç é í ú, —) | OK na renderização (`cupom-qr-600.png`) | Edge headless, perfil isolado no diretório temporário |
| Largura do conteúdo | **72 mm** (`.wrap`) centralizado, padding 3 mm | CSS de `lib/thermal-print.ts` |
| Tamanho do papel | `@page { size: 80mm auto }` é **inválido** e o Edge ignora: o PDF saiu em Carta (215,9 × 279,4 mm). Na impressão real vale o papel padrão do driver | `--print-to-pdf` |
| Margens | `@page { margin: 0 }` é válido: sem margem e sem cabeçalho/rodapé no PDF | idem |
| QR Code | O cupom **não fiscal não tem QR** (só a DANFC-e, dormente). O QR do gerador do projeto renderiza nítido em 3 px por módulo | variante `cupom-qr` |
| Corte | O navegador não envia comando de corte: depende do driver ("cortar ao fim do documento") | código |
| Repetição (vias) | O fallback HTML abre **1 via** só; a configuração `viasCupom` vale apenas no Electron e no ESC/POS | `openBrowserFallback` |

## Achados no código (afetam a decisão)

1. **Sem impressão automática pelo navegador no PDV.** A impressão pós-venda usa
   `allowBrowserFallback: false` (`pdv-auto-print-feedback.tsx`). Sem o Electron ou uma ponte ESC/POS, ela
   falha e o operador precisa clicar para abrir o navegador. Isso atende à exigência de ação do operador,
   mas soma 1 clique por venda.
2. **Largura diferente da homologada.** O Electron 1.0.3 usa **64 mm**, porque 72 mm cortava a direita na
   POS-80 real (`apps/desktop/src/shared/print-protocol.ts`). O template do navegador ainda usa **72 mm**:
   o risco de corte à direita é alto.
3. **Impressora desligada:** o Electron confere a presença da USB antes de enviar (`Get-PnpDevice`), porque
   o spooler aceita e descarta o trabalho. O navegador não tem essa verificação: devolve "ok" e o cupom
   **some sem aviso**. O mesmo vale para falta de papel (o erro fica na fila do Windows).
4. **Impressora padrão errada:** com `--kiosk-printing` ou com a política, o cupom vai em silêncio para a
   impressora padrão. Se for a jato de tinta A4 (há uma EPSON L4160 nesta máquina), sai uma coluna de 72 mm
   numa folha A4. O Electron usa a impressora escolhida por estação.
5. **Escopo do silêncio:** `--kiosk-printing` vale para todo `window.print()` daquele perfil, inclusive
   relatórios e OS em A4, que também iriam para a térmica sem diálogo. No código, todos os disparos vêm de
   clique do operador ou da finalização de venda (`CupomNaoFiscal autoPrint`). Não há disparo em segundo
   plano.
6. **Pop-up:** o cupom abre por `window.open`. A impressão automática ao abrir o comprovante não nasce de
   um clique direto e pode ser bloqueada até o domínio ser liberado.

## `--kiosk-printing` × política `SilentPrintingEnabled`

| | `--kiosk-printing` | `SilentPrintingEnabled` |
|---|---|---|
| Fonte | chave do Chromium; não aparece na documentação de políticas do Edge | política oficial do Edge, versão 144 ou maior (instalada: 157) |
| Alcance | só o atalho ou perfil aberto com ela | todo o Edge daquele usuário ou máquina (GPO ou registro), todos os sites |
| Destino | impressora padrão do Windows | impressora padrão, com as configurações padrão |
| Uso indicado | caixa dedicado, perfil próprio (`--user-data-dir`) | só máquina 100% dedicada e gerida; **não** em PC de produção sem TI |
| Testado em papel | **não** (pendente: PC de teste) | **não** (vetado em produção) |

## Comparação com o Electron 1.0.3 (homologado em papel)

| Capacidade | Electron 1.0.3 | Navegador |
|---|---|---|
| Impressão automática após a venda | sim | não (1 clique) |
| Impressora por estação | sim | só a padrão do Windows |
| Sem diálogo | sim | só com `--kiosk-printing` ou política (não testado) |
| Largura ajustada à POS-80 | 64 mm (provado) | 72 mm (risco de corte) |
| Aviso de impressora desligada | sim | não (perda silenciosa) |
| Vias configuráveis | sim | 1 |
| Atualização | instalador | automática (deploy) |
| Custo de distribuição | certificado ou instalação assistida | zero |

## Conclusão

**O navegador ainda NÃO substitui o Electron para o caixa com cupom térmico.** Faltam: impressão
automática, 64 mm, aviso de impressora desligada e homologação física. Para clientes sem cupom térmico no
caixa (gestão, OS, financeiro, relatórios, impressão A4 com diálogo), o navegador já atende. O Electron
continua necessário onde o cupom térmico é rotina, distribuído por instalação assistida.

Para o navegador chegar lá (correções pequenas, cada uma com autorização própria): usar 64 mm no fallback
HTML (como o Electron), respeitar `viasCupom` e homologar em papel `--kiosk-printing` num PC de teste com
POS-80, incluindo os testes de impressora desligada, sem papel e padrão errada. A perda silenciosa com a
impressora desligada **não tem solução pelo navegador** (ele não enxerga o spooler).

## Pendências para a homologação física (PC de teste, nunca o da RAFACELL)

1. PC de teste com Windows 10/11 e uma térmica 80 mm (POS-80 ou equivalente) como impressora padrão.
2. Atalho `msedge.exe --user-data-dir=C:\OmniCaixaTeste --kiosk-printing --app=<URL de Preview ou da página de teste>`.
3. Imprimir **sem venda em Production**: usar a impressão de teste das configurações de impressão do PDV
   (`ImpressaoPdvSettingsCard`, `forceBrowserFallback`) ou o arquivo `cupom-real.html` desta pasta (remover o
   `<script>` não é necessário: ele chama `window.print()` uma vez ao abrir).
4. Medir: sem diálogo, largura e corte à direita, acentos, corte do papel, 3 repetições, impressora
   desligada, sem papel e padrão trocada para outra impressora.

Arquivos: `cupom-real.html` (HTML exato que o PDV abre), `cupom-render.pdf` (PDF headless),
`cupom-qr-600.png` (renderização com o QR de teste).
