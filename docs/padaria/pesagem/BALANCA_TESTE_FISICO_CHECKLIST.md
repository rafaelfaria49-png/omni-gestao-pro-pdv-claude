# Balança / visor — checklist do teste físico (Padaria piloto)

GOAL: PADARIA-KG-STACK-CONTINUIDADE-RECONCILIACAO-001 · Status: **PENDENTE — presencial**

Escopo: conferir, na loja e com o dono, o visor read-only (#322) ao lado da venda manual por KG.
A venda por peso **não depende** da balança: o peso é digitado e confirmado pelo operador
(`weightSource: "manual"`). Nada aqui liga o peso da balança à venda.

Pré-requisitos: KG liberado só para `cliente-bc1c8ad5-5c08-4aaa-b125-7c1076a72f2e` (gates do
`KG_RELEASE_READINESS_A4_A8.md`). Visor: aparece por padrão só em loja de ramo `padaria`; em
outras lojas só se marcado em Configurações → PDV → Visor da balança (preferência visual, não
habilita venda por peso).

## 1. Identificação (antes de conectar)

- [ ] Foto da etiqueta: modelo exato, número de série, firmware.
- [ ] Foto do menu de comunicação: protocolo, baud, bits, paridade, stop bit, modo contínuo ou sob demanda.
- [ ] Cabo/adaptador usado (USB-serial, chip) e porta COM do Windows.
- [ ] Se o modo for **sob demanda**: PARAR. Nenhum byte é enviado sem o documento do fabricante e autorização do dono.

## 2. Perfil do visor

- [ ] O único perfil implementado é `and-hvg-stream` (A&D HV-G/HW-G Format 1). Toledo Prix 3 Fit **não** tem parser.
- [ ] Se a Toledo não emitir esse formato, o visor deve mostrar "Leitura inválida ou protocolo incompatível" — isso é o resultado esperado, não um defeito.
- [ ] Capturar bytes brutos (`summarizeRawCapture`) para: vazia, tara, 0,350 kg estável, oscilando, retirada, sobrecarga, negativo, cabo desconectado. Guardar como fixture com data e foto.

## 3. Comportamento do visor (se o protocolo for compatível)

- [ ] PDV Clássico **normal**: visor aparece na lateral; PDV Clássico **rápido**: visor aparece na lateral.
- [ ] Loja que não é de ramo padaria (ex.: loja-1) sem a preferência marcada: o visor não aparece.
- [ ] Peso estável → status "estável"; oscilando → "instável"; sem frame por 3 s → "sem leitura válida recente".
- [ ] Cabo retirado durante leitura → "Balança desconectada"; ao religar, exige nova conexão pelo operador.
- [ ] Nenhuma gravação na balança (o código não abre `writable`).

## 4. Venda manual por KG (independente da balança)

- [ ] Com a balança desligada: vender 0,350 kg de PÃO FRANCÊS; total = preço/kg × peso em centavos.
- [ ] Venda mista KG + UN; pagamento; recibo mostra o peso com 3 casas.
- [ ] Comparar o peso digitado com o visor da balança (quando houver) — divergência é do operador, não do sistema.
- [ ] Cancelar uma venda KG de teste: estoque volta em KG exato (ex.: +0,350).
- [ ] F8: devolução parcial 0,100 kg; mínimo aceito 0,001 kg.

## 5. Registro

- [ ] Fotos, capturas e resultado anexados à pasta de evidências do GOAL de homologação física.
- [ ] Qualquer vínculo "usar peso da balança" na venda exige parser homologado + autorização expressa (ver `TOLEDO_PRIX3_FIT_PROTOCOLO.md`).
