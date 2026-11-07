# Revisão técnica independente — decisão final A6

Revisor: subagente `/root/a6_independent_review`, em contexto separado. A pedido explícito do GOAL A6, fez revisão exclusivamente local e somente leitura, sem editar arquivos nem conectar a banco, Neon ou Vercel. Este registro foi salvo pelo executor principal a partir do parecer recebido após a correção do script e a conclusão das duas provas. Não representa uma segunda execução dos testes pelo revisor.

**APPROVE técnico** do [07 corrigido](../../../../padaria/pesagem/rollout/07-guard-check-opcional.sql), exclusivamente para aplicação futura condicionada à autorização específica da janela.

Artefato aprovado: **4.996 bytes LF**, SHA-256 `dea40868a5458e1cceeeae90c9db5ff91a7e291432326269fca932fca5d51935`.

Não identifiquei defeito bloqueante remanescente nesse artefato. A migration original continua intacta, com **1.041 bytes** e SHA-256 `f07242c4604660008b645004d3dfafde4da1656e728f803d9009f2f02a06a47e`. Helper e schema também correspondem à baseline.

- **P1 corrigido — precisão escondida pelo cast.** Os 15 contraexemplos reproduziram a falha do original nos cinco campos. A comparação `round(v::numeric,3)::float8 = v` agora verifica o valor original e rejeita esses valores, sem modificar os dados.
- **P2 corrigidos — evidência insuficiente.** Os extremos agora exigem `23514`; o suplemento confere delta, saldo anterior, saldo posterior, equação em milésimos, venda sintética e preservação dos tipos/NOT NULL após remoção.
- **P3 corrigido — cobertura dos arredores.** Foram comparados 136 vetores ULP com o helper real, sem divergências. Os oito casos acima do teto específico KG foram corretamente separados dessa comparação.

A [prova principal](03-proof-04.json) passou **235 verificações**, incluindo os cinco CHECKs validados, rejeições por constraint, NULL, clientes Prisma Int/Float 6.19.3, corrupção preexistente, locks, falhas e rollback integral. As varreduras aceitaram 220.003 valores KG e 20.002 inteiros UN.

O [suplemento](04-scale-edge-proof-01.json) passou **161 verificações** e validou 300.000 linhas adicionais em **627 ms**, sem alteração dos dados. Esse tempo caracteriza somente o ambiente sintético.

Permanecem riscos residuais documentados:

- **P1 operacional:** clientes Int ainda podem gravar zero ou executar increment/decrement como no-op. **Corte de CONNECT e encerramento das sessões antigas continuam obrigatórios.**
- **P1 de integração:** o caminho Prisma observado normalizou certos inputs antes do CHECK. O banco valida o valor recebido; o boundary deve rejeitar inputs inválidos antes do driver.
- **P2 de domínio:** os CHECKs escalares não distinguem UN/G/KG, não impõem o teto menor KG e não garantem conservação entre produto, depósito e ledger. Essas regras continuam no boundary e na transação canônica.
- **P2 operacional:** executar obrigatoriamente com `psql -X -v ON_ERROR_STOP=1 -1`, identidade do banco conferida na mesma sessão e janela preparada para `ACCESS EXCLUSIVE` até commit. Os timeouts são locais; falhas exigem rollback integral e diagnóstico.

Esta aprovação se limita ao hash acima e às condições declaradas. Não autoriza execução em produção, retirada das salvaguardas ou liberação das vendas manuais KG desenvolvidas na sessão paralela. Minha revisão foi exclusivamente local e somente leitura, sem conexões a banco, Neon ou Vercel.
