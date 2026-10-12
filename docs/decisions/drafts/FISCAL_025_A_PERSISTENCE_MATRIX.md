# 025-A · Matriz de alternativas de preservação

Data: 2026-10-12. **Análise documental; nenhuma alternativa aprovada ou implantada.**
Base 1fd90905e05656444576cf83c9df6c46919a917a, GOAL 025 plan_rev=5 intacto.
[Proposta completa](ADR_PROPOSAL_0024_FISCAL_025_A_PRESERVACAO_IMUTAVEL.md) ·
[Auditoria e testes](../../ai-execution/_evidence/FISCAL-025-A-ARCHITECTURE/AUDIT.md).

Definições: A = bytes/manifesto/vínculo somente no PostgreSQL protegido; B = bytes/manifesto em objeto privado WORM, PostgreSQL contém somente vínculo protegido; C = bytes/manifesto integrais no PostgreSQL protegido e objeto WORM independente, com vínculo protegido. B não dispensa a extensão de persistência do vínculo. As notas abaixo pressupõem proteções futuras efetivas; não descrevem o ambiente atual.

| Critério | A · PostgreSQL protegido | B · Objetos + vínculo DB | C · PostgreSQL + objetos WORM |
| --- | --- | --- | --- |
| Imutabilidade com credenciais runtime | Efetiva somente com role não owner, sem UPDATE/DELETE/TRUNCATE/DDL/bypass, inserção por função mínima e triggers/constraints; comprovar em conexão real | WORM + policy condicional + deny delete e referência fixada na versão; vínculo DB também bloqueia alteração | Combina ambos os controles e compara cópias; runtime comum não administra nenhum backend |
| Permissões | Owner NOLOGIN; runtime sem privilégios herdados/PUBLIC de alteração; custodiante separado | Escritor de criação condicional e leitor por loja; sem administração de bucket/policy/retenção | Mais papéis e segregação; custódia independente impede uma credencial alterar arquivo e âncora |
| Alteração/exclusão privilegiada | DBA/owner/superuser pode remover proteção ou restaurar estado adulterado; residual alto sem âncora independente | COMPLIANCE protege versão no prazo; DBA pode adulterar vínculo, detectável pelo manifesto; administrador pode sabotar acesso/chave/futuras escritas | DBA não altera versão retida; custódia permite detectar/restaurar corrupção DB sob gate; não elimina ataque simultâneo ou perda de acesso |
| Bytes e integridade | bytea, manifesto canônico, SHA-256 independente; retorno byte a byte | Bundle determinístico binário, manifesto no mesmo objeto, SHA-256 de cada segmento e todo bundle, GET versionId; ETag não é SHA | Bytes bytea e objeto comparados entre si e com hashes históricos B2; divergência bloqueia |
| Isolamento por loja | RLS/roles efetivos + identidade autenticada não falsificável; storeId no WHERE sozinho insuficiente | Papel/sessão restrita ao prefixo/objeto da loja + bucket privado; vínculo também escopado | Ambos; broker de credenciais separado, sem confiança em storeId arbitrário; chave compartilhada global não certifica isolamento contra comprometimento |
| Idempotência | UNIQUE(storeId, attemptId), insert exclusivo, mesmo fingerprint converge; divergente recusa | attemptId/chave fixos, If-None-Match obrigatório no backend; 412 exige releitura e igualdade integral | Criação exclusiva + unicidade DB + replay de vínculo/estado; mesma tentativa divergente nunca escolhe arquivo alternativo |
| Concorrência | Arquivo/vínculo/reconciliação na mesma transação SERIALIZABLE/CAS | PUT não transaciona com DB: primeiro objeto verificado, depois CAS; órfãos previstos | Atomicidade local dos bytes DB/vínculo e efeitos, mais criação exclusiva externa; mesmo protocolo de órfãos |
| Falhas | Rollback DB desfaz inserção e efeitos; perda de DB exige backup/restauração | Timeout PUT ou crash exige descobrir versão/validar; objeto órfão preservado; indisponibilidade bloqueia | DB rollback não remove objeto; recuperação por idempotência; nunca apagar/reescrever para compensar |
| Retenção | Retenção por privilégios/controle operacional + backup protegido; não é WORM contra superuser | Retenção real do backend; prazo/hold e gestão de chaves/acesso precisam decisão | Retenção DB + WORM + monitoramento de vencimento e custódia; sem purga automática |
| Recuperação de desastre | Backup/PITR e restore com comparação de bytes; comprometimento de backup/DB é domínio comum | Recuperar vínculo DB a partir de backup e manifesto WORM, sempre sob gate; testar acesso/chaves/réplica | Restore DB + conferência com WORM independente; segunda custódia recomendada; RPO/RTO e réplica são critérios a aprovar |
| Operação/custo | Menor infra nova; crescimento PostgreSQL, WAL, backup, roles/triggers/RLS | Menos bytes DB; custo storage/requests/retenção/tráfego e custódia; consistência entre backends | Maior custo fixo e duplicação; para uma tentativa o custo operacional domina o volume |
| Sistema atual | Exige schema/role/permissões/porta histórica nova; mantém colunas ADR-0018 | Exige vínculo novo e adapter obrigatório; xmlStorageRef/mirror opcional atuais insuficientes | Exige ambas extensões e reader histórico puro; coluna corrente permanece primária, sem reusar mirror como requisito genérico |
| Quando escolher | Humano aceita ameaça administrativa DB e DR comprovado | Humano prioriza menor crescimento DB e aceita dependência externa de bytes | Humano exige defesa contra adulteração do banco e melhor auditabilidade da recuperação |

## Perfil do backend de objetos

| Perfil | Garantia sustentada por documentação oficial | Limite / condição de aceite |
| --- | --- | --- |
| S3 Object Lock COMPLIANCE | Versão retida não pode ser sobrescrita/excluída mesmo por root durante o prazo | Não bloqueia novas versões/delete markers por si; exigir policy, deny deletes e versionId selado; não protege chave/acesso/conta |
| S3 GOVERNANCE | Retenção contra papéis sem bypass | Quem tem BypassGovernanceRetention pode contornar; não satisfaz o perfil administrativo mais forte recomendado |
| R2 Bucket Locks | Impede overwrite/delete durante período ou indefinidamente; lock prevalece sobre lifecycle | Administrador pode remover regras; não equiparar a COMPLIANCE resistente ao administrador. Exige separação do controle e aceite explícito desse residual |
| S3-compatible genérico / bucket privado / versionamento isolado | Confidencialidade ou preservação de versões pode existir | Compatibilidade de SDK não prova Object Lock, retenção ou enforcement; não admissível sem prova específica |

R2 não é descartado como simples convenção de aplicação: Bucket Locks é proteção real. Sua administração removível é um trade-off. A API S3 de R2 declara PutObject condicional, mas não os headers S3 Object Lock/retenção/legal hold, PutObjectLockConfiguration ou PutBucketVersioning; o contrato deve usar recursos R2 documentados e provas próprias, não prometer semântica S3 COMPLIANCE.

**Recomendação principal: C**, pelo registro transacional e âncora de conteúdo em custódia distinta. Preferência técnica de perfil: COMPLIANCE com retenção fixa suficiente e versão selada. Fornecedor, escopo operacional e implantação dependem de decisão humana posterior. A/B são alternativas viáveis sob modelos de ameaça explicitamente menos fortes; no estado atual nenhuma está demonstrada.

## Fontes técnicas verificadas

Consulta pública em 2026-10-12, sem acesso ao backend do projeto. Os requisitos de composição/papéis/CAS são proposta de engenharia, não garantia já atestada pelo fornecedor.

- [PostgreSQL · Row Security](https://www.postgresql.org/docs/current/ddl-rowsecurity.html): RLS tem bypass para superuser/BYPASSRLS e normalmente owner; TRUNCATE não é coberto.
- [PostgreSQL · Privileges](https://www.postgresql.org/docs/current/ddl-priv.html): privilégios/ownership precisam ser separados, incluindo TRUNCATE e DDL.
- [S3 · Object Lock](https://docs.aws.amazon.com/AmazonS3/latest/userguide/object-lock.html): retenção WORM e modos de proteção.
- [S3 · Considerações](https://docs.aws.amazon.com/AmazonS3/latest/userguide/object-lock-managing.html): delete markers, replicação da retenção, lifecycle e perda de chaves.
- [S3 · Writes condicionais](https://docs.aws.amazon.com/AmazonS3/latest/userguide/conditional-writes.html): If-None-Match e disputa 412/409.
- [S3 · Enforcement](https://docs.aws.amazon.com/AmazonS3/latest/userguide/conditional-writes-enforce.html): policy de condição; CopyObject não é caminho autorizado proposto.
- [R2 · Bucket Locks](https://developers.cloudflare.com/r2/buckets/bucket-locks/): bloqueio real, regras por prefixo/prazo e remoção administrativa.
- [R2 · Compatibilidade S3](https://developers.cloudflare.com/r2/api/s3/api/): operações/headers implementados e ausentes.
