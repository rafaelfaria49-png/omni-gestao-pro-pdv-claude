-- Retrato estrutural (sem dados de cliente). Rodado em produção com sessão read-only e no clone.
SELECT 'guard.db_ok=' || (1 / CASE WHEN current_database() = 'omnigestao_prod' THEN 1 ELSE 0 END)::text;
SELECT 'session.read_only=' || current_setting('transaction_read_only') || ' user=' || current_user || ' pg=' || current_setting('server_version');
SELECT 'neon.' || name || '=' || setting FROM pg_settings WHERE name IN ('neon.timeline_id','neon.tenant_id','neon.endpoint_id','neon.project_id','neon.branch_id') ORDER BY name;
SELECT 'system_identifier=' || system_identifier FROM pg_control_system();
SELECT 'db.owner=' || pg_get_userbyid(datdba) || ' acl=' || coalesce(datacl::text, 'NULL') FROM pg_database WHERE datname = current_database();
SELECT 'databases=' || string_agg(datname, ',' ORDER BY datname) FROM pg_database WHERE NOT datistemplate;
SELECT 'roles.omni=' || coalesce(string_agg(rolname, ',' ORDER BY rolname), '(nenhum)') FROM pg_roles WHERE rolname LIKE 'omni%';
SELECT 'roles.md5=' || md5(string_agg(rolname || ':' || rolsuper || rolinherit || rolcreaterole || rolcreatedb || rolcanlogin || rolreplication || rolbypassrls, ',' ORDER BY rolname)) || ' n=' || count(*) FROM pg_roles;
SELECT 'members.md5=' || md5(coalesce(string_agg(pg_get_userbyid(roleid) || '>' || pg_get_userbyid(member) || ':' || admin_option || inherit_option || set_option, ',' ORDER BY 1), '')) || ' n=' || count(*) FROM pg_auth_members;
SELECT 'owners.public=' || string_agg(o || ':' || n, ' ' ORDER BY o) FROM (
  SELECT pg_get_userbyid(c.relowner) || '/' || c.relkind::text AS o, count(*) AS n FROM pg_class c JOIN pg_namespace s ON s.oid = c.relnamespace WHERE s.nspname = 'public' GROUP BY 1
  UNION ALL SELECT pg_get_userbyid(t.typowner) || '/type' || t.typtype::text, count(*) FROM pg_type t JOIN pg_namespace s ON s.oid = t.typnamespace WHERE s.nspname = 'public' AND t.typtype IN ('e','d','r','c') AND NOT EXISTS (SELECT 1 FROM pg_class c WHERE c.oid = t.typrelid AND c.relkind <> 'c') GROUP BY 1
  UNION ALL SELECT pg_get_userbyid(p.proowner) || '/proc', count(*) FROM pg_proc p JOIN pg_namespace s ON s.oid = p.pronamespace WHERE s.nspname = 'public' GROUP BY 1) x;
SELECT 'schema.public.owner=' || pg_get_userbyid(nspowner) || ' acl=' || coalesce(nspacl::text, 'NULL') FROM pg_namespace WHERE nspname = 'public';
SELECT 'rls.tables=' || count(*) FILTER (WHERE relrowsecurity) || ' forced=' || count(*) FILTER (WHERE relforcerowsecurity) || ' policies=' || (SELECT count(*) FROM pg_policy) FROM pg_class c JOIN pg_namespace s ON s.oid = c.relnamespace WHERE s.nspname = 'public' AND relkind IN ('r','p');
SELECT 'table.acl.md5=' || md5(coalesce(string_agg(relname || ':' || coalesce(relacl::text, 'NULL'), ',' ORDER BY relname), '')) FROM pg_class c JOIN pg_namespace s ON s.oid = c.relnamespace WHERE s.nspname = 'public' AND relkind IN ('r','p','v','m','S');
SELECT 'default_acl=' || count(*) FROM pg_default_acl;
SELECT 'extensions=' || string_agg(extname || '@' || extversion || ':' || pg_get_userbyid(extowner), ',' ORDER BY extname) FROM pg_extension;
SELECT 'shdepend.owner.fora_do_escopo=' || count(*) FROM pg_shdepend d WHERE d.dbid = (SELECT oid FROM pg_database WHERE datname = current_database()) AND d.deptype = 'o' AND d.classid NOT IN ('pg_class'::regclass, 'pg_type'::regclass, 'pg_proc'::regclass, 'pg_extension'::regclass, 'pg_default_acl'::regclass);
SELECT 'shdepend.owner.por_classe=' || string_agg(c || ':' || n, ' ' ORDER BY c) FROM (SELECT d.classid::regclass::text AS c, count(*) AS n FROM pg_shdepend d WHERE d.dbid = (SELECT oid FROM pg_database WHERE datname = current_database()) AND d.deptype = 'o' GROUP BY 1) x;
SELECT 'schema.cols.md5=' || md5(string_agg(table_name || '.' || column_name || ':' || data_type || ':' || is_nullable || ':' || coalesce(column_default, ''), ',' ORDER BY table_name, column_name)) || ' n=' || count(*) FROM information_schema.columns WHERE table_schema = 'public';
SELECT 'kg.cols=' || string_agg(c.relname || '.' || a.attname || ':' || format_type(a.atttypid, a.atttypmod), ' ' ORDER BY c.relname, a.attname) FROM pg_attribute a JOIN pg_class c ON c.oid = a.attrelid JOIN pg_namespace s ON s.oid = c.relnamespace
  WHERE s.nspname = 'public' AND (c.relname, a.attname) IN (('estoque_produtos','stock'),('produto_depositos','quantidade'),('movimentacoes_estoque','quantidade'),('movimentacoes_estoque','estoqueAntes'),('movimentacoes_estoque','estoqueDepois'));
SELECT 'kg.constraints=' || coalesce(string_agg(conname, ',' ORDER BY conname), '(nenhuma)') FROM pg_constraint WHERE conname LIKE '%kg_milesimos';
SELECT 'migrations=' || count(*) || ' finished=' || count(finished_at) || ' last=' || (SELECT migration_name FROM _prisma_migrations ORDER BY started_at DESC LIMIT 1) || ' md5=' || md5(string_agg(migration_name || ':' || checksum, ',' ORDER BY migration_name)) FROM _prisma_migrations;
SELECT 'migrations.kg=' || count(*) FROM _prisma_migrations WHERE migration_name ILIKE '%kg%' OR migration_name ILIKE '%estoque_manual%';
SELECT 'rows.estoque_produtos=' || (SELECT count(*) FROM estoque_produtos) || ' produto_depositos=' || (SELECT count(*) FROM produto_depositos) || ' movimentacoes_estoque=' || (SELECT count(*) FROM movimentacoes_estoque);
