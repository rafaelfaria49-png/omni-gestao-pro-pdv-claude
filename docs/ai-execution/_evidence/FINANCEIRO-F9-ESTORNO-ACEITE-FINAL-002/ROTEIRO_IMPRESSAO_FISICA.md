# Roteiro curto — homologação física da impressão de recebimentos (RAFACELL)

GOAL FINANCEIRO-F9-ESTORNO-ACEITE-FINAL-002 · PRs #384 + #341 · **status: NÃO EXECUTADO**

A homologação física só vale com a execução e a confirmação do operador na loja. Nada
aqui foi impresso em papel; o que existe é a prova automatizada (cupom montado, medida
do PDF em mídia `print` de 58 mm e 80 mm, bloqueio da 2ª via estornada).

## Onde testar (decisão do dono)

| Caminho | Ambiente | Escreve em Production? |
|---|---|---|
| **A. Navegador (Chrome) no PC da loja → Preview da branch** | Banco QA do Preview, não o da RAFACELL | Não |
| **B. App Windows (impressão direta no spooler)** | O app aponta para a URL de Production | **Sim** — exige autorização explícita do dono, cliente e título de teste próprios e estorno no mesmo turno de caixa |

Recomendação: fazer **A** antes do merge (impressora 58 mm e 80 mm, 2ª via, falha e
fallback do navegador) e **B** só depois do merge e do deploy, com um título de teste de
**R$ 0,01** de um cliente "TESTE IMPRESSÃO", recebido e estornado no mesmo caixa, que
fecha zerado. Não usar cliente, venda ou dinheiro reais.

## Preparação (5 min)

1. Impressoras ligadas, com papel: térmica **80 mm** (POS-80) e, se houver, **58 mm**.
2. Configurações → Impressão: bobina da loja = a da impressora em teste.
3. App Windows (só no caminho B): versão instalada ≥ 1.0.3, impressora direta selecionada.
4. Um título de teste em aberto de um cliente de teste (no Preview: criado pela massa QA).

## Casos

| # | Passo | Resultado esperado | OK? |
|---|---|---|---|
| 1 | **80 mm** · Financeiro HUB → A receber → Receber parcial do título → **Imprimir comprovante** | Sai **uma** via, largura inteira da bobina, sem corte lateral; mostra "COMPROVANTE NÃO FISCAL", cliente, forma, valor pago e **saldo restante**; sem folha em branco depois | |
| 2 | **58 mm** · trocar a bobina da loja para 58 mm e repetir o caso 1 | Texto cabe nos 58 mm, nenhuma linha cortada, rótulos não quebram no meio da palavra | |
| 3 | **PDV (F9)** · receber o título pelo F9 e imprimir | Mesmo layout do HUB; uma via só, mesmo com clique duplo | |
| 4 | **Impressão direta (app Windows)** · repetir o caso 1 no app | Imprime **sem** abrir a janela de impressão do Windows | |
| 5 | **2ª via** · HUB → "Comprovantes de recebimento" do título → Reimprimir | Sai marcada "2ª VIA — REIMPRESSÃO"; **nenhuma** baixa nova no título nem no caixa | |
| 6 | **2ª via de estornado** · estornar o último pagamento e abrir os comprovantes | O pagamento estornado aparece como estornado e o botão Reimprimir fica **desabilitado**; o pagamento que segue válido continua reimprimível | |
| 7 | **Falha de impressora** · desligar a impressora (ou tirar o cabo USB) e imprimir | O recebimento continua gravado; aparece aviso/fallback; **não** grava baixa duplicada ao tentar de novo | |
| 8 | **Fallback** · no app Windows, com a impressora direta indisponível | Cai para a impressão do navegador (janela de impressão do Windows) com o mesmo cupom | |
| 9 | **Fechamento** · fechar o caixa do teste | Recebido na sessão = recebimentos − estornos; dinheiro esperado confere com a gaveta | |

## Registro

Para cada caso: foto do papel (com régua, se possível), hora, impressora, bobina e quem
executou. Anotar qualquer divergência como texto, não como "ok com ressalva".

Conhecido da homologação anterior do app (#370/#371): forçar `pageSize` gerava papel em
branco, e com a USB desligada o spooler descarta o trabalho em silêncio — o caso 7 existe
para pegar exatamente isso.

**Homologação física declarada somente quando os 9 casos estiverem marcados pelo operador.**
