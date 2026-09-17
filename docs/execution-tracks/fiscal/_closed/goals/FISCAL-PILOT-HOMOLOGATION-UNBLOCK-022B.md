<!-- AEP:META
{
  "aep": "1.0-R2",
  "id": "FISCAL-PILOT-HOMOLOGATION-UNBLOCK-022B",
  "track": "fiscal",
  "title": "Sucessor do 022: documento piloto canônico e primeira NFC-e real em HOMOLOGACAO",
  "status": "READY",
  "class": "C3",
  "risk_tier": "ALTO",
  "branch": "goal/fiscal-022B-pilot-homologation-unblock",
  "worktree": "C:/Projetos/omni-gestao-fiscal-022B-pilot-homologation-unblock",
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
  "reversibilidade": "kill-switch fiscalEnabled=false; janela PILOT_EMISSION_HOMOLOGATION_WINDOW restaurada a {null,null,null} antes do fim da branch; produto piloto inativado sem delete; evidência (venda/NotaFiscal/job/logs) preservada; Production/G-F12 permanecem fechados",
  "gates_extra": [
    {
      "id": "sefaz_homologacao",
      "status": "autorizado_g_f7_sucessor_022b",
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
      "autorizacao": "GOAL 022 permanece BLOCKED. Autorizo o sucessor FISCAL-PILOT-HOMOLOGATION-UNBLOCK-022B a criar o documento piloto canônico ausente no 022 e a concluir EXATAMENTE UMA NFC-e real em HOMOLOGACAO (loja-1, SEFAZ_DIRETO, tpAmb=2, modelo 65), incluindo reconciliação, fechamento AEP, publicação e deploy. G-F7 anterior não consumido. G-F12 e Production fiscal continuam bloqueados. Nenhuma segunda EMISSAO. Nenhuma reabertura do histórico do 022 nem movimentação manual de _closed.",
      "registrado_por": "Rafael Faria",
      "em": "2026-09-17T07:21:00-03:00"
    }
  }
}
-->

# FISCAL-PILOT-HOMOLOGATION-UNBLOCK-022B — Documento piloto canônico e primeira NFC-e real em HOMOLOGACAO

- trilha: `fiscal`
- classe: C3 · status: READY
- plano: `FISCAL-FABLE5-CONTINUATION-MASTERPLAN-001` (plan_rev 1)
- branch: `goal/fiscal-022B-pilot-homologation-unblock`
- worktree: `C:/Projetos/omni-gestao-fiscal-022B-pilot-homologation-unblock`
- teste: `npx vitest run lib/fiscal/homologation lib/fiscal/queue lib/fiscal/provider/sefaz test/fiscal/scenario-battery`
- risco: `ALTO`
- revisao_independente: `true`
- predecessor: `FISCAL-PILOT-HOMOLOGATION-ACTIVATION-022` permanece **BLOCKED** (`PILOT_DOCUMENT_SOURCE_BLOCKED`). Este GOAL é sucessor; o histórico do 022 não é reaberto.

## 1. Relação com o GOAL 022

O 022 entregou o runtime one-shot dormente (PR #196 / `origin/main`) e parou na tentativa 3/3 sem fonte de documento canônica: zero produto com NCM+CFOP+CSOSN+origem, zero venda piloto, zero `NotaFiscal`, zero job `EMISSAO`. A janela `PILOT_EMISSION_HOMOLOGATION_WINDOW` permaneceu `{null,null,null}`. `G-F7` não foi consumido. `REAL_SEFAZ_DOCUMENT_TRANSMISSIONS=0` · `TRANSMISSION_BUDGET_REMAINING=1`.

Este sucessor **não** move arquivos de `_closed`, **não** altera o ledger do 022 e **não** reabre o GOAL bloqueado. Cria o documento piloto que faltou e executa a única transmissão autorizada.

## 2. Base e invariantes confirmados (read-only)

- Base: `origin/main` atual contendo PR #196.
- Loja: `loja-1`
- Banco: Neon `omnigestao_prod`
- `provider=SEFAZ_DIRETO` · `ambiente=HOMOLOGACAO` · `modeloFiscal=NFCE`
- `cscId=4` · `cscTokenRef=FISCAL_CSC_TOKEN_LOJA_1`
- certificado A1 ATIVO/válido
- `fiscalEnabled=false` no estado estável
- XSD worker run `34833154637` aprovado (sem rebuild / sem rerun de supply-chain se o artifact continuar válido)
- `REAL_SEFAZ_DOCUMENT_TRANSMISSIONS=0` · `TRANSMISSION_BUDGET_REMAINING=1`
- Production / G-F12 bloqueados
- Nenhum secret em logs

## 3. Escopo técnico

1. **Produto piloto** via `ProductWriteService` canônico (nunca Prisma create/SQL cru). SKU único, sem barcode, identificação inequívoca GOAL 022B / HOMOLOGACAO. Fiscal da fixture já aprovada: `ncm=85176200`, `cfop=5102`, `csosn=102`, `origem=0`, `unidadeComercial=UN`, `unidadeTributavel=UN`. Quantidade inicial=1, preço venda=R$ 1,00, custo=0, loja=`loja-1`. Validar com `getProdutoFiscal`.
2. **Venda canônica** do mesmo produto pelo writer server-first dos PDVs ativos (`upsertVendaInTransaction` / persistência PDV). 1 unidade, total R$ 1,00, dinheiro R$ 1,00, `cashTendered` R$ 1,00, sem cliente, sem PIX/cartão/aPrazo/carnê. Numeração/idempotência server-side; não inventar `pedidoId` legado.
3. **Caixa**: usar sessão ABERTA segura da `loja-1` se existir e puder receber o piloto; senão abrir sessão dedicada de homologação pelo fluxo canônico de Caixa (abertura R$ 0,00) e fechá-la canonicamente após o piloto. Não interferir em sessão de operador real. Sem caminho canônico seguro → `PILOT_CAIXA_SOURCE_BLOCKED`.
4. **Provas pós-venda**: Venda em `loja-1`; `ItemVenda` referencia o produto real; estoque saiu exatamente 1; `fiscalPaymentHandoff` supported; dinheiro → `tPag=01`; nenhum efeito em outra loja.
5. **Isolamento de worker**: provar ausência de worker concorrente capaz de consumir a fila; pausa/isolamento canônico se necessário.
6. **Produtor canônico**: `fiscalEnabled=true` só no intervalo mínimo; `requestFiscalEmissionWithJob` para a venda piloto (não criar job manualmente). Exigir snapshot, `NotaFiscal`, job `tipo=EMISSAO` / `status=PENDENTE` / `storeId=loja-1` / dedupe canônica / `tentativas=0`. Voltar `fiscalEnabled=false` para provas offline.
7. **Provas offline pré-SEFAZ**: modelo=65, `tpAmb=2`, UF=SP, snapshot congelado, tributação completa, pagamento fiscal válido, XML gerado, XMLDSig válido, XSD certificado PASS, hash persistido = hash preparado, endpoint Production impossível, transmissions=0, budget=1.
8. **Transmissão única**: armar `PILOT_EMISSION_HOMOLOGATION_WINDOW` ≤ 15 min, `activationId` novo, `fiscalEnabled=true` só `loja-1`. Executar **exatamente uma vez** `executePilotHomologationEmissionTransmission({ jobId, storeId: "loja-1" })`. Nenhum retry manual/automático. Nenhuma segunda EMISSAO.
9. **Classificação** pelo pipeline existente (AUTORIZADA / 204 / 656 / UNKNOWN / erro pré-boundary).
10. **Finally obrigatório**: `fiscalEnabled=false`; janela dormente/null; Production contact=false; automatic retries=0. A branch nunca termina armada.
11. **Reconciliação** de Venda, NotaFiscal, FiscalEmissaoJob, FiscalLog, chNFe, cStat/xMotivo, protocolo/consulta, transmission count. `SECOND_EMISSION_CREATED=false`. `SALE_ROLLBACK` causado pelo fiscal = false.
12. Produto piloto permanece rastreável e fica **INATIVO**. Não deletar evidência. Fechar caixa dedicado se foi aberto.
13. Suíte fiscal canônica, typecheck, lint focado, diff-check, AEP verify. Falhas conhecidas fora de escopo em import avançado (byte-identical à main) não geram correção neste GOAL.
14. Publicação autorizada se gates verdes: commit, push, PR, CI, merge, Vercel Production, smoke pós-deploy. Código publicado permanece OFF (janela dormente, `fiscalEnabled=false`).

## 4. Allowlist da trilha de execução

```
lib/fiscal/**
app/api/fiscal/**
app/api/internal/fiscal/**
docs/fiscal/**
docs/ai/CURRENT_STATUS.md
docs/ai-execution/_evidence/**
```

Writes de produto/venda/caixa/configuração fiscal ocorrem no Neon via writers canônicos de runtime — não são alterações versionadas e não expandem a allowlist. Nunca versionar `DATABASE_URL`/`DIRECT_URL`, `.env.local`, A1/CSC/queue secret, XML com dados sensíveis, artifact Docker ou WIPs de outros workstreams.

## 5. Fora de escopo

- Reabrir, mover ou reescrever `FISCAL-PILOT-HOMOLOGATION-ACTIVATION-022`.
- Segunda NFC-e, retry automático, Production (`tpAmb=1`), G-F12.
- Schema/migration, auth, `proxy.ts`.
- Rebuild do worker XSD / rerun de supply-chain se o artifact aprovado continuar válido.
- Correção de falhas de import avançado byte-identical à main.

## 6. Critério de Pronto

1. Produto piloto canônico persistido e validado por `getProdutoFiscal`; inativo ao final.
2. Uma venda piloto canônica em `loja-1` com handoff `tPag=01` e baixa de estoque = 1.
3. Uma `NotaFiscal` + um job `EMISSAO` produzidos pelo produtor canônico.
4. Provas offline verdes (modelo 65, tpAmb=2, XMLDSig, XSD PASS, Production impossível).
5. No máximo uma transmissão SEFAZ de documento; classificação persistida; `SECOND_EMISSION_CREATED=false`.
6. Finally: `fiscalEnabled=false`, janela `{null,null,null}`, Production contact=false, retries automáticos=0.
7. Suíte do GOAL, typecheck, lint focado, diff-check e `track verify` verdes.
8. Evidência técnica sem secrets; close AEP; merge em `origin/main`; Vercel Production READY; smoke público OFF.
