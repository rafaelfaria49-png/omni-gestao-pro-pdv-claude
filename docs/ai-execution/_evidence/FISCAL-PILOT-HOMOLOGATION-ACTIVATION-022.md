# FISCAL-PILOT-HOMOLOGATION-ACTIVATION-022 — evidência da tentativa 3/3

GOAL 022 · piloto NFC-e HOMOLOGACAO ponta a ponta. Tentativa 3/3 parou em
`PILOT_DOCUMENT_SOURCE_BLOCKED`. Nenhuma rede SEFAZ. Janela de emissão permaneceu
dormente. `fiscalEnabled=false` o tempo todo. Production OFF.

## Identidade git

- `GOAL=FISCAL-PILOT-HOMOLOGATION-ACTIVATION-022`
- `HEAD_BEFORE=effc216704050f142e97f4e06d693a9b807f094a`
- `MAIN_BEFORE` (origin/main no fetch desta sessão)=`c9ab2e4a528ff7d869341538c99405afe6b9cb3e`
- `MAIN_RECONCILED=true` — merge ort sem conflito no runtime fiscal `fbd712c`
- Runtime one-shot `fbd712c` vs HEAD: diff vazio nos 9 arquivos do slice
- `PILOT_EMISSION_HOMOLOGATION_WINDOW` permaneceu `{null,null,null}`
- WIPs externos (stashes de outras worktrees) não tocados
- WIP local (timeouts de teste + `.gitignore .vercel`) stashado como
  `wip-fiscal-022-local-before-main-merge`

## Banco (Neon / omnigestao_prod)

- `DATABASE_SOURCE=NEON`
- `CANONICAL_DATABASE_MATCH=true`
- `STORE_MATCH=true` (`loja-1`, nome RafaCell, município Taguaí, UF SP)
- `CERTIFICATE_MATCH=true` (A1 ATIVO, vigente, `cnpjConfere=true`, refs opacas presentes)
- `SECRETS_EXPOSED=false` (DSN nunca impresso/persistido; CSC/A1 só por ref/env)
- Outras lojas: `ConfiguracaoFiscalLoja` somente em `loja-1` (não há outras linhas)

### Config fiscal

| Campo | Antes | Depois |
| --- | --- | --- |
| provider | `STUB_HOMOLOGACAO` | `SEFAZ_DIRETO` |
| ambiente | `HOMOLOGACAO` | `HOMOLOGACAO` (preservado) |
| modeloFiscal | `NFCE` | `NFCE` (preservado) |
| cscId | `""` | `4` |
| cscTokenRef | `null` | `FISCAL_CSC_TOKEN_LOJA_1` |
| fiscalEnabled | `false` | `false` (nunca ligado) |
| certificadoAtivoId | presente | presente (preservado) |

Writer: `normalizeFiscalConfigForUpsert` + `updateMany` CAS + `FiscalLog` `config.update`
(operador `sistema`). Nenhuma outra loja escrita.

`FISCAL_CONFIG_MATCH=true` na releitura imediata.

## Worker XSD certificado (run 34833154637)

- Sem rebuild, sem reexecução de supply-chain
- Archive `fiscal-xsd-worker-goal005a.docker.tar` SHA-256
  `b53d8220e846da301906cd7a036d957c82b86c21a3062b85dbc53502b2ec5d13` = lock
- Manifesto no runtime `fc42d03e1c4a676d5ea5fe813cd2941672caa18540856cac5208ccdff049cae1`
- Image ID no Docker Desktop (containerd) ≠ image ID Linux do GHA (`b69e20bf…`);
  identidade comprovada pelo tar byte-idêntico + manifesto + libxml2 2.15.3
- Trivy do bundle: HIGH=0 CRITICAL=0
- Container: user `10001:10001`, read-only, cap-drop ALL, no-new-privileges,
  memory 768m, pids 64, 1 CPU, bind `127.0.0.1:8080`
- `--internal` + publish não entrega porta ao host no Docker Desktop Windows;
  bind localhost usado para o cliente Node no host (worker não inicia egresso)
- `XSD_HEALTH=200 {"status":"ok","service":"fiscal-xsd-worker"}`
- `XSD_READY=200` engine xmllint/libxml2 `2.15.3`, pacote `PL_010e_v1.02/NFe/nfe_v4.00.xsd`
- `createConfiguredXsdWorkerClient` + `validarXsd` sobre XML sintético do corpus:
  `VALIDACAO_APROVADA` / `xsd_ok`

## Documento piloto

`PILOT_DOCUMENT_SOURCE=PILOT_DOCUMENT_SOURCE_BLOCKED`

Prova read-only em `loja-1`:

- `NotaFiscal` vigente: 0
- Jobs `EMISSAO`: 0 (os 4 jobs existentes são `CONSULTA` WSDL H-9/H-10 já `CONCLUIDO`)
- Vendas marcadas homolog/piloto/nfce: 0
- Série NFCE/HOMOLOGACAO: série 1, `proximoNumero=1`, ativa — nunca consumida
- Produtos: 287; bloco `metadata.fiscal` completo (NCM+CFOP+CST/CSOSN+origem 0-8): 0
- Único produto com NCM 8 dígitos: sem CFOP, sem CSOSN/CST, `origem` não é código 0-8
  (string de proveniência de barcode lookup)
- XML canônico exige NCM, CFOP, orig e CSOSN (`nfce-xml-builder.ts`)
- `requestFiscalEmissionWithJob` / `createVendaFiscalSnapshot` exigem Venda real;
  transformar venda comercial aleatória foi recusado
- INSERT manual em Venda/Caixa/Estoque recusado
- Completar cadastro fiscal de produto está fora da allowlist e inventaria tributação

## Transmissão SEFAZ

Não executada.

- `SOAP_REQUEST_SENT=false`
- `REAL_SEFAZ_DOCUMENT_TRANSMISSIONS=0`
- `TRANSMISSION_BUDGET_REMAINING=1`
- `AUTOMATIC_RETRIES=0`
- `PRODUCTION_CONTACT=false`
- `SECOND_EMISSION_CREATED=false`
- `SALE_ROLLBACK=false`
- `PILOT_WINDOW_DORMANT_FINAL=true`
- `FISCAL_ENABLED_FINAL=false`

## Kill-switch / concorrência

- `fiscalEnabled` nunca foi `true`
- Nenhum worker de fila fiscal de emissão foi iniciado
- Container XSD não adquire `FiscalEmissaoJob`

## Gates desta sessão

- `TESTS=695 passed / 3 skipped` (`lib/fiscal/homologation` · `lib/fiscal/queue` · `lib/fiscal/provider/sefaz` · `test/fiscal/scenario-battery`)
- `TSC=pass` (`npm run typecheck`, exit 0)
- `LINT=pass` (eslint focado nas superfícies do GOAL, `--max-warnings 0`)
- Timeout do scan de importadores SEFAZ elevado a 60s (árvore maior após merge da main)


## Decisão

`FINAL_DECISION=PILOT_DOCUMENT_SOURCE_BLOCKED`

Desbloqueio humano: cadastrar pelo writer de produto fiscal canônico **um** item
de homologação em `loja-1` com NCM+CFOP+CSOSN+origem válidos, produzir **uma**
venda piloto pelo caminho de produto (não SQL cru, não venda aleatória) e
reativar o GOAL 022 (mover de `_closed/goals` → `goals/` com `READY`) ou planejar sucessor.
