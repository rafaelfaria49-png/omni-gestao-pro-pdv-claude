# 025-A · Solicitação de revisão independente

Documento sanitizado para solicitar R técnica externa. Autor: Codex/OpenAI.
Preferência autorizada: Google/Gemini; alternativa: Anthropic/Claude Code.
A aprovação do plano 025 não aprova estes documentos. HUMAN_ARCHITECTURE_DECISION=PENDING.

## Objeto da revisão

Revisar o SHA completo da branch codex/fiscal-025-a-architecture informado no PR próprio, comparado à base 1fd90905e05656444576cf83c9df6c46919a917a. Identificar família/modelo/sessão, SHA efetivamente revisado, veredito APPROVE/REQUEST_CHANGES e findings com severidade/caminho/linha. Se faltarem evidências, dizer explicitamente; não inventar prova de backend nem autorização.

Somente leitura. Não editar arquivos, código, schema ou metadados AEP; não conectar DB/storage do projeto, carregar .env/segredos, iniciar worker/provider, contatar SEFAZ, provisionar recursos, executar migration ou alterar gates. O review pode ler os documentos e contratos versionados necessários e o diff. Não realizar implementação.

## Arquivos

- [Proposta de ADR](../../../decisions/drafts/ADR_PROPOSAL_0024_FISCAL_025_A_PRESERVACAO_IMUTAVEL.md).
- [Matriz A/B/C](../../../decisions/drafts/FISCAL_025_A_PERSISTENCE_MATRIX.md).
- [Auditoria/testes](AUDIT.md).
- [Metadados documentais](../../../execution-tracks/fiscal/phases/025-A-ARCHITECTURE.md).
- Plano canônico 025 rev. 5, ADR-0017 e ADR-0018, somente leitura.
- Contratos lib/fiscal/storage, emission, reconciliation, queue e schema/migration fiscal, somente leitura quando necessário para verificar alegações.

## Focos obrigatórios

1. Escopo PLAN_ONLY, GOAL aprovado intacto, tratamento explícito da recusa AEP sem contorno, nenhuma fase funcional aberta e gates negados preservados.
2. Comparação real A/B/C: proteção do backend com credenciais runtime, limites owner/superuser/cloud-admin, R2 Locks vs S3 COMPLIANCE e custo/DR.
3. Mesmo store/venda/nota/job/chave/série 1/número 2, contador 3, sem segunda NotaFiscal/EMISSAO; vínculo protegido sobreviva a payload/restart.
4. XML byte a byte, hash histórico B2, manifesto/estado/lineage, xMotivo NOT_PERSISTED; NOT_FOUND isolado insuficiente.
5. Bundle determinístico e ausência de hashes circulares; jobId explícito; identidade da tentativa independente de fingerprint divergente; replay sem now volátil.
6. PUT exclusivo enforcement no backend, versão selada, delete markers/novas versões, retention e permissões; atomicidade com DB/CAS e falhas/órfãos sem compensação destrutiva.
7. Isolamento por loja no backend, ameaça da credencial global, funções/roles/constraints, serialização com faixa/worker/admin e inventários B1-R1/B3-R1.
8. Compatibilidade explícita ADR-0017/0018: coluna primária corrente, arquivo histórico separado, mirror opcional corrente preservado, sem retry/correção habilitados.
9. Extensões futuras sem implementação; testes simulados separados de provas reais, retenção/recuperabilidade e decisões humanas pendentes.
10. Ausência de XML, certificados, tokens, payload/snapshots integrais, URLs privadas ou promessas de aprovação/readiness não demonstradas.

A R deve procurar blockers novos, além dos focos acima. Aprovação técnica não ratifica arquitetura nem autoriza 025-B/C/D, schema/storage/banco/SEFAZ. Ponto de parada permanece AWAITING_025_A_ARCHITECTURE_REVIEW.
