# Proposta ADR-0024 · Registro da ratificação documental

A proposta foi ratificada por Rafael Faria em 2026-10-12 como **opção B: WORM object storage + referência PostgreSQL protegida**. O contrato completo e vigente está na [ADR-0024 aceita](../ADR-0024-arquivo-historico-worm-referencia-protegida.md), registrada no [índice oficial](../INDEX.md).

Proveniência: proposta integral e recomendação inicial C no SHA e3c9d4a416972a65b1283b568ae5b13d3897b5c8 da [PR #265](https://github.com/rafaelfaria49-png/omni-gestao-pro-pdv-claude/pull/265); [revisão independente Google/Gemini](https://github.com/rafaelfaria49-png/omni-gestao-pro-pdv-claude/pull/265#issuecomment-6134615719) APPROVE, NEW_BLOCKERS=NONE, com preferência técnica B. A aprovação humana posterior escolheu B, rejeitou A para ameaça administrativa forte e manteve C como alternativa não escolhida.

S3 Object Lock COMPLIANCE é a referência técnica. Substituição por R2 Bucket Locks exige nova aceitação humana explícita dos riscos administrativos. Prazo de retenção, região, fornecedor contratado, custo e RPO/RTO não estão definidos.

Este caminho permanece para preservar referências à proposta; a versão histórica integral continua no Git. A ratificação é documental, sem implementação, schema/migration, provisionamento ou autorização de escrita.

HUMAN_ARCHITECTURE_DECISION=B_APPROVED.
IMMUTABLE_ARCHIVE_STRATEGY=WORM_OBJECTS_WITH_PROTECTED_REFERENCE.
IMPLEMENTATION_AUTHORIZED=false; STORAGE_PROVISIONING_AUTHORIZED=false.
DB_WRITES=0; SEFAZ_TRANSMISSIONS=0; G_F7=BLOCKED; G_F12=BLOCKED.
