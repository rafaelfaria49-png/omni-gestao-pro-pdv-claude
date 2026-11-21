# A5 — consolidação documental do runbook KG — 2026-10-29

**A5=PASS documental. Rollout permanece NO-GO operacional.** GOAL `ESTOQUE-KG-PRODUCTION-A5-RUNBOOK-001`.
Foram consolidados os registros locais A1, A1.1, A2, A3 e A4; nenhuma conexão ao Neon ou à Vercel foi feita.
O A5 conclui o texto e a validação local desta revisão. A preparação operacional e os gates posteriores
permanecem pendentes, sem autorização implícita.

Resultado estruturado: [02-final-summary.json](02-final-summary.json).

```text
A5=PASS
RUNBOOK_UPDATED=YES
A1_A4_EVIDENCE_RECONCILED=YES
PRODUCTION_STATE_DOCUMENTED=YES
DEPLOYMENT_RISK_DOCUMENTED=YES
J0_CHECKLIST_UPDATED=YES
SCRIPT_07_DECISION=PENDING
MAIN_RECONCILIATION=PENDING
DOCS_COMMIT=NONE
PRODUCTION_CHANGES=0
VERCEL_CHANGES=0
MERGE=NO
PUSH=NO
NEXT_GATE=A6, mediante autorização separada.
```

## Documentos consolidados e pendentes de versionamento

| Documento | Resultado desta revisão |
| --- | --- |
| [Runbook](../../../../padaria/pesagem/ESTOQUE_MANUAL_KG_RUNBOOK.md) | Estado A1–A4 e identidade reconciliados; A5 documental, A6–A8/J0–J13 não autorizados; preflight seguro antes do 01; reconciliação/CI do head final e cron auxiliar pendentes |
| [Remediação](../../../../padaria/pesagem/ESTOQUE_MANUAL_KG_ROLLOUT_REMEDIACAO.md) | Papéis/GRANTs A3 já aplicados; A4 por login/catálogo, sem prova de migration produtiva; topologia e contagens datadas; corte CONNECT + sessões como proteção efetiva; 07 candidato sem aprovação |
| [Checklist de lojas](../../../../padaria/pesagem/ESTOQUE_MANUAL_KG_CHECKLIST_LOJAS.md) | loja-1 RafaCell / loja-2 Rafa Brinquedos; terminais e perfis/PWAs reais, URLs antigas, filas offline, pagamentos, todas as sessões por storeId; ABERTA=0 antes do J0 e inventário de deployments no início da janela |

As cinco colunas `integer`, a ausência da migration e os 110/110 GRANTs são estados documentados dos
registros anteriores, não novas consultas deste A5. O último relato de caixa aberto é loja-1 no A3;
loja-2 aberta nos registros A1/A1.1 é histórico e deve ser reconfirmada somente sob autorização futura.

A continuidade da configuração antiga de Production continua classificada como inferência do A4,
apoiada nos metadados e deployment preservados; não houve leitura dos valores `sensitive` da Vercel.
O migrator autenticou e herda `omni_owner`, mas ainda não tem acesso de proprietário aos objetos;
nenhuma capacidade de migration foi efetivamente exercitada em Production.

Main de referência: `origin/main` local em `aaab27505a03903d9fb8333baef5b52424821093`, merge da #321,
sem fetch neste A5. Antes de J3/J4, reconciliar a #315 com a main então atual e obter CI/revisão do head final.
O head local da #315 permanece `104d768d7b7497fe34e2872f4253c4fd97feb5bb`.

## Validação local

[validation-02.json](validation-02.json): **55/55 verificações PASS**, após a redação final que restringe a
reconfirmação dos caixas ao preflight da janela autorizada. O primeiro resultado também foi preservado.

- `git diff --check`: exit 0.
- Markdown: cercas de código, tabelas, links locais, âncoras e caminhos explícitos conferidos.
- Migration: **1.041 bytes LF**, SHA-256 `f07242c4604660008b645004d3dfafde4da1656e728f803d9009f2f02a06a47e`, igual ao blob Git.
- Cinco alterações de tipo da migration e do wrapper de aplicação conferidas por inspeção estática.
- Referências, marcadores e integridade dos oito scripts de rollout conferidos; nenhum script SQL alterado ou executado.
- Preflight equivalente ao 06: consulta por OID com LEFT JOIN/CASE para `omni_owner` ausente, READ ONLY e ROLLBACK;
  validação estática, sem execução contra PostgreSQL. O 06 oficial permanece inalterado.
- Recuperação F0–F4 preservada literalmente; ponto de não-retorno no COMMIT do J8 e proibição de escrita Int sobre Float mantidos.
- **6.038 arquivos rastreados fora dos três documentos** preservados byte a byte, incluindo código funcional e scripts.
- **152 arquivos de evidências anteriores** preservados byte a byte, inclusive os não commitados.
- Índice Git vazio e inalterado, HEAD preservado, WIPs da raiz preservados; AEP segue opt-out nas duas worktrees.

O validador [harness/validate-docs.cjs](harness/validate-docs.cjs) usa somente arquivos locais e comandos Git de leitura.
Não executa SQL, Prisma, testes do app, GitHub, conectores, Vercel CLI ou operações de rede.
Não há validador Markdown dedicado configurado nos scripts/workflows inspecionados; as verificações acima
foram aplicadas aos documentos deste escopo. Nenhuma CI nova foi executada ou declarada aprovada.

## Decisão de versionamento

**DOCS_COMMIT=NONE.** O runbook e a remediação já tinham WIPs do hardening 005 antes deste GOAL,
cujo registro os qualificava como pendentes de revisão/commit. O delta A5 se sobrepõe a **18 hunks do runbook**
e **8 da remediação** no cotejo com a base local. O checklist não tinha WIP anterior.

A separação do conjunto documental A5 para um commit coerente não é inequívoca sem incorporar parte desses
WIPs anteriores. Conforme a condição expressa do GOAL, **não foi feito staging nem commit**. Os três documentos
da tabela acima permanecem pendentes. Não foi criado commit parcial apenas do checklist.

Preservados para revisão: [00-baseline.json](00-baseline.json), cópias originais em `baseline/`,
`baseline/preexisting-docs.patch` e [a5-only-02.patch](a5-only-02.patch). Este último é o diff de revisão
entre os snapshots originais e os documentos finais; não deve ser aplicado automaticamente como script operacional.
As evidências, scripts, segredos e WIPs de outras sessões não foram incluídos em commit.

## Limite de encerramento

`SCRIPT_07_DECISION=PENDING`, `MAIN_RECONCILIATION=PENDING`; leitura de `cron.job` em `postgres` pendente
de autorização específica. Não houve merge, push, deploy, migration, fechamento de caixa ou criação de dados reais.
Não houve operação na PR #318. Encerrado no A5; próximo gate A6 somente mediante autorização separada.
