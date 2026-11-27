VEREDITO: APPROVE

Revisão estática das alterações não commitadas sobre `b00b230881ebc3a734248e1bbd1a8b93e2d3ac3b`, incluindo a íntegra dos nove arquivos alterados. Nenhum arquivo editado, nenhuma rede utilizada e nenhum SQL executado. Os resultados fornecidos pelo executor foram considerados evidência complementar, sem reprodução nesta revisão.

1. **R1 #1 — CORRIGIDO.** O [procedimento:82](C:/Projetos/omni-gestao/.worktrees/estoque-manual-kg-001/docs/padaria/pesagem/ESTOQUE_MANUAL_KG_ROLLOUT_REMEDIACAO.md:82) elimina o redeploy prévio de código `Int` com a credencial definitiva. A troca ocorre junto ao deploy Float, com conferência dos deployments antes do corte. O ensaio foi deslocado para o branch Neon. A correção depende dessa disciplina operacional; 04/05 continuam sem distinguir builds que usem o mesmo runtime.

2. **R1 #2 — CORRIGIDO.** O [99:12](C:/Projetos/omni-gestao/.worktrees/estoque-manual-kg-001/docs/padaria/pesagem/rollout/99-desfazer-corte.sql:12) exige database correto, trava explicitamente as três tabelas de `public` e exige as cinco colunas como `int4`. Ausência, conversão parcial ou migration completa recusam a reabertura. Com `-1`, os locks permanecem até o COMMIT. O GRANT agora devolve somente CONNECT ao papel antigo.

3. **R1 #3 — CORRIGIDO.** O [02:20](C:/Projetos/omni-gestao/.worktrees/estoque-manual-kg-001/docs/padaria/pesagem/rollout/02-grants-runtime.sql:20) exige SELECT, INSERT, UPDATE e DELETE separadamente, combinados por AND.

4. **R1 #4 — CORRIGIDO.** O [03:23](C:/Projetos/omni-gestao/.worktrees/estoque-manual-kg-001/docs/padaria/pesagem/rollout/03-corte-posse.sql:23) inventaria ownership por `pg_shdepend`, recusa objetos fora do escopo, transfere compostos avulsos e ranges e aborta diante de resíduos não permitidos. Extensões e default ACLs aparecem como exceções explícitas no diagnóstico final. Não introduz `REASSIGN OWNED` nem transferência indiscriminada de objetos compartilhados.

5. **R1 #5 — CORRIGIDO.** Os cinco CHECKs do [07:15](C:/Projetos/omni-gestao/.worktrees/estoque-manual-kg-001/docs/padaria/pesagem/rollout/07-guard-check-opcional.sql:15) usam `999999999999999`, compatível com `MAX_STOCK_UNITS` para UN/G. O inteiro válido `1000000000000` deixa de ser rejeitado. Permanece a limitação já conhecida: esse CHECK não reproduz integralmente o contrato por unidade da aplicação.

6. **R1 #6 — CORRIGIDO.** O [apply:13](C:/Projetos/omni-gestao/.worktrees/estoque-manual-kg-001/docs/padaria/pesagem/estoque-kg-migration-apply.sql:13) fixa `extra_float_digits=1` antes dos dois retratos. O DDL continua correspondente à migration; confirmei os 1041 bytes normalizados para LF e o SHA-256 informado.

Achado novo, não bloqueante:

1. **P3 — O resumo ainda prevê redeploy antes da janela.**  
   [ESTOQUE_MANUAL_KG_ROLLOUT_REMEDIACAO.md:53](C:/Projetos/omni-gestao/.worktrees/estoque-manual-kg-001/docs/padaria/pesagem/ESTOQUE_MANUAL_KG_ROLLOUT_REMEDIACAO.md:53). A linha “Custo” mantém “2 envs + 1 redeploy **antes** da janela”, contradizendo o procedimento corrigido. Um operador que use esse resumo pode interpretar a sequência antiga. **Correção:** mover expressamente a troca das envs e o deploy Float para a janela também nessa linha.

**Só o Neon real pode provar:**

- Preservação de ownership, ACLs e memberships após suspensão/retomada do compute.
- Comportamento efetivo do pooler: identidade dos backends, cliente persistente/idle, transação ativa, reconexão e cold start após 04+05.
- Inventário e privilégios no database de produção. A evidência 41 cobre candidate; não demonstra ausência de objetos não suportados nem de RLS em produção.
- Comportamento de criação e gerenciamento dos papéis SQL pelo provedor.

A associação entre credencial e builds Float exige conferência adicional na Vercel. Esta aprovação da revisão estática preserva o **NO-GO operacional** documentado até o fechamento desses gates.