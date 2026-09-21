# TRACK — Operações V4 / fluxo curto

<!-- AEP:TRACK
{
  "aep": "1.0-R2",
  "track": "ops-v4-fluxo-curto",
  "title": "Operações V4 — fluxo curto",
  "plan_rev": 2,
  "risk_tier": "ALTO",
  "completion_when_empty": "PAUSED"
}
-->

Fonte de intenção: plano funcional de 19/09/2026, entrega 001; envelope R2 de 20/09/2026. Instalação e implementação não ocorreram neste ambiente.

## Escopo ativo
Somente OPS-V4-FLUXO-CURTO-001, com o contrato instalado em goals/OPS-V4-FLUXO-CURTO-001.md. Nenhum GOAL 002–008 é elegível por esta autorização. Ao esvaziar o caminho ativo, PAUSED: o programa completo ainda não está concluído.

## Ambiente planejado
Branch goal/ops-v4-fluxo-curto-001; worktree C:/Projetos/omni-gestao-ops-v4-fluxo-curto-001. Ajuste factual de caminho/branch, somente antes do open, quando necessário para evitar ocupar trabalho alheio. Registrar a base real pelo protocolo; 469b3aa é referência de leitura, não valor a impor após avanço da main.

## Contratos de entrada
02_CONTRATO_COMUM.md, GOAL 001 e 04_MATRIZ_ACEITE.md em docs/roadmaps/ops-v4-fluxo-curto/. Não duplicar outra trilha funcional existente que já contenha comprovadamente este mesmo trabalho.

## Gates
G-AEP-CORE restrito ao cadastro desta trilha, sem mudanças nas regras. Autorizações narrativas de dados básicos/read-back de Operações V3/V4 apenas nos paths exatos do GOAL. Schema, auth, financeiro, estoque, CI, .env e produção mutante continuam fechados.

## Prova de resultado
T01–T11, typecheck, regressões de mapeadores/readers/actions tocadas, componente/E2E, concorrência em base descartável, lint, build seguro e revisão R de outra família. O test_command do GOAL não é prova isolada de homologação. Sem revisão ou ambiente exigido, preservar trabalho e informar pendência; não ratificar DONE.

## Publicação
Seguir a política de release condicionado do contrato comum: PR e checks; R aprovado sobre candidato, proveniência e integração preservadas; somente então merge permitido e smoke canônico comprovadamente read-only. Não instalar novos workflows nem contornar checks. Não iniciar GOAL 002 após o fechamento.
