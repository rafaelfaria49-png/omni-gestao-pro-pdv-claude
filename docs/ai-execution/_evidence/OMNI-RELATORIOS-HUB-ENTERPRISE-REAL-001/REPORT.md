# OMNI-RELATORIOS-HUB-ENTERPRISE-REAL-001 — publicação para revisão

BASE_SHA=51265894a8a019fbd5e679003de0b08dd95feba9

AUDIT_REPORT=[AUDIT.md](AUDIT.md). Comparação atualizada com a main; worktree original e seus commits preservados localmente. AEP opt-in inativo, sem alterações em registry/state/ledger.

PR318_REUSE=Redutor/testes de produtos e inspetor PWA reaproveitados seletivamente da [PR318](https://github.com/rafaelfaria49-png/omni-gestao-pro-pdv-claude/pull/318), sem merge integral. Devoluções limitadas à coorte autorizada; proteções mais recentes da main preservadas.

REPORTS_IMPLEMENTED=Sete consultas reais, somente leitura: produtos, caixa, DRE gerencial parcial, clientes, OS, técnicos e registros WhatsApp. Filtros, paginação, comparação aplicável, tendências, CSV/PDF e detalhes de origem. Preservados os links já funcionais de histórico/caixa/financeiro.

REPORTS_PENDING=Margem/CMV históricos; competência e lucros completos; conciliação bancária e forma de pagamento consolidada sem lastro; peso sem unidade histórica; RFM sem identidade/amostra suficiente; aceite/entrega/encerramento/falhas/execução externa de WhatsApp sem telemetria comprovada. Métricas indisponíveis são explicitadas, sem números simulados.

SOURCE_OF_TRUTH=Venda/ItemVenda/DevolucaoVenda, ledger/carteiras/histórico canônico de títulos, Cliente por FK, OrdemServico única V3/V4 com status/precisão/payload validados, técnicos/garantias, registros WhatsApp persistidos. SQL parametrizado, RepeatableRead, READ ONLY e timezone UTC na transação; apresentação em America/Sao_Paulo. Schema e migrations idênticos à main.

FINANCIAL_ACCURACY=Venda e recebimento são separados. Devoluções limitadas ao vendido; desconto geral sem rateio explícito. Transferência interna neutra no consolidado; sangria/suprimento separados de receita. Principal previsto reduzido pelos pagamentos/reversões comprovados. Compra de estoque não é CMV; custo atual não substitui custo histórico. DRE é parcial em caixa, sem lucro/margem inventados.

MULTISTORE_ISOLATION=Sessão, acesso à central/módulo e loja conferidos no servidor; todos os candidatos de header/query/cookie validados e SQL escopado. Mesma ACL em consulta, detalhe e exportação. UI cancela/desmonta por usuário/loja/permissão e rejeita resposta de outra loja/tipo.

PRIVACY_AND_CACHE=NetworkOnly para API/CSV/PDF/HTML/RSC; worker auxiliar não aquece páginas privadas; expurgo de entradas antigas e no ciclo de escopo. Cache-Control private/no-store e erros sanitizados. Sem corpo/contato/documento/payload bruto nos detalhes WhatsApp/cliente; detalhe OS sem valores financeiros/laudos/observações. Providers não carregam nem sincronizam automaticamente inventário/OS/ledger nos relatórios.

AUTH_COMPATIBILITY=O contrato da [PR350](https://github.com/rafaelfaria49-png/omni-gestao-pro-pdv-claude/pull/350) permanece integralmente o da main: logout por sid, sem incrementar sessionVersion ou encerrar outros dispositivos. A proposta antiga de revogação global foi descartada e não faz parte da publicação. Flag habilitada somente na QA isolada; nada alterado em Production. [Provas e limitações herdadas](AUTH_LOGOUT.md).

EXPORTS=CSV protegido contra fórmulas e aspas; PDF multipágina no servidor com fontes/limitações e continuação identificada. Máximo500 registros completos do filtro, com422 acima do teto, sem truncamento silencioso. Mesmos guards; download cancelado na troca de escopo. Arquivos gerados são locais e não são enviados ao Git.

QA_TEST_RESULTS=Resultados novos na base5126589:93/93 unitários, incluindo configuração350 real com flag off/on;32/32 PostgreSQL17 em banco novo sintético; typecheck e lint TS/TSX focado aprovados; build completo com MIGRATION_SKIPPED e PROXY_PRISMA_ARTIFACT_VERIFIED;5/5 no worker emitido;14/14 E2E reais. O cenário adicional confirmou A401/B200/outra conta ativa/sessionVersion inalterada. Navegador/mobile/temas e Electron45.2.3 foram executados com credenciais efêmeras. O resultado anterior com revogação global não é usado como aprovação desta publicação. Node local26; CI usa24.

QA_ISOLATION=O runner cria cluster vazio em loopback e substitui ambas URLs. Senha/segredo são aleatórios por execução e guardados somente em manifesto ignorado. Nenhum .env, credencial real, banco, log, JSON de resultado, imagem, CSV/PDF ou artefato local entra nos seis commits. CI específica usa Docker PostgreSQL17 novo em loopback, sem credencial fixa e sem upload de manifestos/traces.

INDEPENDENT_REVIEW=Revisor somente leitura autorizado. Primeiros cinco deltas compatibilizados conferidos sem achados remanescentes; UI/PDF/runner CI também revisados. Ajuste solicitado nos paths da CI para dependências de privacidade/autenticação aplicado. Conferência final ancorada no sexto head antes do push. A revisão antiga do CAS global foi superada e não aprova esta cadeia. [Registro de revisão](INDEPENDENT_REVIEW.md).

CI_STATUS=Pendente de publicação e execução remota autorizadas. Não declarar CI completamente aprovada antes dos resultados por SHA. A CI específica da sexta PR cobre contratos, PostgreSQL, build, worker e navegador/mobile. Electron Windows é validado localmente; CI Linux não é certificação do Electron. Os checks existentes e, quando necessário, o workflow já existente são verificados por branch.

KNOWN_BASELINE=O teste de entrada ainda exige a landing antiga, mas main já usa PilotEntryPage: falha preexistente, sem alteração de app/page.tsx nesta trilha. Lint global não é certificado: a configuração herdada referencia plugins React ausentes para alguns arquivos JS. Essas limitações permanecem documentadas e separadas de defeitos introduzidos.

VERCEL_COST_IMPACT=Sem polling do relatório, sem N+1 por linha nem histórico completo no navegador. Período até366 dias, páginas até100, exportações até500; statement_timeout12s/transação30s. Medida local recente:50.001 vendas,442ms e2993 bytes. Contador Node retornou0/0ms nesse recorte, sem medir CPU de PostgreSQL/engine. Neon/Vercel reais, cold-start/p95/fatura não medidos; não é previsão de custo.

PRODUCTION_WRITES=0
PRODUCTION_MIGRATIONS=0
MERGE_EXECUTED=NO
FINAL_STATUS=CADEIA_COMPATIVEL_350_VALIDADA_EM_QA; PUBLICACAO_DRAFT_E_CI_AUTORIZADAS; CI_REMOTA_AINDA_PENDENTE; SEM_LIBERACAO_PRODUCTION
