# Edição completa da OS — V3 e V4

- Base: `origin/main` `1cb73f5`; execução isolada em `codex/ops-edicao-completa-v3-v4`, sem `.aep-active`.
- Edição da mesma OS, prévia, motivo, PIN real do Caixa com escopo loja/OS/operação/conteúdo; permissão server-side e auditoria transacional.
- Cobrança pendente: atualiza o título existente e distribui centavos nas parcelas preservando identidades/vencimentos. Não cria títulos, pagamentos ou movimentos de estoque/caixa.
- Recebimento, quitação, estorno, fechamento ou inconsistência: alteração direta de cobrança recusada; exige ajuste/compensação no Financeiro. Custos internos podem ser corrigidos sem nova cobrança.
- Preserva snapshots dos documentos e versões de garantia; alterações comerciais após entrega registram aditivo. Documentos podem ser reimpressos por versão.
- Suíte essencial: 135 testes aprovados, incluindo 14 com PostgreSQL real, rollback, concorrência, reenvio, escopo do PIN e CPF.
- Regressão ampliada: 25 falhas também reproduzidas na main original, com os mesmos nomes e nenhuma falha nova; inclui testes que exigem banco local específico ausente.
- Typecheck com Node 8 GB: aprovado (o projeto ultrapassa o heap padrão de 4 GB).
- Lint completo: zero erros, 68 avisos preexistentes; exclui Prisma gerado, evidências locais e referência PDV arquivada.
- QA: banco novo `omni_ops_edicao_qa`, projeto Neon `blue-water-55327127`, oito OS inteiramente sintéticas. Nenhum acesso de teste à OS real indicada ou a recebimentos produtivos.
- Preview protegida preparada em `omni-ops-edicao-v3-v4-qa` (`prj_7sIv1V8R9TF9ftB6b7Y2apKGIvkc`); provisionamento de segredos exclusivos de QA autorizado explicitamente pelo usuário e concluído somente no ambiente Preview. Production e merge não autorizados nesta entrega.

Reprodução local: `scripts/qa/seed-edicao-os.ts`, `scripts/qa/verify-edicao-os.mjs` e `lib/operacoes-v3/edicao-completa.integration.test.ts`. Credenciais e evidências de navegador ficam somente em arquivos ignorados, fora do Git e do upload.
