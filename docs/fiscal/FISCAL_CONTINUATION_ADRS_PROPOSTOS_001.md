# Mapeamento de ADRs fiscais propostas — reconstrução reconciliada

> **Proveniência:** reconstrução do pacote Fable 5 ausente. Este arquivo propõe numeração; não cria,
> aceita nem altera ADRs. ADR-0003, ADR-0008 e ADR-0009 permanecem aceitas e intocadas.

O maior número aceito existente é ADR-0009. Há drafts históricos com números menores, mas nenhuma
colisão entre ADR-0010 e ADR-0023 em `docs/decisions/**` na base `2b9c51a`.

| Proposta | Número real reservado | Tema | Estado |
|---|---:|---|---|
| ADR-P01 | ADR-0010 | autoridade e matriz tributária do mix piloto | proposta |
| ADR-P02 | ADR-0011 | proveniência/versionamento de XSD fiscal | proposta |
| ADR-P03 | ADR-0012 | biblioteca/estratégia C14N e XMLDSig | proposta |
| ADR-P04 | ADR-0013 | critério normativo de dry-run verde | proposta |
| ADR-P05 | ADR-0014 | escolha SEFAZ direto × gateway | proposta; gate G-F5 |
| ADR-P06 | ADR-0015 | custódia do A1 quando o provider hospeda certificado | proposta; compatível com ADR-0009 |
| ADR-P07 | ADR-0016 | persistência e retenção de XML autorizado | proposta |
| ADR-P08 | ADR-0017 | estado incerto e reconciliação por chave | proposta |
| ADR-P09 | ADR-0018 | política de retry, backoff e dead-letter fiscal | proposta |
| ADR-P10 | ADR-0019 | cancelamento, inutilização e consumo de numeração | proposta |
| ADR-P11 | ADR-0020 | contingência offline | proposta |
| ADR-P12 | ADR-0021 | DANFCE, impressão e reimpressão | proposta |
| ADR-P13 | ADR-0022 | observabilidade, auditoria e retenção de logs | proposta |
| ADR-P14 | ADR-0023 | ativação controlada por loja e rollback | proposta; gate G-F7 |

Antes de criar cada ADR, repetir a busca de colisão na `origin/main` atual. Não reservar número por
branch futura e não reabrir decisões já aceitas.
