# Complemento da matriz — sem alterar a original

A matriz original permanece53PASS/0 FAIL/27 DEFERRED. As 53 referências PASS reutilizam33blocos dentre35registrados. Não houve nova execução de testes. O complemento separa47casos rastreáveis no escopo declarado,6critérios parcialmente exercitados e27DEFERRED. Os 6são subconjunto dos53, não soma adicional.

| ID | Demonstrado | Ainda sem prova direta | Menor prova/gate futuro |
|---|---|---|---|
| P01 | Defaults, ordem e campos admitidos normalizados; keys distintas convergem ao mesmo job. | Envelope UI que aceite uiContextId e o exclua do commandHash. O shape interno não aceita esse campo. | No gate de API/UI, ensaiar dois envelopes que difiram apenas em uiContextId e confirmar identidade semântica. Não abrir API neste fechamento. |
| P06 | Hash dos bytes, variação por ordinal e recusa de mutações; snapshot/payload autenticados. | Duas renderizações independentes com snapshot, renderer e perfil idênticos comparadas explicitamente. | Teste puro dirigido de igualdade byte a byte/hash para dois renders com entradas idênticas, sem dispositivo. |
| P07 | PARTIAL com ACCEPT + NO_EFFECT e retry manual somente da segunda via; UNKNOWN isolado não é retryable. | Vetor misto ACCEPT + UNKNOWN na agregação. | Teste puro com vetor ACCEPT + UNKNOWN: PARTIAL preserva ambas as vias e não oferece retry da via incerta. |
| P11 | Limites de vias, itens e comando. maxBytes1 produz COMMAND_LIMIT antes dos bytes do snapshot. | Negativas específicas SNAPSHOT_LIMIT e PAYLOAD_LIMIT. | Duas fixtures dirigidas: comando cabe mas snapshot excede; snapshot cabe mas payload excede. Exigir os códigos específicos e zero tentativas/efeitos. Sem modificar os guards para passar. |
| B19 | Purga de bytes/requests mantém slot, fechamento histórico e dedup. | Retirement/arquivamento completo e fechamento atômico da elegibilidade. | Manter essa subcláusula no gate D03 de retenção/retirement; não executar exclusão/retirada sem autorização própria. |
| I17 | Lease vencido, crash pré-chamada e destino retido não permitem reenvio cego. | Consulta de adaptador real/sintético retornando não encontrado; tal API não existe no núcleo. | No gate de adaptador, retorno não encontrado correlacionado com tentativa potencial deve manter UNKNOWN/gate e zero reenvio. |

## Limites adicionais de interpretação

- I25: Os 108 snapshots excluem admin_users. Igualdade completa é checkpoint pós-correções→final; antes→checkpoint compara conjunto de tabelas, não cada delta/escritor. Journal cobre exec tentado, não query/commit. Grants/fonte/42501 são provas adicionais.
- P13: Asserções de minimização são do snapshot/DTO da fixture. Infraestrutura produtiva completa de logs, rotas e cache não foi certificada.
- REV-B-01: Leitura de sessaoId pelo payload corrigida e reader executado. Não há asserção com sessaoId não nulo; ensaio mínimo futuro pode fornecer valor sintético e conferir snapshot/fingerprint.

## Os 27 DEFERRED continuam pendentes

| ID | Gate |
|---|---|
| F01 | PHYSICAL_HOMOLOGATION |
| F02 | PHYSICAL_HOMOLOGATION |
| F03 | PHYSICAL_HOMOLOGATION |
| F04 | PHYSICAL_HOMOLOGATION |
| F05 | PHYSICAL_HOMOLOGATION |
| F06 | PHYSICAL_HOMOLOGATION |
| F07 | PHYSICAL_HOMOLOGATION |
| I01 | REAL_SESSION_AND_API_INTEGRATION |
| I02 | REAL_SESSION_AND_API_INTEGRATION |
| I04 | CANONICAL_SCOPED_READER_INTEGRATION |
| I06 | ADAPTER_PAIRING_AND_DEVICE_IDENTITY |
| I07 | ADAPTER_PAIRING_AND_CHALLENGE |
| I08 | MULTISTORE_DEVICE_PAIRING |
| I09 | INSTALLATION_AND_QUEUE_LIFECYCLE |
| I10 | BINDING_REVOCATION_LIFECYCLE |
| I11 | UI_CONTEXT_HANDLING |
| I12 | G_AUTH_PRINT_LOGOUT |
| I14 | API_ORIGIN_CSRF_CACHE |
| I18 | TRANSPORT_CANCELLATION_AND_EFFECT_PROOF |
| I19 | ADAPTER_CAPABILITIES_AND_DEDUP_CONTRACT |
| I20 | OFFLINE_TRANSPORT_AND_LATE_DELIVERY |
| I23 | EXPLICIT_UI_FALLBACK_HANDOFF |
| I26 | D03_PRODUCTIVE_LIMITS_RETENTION_AND_GRANTS |
| I27 | REAL_INSTALLATION_AUTHENTICITY_AND_REPLAY_PROOF |
| I31 | REAL_A4_BROWSER_HANDOFF |
| P04 | REVIEW_OF_REAL_RENDERER_HTML_SECURITY |
| P05 | THERMAL_RENDERER_PROFILE_ENCODING |
