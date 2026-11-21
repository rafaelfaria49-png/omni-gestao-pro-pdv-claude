# Compatibilidade com a revogação por sessão da PR350

Base revisada: main `51265894a8a019fbd5e679003de0b08dd95feba9`, incluindo a [PR350](https://github.com/rafaelfaria49-png/omni-gestao-pro-pdv-claude/pull/350), merge `c6c552ae9d35ae0b6f59481778690e9ce7f0f16e`.

A proposta inicial de incrementar `AdminUser.sessionVersion` no logout foi descartada. Seus commits e evidências permanecem exclusivamente na worktree original e na branch local de preservação; não fazem parte da cadeia publicada.

Esta PR acrescenta regressões e preparação de QA. `auth.ts`, `lib/auth/admin-session.ts`, os handlers/ações de autenticação e os componentes de logout são os da main, sem substituição. Cada login tem `JWT.sid`; o logout revoga aquela linha de `admin_sessions`. Outro dispositivo da mesma conta e outra conta permanecem ativos. O incremento global de versão para troca de senha continua sendo o contrato preexistente dessa operação, sem alteração.

## Provas exigidas

- Unitário da configuração real: flag desligada não consulta admin_sessions; flag ligada revoga apenas o sid assinado, sem escrever sessionVersion.
- PostgreSQL descartável: revogação A idempotente, B e outra conta preservados, versão da conta inalterada; adoção legada determinística não ressuscita linha já revogada.
- NextAuth real em QA: cookie antigo de A reapresentado após logout recebe401; relatório de B permanece200 e outra conta mantém sessão; contador da conta não avança.
- Flag ligada apenas nos processos de QA, após criar banco vazio com o schema herdado. Nenhuma migration/flag ou escrita em ambiente hospedado é executada por esta trilha.

Credenciais e segredo de QA são aleatórios, gerados por execução e guardados apenas no manifesto local ignorado. Não há segredo fixo no código de teste. Resultados gerados permanecem locais; resultados resumidos e CI remota são documentados no relatório consolidado.

## Limitações herdadas, sem correção de auth neste delta

A proteção depende da ativação da flag e do schema da350 no mesmo ambiente. Não foi verificada/alterada a configuração de Production.

A revisão observou limites preexistentes no evento de logout da350: após falha definitiva de revoke o SDK pode confirmar saída local; o caminho de POST imediato com JWT legado sem sid exige avaliação adicional. O teste de adoção legada cobre o resolver/estado persistido, sem certificar esse caminho HTTP. Esses limites não são substituídos por revogação global e não se declaram corrigidos aqui. Uma mudança posterior de autenticação deve ter escopo, revisão e aprovação próprios.

Ativação e rollback deste delta são apenas de testes. Não diminuir/resetar contadores, reviver sessões nem alterar o mecanismo da350.

PRODUCTION_WRITES=0
PRODUCTION_MIGRATIONS=0
MERGE_EXECUTED=NO
