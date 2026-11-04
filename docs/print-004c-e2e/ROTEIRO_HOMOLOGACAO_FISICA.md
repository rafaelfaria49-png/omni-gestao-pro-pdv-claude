# Roteiro de homologação física na loja — OMNI-PRINT-004C

Pré-condições (gates humanos, nenhum foi aberto por este candidato):

- D02 (schema) e D04 (transporte por agente local) aprovados pelo proprietário; D03 (limites/retenção/chaves) com valores definidos; D05 (hardware) com consentimento.
- Migration recortada a partir de `tools/print-004c-e2e/candidate-migrations/future/` e aplicada **em ambiente de homologação** (nunca produção sem janela aprovada), com `00` fora de transação e conferência de `indisvalid`.
- Release aprovada registrada em `lib/printing/direct/activation.ts` (`APPROVED_RELEASE`) por commit revisado; `OMNI_PRINT_DIRECT_ENABLED=1`, `OMNI_PRINT_DIRECT_RELEASE=<id>`, `OMNI_PRINT_CONTENT_KEY` e `OMNI_PRINT_SIGNING_KEY` (32 bytes base64url, distintas) somente no ambiente de homologação.
- Banco de homologação = branch Neon separado (nunca o banco da loja), com o D02 aplicado pelo plano de `DECISOES_PROPRIETARIO_OMNI_PRINT.md` (lock_timeout, `00` fora de transação). As variáveis acima ficam com escopo **Preview fixado na branch de homologação** na Vercel (Preview sem branch vale para todas as branches), apontando para esse branch Neon; **nunca** escopo Production. Conferir se a proteção de deployment da Vercel barra o agente (usar o bypass de automação só nesse deployment). Ao final: remover as variáveis, remover os deployments de homologação (deployments antigos mantêm as variáveis) e revogar o agente.
- Loja piloto com usuário ADMIN (configurar) e CAIXA (vender); terminal PDV cadastrado.

## 1. Impressora

1. Ligar a térmica (ex.: POS-80 USB). No Windows: Configurações → Impressoras → confirmar a fila (nome exato), driver instalado, **não** pausada, **não** "usar offline".
2. PowerShell (somente leitura): `Get-CimInstance Win32_Printer | Select Name,PortName,WorkOffline,PrinterStatus` e, para USB, `Get-PnpDevice -PresentOnly | ? InstanceId -like 'USBPRINT*'` → a porta (ex.: USB005) deve aparecer presente.
3. Imprimir uma página de teste do Windows **uma vez** para confirmar papel, alinhamento e corte. Registrar foto.
4. Anotar largura da bobina (58 ou 80 mm).

## 2. Instalação e pareamento autorizado do agente

1. Instalar Node 24 LTS no computador do caixa (autorizado pelo proprietário). Copiar a pasta `tools/omni-print-agent/` (sem `*.test.ts`) para `C:\OmniPrintAgent\`.
2. `node C:\OmniPrintAgent\agent.mjs printers` → a fila do passo 1 deve aparecer.
3. No OmniGestão, **a partir do navegador do próprio caixa**, Configurações → PDV → "Impressão direta pelo agente local" → "Gerar código de pareamento" (válido 10 min, uso único).
4. No caixa: `node C:\OmniPrintAgent\agent.mjs pair --server https://<domínio-homologação> --code XXXX-XXXX-XXXX`. Conferir que `%LOCALAPPDATA%\OmniPrintAgent\config.json` contém a credencial **cifrada** (DPAPI), nunca em claro.
5. `node C:\OmniPrintAgent\agent.mjs run` (janela visível no piloto). Na configuração, o computador deve aparecer **online** com a impressora listada.
6. Vincular o terminal: escolher computador, fila e bobina (58/80), manter "Somente este navegador" marcado, "Vincular". Ligar "Usar impressão direta nesta loja". Ligar "Imprimir automaticamente" no cartão de impressão, se for o caso.
7. Confirmar que o agente não abre porta: `Get-NetTCPConnection -OwningProcess (Get-Process node).Id` → somente conexões de saída 443.

## 3. Teste de cupom

1. Venda real de valor simbólico com **dados de teste** (sem cliente real, sem CPF), 2 itens com acentos (ex.: "Pão de queijo", "Café com açúcar"), pagamento em dinheiro com troco.
2. Esperado: nenhuma janela/diálogo do navegador; aviso "Comprovante enviado à fila da impressora"; papel sai com: nome/CNPJ da loja, "NÃO É DOCUMENTO FISCAL", número da venda, itens, valores, forma de pagamento, troco, rodapé, **acentos corretos**, linhas dentro da largura (32/48 colunas).
3. Medir tempo venda→papel (meta < 3 s com o host PowerShell já aquecido). Registrar foto do cupom e o `spoolJobId` mostrado no log do agente.

## 4. Corte

1. Conferir corte total ao final de cada cupom (GS V 0). Se a impressora só tiver corte parcial, registrar comportamento (não alterar o perfil sem nova revisão).
2. Conferir que **nenhuma gaveta abre** (o candidato não envia pulso de gaveta).

## 5. Segunda via

1. No aviso, "Imprimir 2ª via" → a tela deve informar que 1 via pode já ter saído → "Confirmar 2ª via".
2. Esperado: novo papel com "SEGUNDA VIA - REIMPRESSAO 1/1" no topo.
3. "Abrir impressão do navegador" após um cupom aceito deve pedir confirmação e imprimir com "SEGUNDA VIA - IMPRESSAO PELO NAVEGADOR" (testar em Chrome e Edge).

## 6. Falha e recuperação

| Teste | Como provocar | Esperado |
|---|---|---|
| Impressora desligada | desligar a térmica e vender | "Não enviado: impressora desligada ou desconectada"; nada imprime depois sozinho; religar → "Tentar novamente" → 1 cupom |
| Sem papel | remover a bobina | registrar o que o Windows reporta (status) e o resultado mostrado; nenhum reenvio automático |
| Agente parado | fechar o agente e vender | após ~20 s "o agente de impressão não respondeu"; reabrir agente → nada imprime sozinho; "Tentar novamente" → 1 cupom |
| Rede cai após envio | desconectar o cabo de rede logo após vender | se o papel saiu, o resultado é registrado quando a rede volta; se ficar "incerto", conferir o papel antes de pedir 2ª via |
| Reinício do computador no meio | reiniciar durante um envio (piloto controlado) | ao voltar, a via fica "Resultado incerto"; **nada é reenviado**; decisão humana via 2ª via |
| Venda pendente | desconectar a internet e vender | venda fica pendente; **nenhum cupom** até confirmar no servidor |
| Dois caixas | dois terminais vinculados à mesma fila | cupons saem um de cada vez, sem duplicar |

## 7. Encerramento da homologação

- Revogar o agente piloto (Configurações → Revogar) e confirmar que ele para (credencial recusada).
- Registrar evidências (fotos, logs do agente sem a credencial, prints da tela) e preencher F01–F07 na matriz.
- Somente após aprovação escrita: `PHYSICAL_HOMOLOGATION=PASS` e decisão sobre empacotamento/assinatura do agente e execução como serviço.

## 8. Critérios de parada

Interromper, revogar o agente (Configurações → Revogar) e registrar o ocorrido se acontecer **qualquer** um destes:

- um mesmo cupom sai duas vezes sem pedido de 2ª via;
- sai cupom de venda que não foi confirmada no servidor;
- a gaveta abre;
- aparece dado de cliente real no cupom de teste;
- qualquer venda da loja deixa de gravar ou fica lenta durante o teste.

## 9. Registro de execução

Cada linha começa **NÃO EXECUTADO**. Só muda com evidência anexada (foto do papel, trecho do log do agente sem a credencial, print da tela) e o nome de quem executou. Nenhuma linha pode ser preenchida por inferência ou por resultado simulado.

| Caso | Passo do roteiro | Resultado | Evidência | Executor / data |
|---|---|---|---|---|
| F01 Windows + Chrome / Edge | §3, §5.3 | NÃO EXECUTADO | | |
| F02 bobina 58 / 80 mm | §1.4, §3 | NÃO EXECUTADO | | |
| F03 frio/quente, reinício, desligamento, sem papel | §6 | NÃO EXECUTADO | | |
| F04 duas vias, falha parcial, resposta perdida real | §5, §6 | NÃO EXECUTADO | | |
| F05 fila trocada/removida, vínculo revogado | §6, §7 | NÃO EXECUTADO | | |
| F06 gaveta desligada | §4.2 | NÃO EXECUTADO | | |
| F07 navegador (A4/fallback) em Chrome e Edge | §5.3 | NÃO EXECUTADO | | |
| I18 cancelamento após aceite na fila | observar a fila do Windows | NÃO EXECUTADO | | |
| I20 fila offline com entrega tardia | §6 (impressora desligada com fila ativa) | NÃO EXECUTADO | | |
| Tempo venda → papel (meta < 3 s) | §3.3 | NÃO EXECUTADO | | |

`PHYSICAL_HOMOLOGATION=PASS` só com todas as linhas preenchidas com evidência e aprovação escrita do proprietário.
