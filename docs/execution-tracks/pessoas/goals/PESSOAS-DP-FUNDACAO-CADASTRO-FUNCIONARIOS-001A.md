<!-- AEP:META
{
  "aep": "1.0-R2",
  "id": "PESSOAS-DP-FUNDACAO-CADASTRO-FUNCIONARIOS-001A",
  "track": "pessoas",
  "title": "Fundação persistente e backend do cadastro de funcionários",
  "status": "READY",
  "class": "C3",
  "risk_tier": "ALTO",
  "branch": "goal/pessoas-001a-fundacao-backend",
  "worktree": "C:/Projetos/omni-gestao-pessoas-001a-backend",
  "test_command": "npx vitest run lib/pessoas",
  "allowlist": [
    "lib/pessoas/**",
    "app/actions/pessoas/**",
    "app/api/pessoas/documentos/**",
    "prisma/schema.prisma",
    "prisma/migrations/**",
    "scripts/pessoas/**",
    "docs/pessoas/**",
    "docs/execution-tracks/pessoas/**",
    "docs/execution-tracks/REGISTRY.md",
    "docs/ai-execution/GATES.md",
    "docs/ai-execution/protocol.json",
    ".env.example"
  ],
  "gates_liberados": [
    "G-AEP-CORE",
    "G-DADOS-SCHEMA",
    "G-CONFIG-DEPLOY"
  ],
  "read_budget": 220,
  "plan_ref": "OMNIGESTAO_PESSOAS_DP_RH_MASTERPLAN_2026-09-15",
  "plan_rev": 1,
  "familia_executor": "codex",
  "revisao_independente": true,
  "reversibilidade": "schema aditivo na branch; migration apenas em banco isolado; sem escrita em produção; revisão independente antes de merge",
  "gate_humano": {
    "requerido": true,
    "pendente": false,
    "aprovacao": {
      "aprovado": true,
      "autorizacao": "Pedido do usuário nesta conversa libera G-AEP-CORE somente para init da trilha, G-DADOS-SCHEMA para adições e validação isolada, G-CONFIG-DEPLOY apenas para .env.example; proíbe G-AUTH, CI e produção.",
      "registrado_por": "usuário desta conversa",
      "em": "2026-09-29T16:35:46Z"
    }
  }
}
-->

# PESSOAS-DP-FUNDACAO-CADASTRO-FUNCIONARIOS-001A

## Objetivo e limite

Entregar dados persistentes, serviços, autorização própria, documentos privados e testes para o cadastro de empregados. PESSOAS-000 (ratificação arquitetural) integra o pre-flight. Este recorte não conclui o GOAL 001 completo: 001B entregará interface e aceite visual após escolha humana da IA.

## Pre-flight

- Partir da origin/main atual e registrar o SHA. Confirmar pontualmente ausência/presença de implementação Pessoas equivalente.
- Persistir o masterplan original em docs/pessoas/ e documentar o delta 001A, sem replanejamento geral.
- Preservar todas as worktrees e WIPs alheios. Não escrever fora da allowlist.
- Branch e worktree são as declaradas no AEP:META.

## Dados e invariantes

- Núcleo cadastral da seção 5.2: empregador e versões, estabelecimento e versões necessárias, mapeamento explícito para Store, grants DpAcesso, pessoa e versões, vínculo, contrato versionado, documentos e auditoria. Dependentes, parâmetros e associações opcionais somente se necessários ao cadastro e com finalidade declarada.
- Empregador é distinto de Store; funcionário não é AdminUser nem Tecnico. CPF único por empregador via índice HMAC escopado; matrícula única por empregador. Inscrições e documentos como texto.
- Vigência, autoria, motivo, instante de registro e supersessão preservados. Histórico salarial derivado apenas de contratos. FKs de escopo, índices e exclusão restritiva. Decimal para dinheiro, DTO string canônica, datas civis válidas.
- Resolver concorrência, idempotência e sobreposição/supersessão das versões contratuais. Cadastro incompleto pode ser salvo como rascunho com pendências explícitas. Admissão histórica nunca é inferida como hoje.

## Serviço e autorização

- Entregar setup explícito, cadastro, consulta, edição versionada, histórico e arquivo como operações reais.
- Revalidar sessão, concessão DP vigente, autoridade sobre Store e escopo do objeto no servidor. Bootstrap inicial exige autoridade comprovada. Perfil Financeiro, gerente ou flag de interface não concedem salário.
- Flag server-side DP desligada por padrão, sem consultas/escritas DP quando OFF. CPF cifrado com autenticação e HMAC com chaves do servidor, sem fallback. Falta de chave bloqueia operação dependente.
- Mutação cadastral/contratual e auditoria na mesma transação.

## Documentos

- Contratos reais de upload, confirmação, listagem e download privados em namespace Pessoas. Reaproveitar somente o transporte do Contador.
- Validar tipo, tamanho, integridade, dono e escopo; distinguir documento externo do contador de holerite calculado. Sem cache público/offline ou PII em URL, erro e log.
- Não incluir PDF, folha ou integrações Financeiro/Contador.

## Validação e parada

- Banco de homologação isolado com dados sintéticos e destino conferido antes da escrita. Validar schema, gerar Prisma Client e aplicar migration somente nele; CRUD com leitura posterior e isolamento entre dois empregadores/lojas.
- Cobrir grants revogados, bootstrap indevido, IDs de outro escopo, CPF/matrícula, datas, Decimal, versões/concorrência/atomicidade, chaves ausentes, flag OFF, documento e integridade.
- Executar testes focados e de integração, typecheck, lint focado, build, diff check e check/close do AEP. Infra indisponível é pendência explícita, nunca PASS.
- Commit/push somente nesta branch. Revisão independente e autorização humana antes de merge; nenhum banco de produção, nenhum dado real.
- Ponto de parada: BACKEND PRONTO PARA REVISÃO — FRONT-END AGUARDA ESCOLHA DE IA.
