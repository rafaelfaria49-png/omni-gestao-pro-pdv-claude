# Toledo Prix 3 Fit — caminho até a captura de peso na venda

GOAL: PADARIA-KG-VENDA-POR-PESO-INTEGRACAO-001 · Status: **TOLEDO_REAL_CAPTURE=PENDING_PHYSICAL_TEST**

## O que existe hoje

| Peça | Situação |
| --- | --- |
| Núcleo `WeightSession` (#294) | Estabilidade, validade, sessão/contexto, limpeza após desconexão. Agnóstico de marca. |
| Visor read-only (#322) | Perfil `and-hvg-stream` (A&D HV-G/HW-G, Format 1). Só exibe; não alimenta a venda. |
| `lib/pesagem/sale-capture.ts` | `proposeSaleWeight` converte uma leitura `ready` em gramas inteiras e recusa instável, vencida, zero, negativa, bruta, sem base, com mais de 3 casas, de outro contexto ou de produto não-KG. `SCALE_CAPTURE_PROFILES` não tem **nenhum** perfil homologado; `toledo-prix3-fit` está sem parser (`protocol_not_implemented`). |
| `summarizeRawCapture` | Diagnóstico passivo de bytes recebidos (hex/ASCII, terminadores, intervalos). Não interpreta marca. |
| Venda | O servidor só aceita `weightSource: "manual"` (peso digitado e confirmado). Nenhuma tela chama `proposeSaleWeight`. |

**Não presumir** que a Toledo fala o protocolo A&D. Não há frame, comando ou parâmetro serial da Toledo neste repositório, e não deve haver até haver prova.

## Coleta segura do protocolo (na loja, com o dono)

1. Fotografar a etiqueta e o menu de configuração de comunicação da balança (modelo exato, firmware, protocolo selecionado, baud, bits, paridade, modo contínuo ou sob demanda). Pedir ao técnico autorizado Toledo o documento do protocolo configurado.
2. Se a balança estiver em modo **contínuo**, apenas escutar a porta (Web Serial `readable`, sem `writable`), com os parâmetros lidos no menu. Registrar os bytes com `summarizeRawCapture` para estes estados: vazia (zero), com tara, peso estável (ex.: 0,350 kg), peso oscilando, retirada do peso, sobrecarga, negativo e desconexão do cabo.
3. Se a balança só responder **sob demanda**, PARAR: transmitir qualquer byte exige o comando documentado pelo fabricante e autorização do dono. Nada de tentativa e erro (ENQ, "P", etc.).
4. Guardar as capturas como fixtures (`test/pesagem/fixtures/toledo-prix3-fit/*.bin`) com a foto da configuração e a data. Sem dados de cliente.

## Implementação após a coleta

1. Parser `toledoPrix3FitProtocol` em `lib/pesagem/` testado **somente** contra as capturas reais (golden), sem casos inventados de formato.
2. Trocar `parserAvailable` para `true`; manter `saleCaptureHomologated: false`.
3. Homologação física: comparar 10 pesagens com peso-padrão (incluindo 0,001/0,125/1,250/2,350/9,999 kg quando a capacidade permitir) entre visor da balança e leitura do PDV; 0 divergência de gramas; desconexão durante leitura invalida a proposta.
4. Só então, com autorização explícita: `saleCaptureHomologated: true`, botão "Usar peso da balança" no modal KG (o operador continua confirmando), servidor passando a aceitar `weightSource: "scale"` com o mesmo cálculo e as mesmas validações do peso manual.

## Bloqueios mantidos

- Captura física Toledo: bloqueada até a coleta e homologação acima.
- Nenhum comando enviado à balança.
- Venda KG em produção: desligada (`PDV_MANUAL_KG_RELEASE` ausente). Ver `VENDA_MANUAL_KG_RELEASE_HARDENING.md`.
