# Edição completa da OS — V3 e V4

- Base inicial: `origin/main` `1cb73f5`; main `5805462` incorporada sem conflitos. Execução isolada em `codex/ops-edicao-completa-v3-v4`, sem `.aep-active`.
- Edição da mesma OS, prévia, motivo, PIN real do Caixa com escopo loja/OS/operação/conteúdo; permissão server-side e auditoria transacional.
- Cobrança pendente: atualiza o título existente e distribui centavos nas parcelas preservando identidades/vencimentos. Não cria títulos, pagamentos ou movimentos de estoque/caixa.
- Recebimento, quitação, estorno, fechamento ou inconsistência: alteração direta de cobrança recusada; exige ajuste/compensação no Financeiro. Custos internos podem ser corrigidos sem nova cobrança.
- Preserva snapshots dos documentos e versões de garantia; alterações comerciais após entrega registram aditivo. Documentos podem ser reimpressos por versão.
- Suíte essencial: 136 testes aprovados, incluindo 15 com PostgreSQL real, rollback, concorrência, reenvio, escopo do PIN, CPF e preservação de contatos mais recentes do cadastro.
- Regressão ampliada: 25 falhas também reproduzidas na main original, com os mesmos nomes e nenhuma falha nova; inclui testes que exigem banco local específico ausente.
- Typecheck com Node 8 GB: aprovado (o projeto ultrapassa o heap padrão de 4 GB).
- Lint completo: zero erros, 68 avisos preexistentes; exclui Prisma gerado, evidências locais e referência PDV arquivada.
- QA: banco novo `omni_ops_edicao_qa`, projeto Neon `blue-water-55327127`, oito OS inteiramente sintéticas. Nenhum acesso de teste à OS real indicada ou a recebimentos produtivos.
- Preview protegida preparada em `omni-ops-edicao-v3-v4-qa` (`prj_7sIv1V8R9TF9ftB6b7Y2apKGIvkc`); provisionamento de segredos exclusivos de QA autorizado explicitamente pelo usuário e concluído somente no ambiente Preview. Production e merge não autorizados nesta entrega.
- Build da Preview aprovado. Um primeiro pedido sem target explícito recebeu target Production da API e foi cancelado antes de ficar pronto/publicar; pedidos seguintes usam explicitamente `staging` (Preview). Nenhuma publicação Production concluída.
- Navegador exercitou login/PIN e correções sintéticas; a verificação visual completa V3/V4/mobile não foi concluída, por instabilidade do navegador local e proteção de acesso na automação remota. Não se declara esse smoke aprovado. O endpoint de autenticação da Preview respondeu HTTP 200 via acesso autorizado.
- O cenário sintético a prazo foi conferido novamente em R$ 330, com um só título, sem pagamentos e duas correções auditadas preservadas. PR #353 permanece em rascunho para teste humano e gates obrigatórios.

Reprodução local: `scripts/qa/seed-edicao-os.ts`, `scripts/qa/verify-edicao-os.mjs` e `lib/operacoes-v3/edicao-completa.integration.test.ts`. Credenciais e evidências de navegador ficam somente em arquivos ignorados, fora do Git e do upload.
