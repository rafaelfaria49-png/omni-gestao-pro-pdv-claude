# Janela de liberação da P03

Este procedimento mantém a Alternativa B. O código fica desligado em Production durante o backup, a migration isolada, o registro Prisma e o smoke de legados. A ativação tem uma autorização própria. A loja piloto precisa ser aprovada pelo proprietário.

## Preflight da janela

1. Reconfirme o SHA da `main`, o deployment canônico, a chave `MIGRATION_AUTHORITY_ENABLED=false`, a identidade do runtime `neondb_owner` e as flags P03 OFF. Separe a janela de outras migrations e publicações. Deixe elegível para rollback um deployment Production conhecido com P03 OFF.
2. Acesse o endpoint direto confirmado no provedor com TLS `verify-full` e a credencial autorizada. Confira branch, database, `session_user`, `current_user` e versão PostgreSQL. Use uma transação read-only para registrar histórico, checksums, objetos P02/P03, donos e locks. O baseline de 26/11/2026 continha a G001 concluída e a P03 ausente. Se o baseline mudar, reconcilie o novo estado antes de aplicar.
3. Confirme ponto de recuperação dentro da retenção, snapshot pré-P03 e restore verificado em destino isolado, sem aplicação ou credenciais do runtime. Para restore lógico em outro cluster, prepare papéis compatíveis pelo inventário aprovado antes do `pg_restore`, pois o dump de um banco não contém os papéis globais. Registre UTC/LSN, identidade do artefato, conferência de dados/ACL/histórico, duração e ponto recuperado. O ponto e a autorização da janela precisam ser atuais. [Recuperação Neon](https://neon.com/docs/postgres/backup-restore/branch-restore)
4. Grave o SHA aprovado e confira os bytes da P03 `20261116090000_identificadores_etiquetas_p03`. O blob Git em LF tem SHA-256 `b37b37c26aef8aeb6c5cc1e0394c69a3d14310e4c480e74e280b3b17860a9084`. As cópias de execução e registro Prisma devem ser o mesmo arquivo em CRLF, com SHA-256 `49df6b1159c6cc28b3bc1973af2a28746748daaa382926f310a0a7c9b9766424`. Preserve a cópia de registro dentro de `prisma/migrations/20261116090000_identificadores_etiquetas_p03/migration.sql` no diretório preparado com o schema. A G001 permanece rastreada na frente Gestor Money.

## DDL e registro Prisma

A versão histórica de aplicação da 008 e o SQL de rollback legado usavam DML no ledger. O procedimento vigente usa a interface oficial do Prisma para registro. Mantenha a autoridade de migration e a P03 desligadas durante as duas operações. [Registro oficial de aplicação manual](https://www.prisma.io/docs/orm/prisma-migrate/workflows/patching-and-hotfixing)

1. Autorize expressamente o DDL e o `GRANT SELECT, INSERT, UPDATE, DELETE` nas cinco tabelas novas. O runtime continua `neondb_owner`. Faça em baixa atividade. O DDL inclui índices comuns e gatilhos ativos no catálogo todo. A transação tem `lock_timeout=3s`, `statement_timeout=60s` e `transaction_timeout=120s`.
2. Execute somente o wrapper via `psql -X --single-transaction`, no diretório que contém o único arquivo `migration.sql` P03 conferido. Configure a credencial fora da linha de comando. Em Production, `$p03DirectHost` aponta para o endpoint direto confirmado. Obtenha e valide o fingerprint no preflight, conforme a mesma agregação do wrapper. Execute o comando abaixo após a autorização. [Wrapper SQL](./P03_DDL_ACL_009.sql)

   ```powershell
   psql -X -w -h $p03DirectHost -p 5432 -U neondb_owner -d omnigestao_prod --single-transaction -v P03_RELEASE_APPROVED=on -v P03_GRANTS_APPROVED=on -v P03_EXPECTED_DB=omnigestao_prod -v P03_EXPECTED_ROLE=neondb_owner -v "P03_EXPECTED_HISTORY_MD5=$p03HistoryMd5" -f $p03DdlWrapper
   if ($LASTEXITCODE -ne 0) { throw 'DDL interrompido. Reconfira catálogo e histórico em read-only.' }
   ```

3. Reabra transação read-only para verificar cinco tabelas, 16 funções, 11 gatilhos, três índices novos nas relações existentes, ACLs e histórico idêntico ao baseline. Confirme o commit do DDL e o checksum nas duas cópias antes de registrar. Execute a CLI Prisma fixada no projeto, com `DATABASE_URL` e `DIRECT_URL` para o mesmo destino direto, definidos somente no processo autorizado.

   ```powershell
   node $prismaCli migrate resolve --applied 20261116090000_identificadores_etiquetas_p03 --schema $p03PreparedSchema
   if ($LASTEXITCODE -ne 0) { throw 'Registro Prisma pendente. Reconfira catálogo e histórico sem reaplicar o DDL.' }
   ```

4. Confira a entrada P03 única, checksum aprovado, `finished_at` preenchido, `rolled_back_at` nulo e `applied_steps_count=0`, convenção da CLI para registro de SQL já aplicado. Compare os demais registros, incluindo a G001. A reconciliação com a main continua mostrando a linha G001 externa. Qualquer verificação que exija histórico sem divergência usa uma cópia curada e verificada, sem editar a árvore de migrations da main.
5. Um erro antes do commit do wrapper aborta DDL e grants. Se a conexão cair no commit, inspecione o banco antes de tentar alguma ação. Caso os objetos e ACLs estejam completos e falte apenas a linha, mantenha P03 OFF e conclua apenas o `migrate resolve --applied` depois de confirmar o estado. Para catálogo parcial, checksum divergente ou histórico inesperado, interrompa a janela. `prisma migrate deploy` em Production e DML direto em `_prisma_migrations` ficam fora do procedimento.

## Smoke, piloto e reversão

- Com P03 OFF, valide catálogo convencional e vestuário simples ou com grade, produtos por peso, acessórios, aparelhos, estoque, PDV, caixa e financeiro com a matriz aprovada. Em Production, a verificação sem escrita usa consultas e operações legítimas observadas, evitando navegação que sincroniza `ledger_snapshots`. Acompanhe 5xx, `42501`, `55P03`, `40P01`, colisões inesperadas e latência de writers legados. O ensaio sintético mede o perfil de locks da janela e a aplicação futura precisa medir o comportamento real.
- Depois do aceite físico, do smoke e da aprovação do piloto, configure no projeto canônico, escopo Production, `VESTUARIO_P03_ENABLED=1`, `VESTUARIO_P03_PRODUCTION_ENABLED=1` e `VESTUARIO_P03_STORE_ALLOWLIST=<loja aprovada>`. O servidor exige exatamente uma entrada e elegibilidade P02, pois a P03 usa o catálogo de grades. As actions e o PDF exigem sessão, módulo catálogo e acesso de Cadastros. Em outro tenant, confirme aba oculta e 403 no PDF com `private, no-store`. Venda e estoque de variantes seguem fora deste gate.
- Publique o SHA já validado primeiro com P03 OFF. As variáveis Vercel valem no próximo deployment. Depois da ativação autorizada, confirme `MIGRATION_SKIPPED` antes da promoção. Para desativação imediata, faça Instant Rollback para o deployment OFF conhecido e confirme a negativa ao piloto. Remova a allowlist e desligue os opt-ins antes da próxima publicação. [Variáveis Vercel](https://vercel.com/docs/environment-variables) · [Instant Rollback](https://vercel.com/docs/instant-rollback)
- A reversão operacional preserva schema, códigos, lotes, auditoria e histórico. Qualquer reversão estrutural posterior ao registro Prisma exige proposta e autorização separadas, com migration compensatória revisada ou recuperação aprovada e verificada. O SQL de rollback legado que remove a linha Prisma fica restrito a ensaios históricos, fora da execução em Production.
