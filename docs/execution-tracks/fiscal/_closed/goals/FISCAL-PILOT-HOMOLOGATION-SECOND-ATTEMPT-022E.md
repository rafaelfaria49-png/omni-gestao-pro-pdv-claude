<!-- AEP:META
{
  "aep": "1.0-R2",
  "id": "FISCAL-PILOT-HOMOLOGATION-SECOND-ATTEMPT-022E",
  "track": "fiscal",
  "title": "Segunda e única tentativa controlada de NFC-e em HOMOLOGACAO sobre o runtime 022D, com halt G-F7-2",
  "status": "READY",
  "class": "C3",
  "risk_tier": "ALTO",
  "branch": "cursor/fiscal-pilot-homologation-second-attempt-022e-b0e3",
  "worktree": "/workspace",
  "test_command": "npx vitest run lib/fiscal/homologation lib/fiscal/queue lib/fiscal/provider/sefaz test/fiscal/scenario-battery",
  "allowlist": [
    "lib/fiscal/**",
    "app/api/fiscal/**",
    "app/api/internal/fiscal/**",
    "docs/fiscal/**",
    "docs/ai/CURRENT_STATUS.md",
    "docs/ai-execution/_evidence/**"
  ],
  "gates_liberados": [],
  "read_budget": 180,
  "plan_ref": "FISCAL-FABLE5-CONTINUATION-MASTERPLAN-001",
  "plan_rev": 1,
  "familia_executor": "cursor",
  "revisao_independente": true,
  "reversibilidade": "kill-switch fiscalEnabled=false; janela PILOT_EMISSION_HOMOLOGATION_WINDOW restaurada a {null,null,null} antes do fim da branch; produto piloto 022E inativado sem delete; evidência (venda/NotaFiscal/job/logs) preservada; 022B permanece evidência histórica imutável; Production/G-F12 permanecem fechados; zero retry; nenhuma segunda EMISSAO",
  "gates_extra": [
    {
      "id": "sefaz_homologacao",
      "status": "pendente_g_f7_2",
      "dependencias": []
    },
    {
      "id": "production",
      "status": "bloqueado",
      "dependencias": []
    }
  ],
  "gate_humano": {
    "requerido": true,
    "pendente": false,
    "aprovacao": {
      "aprovado": true,
      "autorizacao": "GOAL 022 permanece BLOCKED e 022B permanece DONE (evidência histórica imutável; produto cmu5exl5d0003h24smn7wqm3h, venda cmu5exm1s000eh24sjfhdvf7u, NotaFiscal cmu5exmri000qh24suft83gdc, job cmu5exmz7000th24sz4fsb6yi e chave 35260948241205000195650010000000011157776935 NÃO reutilizáveis). Autorizo o sucessor FISCAL-PILOT-HOMOLOGATION-SECOND-ATTEMPT-022E a preparar a segunda e única tentativa controlada de NFC-e em HOMOLOGACAO (loja-1, SEFAZ_DIRETO, tpAmb=2, modelo 65) sobre o runtime 022D já publicado, até o gate humano G-F7-2. G-F12 e Production fiscal continuam bloqueados. Nenhuma janela armada, nenhuma activation consumida, nenhum socket e nenhum SOAP antes da autorização textual G-F7-2 na mesma sessão. Se o runtime 022D exigir alteração NOVA de semântica em lib/fiscal/**, NÃO mergear — marcar NEEDS_INDEPENDENT_REVIEW e parar.",
      "registrado_por": "Rafael Faria",
      "em": "2026-09-20T13:07:00Z"
    }
  }
}
-->

# FISCAL-PILOT-HOMOLOGATION-SECOND-ATTEMPT-022E — Segunda NFC-e controlada em HOMOLOGACAO (runtime 022D)

- trilha: `fiscal`
- classe: C3 · status: READY
- plano: `FISCAL-FABLE5-CONTINUATION-MASTERPLAN-001` (plan_rev 1)
- branch: `cursor/fiscal-pilot-homologation-second-attempt-022e-b0e3`
- worktree: `/workspace`
- teste: `npx vitest run lib/fiscal/homologation lib/fiscal/queue lib/fiscal/provider/sefaz test/fiscal/scenario-battery`
- risco: `ALTO`
- revisao_independente: `true` (herdada do 022C/022D: R1 providerInvoked + R2 startedAt pré-boundary). Qualquer semântica NOVA em `lib/fiscal/**` invalida essa herança (`NEEDS_INDEPENDENT_REVIEW`).
- predecessor: `022` BLOCKED permanece · `022B` DONE permanece (imutável) · `022D` DONE (runtime publicado) · `022C` substituído pelo 022D (PR #203 superseded)

## 1. Relação com 022 / 022B / 022D

O 022 parou sem fonte de documento. O 022B criou o primeiro documento piloto e transmitiu UMA vez; CONSULTA classificou `NOT_FOUND` (217) porque o freio GOAL-011 reescreveu a EMISSAO. O 022C/022D publicou a prova opaca de EMISSAO, `providerInvoked` reconferido, `startedAt` pré-boundary, default deny, HOMOLOGACAO-only, Production bloqueada, one-shot persistente, zero retry e CONSULTA posterior sem segunda EMISSAO.

Este sucessor **não** reabre 022, **não** reutiliza o documento 022B e **não** altera o ledger desses GOALs. Executa a segunda tentativa sobre o runtime já mergeado.

## 2. Base (confirmar no início, read-only)

- Fetch + partir de `origin/main` atual.
- Merge do 022D (`4f72e606` / PR #208) continua ancestral da main.
- Nenhuma alteração posterior conflitante em `lib/fiscal/**`.
- Track `fiscal` sem GOAL ativo no caminho quente.
- Production fiscal fechada: `PILOT_EMISSION_HOMOLOGATION_WINDOW = {null,null,null}` · `G-F12` bloqueado.

Identidade operacional Neon canônico (nunca imprimir `DATABASE_URL`, A1, CSC ou secrets):

- `database=omnigestao_prod`
- `store=loja-1`
- `provider=SEFAZ_DIRETO`
- `ambiente=HOMOLOGACAO`
- `modeloFiscal=NFCE`
- `cscId=4`
- `cscTokenRef=FISCAL_CSC_TOKEN_LOJA_1`
- certificado A1 ativo/válido
- `fiscalEnabled=false` no estado estável

## 3. Ritual AEP (não repetir o erro 022C)

O 022C commitou trabalho sem `registry` + `verify` + `aep(fiscal): plan` ratificado — `verify` ficou divergente. Este GOAL exige, **antes do open**:

1. Arquivo deste GOAL em `docs/execution-tracks/fiscal/goals/`
2. `node scripts/track.mjs registry`
3. `node scripts/track.mjs verify` (e `verify --all`)
4. `AEP_WRITE=1 git commit -m "aep(fiscal): plan FISCAL-PILOT-HOMOLOGATION-SECOND-ATTEMPT-022E"` por caminhos explícitos
5. Só então `node scripts/track.mjs open fiscal`

## 4. Escopo técnico

1. **Provar o runtime 022D offline** (código + testes, antes de qualquer preparação externa): prova opaca de EMISSAO ativa; `providerInvoked` reconferido; `startedAt` pré-boundary; default deny; HOMOLOGACAO-only; Production bloqueada; one-shot persistente; zero retry; CONSULTA posterior sem segunda EMISSAO.
2. **XSD**: reutilizar exclusivamente o worker certificado do run `34833154637` (Trivy HIGH=0 CRITICAL=0). Sem rebuild de supply-chain. Subir hardenizado e exigir `health=200`, `ready=200`, `VALIDACAO_APROVADA`.
3. **Novo produto piloto** via `ProductWriteService` canônico (nunca Prisma create/SQL cru). SKU técnico único do 022E, sem barcode. `preço=R$ 1,00`, estoque inicial=1, `NCM=85176200`, `CFOP=5102`, `CSOSN=102`, `origem=0`, `uCom=UN`, `uTrib=UN`. Validar com `getProdutoFiscal`.
4. **Nova venda** via writer server-first canônico (`persistSaleV2` / `upsertVendaInTransaction`). 1 unidade, R$ 1,00, dinheiro, `cashTendered=R$ 1,00`, `tPag` esperado `01`, sem PIX/cartão/aPrazo/carnê, sem cliente identificado. Numeração/idempotência server-side corrente. Nunca INSERT SQL cru.
5. **Caixa**: sessão dedicada de homologação, aberta canonicamente com R$ 0,00 (`app/api/ops/caixa/abrir`). Não interferir com sessão real de operador. Fechar canonicamente após o teste.
6. **Preparação fiscal SEM transmissão**: `fiscalEnabled=true` só no intervalo mínimo para `requestFiscalEmissionWithJob`. Nova `NotaFiscal` + novo job `EMISSAO`. Em seguida `fiscalEnabled=false`. Exigir: `job.tipo=EMISSAO`, `job.status=PENDENTE`, `tentativas=0`, nova dedupe, nova chave, `tpAmb=2`, modelo=65, UF=SP, snapshot congelado, pagamento `tPag=01`, XMLDSig válido, XSD PASS, hash persistido = hash preparado.
7. **Halt G-F7-2** (ver § 5). Não armar janela, não consumir activation, não abrir socket, não enviar SOAP.
8. **Após autorização G-F7-2 na mesma sessão**: revalidar preflights; se qualquer dado mudou, NÃO transmitir. Armar janela ≤ 15 min; `fiscalEnabled=true` só `loja-1`; executar **exatamente uma vez** `executePilotHomologationEmissionTransmission`. Nenhum retry.
9. **Classificação** pelo contrato existente: AUTORIZADA persiste cStat/protocolo/chNFe; 103/105 consulta sem nova EMISSAO; 204 número consumido + consulta, nunca retransmissão; 656 pause/fail-closed; UNKNOWN/timeout/socket/mTLS/HTTP incerto após boundary → CONSULTA, nunca nova EMISSAO; 217 em CONSULTA → `NOT_FOUND`, sem retransmissão automática neste GOAL.
10. **Finally obrigatório** (qualquer desfecho): `fiscalEnabled=false`; janela dormente/null; `automaticRetries=0`; Production contact=false; segunda EMISSAO=false. Fechar caixa dedicado. Inativar produto piloto. Não deletar venda, NotaFiscal, jobs ou logs fiscais.
11. Reconciliar Venda, NotaFiscal, FiscalEmissaoJob, FiscalLog, chNFe, cStat, xMotivo, protocolo, consulta, contagem de transmissões. Suíte fiscal focada, `npm run typecheck`, eslint focado, `git diff --check`, `node scripts/track.mjs check fiscal`, `node scripts/track.mjs verify --all`.
12. Publicação se reconciliado e seguro: `close fiscal`, commit, push, PR, CI, correções diretamente relacionadas, merge, Vercel Production READY, smoke `/api/version` e `/login`. Não parar em "ready to merge" ou "ready to deploy". Semântica NOVA em `lib/fiscal/**` → `NEEDS_INDEPENDENT_REVIEW` e parar sem merge.

## 5. Gate humano G-F7-2 (halt operacional)

Antes de armar janela, consumir activation, habilitar `fiscalEnabled` para transmissão, criar authority externa, abrir socket ou enviar SOAP, **PARE** e solicite EXATAMENTE:

> AUTORIZO G-F7-2: uma única nova NFC-e em HOMOLOGAÇÃO para a loja-1, tpAmb=2, com este novo documento/NotaFiscal/job/chave, zero retry, Production proibida. Se o resultado for incerto, somente CONSULTA; nenhuma segunda EMISSAO.

Mostre o resumo curto com `PRODUCT_ID`, `SALE_ID`, `NOTA_ID`, `JOB_ID`, `CHNFE`, `tpAmb`, `UF`, `XSD`, `XMLDSIG`, `transmissions=0`, `budget=1`, `Production=false`. Não encerre a sessão. Aguarde somente essa autorização humana. Depois dela, continue automaticamente na mesma sessão.

## 6. IDs 022B proibidos (evidência histórica imutável)

Não reutilizar: produto `cmu5exl5d0003h24smn7wqm3h`, venda `cmu5exm1s000eh24sjfhdvf7u`, NotaFiscal `cmu5exmri000qh24suft83gdc`, job `cmu5exmz7000th24sz4fsb6yi`, chave `35260948241205000195650010000000011157776935`.

## 7. Allowlist da trilha de execução

```
lib/fiscal/**
app/api/fiscal/**
app/api/internal/fiscal/**
docs/fiscal/**
docs/ai/CURRENT_STATUS.md
docs/ai-execution/_evidence/**
```

Writes de produto/venda/caixa/configuração fiscal ocorrem no Neon via writers canônicos de runtime — não são alterações versionadas e não expandem a allowlist. Nunca versionar `DATABASE_URL`/`DIRECT_URL`, `.env.local`, A1/CSC/queue secret, XML com dados sensíveis, artifact Docker ou WIPs de outros workstreams. Orquestradores efêmeros ficam em `import/` (gitignored).

## 8. Fora de escopo

- Reabrir, mover ou reescrever 022 / 022B / 022C / 022D.
- Reutilizar documento, job ou chave do 022B.
- Segunda NFC-e, retry automático, Production (`tpAmb=1`), G-F12.
- Schema/migration, auth, `proxy.ts`.
- Rebuild do worker XSD / rerun de supply-chain.
- Semântica nova em `lib/fiscal/**` (se for necessária: `NEEDS_INDEPENDENT_REVIEW`, sem merge).

## 9. Critério de Pronto

1. Runtime 022D comprovado offline; suíte do GOAL verde antes da preparação externa.
2. Worker XSD do run `34833154637` health/ready 200 + `VALIDACAO_APROVADA`.
3. Produto/venda/caixa/NotaFiscal/job 022E novos, distintos do 022B; produto inativo ao final; caixa dedicado fechado.
4. No máximo uma transmissão SEFAZ de documento, e somente após G-F7-2; classificação persistida; `SECOND_EMISSION_CREATED=false`.
5. Finally: `fiscalEnabled=false`, janela `{null,null,null}`, Production contact=false, retries automáticos=0.
6. Typecheck, lint focado, diff-check, `track check` e `track verify --all` verdes.
7. Close AEP; merge em `origin/main` (salvo `NEEDS_INDEPENDENT_REVIEW`); Vercel Production READY; smoke público OFF.
