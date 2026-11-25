# Isolamento permanente dos datasources de Development e QA

O contrato do GOAL 007 parte de `origin/main` em `3dcd40956b06ac0f7854497d406ce8db59239a71` e das identidades verificadas na auditoria local até `9486d01`.

## Pontos de entrada

| Contexto | Proteção |
| --- | --- |
| Aplicação Next.js | `lib/prisma.ts` adia a criação do cliente compartilhado até o primeiro acesso. Valida os dois bindings e fixa a URL validada no cliente para evitar nova resolução de dotenv. |
| Build Vercel | Importar módulos pode ocorrer sem banco. Qualquer acesso real ao cliente passa pelo mesmo guard. `prisma generate` e o runner de build conservam o contrato existente. |
| Runtime Vercel Production | O conjunto de metadados da Vercel exige alvo Production, projeto canônico ou legado conhecido, marcador Vercel e ID de deployment. Nesse contexto, mantém as opções e a resolução de datasource anteriores. Uma flag isolada e `NODE_ENV=production` não conferem acesso. |
| Vitest e Playwright | Preflight dos bindings de integração declarados. Testes sem configuração de banco podem iniciar. Ao acessar o Prisma da aplicação, o guard de runtime continua obrigatório. |
| Bancadas descartáveis | Validam loopback, identidade e opções de conexão antes de criar cliente ou provisionar o fixture. Os checks existentes de banco novo, role e schema continuam aplicáveis. |
| Scripts de aplicação | Os comandos comuns validam o contexto não produtivo. As variáveis explícitas prevalecem sobre o fallback em memória do `.env` da worktree. |
| `npm run db:push` e `npm run db:migrate` | Entrypoint local com datasources fixados no processo filho e schema versionado. Aceita o papel administrativo registrado do Development na conexão direta ou PostgreSQL local isolado. O papel de runtime do Neon permanece separado. |
| Auditoria Production | `scripts/check-prod-data.mjs` recebe `OMNI_AUDIT_DATABASE_URL` para o papel dedicado `omni_prod_auditor` e executa consultas em transação read-only. A provisão e concessão desse papel exigem a autorização administrativa separada. O comando recusa o antigo papel proprietário. |

O guard trata ausência, ambiguidade e opções de redirecionamento antes da rede. Para Neon, a autorização exige a tupla hostname, banco, papel e TLS, incluindo variantes diretas e pooler registradas. Apenas a matriz de loopback permite usar `DATABASE_URL` sozinha. Uma `DIRECT_URL` explicitamente definida passa pelo mesmo controle e deve corresponder à identidade e ao schema do par. Erros da política informam somente o código e o nome da classe de binding.

Os metadados Vercel separam contextos operacionais do aplicativo. Este controle cobre configuração inadvertida. A custódia dos segredos, as permissões de rede e as ACLs do PostgreSQL continuam responsáveis por acessos deliberados. Executar clientes externos por conta própria exige as mesmas regras de destino e autorização.

## Compatibilidade QA

- Development remoto usa o compute sintético, seu banco e o papel `omni_dev_runtime`. O Dev local e o CI descartável usam loopback real. A rotina local de DDL tem seu próprio papel aprovado.
- Preview genérico, Padaria KG e o canário 005 preservam as tuplas verificadas. SaaS e Marketplace passam pela mesma política quando usam o binding genérico comprovado. A aprovação da tupla não liga flags nem homologa pagamentos, OAuth ou callbacks.
- As bancadas Vestuário e Marketplace mantêm seus preparadores descartáveis. A verificação adicionada cobre também parâmetros que tentem mudar o destino.
- Windows e Omni Print preservam as tuplas isoladas documentadas. O provisionador Windows hospedado está preso à conexão direta do seu banco dedicado. A associação de cada snapshot ao papel correto, a sessão e os ensaios de hardware ainda pertencem ao aceite do respectivo QA.
- Overrides com destino fora da matriz precisam de prova de projeto, compute, banco, papel e isolamento antes de entrar na política. Os snapshots anteriores à implantação conservam código e configuração originais.

## Rollout e verificação

1. Executar a CI da PR draft, o teste de leitura no PostgreSQL descartável e os checks Vercel Preview. Conferir `MIGRATION_SKIPPED` e os testes existentes de autoridade antes de qualquer promoção.
2. Confirmar a matriz de ambientes ativos com os responsáveis. Para cada override, conferir ambas as variáveis com valores protegidos e atestar a tupla por catálogo read-only no cluster autorizado.
3. Validar login sintético nas origens QA aprovadas e as integrações Windows/Print em suas bancadas próprias. Manter a autoridade de migrations e os fluxos Production na configuração atualmente aprovada.
4. Se um ambiente aprovado falhar, corrigir a tupla mediante nova evidência ou manter a homologação afetada pausada. O rollback de software é uma revisão isolada ou um Preview comprovadamente seguro. A credencial antiga da raiz fica fora de qualquer caminho de retorno.

Referências [Variáveis de sistema da Vercel](https://vercel.com/docs/environment-variables/system-environment-variables) e [Prisma Client v6](https://www.prisma.io/docs/orm/v6/reference/prisma-client-reference).
