<!-- AEP:META

{

  "aep": "1.0-R2",

  "id": "OPS-V4-FLUXO-CURTO-002",

  "track": "ops-v4-fluxo-curto",

  "title": "Garantia e documentos coerentes da abertura à impressão",

  "status": "READY",

  "class": "C3",

  "risk_tier": "ALTO",

  "plan_rev": 6,

  "branch": "goal/ops-v4-fluxo-curto-002",

  "worktree": "C:/Projetos/omni-gestao-ops-v4-fluxo-curto-002",

  "test_command": "npm run typecheck && npx --no-install vitest run lib/operacoes-v4/nova-os-draft-from-form.test.ts lib/operacoes-v3/garantia-textos.test.ts lib/operacoes-v3/garantia-actions.test.ts lib/operacoes-v3/pos-venda-model.test.ts lib/operacoes-v3/print-model.test.ts lib/operacoes-v4/documento-mensagem.test.ts && npx --no-install vitest run --config test/ops-v4-fluxo-curto-002/vitest.config.ts && npx playwright test e2e/specs/operacoes-v4-fluxo-curto-002.spec.ts",

  "allowlist": [

    "components/operacoes-v4-preview/parts/NovaOSModal.tsx",

    "components/operacoes-v4-preview/parts/stages/EntregaStage.tsx",

    "components/operacoes-v4-preview/parts/DocPrintModal.tsx",

    "components/operacoes-v4-preview/use-v4-preview.ts",

    "components/operacoes-v4-preview/os-adapter.ts",

    "components/operacoes-v3/components/print/PrintPreviewV3.tsx",

    "lib/operacoes-v4/nova-os-draft-from-form.ts",

    "lib/operacoes-v4/nova-os-draft-from-form.test.ts",

    "lib/operacoes-v4/documento-mensagem.ts",

    "lib/operacoes-v4/documento-mensagem.test.ts",

    "lib/operacoes-v3/garantia-actions.ts",

    "lib/operacoes-v3/garantia-actions.test.ts",

    "lib/operacoes-v3/garantia-textos.ts",

    "lib/operacoes-v3/garantia-textos.test.ts",

    "lib/operacoes-v3/pos-venda-model.ts",

    "lib/operacoes-v3/pos-venda-model.test.ts",

    "lib/operacoes-v3/print-model.ts",

    "lib/operacoes-v3/print-model.test.ts",

    "lib/operacoes-v3/documentos.ts",

    "lib/loja-ativa.tsx",

    "lib/loja-ativa.test.tsx",

    "test/ops-v4-fluxo-curto-002/**",

    "e2e/specs/operacoes-v4-fluxo-curto-002.spec.ts",

    "docs/execution-tracks/ops-v4-fluxo-curto/**",

    "docs/execution-tracks/REGISTRY.md",

    "docs/ai-execution/GATES.md",

    "docs/ai-execution/protocol.json"

  ],

  "gates_liberados": [

    "G-AEP-CORE",

    "G-CONFIG-DEPLOY"

  ],

  "read_budget": 40,

  "revisao_independente": true,

  "familia_executor": "openai",

  "reversibilidade": "media"

}

-->



# OPS-V4-FLUXO-CURTO-002 — Garantia e documentos coerentes da abertura à impressão



## Objetivo



Garantir que Nova OS, card de garantia, persistência server-side, Termo de Garantia,

OS impressa e mensagem de WhatsApp usem a mesma verdade.



## Critérios centrais



- Serviço autorizado com garantia positiva não pode gerar `sem_garantia + prazo > 0`.

- `sem_garantia` e demais modelos sem cobertura persistem prazo 0.

- Modelo com cobertura nunca persiste prazo 0; usa prazo válido/padrão.

- Troca de tela com 90 dias resulta em modelo coerente + prazo 90 em todas as superfícies.

- Garantia não definida permanece "não definida"; não vira automaticamente "sem garantia".

- Termo não é emitido como acordo de ausência de garantia quando nada foi definido.

- Documentos V4 usam dados reais da loja ativa via fonte canônica existente.

- Nenhum CNPJ, endereço, telefone ou nome de empresa é inventado/hardcoded.

- Documento de cliente continua sem custo/lucro/observações internas.

- Sem schema, migration, Financeiro, Caixa, Estoque, Fiscal, auth/proxy ou motor novo.



## Fonte empresarial existente



A V4 deve reutilizar `useLojaAtiva()` / `empresaDocumentos` já existentes em

`lib/loja-ativa.tsx`.



Não criar segunda fonte de cadastro da empresa.



## Evidências obrigatórias



G01–G08: coerência de garantia.

D01–D06: coerência dos documentos.

W01–W03: coerência WhatsApp.

Teste montado real, integração server-side quando necessária, E2E, typecheck,

lint, build, diff-check e AEP check.



## Não objetivos



Não implementar multi-garantia, retorno/garantia, novo motor de documentos,

novo backend empresarial, Cloud API WhatsApp ou qualquer GOAL 003+.
