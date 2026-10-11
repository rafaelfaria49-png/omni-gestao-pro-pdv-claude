# 001B — preflight bloqueado por contrato de histórico

Data: 11/10/2026. Base: 9f1b511a21ab98a924513428d465725e6839fdc2.
Branch: goal/pessoas-001b-frontend.

## Revisão externa predecessora

A cópia REVISAO_R_PREDECESSOR_P2_ZAI_2026-10-09.md foi preservada byte a byte.
SHA-256 do original e cópia: 746e1a59691026d5865268bf05fbbd19d08770a7089be34e2872531c8fa8096f.
Relatório externo fornecido pelo usuário, não review assinado nem aprovação formal no GitHub.
Data declarada 09/10/2026; revisor ZCode/GLM, família Z.ai; GOAL PESSOAS-DP-HARDENING-P2-PRE-001B-001;
HEAD revisado 53250ef52c4401bdc2e0de22aab12b1f13222117; APPROVE; P0/P1/P2=0; P3=2;
95 testes, zero skipped/todo; FRONTEND_001B_READINESS=READY. Resultados atribuídos ao relatório externo.

## Bloqueio de implementação

lib/pessoas/cadastro.ts:397-423, listarHistorico, protege salarioBase com viewRemuneracao,
mas retorna motivo contratual livre sem essa capacidade (linha 420). criarVersaoContrato
aceita motivo livre e o persiste. app/actions/pessoas/index.ts encaminha o DTO sem redigir
esse campo. Assim, um motivo que contenha salário chega ao cliente sem viewRemuneracao.
Ocultar motivo no DOM não resolve a exposição na resposta da action.

Prova reproduzível: node docs/ai-execution/_evidence/PESSOAS-DP-FRONTEND-CADASTRO-001B/historico-motivo-proof.mjs.
Executa o corpo real do reader extraído da fonte e remove apenas os tipos TypeScript;
guard e Prisma são dependências substituídas por fixtures sintéticas em VM. Confere escopo,
salarioBase=null, remuneracaoOculta=true e presença da sentinela salarial em motivo.
Exit 0 confirma a reprodução do problema, NÃO aprovação do contrato nem do GOAL.
Não é teste de integração, não executa transporte Next e não acessa banco, sessão real ou storage.
Resultado e hash da fonte em historico-motivo-proof.json.

O GOAL, seção Comandos, edição e consistência, determina: “qualquer vazamento comprovado
no próprio contrato deve ser reportado para replanejamento, sem corrigir P3 fora do recorte”.
A allowlist exclui cadastro.ts e as actions existentes. Nenhum código produtivo foi alterado.

Decisão humana necessária: autorizar replanejamento/correção pontual do contrato para suprimir
motivo contratual sem viewRemuneracao e adicionar regressão, preservando o motivo histórico
armazenado e a leitura autorizada; então retomar o 001B. Não corrigido nesta sessão.

GOAL=PESSOAS-DP-FRONTEND-CADASTRO-001B
BASE_SHA=9f1b511a21ab98a924513428d465725e6839fdc2
FUNCTIONAL_COMMIT=NENHUM
REVIEW_R_P2_EVIDENCE=REVISAO_R_PREDECESSOR_P2_ZAI_2026-10-09.md
CADASTRO_REAL=NAO_IMPLEMENTADO
CONTRATO_VERSIONADO=NAO_IMPLEMENTADO
HISTORICO=BLOQUEIO_DTO_MOTIVO
DOCUMENTOS=NAO_IMPLEMENTADO
PERMISSOES=VAZAMENTO_SINTETICO_REPRODUZIDO
MENU_DESKTOP_MOBILE_FOCUS=NAO_IMPLEMENTADO
FOUR_THEMES=NAO_VALIDADO
OFFICIAL_RUNNER=NAO_IMPLEMENTADO_NAO_EXECUTADO
TESTS_TOTAL=NAO_APLICAVEL_PROVA_ISOLADA
TESTS_SKIPPED=NAO_APLICAVEL
TYPECHECK=NAO_EXECUTADO_SEM_MUDANCA_TS
LINT=NAO_EXECUTADO
BUILD=NAO_EXECUTADO
PWA_REGRESSION=NAO_EXECUTADO
PREVIEW_SMOKE=PENDENTE_NAO_AUTORIZADO
AEP_CLOSE=NAO_EXECUTADO_GOAL_NAO_CONCLUIDO
PENDENCIAS=CORRECAO_CONTRATO_IMPLEMENTACAO_VALIDACAO_REVISAO_R_PREVIEW
NEXT_HUMAN_GATE=REPLANEJAMENTO_CONTRATO_HISTORICO

CURRENT_STATUS/CHANGELOG/masterplan e GOALs predecessores não foram editados.

Diff check: aponta somente os espaços de quebra de linha Markdown do relatório externo original. Preservados conforme exigência de cópia integral; demais arquivos sem erros de whitespace.
