-- ESTOQUE-MANUAL-KG-001 · rollout B · 05 — JANELA, corte 3/3: encerrar as sessões do papel antigo em produção.
-- NÃO executar em produção sem autorização específica.
--
-- Quem: o PRÓPRIO papel antigo, conectado a um database que NÃO é o de produção (ex.: neondb) —
-- ele não consegue mais entrar em produção e pode sinalizar os próprios backends.
-- Uso: psql -X -v ON_ERROR_STOP=1 -v old_role=neondb_owner -v prod_db=omnigestao_prod -d neondb -f 05-encerrar-sessoes.sql
--
-- Encerra em 3 rodadas (2 s entre elas) e exige zero ao final: cobre função quente com pool aberto,
-- conexão de servidor do pooler e transação em voo (que é desfeita, nada gravado).

SET kg.old_role = :'old_role';
SET kg.prod_db = :'prod_db';
DO $$
DECLARE old text := current_setting('kg.old_role'); db text := current_setting('kg.prod_db'); n int; rodada int;
BEGIN
  IF current_database() = db THEN RAISE EXCEPTION 'KG_RODAR_FORA_DO_DATABASE_DE_PRODUCAO'; END IF;
  FOR rodada IN 1..3 LOOP
    -- pg_stat_activity é um retrato fixo dentro da transação: sem limpar, a rodada 2 vê PIDs já mortos
    PERFORM pg_stat_clear_snapshot();
    SELECT count(*) FILTER (WHERE pg_terminate_backend(pid)) INTO n
      FROM pg_stat_activity WHERE datname = db AND usename = old AND pid <> pg_backend_pid();
    RAISE NOTICE 'KG_SESSOES_ENCERRADAS rodada=% n=%', rodada, n;
    PERFORM pg_sleep(2);
  END LOOP;
  PERFORM pg_stat_clear_snapshot();
  SELECT count(*) INTO n FROM pg_stat_activity WHERE datname = db AND usename = old;
  IF n <> 0 THEN RAISE EXCEPTION 'KG_SESSOES_ANTIGAS_RESTANTES: %', n; END IF;
  RAISE NOTICE 'KG_SESSOES_ANTIGAS_ZERO';
END $$;
