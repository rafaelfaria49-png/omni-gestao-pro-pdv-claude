# GOALs de continuação fiscal — reconstrução reconciliada

> **Proveniência:** reconstrução, não cópia literal do pacote Fable 5 ausente. A sequência abaixo
> deriva do GOAL-001, da auditoria read-only de 2026-07-12 e da reconciliação de 2026-07-13.

| GOAL | Objetivo fechado | Gate/saída |
|---|---|---|
| 001 | Reconciliar Git, código, banco, schema, testes e documentação | este relatório; G-C1 |
| 002 | Dar paridade fiscal ao `upsertProduto` do Cadastros V2, sem ativar emissão | `metadata.fiscal` canônico e testes |
| 003 | Fixar matriz tributária e golden cases com contador | autoridade tributária nomeada |
| 004 | Implementar ST mínima do mix piloto, incluindo CSOSN 500 | testes internos + casos aprovados |
| 005 | Versionar o pacote XSD oficial e sua proveniência | artefatos oficiais verificáveis |
| 006 | Trocar o placeholder por validação XSD real e fail-closed | XML inválido reprova |
| 007 | Substituir o canonicalizador irregular por C14N conforme | vetores independentes verdes |
| 008 | Endurecer XMLDSig com certificado exclusivamente de teste | verificação independente verde |
| 009 | Tornar o dry-run auferível, sem stub indulgente | gate técnico real F4→F5 |
| 010 | Validar retenção, idempotência e imutabilidade de XML/snapshot | P3/P4 comprovados internamente |
| 011 | Preparar decisão comparativa SEFAZ direto × gateway | recomendação para G-F5 |
| 012 | Registrar ADR do provider escolhido | G-F5 decidido por Rafael |
| 013 | Implementar provider real somente em `HOMOLOGACAO` | sem produção, sem caller de venda |
| 014 | Transmitir primeiro documento controlado em homologação | N6, cStat 100, evidência sanitizada |
| 015 | Implementar QR-Code/CSC e validar no portal oficial | prova externa de homologação |
| 016 | Implementar consulta por chave e doutrina de estado incerto | timeout nunca duplica documento |
| 017 | Implementar cancelamento e inutilização em homologação | eventos autorizados e auditados |
| 018 | Implementar produtor/worker idempotente da fila, ainda desconectado | lock/retry/dedupe testados |
| 019 | Implementar DANFCE sobre XML autorizado | representação verificada |
| 020 | Implementar contingência e drenagem/reconciliação | cenários de falha verdes |
| 021 | Observabilidade e bateria ampla por UF/cenário | prontidão para G-F7, sem ativar |
| 022 | Construir ativação auditada por loja-piloto | **somente HOMOLOGACAO**, exige G-F7 |

## Próximo GOAL oficial

`GOAL 002 — FISCAL-PRODUTO-UPSERT-PARITY-002`.

Motivo: o caminho principal Cadastros V2 ainda aceita metadata genérica sem normalizar a identidade
fiscal. Fechar essa lacuna é independente de provider/certificado, não requer banco ou schema e
remove um bloqueio direto à futura homologação com mix real.

## Limites permanentes

- Nenhum GOAL anterior ao 022 liga `fiscalEnabled` ou conecta emissão ao fechamento da venda.
- Nenhum GOAL aponta para `PRODUCAO` antes de G-F12.
- Certificado, senha, CSC e token nunca aparecem em código, log, fixture documental ou relatório.
- GOAL que tocar regra tributária precisa nomear autoridade contábil/tributária; teste interno é N3.
