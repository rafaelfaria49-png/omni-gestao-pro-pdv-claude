# Handoff para a frente de segurança de infraestrutura (#404) — sanitizado

Origem: preflight read-only do Gestor Money (#405), 2026-11-26. Nada foi alterado: nenhum GRANT, REVOKE, rotação,
troca de credencial ou de papel. Sem identificadores de infraestrutura, hostnames ou valores de variáveis.

## Fatos

1. **O runtime de Production usa o papel proprietário.** A aplicação conecta (via pooler) com o mesmo papel que é
   dono das 133 tabelas e funções do schema `public` e que aplica as migrations (via conexão direta). Esse papel
   tem `BYPASSRLS` e herda leitura/escrita global (`pg_read_all_data`/`pg_write_all_data`). As variáveis de conexão
   de Production não mudam desde o corte para o Neon; o papel restrito de runtime (`omni_runtime_v2`), criado depois,
   **nunca foi adotado** (0 sessões).
2. **RLS pessoal ineficaz nesse runtime.** As policies que o Gestor Money cria (perfil PESSOAL visível só ao dono
   declarado na transação) não se aplicam ao dono da tabela nem a quem tem `BYPASSRLS`. Hoje isso é inócuo (módulo
   desligado; legado inalterado), mas **ativar o Gestor Money com dados pessoais exige um runtime não proprietário**.
3. **21 tabelas sem privilégios para o runtime restrito.** As tabelas criadas depois da concessão inicial ao
   `omni_runtime_v2` não têm GRANT para ele e não existe *default privilege* que as cubra:
   `admin_sessions`; `aparelhos_aquisicoes`, `aparelhos_documentos`, `aparelhos_eventos`, `aparelhos_fisicos`,
   `aparelhos_fotos`, `aparelhos_identificadores`, `aparelhos_politicas_loja`, `aparelhos_sequencias`,
   `aparelhos_vendas`; `compat_cores_loja`, `compat_fileiras`, `compat_localizacoes`, `compat_paineis`,
   `compat_preferencias_loja`; `solicitacoes_teste_comercial`; `vestuario_cores`, `vestuario_grade_tamanhos`,
   `vestuario_grades`, `vestuario_produtos_grade`, `vestuario_variantes`.
   Consequência: trocar o runtime hoje quebraria login/revogação de sessão, aparelhos, compat e vestuário.
4. Pendentes que também criarão tabelas novas sem GRANT: P03 (5 tabelas), SaaS #398 (7), Gestor Money (20).

## Necessário antes de qualquer troca futura de papel

- **Matriz completa de permissões** por tabela, sequence e função: SELECT/INSERT/UPDATE/DELETE por papel, incluindo
  as tabelas das migrations pendentes, com regra para tabelas futuras (default privileges do papel que cria, ou
  GRANT explícito em cada migration — decisão da frente).
- Prova de que nenhum fluxo depende de privilégio de dono (DDL em runtime, `TRUNCATE`, sequências, `SECURITY DEFINER`).
- Para o Gestor Money: o runtime restrito precisa de DML nas tabelas novas (as do G004 recebem `REVOKE ALL FROM PUBLIC`);
  as funções usadas pelas policies mantêm o `EXECUTE` padrão; os papéis do worker G006 (`omni_gastos_*`) ainda não
  existem e são gate próprio.
- Fronteira de confiança: o contexto RLS pessoal é um GUC de sessão que qualquer papel SQL com SELECT pode definir —
  só papéis confiáveis podem ter SELECT nas tabelas pessoais.
- Ordem segura sugerida: matriz → ensaio em branch isolada → GRANTs → troca de credencial do runtime em janela →
  corte de sessões antigas (troca de senha sozinha não derruba sessão aberta).
